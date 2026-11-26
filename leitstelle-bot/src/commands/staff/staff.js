const { SlashCommandBuilder } = require('discord.js');
const theme = require('../../core/theme');
const util = require('../../core/util');
const perms = require('../../core/permissions');
const { all, one, run, now } = require('../../core/database');
const sm = require('../../systems/staffManager');

const { E } = theme;
const periodOpt = (o) => o.setName('zeitraum').setDescription('Zeitraum').addChoices({ name: 'Gesamt', value: '0' }, { name: 'Letzte 30 Tage', value: '30' }, { name: 'Letzte 7 Tage', value: '7' });

const data = new SlashCommandBuilder()
  .setName('staff')
  .setDescription('Teamverwaltung')
  .addSubcommand((s) => s.setName('info').setDescription('Informationen zu einem Teammitglied').addUserOption((o) => o.setName('nutzer').setDescription('Teammitglied (Standard: du)')))
  .addSubcommand((s) => s.setName('stats').setDescription('Aktivitätsstatistik eines Teammitglieds').addUserOption((o) => o.setName('nutzer').setDescription('Teammitglied (Standard: du)')).addStringOption(periodOpt))
  .addSubcommand((s) => s.setName('duty').setDescription('Dienst beginnen, beenden oder anzeigen')
    .addStringOption((o) => o.setName('aktion').setDescription('Was möchtest du tun?').setRequired(true).addChoices({ name: 'Dienst beginnen', value: 'an' }, { name: 'Dienst beenden', value: 'aus' }, { name: 'Wer ist im Dienst?', value: 'liste' })))
  .addSubcommand((s) => s.setName('promote').setDescription('Befördert ein Teammitglied in den nächsten Teamrang')
    .addUserOption((o) => o.setName('nutzer').setDescription('Teammitglied').setRequired(true)).addStringOption((o) => o.setName('grund').setDescription('Grund').setMaxLength(300)))
  .addSubcommand((s) => s.setName('demote').setDescription('Stuft ein Teammitglied einen Teamrang herab')
    .addUserOption((o) => o.setName('nutzer').setDescription('Teammitglied').setRequired(true)).addStringOption((o) => o.setName('grund').setDescription('Grund').setMaxLength(300)))
  .addSubcommand((s) => s.setName('warn').setDescription('Erteilt einem Teammitglied eine Teamverwarnung')
    .addUserOption((o) => o.setName('nutzer').setDescription('Teammitglied').setRequired(true)).addStringOption((o) => o.setName('grund').setDescription('Grund').setRequired(true).setMaxLength(500)))
  .addSubcommand((s) => s.setName('leaderboard').setDescription('Rangliste der aktivsten Teammitglieder').addStringOption(periodOpt))
  .addSubcommand((s) => s.setName('raenge').setDescription('Teamränge festlegen (Reihenfolge für Beförderungen)')
    .addStringOption((o) => o.setName('aktion').setDescription('Aktion').setRequired(true).addChoices({ name: 'Rang hinzufügen', value: 'add' }, { name: 'Rang entfernen', value: 'remove' }, { name: 'Ränge anzeigen', value: 'list' }))
    .addRoleOption((o) => o.setName('rolle').setDescription('Teamrolle'))
    .addIntegerOption((o) => o.setName('position').setDescription('Position (1 = niedrigster Teamrang)').setMinValue(1).setMaxValue(25)));

const team = ['moderation', 'support', 'server', 'host'];
const permsMap = { info: team, stats: team, duty: team, promote: ['management'], demote: ['management'], warn: ['management'], leaderboard: team, raenge: ['admin'] };

async function execute(interaction) {
  const g = interaction.guildId;
  const sub = interaction.options.getSubcommand();
  const o = interaction.options;
  const guild = interaction.guild;

  switch (sub) {
    case 'info': {
      const u = o.getUser('nutzer') || interaction.user;
      const member = await guild.members.fetch(u.id).catch(() => null);
      if (!member) return theme.replyError(interaction, 'Diese Person ist nicht auf dem Server.');
      const rank = sm.currentRank(member);
      const duty = sm.onDuty(g, u.id);
      const hist = all('SELECT * FROM staff_history WHERE guild_id = ? AND user_id = ? ORDER BY at DESC LIMIT 5', g, u.id);
      const warns = all('SELECT * FROM staff_warnings WHERE guild_id = ? AND user_id = ? ORDER BY at DESC LIMIT 5', g, u.id);
      const groups = [...perms.groupsOf(member)].filter((x) => x !== 'everyone').map((x) => perms.GROUPS[x] || x);
      return theme.reply(interaction, { embeds: [theme.base(g, 'primary').setTitle(`${E.shield} Teammitglied – ${member.displayName}`).setThumbnail(u.displayAvatarURL()).addFields(
        { name: 'Teamrang', value: rank ? `<@&${rank.role_id}>` : 'Kein Teamrang', inline: true },
        { name: 'Dienst', value: duty ? `🟢 seit ${util.ts(duty.started_at, 'R')}` : '⚪ Nicht im Dienst', inline: true },
        { name: 'Beigetreten', value: member.joinedTimestamp ? util.ts(member.joinedTimestamp, 'D') : '–', inline: true },
        { name: 'Berechtigungsgruppen', value: groups.join(', ') || 'Keine' },
        { name: 'Letzte Rangänderungen', value: hist.map((h) => `${util.ts(h.at, 'd')} ${E.dot} ${h.action}${h.to_role ? ` → <@&${h.to_role}>` : ''}`).join('\n') || '–' },
        { name: `Teamverwarnungen (${warns.length})`, value: warns.map((w) => `${util.ts(w.at, 'd')} ${E.dot} ${util.truncate(w.reason, 80)}`).join('\n') || 'Keine' },
      )] });
    }
    case 'stats': {
      const u = o.getUser('nutzer') || interaction.user;
      const days = Number(o.getString('zeitraum') || 0);
      const a = sm.activity(g, u.id, days ? Date.now() - days * 864e5 : 0);
      return theme.reply(interaction, { embeds: [theme.base(g, 'primary', days ? `Letzte ${days} Tage` : 'Gesamt').setTitle(`${E.stats} Teamaktivität – ${u.username}`).addFields(
        { name: 'Dienstzeit', value: `${util.hours(a.duty)} Std.`, inline: true },
        { name: 'Modmail-Antworten', value: String(a.modmail), inline: true },
        { name: 'Moderationsaktionen', value: String(a.moderation), inline: true },
        { name: 'Bewerbungen geprüft', value: String(a.applications), inline: true },
        { name: 'Sessions (Host/Co-Host)', value: String(a.sessions), inline: true },
        { name: 'ER:LC-Befehle', value: String(a.erlc), inline: true },
        { name: 'Aktivitätspunkte', value: `**${sm.score(a)}**`, inline: true },
        { name: 'Teamverwarnungen', value: String(a.warnings), inline: true },
      )] }, false);
    }
    case 'duty': {
      const action = o.getString('aktion');
      if (action === 'liste') {
        const rows = all('SELECT * FROM staff_duty WHERE guild_id = ? AND ended_at IS NULL ORDER BY started_at', g);
        return theme.reply(interaction, { embeds: [theme.base(g, 'primary').setTitle('🟢 Im Dienst').setDescription(rows.length ? rows.map((r) => `<@${r.user_id}> ${E.dot} seit ${util.ts(r.started_at, 'R')}`).join('\n') : 'Aktuell ist niemand im Dienst.')] }, false);
      }
      const res = await sm.setDuty(interaction.member, action === 'an');
      if (!res.ok) return theme.replyError(interaction, res.reason);
      await sm.log(g, action === 'an' ? `🟢 <@${interaction.user.id}> hat den **Dienst begonnen**.` : `⚪ <@${interaction.user.id}> hat den **Dienst beendet** (${util.duration(res.duration)}).`, interaction.user.id);
      return theme.replySuccess(interaction, action === 'an' ? 'Du bist jetzt **im Dienst**. Viel Erfolg!' : `Dienst beendet. Dauer: **${util.duration(res.duration)}**.`, false);
    }
    case 'promote':
    case 'demote': {
      const u = o.getUser('nutzer');
      if (u.id === interaction.user.id) return theme.replyError(interaction, 'Du kannst deinen eigenen Teamrang nicht ändern.');
      const member = await guild.members.fetch(u.id).catch(() => null);
      if (!member) return theme.replyError(interaction, 'Diese Person ist nicht auf dem Server.');
      const rs = sm.ranks(g);
      if (!rs.length) return theme.replyError(interaction, 'Es sind noch keine Teamränge festgelegt. Nutze `/staff raenge`.');
      const cur = sm.currentRank(member);
      const idx = cur ? rs.findIndex((r) => r.id === cur.id) : -1;
      const target = sub === 'promote' ? rs[idx + 1] : idx > 0 ? rs[idx - 1] : null;
      if (sub === 'promote' && !target) return theme.replyError(interaction, 'Diese Person hat bereits den höchsten Teamrang.');
      if (sub === 'demote' && !cur) return theme.replyError(interaction, 'Diese Person hat keinen Teamrang.');
      const me = guild.members.me;
      for (const r of [target, cur].filter(Boolean)) {
        const role = guild.roles.cache.get(r.role_id);
        if (!role || role.position >= me.roles.highest.position) return theme.replyError(interaction, `Ich kann <@&${r.role_id}> nicht verwalten (Rolle fehlt oder steht über meiner Rolle).`);
        if (interaction.user.id !== guild.ownerId && role.position >= interaction.member.roles.highest.position && !perms.isAdmin(interaction.member)) return theme.replyError(interaction, 'Du kannst nur Teamränge unterhalb deiner eigenen Rolle verwalten.');
      }
      try {
        if (cur) await member.roles.remove(cur.role_id, `Team-${sub === 'promote' ? 'Beförderung' : 'Herabstufung'} durch ${interaction.user.tag}`);
        if (target) await member.roles.add(target.role_id, `Team-${sub === 'promote' ? 'Beförderung' : 'Herabstufung'} durch ${interaction.user.tag}`);
      } catch (err) { return theme.replyError(interaction, `Rollen konnten nicht geändert werden: ${err.message}`); }
      const reason = o.getString('grund');
      sm.history(g, u.id, sub === 'promote' ? 'befördert' : 'herabgestuft', cur?.role_id, target?.role_id, interaction.user.id, reason);
      await sm.log(g, `${sub === 'promote' ? '⬆️' : '⬇️'} <@${u.id}> wurde ${sub === 'promote' ? 'befördert' : 'herabgestuft'}: ${cur ? `<@&${cur.role_id}>` : 'kein Rang'} → ${target ? `<@&${target.role_id}>` : 'kein Teamrang'} (durch <@${interaction.user.id}>)${reason ? `\nGrund: ${util.clean(reason)}` : ''}`, interaction.user.id, u.id, sub === 'promote' ? 'success' : 'warning');
      u.send({ embeds: [theme.base(g, sub === 'promote' ? 'success' : 'warning').setTitle(sub === 'promote' ? '🎉 Team-Beförderung' : 'Team-Rangänderung').setDescription(`Dein Teamrang auf **${guild.name}** wurde geändert: **${target ? guild.roles.cache.get(target.role_id)?.name : 'kein Teamrang'}**${reason ? `\n**Grund:** ${util.clean(reason)}` : ''}`)] }).catch(() => {});
      return theme.replySuccess(interaction, `<@${u.id}>: ${cur ? `<@&${cur.role_id}>` : 'kein Rang'} → ${target ? `<@&${target.role_id}>` : 'kein Teamrang'}`, false);
    }
    case 'warn': {
      const u = o.getUser('nutzer');
      if (u.id === interaction.user.id) return theme.replyError(interaction, 'Du kannst dich nicht selbst verwarnen.');
      run('INSERT INTO staff_warnings (guild_id, user_id, by_id, reason, at) VALUES (?,?,?,?,?)', g, u.id, interaction.user.id, o.getString('grund'), now());
      const n = one('SELECT COUNT(*) AS n FROM staff_warnings WHERE guild_id = ? AND user_id = ?', g, u.id).n;
      sm.history(g, u.id, 'teamverwarnung', null, null, interaction.user.id, o.getString('grund'));
      await sm.log(g, `⚠️ **Teamverwarnung** für <@${u.id}> von <@${interaction.user.id}> (insgesamt ${n})\nGrund: ${util.clean(o.getString('grund'))}`, interaction.user.id, u.id, 'warning');
      u.send({ embeds: [theme.warning(g, `Du hast eine **Teamverwarnung** erhalten.\n**Grund:** ${util.clean(o.getString('grund'))}\n**Teamverwarnungen insgesamt:** ${n}`, 'Teamverwarnung')] }).catch(() => {});
      return theme.replySuccess(interaction, `<@${u.id}> hat eine Teamverwarnung erhalten (insgesamt **${n}**).`);
    }
    case 'leaderboard': {
      const days = Number(o.getString('zeitraum') || 30);
      const since = days ? Date.now() - days * 864e5 : 0;
      const ids = new Set([
        ...all('SELECT DISTINCT user_id FROM staff_duty WHERE guild_id = ?', g).map((r) => r.user_id),
        ...all('SELECT DISTINCT moderator_id AS user_id FROM moderation WHERE guild_id = ?', g).map((r) => r.user_id),
        ...all('SELECT DISTINCT user_id FROM staff_activity WHERE guild_id = ?', g).map((r) => r.user_id),
        ...all('SELECT DISTINCT user_id FROM session_hosts WHERE guild_id = ?', g).map((r) => r.user_id),
      ]);
      const rows = [...ids].map((id) => ({ id, a: sm.activity(g, id, since) })).map((r) => ({ ...r, s: sm.score(r.a) })).filter((r) => r.s > 0).sort((a, b) => b.s - a.s).slice(0, 10);
      const medal = ['🥇', '🥈', '🥉'];
      return theme.reply(interaction, { embeds: [theme.base(g, 'primary', days ? `Letzte ${days} Tage` : 'Gesamt').setTitle(`${E.trophy} Team-Rangliste`)
        .setDescription(rows.length ? rows.map((r, i) => `${medal[i] || `\`${i + 1}.\``} <@${r.id}> ${E.dot} **${r.s}** Punkte\n-# ${util.hours(r.a.duty)} Std. Dienst ${E.dot} ${r.a.modmail} Modmail ${E.dot} ${r.a.moderation} Moderation ${E.dot} ${r.a.sessions} Sessions`).join('\n') : 'Noch keine Aktivität erfasst.')
        .addFields({ name: 'Punkte', value: '2 je Dienststunde · 5 je Session · 2 je Bewerbung · 1 je Moderation · 0,5 je Modmail-Antwort · 0,2 je ER:LC-Befehl' })] }, false);
    }
    case 'raenge': {
      const action = o.getString('aktion');
      const rs = sm.ranks(g);
      if (action === 'list') return theme.reply(interaction, { embeds: [theme.base(g, 'primary').setTitle('Teamränge (hoch → niedrig)').setDescription([...rs].reverse().map((r) => `\`${r.position}\` <@&${r.role_id}>`).join('\n') || 'Keine Teamränge festgelegt.')] });
      const role = o.getRole('rolle');
      if (!role) return theme.replyError(interaction, 'Bitte gib eine Rolle an.');
      const reorder = (list) => list.forEach((r, i) => run('UPDATE staff_ranks SET position = ? WHERE id = ?', i + 1, r.id));
      if (action === 'remove') {
        const r = rs.find((x) => x.role_id === role.id);
        if (!r) return theme.replyError(interaction, 'Diese Rolle ist kein Teamrang.');
        run('DELETE FROM staff_ranks WHERE id = ?', r.id);
        reorder(rs.filter((x) => x.id !== r.id));
        return theme.replySuccess(interaction, `<@&${role.id}> ist kein Teamrang mehr.`);
      }
      if (rs.some((x) => x.role_id === role.id)) return theme.replyError(interaction, 'Diese Rolle ist bereits ein Teamrang.');
      const pos = Math.min(o.getInteger('position') || rs.length + 1, rs.length + 1);
      const id = run('INSERT INTO staff_ranks (guild_id, role_id, position) VALUES (?,?,?)', g, role.id, pos).lastInsertRowid;
      const list = [...rs]; list.splice(pos - 1, 0, { id });
      reorder(list);
      return theme.replySuccess(interaction, `<@&${role.id}> ist jetzt Teamrang an Position **${pos}**.`);
    }
    default: return theme.replyError(interaction, 'Unbekannter Unterbefehl.');
  }
}

module.exports = { data, perms: permsMap, execute };
