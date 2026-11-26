const { SlashCommandBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const theme = require('../../core/theme');
const util = require('../../core/util');
const perms = require('../../core/permissions');
const { one, all, run, now } = require('../../core/database');
const dm = require('../../systems/departmentManager');
const panels = require('../../systems/panels');

const { E } = theme;
const deptOpt = (o, req = true) => o.setName('abteilung').setDescription('Abteilung').setRequired(req).setAutocomplete(true);
const rankOpt = (o, req = true) => o.setName('rang').setDescription('Rang').setRequired(req).setAutocomplete(true);
const userOpt = (o, req = true) => o.setName('nutzer').setDescription('Mitglied').setRequired(req);

const data = new SlashCommandBuilder()
  .setName('department')
  .setDescription('Abteilungen verwalten (Polizei, Sheriff, Feuerwehr …)')
  .addSubcommand((s) => s.setName('create').setDescription('Erstellt eine neue Abteilung')
    .addStringOption((o) => o.setName('kuerzel').setDescription('Kürzel, z. B. LSPD').setRequired(true).setMaxLength(10))
    .addStringOption((o) => o.setName('name').setDescription('Name, z. B. Polizei').setRequired(true).setMaxLength(50))
    .addRoleOption((o) => o.setName('rolle').setDescription('Abteilungsrolle'))
    .addStringOption((o) => o.setName('emoji').setDescription('Emoji').setMaxLength(10))
    .addStringOption((o) => o.setName('farbe').setDescription('Hex-Farbe, z. B. #2563EB').setMaxLength(7)))
  .addSubcommand((s) => s.setName('delete').setDescription('Löscht eine Abteilung').addStringOption((o) => deptOpt(o)))
  .addSubcommand((s) => s.setName('add').setDescription('Nimmt ein Mitglied in eine Abteilung auf')
    .addUserOption((o) => userOpt(o)).addStringOption((o) => deptOpt(o)).addStringOption((o) => rankOpt(o, false))
    .addStringOption((o) => o.setName('dienstnummer').setDescription('Optionale Dienstnummer / Callsign').setMaxLength(15)))
  .addSubcommand((s) => s.setName('remove').setDescription('Entfernt ein Mitglied aus einer Abteilung')
    .addUserOption((o) => userOpt(o)).addStringOption((o) => deptOpt(o))
    .addStringOption((o) => o.setName('grund').setDescription('Grund').setMaxLength(300)))
  .addSubcommand((s) => s.setName('promote').setDescription('Befördert ein Mitglied')
    .addUserOption((o) => userOpt(o)).addStringOption((o) => deptOpt(o)).addStringOption((o) => rankOpt(o, false).setDescription('Zielrang (Standard: nächster Rang)'))
    .addStringOption((o) => o.setName('grund').setDescription('Grund').setMaxLength(300)))
  .addSubcommand((s) => s.setName('demote').setDescription('Degradiert ein Mitglied')
    .addUserOption((o) => userOpt(o)).addStringOption((o) => deptOpt(o)).addStringOption((o) => rankOpt(o, false).setDescription('Zielrang (Standard: vorheriger Rang)'))
    .addStringOption((o) => o.setName('grund').setDescription('Grund').setMaxLength(300)))
  .addSubcommand((s) => s.setName('info').setDescription('Zeigt Infos zu einer Abteilung oder einem Mitglied')
    .addStringOption((o) => deptOpt(o, false)).addUserOption((o) => userOpt(o, false)))
  .addSubcommand((s) => s.setName('list').setDescription('Zeigt alle Abteilungen'))
  .addSubcommand((s) => s.setName('roster').setDescription('Zeigt die Dienstliste oder richtet eine automatische Dienstliste ein')
    .addStringOption((o) => deptOpt(o))
    .addChannelOption((o) => o.setName('kanal').setDescription('Dauerhafte, automatisch aktualisierte Dienstliste in diesem Kanal').addChannelTypes(ChannelType.GuildText)))
  .addSubcommand((s) => s.setName('rename').setDescription('Benennt eine Abteilung um')
    .addStringOption((o) => deptOpt(o)).addStringOption((o) => o.setName('name').setDescription('Neuer Name').setRequired(true).setMaxLength(50))
    .addStringOption((o) => o.setName('kuerzel').setDescription('Neues Kürzel').setMaxLength(10)))
  .addSubcommand((s) => s.setName('setleader').setDescription('Legt die Leitung einer Abteilung fest')
    .addStringOption((o) => deptOpt(o)).addUserOption((o) => userOpt(o, false).setDescription('Leitung (leer = entfernen)')))
  .addSubcommand((s) => s.setName('setrole').setDescription('Legt die Discord-Rolle einer Abteilung oder eines Rangs fest')
    .addStringOption((o) => deptOpt(o)).addRoleOption((o) => o.setName('rolle').setDescription('Rolle (leer = entfernen)'))
    .addStringOption((o) => rankOpt(o, false).setDescription('Rang (leer = Abteilungsrolle)')))
  .addSubcommand((s) => s.setName('rank').setDescription('Ränge einer Abteilung verwalten')
    .addStringOption((o) => o.setName('aktion').setDescription('Was soll passieren?').setRequired(true).addChoices(
      { name: 'Rang hinzufügen', value: 'add' }, { name: 'Rang entfernen', value: 'remove' }, { name: 'Rang umbenennen', value: 'rename' },
      { name: 'Position ändern', value: 'move' }, { name: 'Leitungsrang an/aus', value: 'lead' }, { name: 'Ränge anzeigen', value: 'list' },
    ))
    .addStringOption((o) => deptOpt(o)).addStringOption((o) => rankOpt(o, false))
    .addStringOption((o) => o.setName('name').setDescription('Name (für hinzufügen/umbenennen)').setMaxLength(50))
    .addIntegerOption((o) => o.setName('position').setDescription('Position (1 = niedrigster Rang)').setMinValue(1).setMaxValue(50)))
  .addSubcommand((s) => s.setName('stats').setDescription('Statistiken einer Abteilung').addStringOption((o) => deptOpt(o)))
  .addSubcommand((s) => s.setName('announce').setDescription('Sendet eine Ankündigung an eine Abteilung')
    .addStringOption((o) => deptOpt(o)).addStringOption((o) => o.setName('nachricht').setDescription('Text').setRequired(true).setMaxLength(2000))
    .addChannelOption((o) => o.setName('kanal').setDescription('Kanal (Standard: hier)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addBooleanOption((o) => o.setName('ping').setDescription('Abteilungsrolle erwähnen? (Standard: ja)')))
  .addSubcommand((s) => s.setName('training').setDescription('Plant ein Training mit Anmeldung und Anwesenheit')
    .addStringOption((o) => deptOpt(o)).addStringOption((o) => o.setName('titel').setDescription('Titel').setRequired(true).setMaxLength(100))
    .addStringOption((o) => o.setName('zeitpunkt').setDescription('z. B. 20:00, 24.12.2026 19:30 oder in 2h').setRequired(true).setMaxLength(30))
    .addStringOption((o) => o.setName('beschreibung').setDescription('Beschreibung').setMaxLength(1000))
    .addChannelOption((o) => o.setName('kanal').setDescription('Kanal (Standard: hier)').addChannelTypes(ChannelType.GuildText)));

const permsMap = {
  create: ['management'], delete: ['management'], rename: ['management'], setleader: ['management'], setrole: ['management'], rank: ['management'],
  add: ['deptlead'], remove: ['deptlead'], promote: ['deptlead'], demote: ['deptlead'], announce: ['deptlead'], training: ['deptlead'],
  info: ['everyone'], list: ['everyone'], roster: ['everyone'], stats: ['deptlead'],
};

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const g = interaction.guildId;
  const o = interaction.options;
  const guild = interaction.guild;
  dm.ensureDefaults(g);

  const dept = o.getString('abteilung') ? dm.find(g, o.getString('abteilung')) : null;
  if (o.getString('abteilung') && !dept) return theme.replyError(interaction, 'Diese Abteilung gibt es nicht. Bitte wähle eine aus der Liste.');

  const needAuthority = () => {
    const a = dm.authority(interaction.member, dept);
    if (!a.ok) { theme.replyError(interaction, a.reason); return null; }
    return a;
  };
  const refresh = () => dm.updateRoster(interaction.client, g, dept.id);

  switch (sub) {
    case 'create': {
      const short = o.getString('kuerzel').toUpperCase().replace(/\s+/g, '');
      if (dm.find(g, short)) return theme.replyError(interaction, `Es gibt bereits eine Abteilung mit dem Kürzel **${short}**.`);
      const color = o.getString('farbe') ? util.parseColor(o.getString('farbe')) : null;
      if (o.getString('farbe') && color === null) return theme.replyError(interaction, 'Ungültige Farbe. Format: `#RRGGBB`.');
      const id = run('INSERT INTO departments (guild_id, name, short, emoji, color, role_id, created_at) VALUES (?,?,?,?,?,?,?)', g, o.getString('name'), short, o.getString('emoji') || E.dept, color, o.getRole('rolle')?.id || null, now()).lastInsertRowid;
      run('INSERT INTO department_ranks (department_id, name, position) VALUES (?,?,1)', id, 'Mitglied');
      await dm.auditLog(g, `Abteilung **${short} – ${util.clean(o.getString('name'))}** erstellt von <@${interaction.user.id}>`, interaction.user.id);
      return theme.replySuccess(interaction, `Die Abteilung **${short} – ${util.clean(o.getString('name'))}** wurde erstellt. Sie hat den Startrang „Mitglied“.\nWeitere Ränge: \`/department rank aktion:Rang hinzufügen\`.`);
    }

    case 'delete': {
      const count = one('SELECT COUNT(*) AS n FROM department_members WHERE department_id = ?', dept.id).n;
      return theme.reply(interaction, {
        embeds: [theme.warning(g, `Soll **${dm.label(dept)}** wirklich gelöscht werden?\nAlle **${count}** Mitgliedschaften, Ränge und Trainings werden entfernt. Abteilungs- und Rangrollen werden den Mitgliedern abgenommen.`, 'Abteilung löschen')],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`dept:delete:${dept.id}`).setStyle(ButtonStyle.Danger).setLabel('Endgültig löschen'),
          new ButtonBuilder().setCustomId('dept:cancel').setStyle(ButtonStyle.Secondary).setLabel('Abbrechen'),
        )],
      });
    }

    case 'add': {
      const a = needAuthority(); if (!a) return;
      const user = o.getUser('nutzer');
      if (user.bot) return theme.replyError(interaction, 'Bots können keiner Abteilung beitreten.');
      const rs = dm.ranks(dept.id);
      if (!rs.length) return theme.replyError(interaction, 'Diese Abteilung hat noch keine Ränge.');
      const rk = o.getString('rang') ? dm.findRank(dept.id, o.getString('rang')) : rs[0];
      if (!rk) return theme.replyError(interaction, 'Diesen Rang gibt es in der Abteilung nicht.');
      if (rk.position > a.maxPosition) return theme.replyError(interaction, `Du darfst höchstens Ränge unterhalb deines eigenen vergeben.`);
      await interaction.deferReply();
      const res = await dm.addMember(guild, dept, user.id, rk, interaction.user.id, o.getString('dienstnummer'));
      if (!res.ok) return interaction.editReply({ embeds: [theme.error(g, res.reason)] });
      await refresh();
      await dm.auditLog(g, `<@${user.id}> wurde in **${dept.short}** aufgenommen (Rang: **${rk.name}**) von <@${interaction.user.id}>`, interaction.user.id, user.id, 'success');
      return interaction.editReply({ embeds: [theme.success(g, `<@${user.id}> ist jetzt Mitglied von **${dm.label(dept)}** im Rang **${rk.name}**.${res.note ? `\n${E.warn} ${res.note}` : ''}`)] });
    }

    case 'remove': {
      const a = needAuthority(); if (!a) return;
      const user = o.getUser('nutzer');
      const m = dm.membership(dept.id, user.id);
      if (m && m.position > a.maxPosition) return theme.replyError(interaction, 'Du kannst keine Mitglieder mit gleichem oder höherem Rang entfernen.');
      await interaction.deferReply();
      const res = await dm.removeMember(guild, dept, user.id, interaction.user.id, o.getString('grund'));
      if (!res.ok) return interaction.editReply({ embeds: [theme.error(g, res.reason)] });
      await refresh();
      await dm.auditLog(g, `<@${user.id}> wurde aus **${dept.short}** entfernt (zuvor: ${res.oldRank || '–'}) von <@${interaction.user.id}>${o.getString('grund') ? `\nGrund: ${util.clean(o.getString('grund'))}` : ''}`, interaction.user.id, user.id, 'danger');
      return interaction.editReply({ embeds: [theme.success(g, `<@${user.id}> wurde aus **${dm.label(dept)}** entfernt.${res.note ? `\n${E.warn} ${res.note}` : ''}`)] });
    }

    case 'promote':
    case 'demote': {
      const a = needAuthority(); if (!a) return;
      const user = o.getUser('nutzer');
      if (user.id === interaction.user.id && !a.full) return theme.replyError(interaction, 'Du kannst deinen eigenen Rang nicht ändern.');
      const m = dm.membership(dept.id, user.id);
      if (!m) return theme.replyError(interaction, `<@${user.id}> ist kein Mitglied von **${dept.short}**.`);
      const rs = dm.ranks(dept.id);
      let target;
      if (o.getString('rang')) target = dm.findRank(dept.id, o.getString('rang'));
      else {
        const idx = rs.findIndex((r) => r.id === m.rank_id);
        target = sub === 'promote' ? rs[idx + 1] : rs[idx - 1];
      }
      if (!target) return theme.replyError(interaction, sub === 'promote' ? 'Es gibt keinen höheren Rang.' : 'Es gibt keinen niedrigeren Rang.');
      if (sub === 'promote' && target.position <= (m.position || 0)) return theme.replyError(interaction, 'Der Zielrang muss höher als der aktuelle Rang sein.');
      if (sub === 'demote' && target.position >= (m.position || 0)) return theme.replyError(interaction, 'Der Zielrang muss niedriger als der aktuelle Rang sein.');
      if (target.position > a.maxPosition || (m.position || 0) > a.maxPosition) return theme.replyError(interaction, 'Du darfst nur Ränge unterhalb deines eigenen verwalten.');
      await interaction.deferReply();
      const res = await dm.setRank(guild, dept, user.id, target, interaction.user.id, o.getString('grund'));
      if (!res.ok) return interaction.editReply({ embeds: [theme.error(g, res.reason)] });
      await refresh();
      const verb = sub === 'promote' ? 'befördert' : 'degradiert';
      await dm.auditLog(g, `<@${user.id}> wurde in **${dept.short}** ${verb}: ${res.from || '–'} → **${target.name}** (durch <@${interaction.user.id}>)${o.getString('grund') ? `\nGrund: ${util.clean(o.getString('grund'))}` : ''}`, interaction.user.id, user.id, sub === 'promote' ? 'success' : 'warning');
      try {
        await user.send({ embeds: [theme.base(g, sub === 'promote' ? 'success' : 'warning').setTitle(sub === 'promote' ? '🎉 Beförderung' : '📉 Rangänderung')
          .setDescription(`Du wurdest in **${dept.short} – ${dept.name}** ${verb}.\n**Neuer Rang:** ${target.name}${o.getString('grund') ? `\n**Grund:** ${util.clean(o.getString('grund'))}` : ''}`)] });
      } catch { /* DMs geschlossen */ }
      return interaction.editReply({ embeds: [theme.success(g, `<@${user.id}> wurde ${verb}: ${res.from || '–'} → **${target.name}**.${res.note ? `\n${E.warn} ${res.note}` : ''}`)] });
    }

    case 'info': {
      const user = o.getUser('nutzer');
      if (user) {
        const rows = all(`SELECT m.*, d.short, d.name, d.emoji, r.name AS rank_name FROM department_members m JOIN departments d ON d.id = m.department_id
          LEFT JOIN department_ranks r ON r.id = m.rank_id WHERE m.guild_id = ? AND m.user_id = ?`, g, user.id);
        const hist = all('SELECT h.*, d.short FROM department_history h JOIN departments d ON d.id = h.department_id WHERE h.guild_id = ? AND h.user_id = ? ORDER BY h.at DESC LIMIT 10', g, user.id);
        const trainings = one('SELECT COUNT(*) AS n FROM training_attendance a JOIN department_trainings t ON t.id = a.training_id WHERE t.guild_id = ? AND a.user_id = ?', g, user.id).n;
        return theme.reply(interaction, { embeds: [theme.base(g, 'primary').setTitle(`${E.user} Abteilungen – ${user.username}`).setThumbnail(user.displayAvatarURL())
          .addFields(
            { name: 'Mitgliedschaften', value: rows.length ? rows.map((r) => `${r.emoji || E.dept} **${r.short}** ${E.dot} ${r.rank_name || 'Ohne Rang'}${r.callsign ? ` ${E.dot} \`${r.callsign}\`` : ''} ${E.dot} seit ${util.ts(r.joined_at, 'd')}`).join('\n') : 'Keine' },
            { name: 'Trainings besucht', value: String(trainings), inline: true },
            { name: 'Verlauf', value: hist.length ? hist.map((h) => `${util.ts(h.at, 'd')} ${E.dot} **${h.short}** ${h.action}${h.from_rank || h.to_rank ? ` (${h.from_rank || '–'} → ${h.to_rank || '–'})` : ''}`).join('\n').slice(0, 1024) : 'Kein Verlauf' },
          )] }, false);
      }
      if (!dept) return theme.replyError(interaction, 'Bitte gib eine Abteilung oder ein Mitglied an.');
      const rs = dm.ranks(dept.id);
      const counts = Object.fromEntries(all('SELECT rank_id, COUNT(*) AS n FROM department_members WHERE department_id = ? GROUP BY rank_id', dept.id).map((r) => [r.rank_id, r.n]));
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      return theme.reply(interaction, { embeds: [theme.base(g, dept.color || 'primary').setTitle(`${dept.emoji || E.dept} ${dept.short} – ${dept.name}`)
        .addFields(
          { name: 'Leitung', value: dept.leader_id ? `<@${dept.leader_id}>` : '–', inline: true },
          { name: 'Rolle', value: dept.role_id ? `<@&${dept.role_id}>` : '–', inline: true },
          { name: 'Mitglieder', value: String(total), inline: true },
          { name: 'Ränge (hoch → niedrig)', value: [...rs].reverse().map((r) => `${r.is_leadership ? '⭐' : '▫️'} \`${r.position}\` **${r.name}**${r.role_id ? ` <@&${r.role_id}>` : ''} ${E.dot} ${counts[r.id] || 0}`).join('\n').slice(0, 1024) || 'Keine Ränge' },
        )] }, false);
    }

    case 'list': {
      const ds = dm.list(g);
      return theme.reply(interaction, { embeds: [theme.base(g, 'primary').setTitle(`${E.dept} Abteilungen`)
        .setDescription(ds.map((d) => `${d.emoji || E.dept} **${d.short}** – ${d.name} ${E.dot} ${one('SELECT COUNT(*) AS n FROM department_members WHERE department_id = ?', d.id).n} Mitglieder${d.leader_id ? ` ${E.dot} Leitung: <@${d.leader_id}>` : ''}`).join('\n') || 'Keine Abteilungen vorhanden.')] }, false);
    }

    case 'roster': {
      const ch = o.getChannel('kanal');
      if (!ch) return theme.reply(interaction, { embeds: [dm.rosterEmbed(g, dept)] }, false);
      if (!dm.authority(interaction.member, dept).ok) return theme.replyError(interaction, 'Nur die Abteilungsleitung kann eine dauerhafte Dienstliste einrichten.');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const msg = await panels.upsert(interaction.client, g, 'roster', dept.id, ch.id, { embeds: [dm.rosterEmbed(g, dept)] }).catch(() => null);
      return interaction.editReply({ embeds: [msg ? theme.success(g, `Die Dienstliste von **${dept.short}** steht jetzt in ${ch} und aktualisiert sich automatisch.`) : theme.error(g, `Ich kann in ${ch} nicht schreiben.`)] });
    }

    case 'rename': {
      const short = o.getString('kuerzel')?.toUpperCase().replace(/\s+/g, '');
      if (short && short !== dept.short && dm.find(g, short)) return theme.replyError(interaction, `Das Kürzel **${short}** ist bereits vergeben.`);
      run('UPDATE departments SET name = ?, short = ? WHERE id = ?', o.getString('name'), short || dept.short, dept.id);
      await refresh();
      await dm.auditLog(g, `Abteilung **${dept.short}** umbenannt in **${short || dept.short} – ${util.clean(o.getString('name'))}** (durch <@${interaction.user.id}>)`, interaction.user.id);
      return theme.replySuccess(interaction, `Die Abteilung heißt jetzt **${short || dept.short} – ${util.clean(o.getString('name'))}**.`);
    }

    case 'setleader': {
      const user = o.getUser('nutzer');
      run('UPDATE departments SET leader_id = ? WHERE id = ?', user?.id || null, dept.id);
      await refresh();
      await dm.auditLog(g, `Leitung von **${dept.short}**: ${user ? `<@${user.id}>` : 'entfernt'} (durch <@${interaction.user.id}>)`, interaction.user.id, user?.id);
      return theme.replySuccess(interaction, user ? `<@${user.id}> leitet jetzt **${dm.label(dept)}**.${dm.membership(dept.id, user.id) ? '' : `\n${E.info} Tipp: Mit \`/department add\` auch als Mitglied eintragen.`}` : `Die Leitung von **${dept.short}** wurde entfernt.`);
    }

    case 'setrole': {
      const role = o.getRole('rolle');
      if (role && role.position >= guild.members.me.roles.highest.position) return theme.replyError(interaction, `Ich kann <@&${role.id}> nicht vergeben, weil sie über meiner höchsten Rolle steht.`);
      if (role?.managed) return theme.replyError(interaction, 'Diese Rolle wird von einer Integration verwaltet.');
      if (o.getString('rang')) {
        const rk = dm.findRank(dept.id, o.getString('rang'));
        if (!rk) return theme.replyError(interaction, 'Diesen Rang gibt es nicht.');
        run('UPDATE department_ranks SET role_id = ? WHERE id = ?', role?.id || null, rk.id);
        return theme.replySuccess(interaction, `Rang **${rk.name}** (${dept.short}): ${role ? `<@&${role.id}>` : 'keine Rolle'}.\n-# Bestehende Mitglieder erhalten die Rolle bei der nächsten Rangänderung.`);
      }
      run('UPDATE departments SET role_id = ? WHERE id = ?', role?.id || null, dept.id);
      return theme.replySuccess(interaction, `Abteilungsrolle von **${dept.short}**: ${role ? `<@&${role.id}>` : 'keine'}.`);
    }

    case 'rank': {
      const action = o.getString('aktion');
      const rs = dm.ranks(dept.id);
      const rk = o.getString('rang') ? dm.findRank(dept.id, o.getString('rang')) : null;
      if (['remove', 'rename', 'move', 'lead'].includes(action) && !rk) return theme.replyError(interaction, 'Bitte wähle einen gültigen Rang aus.');
      const reorder = (list) => list.forEach((r, i) => run('UPDATE department_ranks SET position = ? WHERE id = ?', i + 1, r.id));
      switch (action) {
        case 'list':
          return theme.reply(interaction, { embeds: [theme.base(g, dept.color || 'primary').setTitle(`Ränge – ${dept.short}`).setDescription([...rs].reverse().map((r) => `\`${r.position}\` ${r.is_leadership ? '⭐ ' : ''}**${r.name}**${r.role_id ? ` <@&${r.role_id}>` : ''}`).join('\n') || 'Keine Ränge')] });
        case 'add': {
          const name = o.getString('name');
          if (!name) return theme.replyError(interaction, 'Bitte gib einen Namen an.');
          if (rs.some((r) => r.name.toLowerCase() === name.toLowerCase())) return theme.replyError(interaction, 'Diesen Rang gibt es bereits.');
          const pos = Math.min(o.getInteger('position') || rs.length + 1, rs.length + 1);
          const id = run('INSERT INTO department_ranks (department_id, name, position) VALUES (?,?,?)', dept.id, name, pos).lastInsertRowid;
          const list = [...rs]; list.splice(pos - 1, 0, { id });
          reorder(list);
          await refresh();
          return theme.replySuccess(interaction, `Rang **${util.clean(name)}** wurde an Position **${pos}** hinzugefügt.`);
        }
        case 'remove': {
          const n = one('SELECT COUNT(*) AS n FROM department_members WHERE rank_id = ?', rk.id).n;
          if (n) return theme.replyError(interaction, `Diesen Rang haben noch **${n}** Mitglieder. Bitte zuerst befördern oder degradieren.`);
          run('DELETE FROM department_ranks WHERE id = ?', rk.id);
          reorder(rs.filter((r) => r.id !== rk.id));
          return theme.replySuccess(interaction, `Rang **${rk.name}** wurde entfernt.`);
        }
        case 'rename': {
          if (!o.getString('name')) return theme.replyError(interaction, 'Bitte gib einen neuen Namen an.');
          run('UPDATE department_ranks SET name = ? WHERE id = ?', o.getString('name'), rk.id);
          await refresh();
          return theme.replySuccess(interaction, `**${rk.name}** heißt jetzt **${util.clean(o.getString('name'))}**.`);
        }
        case 'move': {
          const pos = o.getInteger('position');
          if (!pos) return theme.replyError(interaction, 'Bitte gib eine neue Position an.');
          const list = rs.filter((r) => r.id !== rk.id);
          list.splice(Math.min(pos, list.length + 1) - 1, 0, rk);
          reorder(list);
          await refresh();
          return theme.replySuccess(interaction, `**${rk.name}** steht jetzt an Position **${Math.min(pos, list.length)}**.`);
        }
        case 'lead': {
          run('UPDATE department_ranks SET is_leadership = ? WHERE id = ?', rk.is_leadership ? 0 : 1, rk.id);
          await refresh();
          return theme.replySuccess(interaction, `**${rk.name}** ist jetzt ${rk.is_leadership ? '**kein**' : 'ein'} Leitungsrang.${rk.is_leadership ? '' : ' Mitglieder mit diesem Rang können ihre Abteilung verwalten (Ränge unterhalb ihres eigenen).'}`);
        }
        default: return theme.replyError(interaction, 'Unbekannte Aktion.');
      }
    }

    case 'stats': {
      if (!dm.authority(interaction.member, dept).ok && !perms.isStaff(interaction.member)) return theme.replyError(interaction, 'Statistiken sind der Abteilungsleitung vorbehalten.');
      const st = dm.stats(g, dept);
      return theme.reply(interaction, { embeds: [theme.base(g, dept.color || 'primary', 'Letzte 30 Tage bei Verlaufswerten').setTitle(`${E.stats} Statistiken – ${dept.short}`)
        .addFields(
          { name: 'Mitglieder', value: String(st.members), inline: true },
          { name: 'Neu aufgenommen', value: String(st.joined), inline: true },
          { name: 'Entfernt', value: String(st.removed), inline: true },
          { name: 'Beförderungen', value: String(st.promoted), inline: true },
          { name: 'Degradierungen', value: String(st.demoted), inline: true },
          { name: 'Trainings (gesamt)', value: `${st.trainings} ${E.dot} Ø ${st.attendance ? st.attendance.toFixed(1).replace('.', ',') : '–'} Teilnehmer`, inline: true },
          { name: 'Leitung', value: [dept.leader_id ? `<@${dept.leader_id}> (Abteilungsleitung)` : null, ...st.leadership.map((l) => `<@${l.user_id}> – ${l.name}`)].filter(Boolean).join('\n').slice(0, 1024) || '–' },
          { name: 'Mitglieder je Rang', value: st.perRank.map((r) => `${r.name}: **${r.n}**`).join('\n').slice(0, 1024) || '–', inline: true },
          { name: 'Neueste Mitglieder', value: st.newest.map((m) => `<@${m.user_id}> ${util.ts(m.joined_at, 'R')}`).join('\n') || '–', inline: true },
          { name: 'Aktivste Trainingsteilnehmer', value: st.topTraining.map((m) => `<@${m.user_id}> – ${m.n}`).join('\n') || '–', inline: true },
        )] }, false);
    }

    case 'announce': {
      const a = needAuthority(); if (!a) return;
      const ch = o.getChannel('kanal') || interaction.channel;
      const ping = (o.getBoolean('ping') ?? true) && dept.role_id;
      try {
        await ch.send({
          content: ping ? `<@&${dept.role_id}>` : undefined,
          embeds: [theme.base(g, dept.color || 'primary', dept.short).setTitle(`${dept.emoji || E.dept} ${dept.name} – Mitteilung`).setDescription(util.clean(o.getString('nachricht'))).setAuthor({ name: interaction.member.displayName, iconURL: interaction.user.displayAvatarURL() })],
          allowedMentions: { roles: ping ? [dept.role_id] : [] },
        });
      } catch (err) { return theme.replyError(interaction, `Die Ankündigung konnte nicht gesendet werden: ${err.message}`); }
      await dm.auditLog(g, `Ankündigung an **${dept.short}** von <@${interaction.user.id}> in ${ch}`, interaction.user.id);
      return theme.replySuccess(interaction, `Die Ankündigung an **${dept.short}** wurde in ${ch} gesendet.`);
    }

    case 'training': {
      const a = needAuthority(); if (!a) return;
      const at = util.parseTime(o.getString('zeitpunkt'));
      if (!at) return theme.replyError(interaction, 'Ungültiger Zeitpunkt. Beispiele: `20:00`, `24.12.2026 19:30`, `in 2h`.');
      const ch = o.getChannel('kanal') || interaction.channel;
      const id = run('INSERT INTO department_trainings (guild_id, department_id, host_id, title, description, scheduled_at, channel_id, created_at) VALUES (?,?,?,?,?,?,?,?)',
        g, dept.id, interaction.user.id, o.getString('titel'), o.getString('beschreibung'), at, ch.id, now()).lastInsertRowid;
      const t = one('SELECT * FROM department_trainings WHERE id = ?', id);
      try {
        const msg = await ch.send({ content: dept.role_id ? `<@&${dept.role_id}>` : undefined, ...trainingPayload(g, t), allowedMentions: { roles: dept.role_id ? [dept.role_id] : [] } });
        run('UPDATE department_trainings SET message_id = ? WHERE id = ?', msg.id, id);
      } catch (err) {
        run('DELETE FROM department_trainings WHERE id = ?', id);
        return theme.replyError(interaction, `Das Training konnte nicht gesendet werden: ${err.message}`);
      }
      await dm.auditLog(g, `Training **${util.clean(o.getString('titel'))}** (${dept.short}) geplant von <@${interaction.user.id}> für ${util.ts(at)}`, interaction.user.id);
      return theme.replySuccess(interaction, `Das Training wurde in ${ch} angekündigt. Mitglieder können sich per Button anmelden; mit **Abschließen** wird die Anwesenheit gespeichert.`);
    }
    default: return theme.replyError(interaction, 'Unbekannter Unterbefehl.');
  }
}

function trainingPayload(guildId, t) {
  const dept = dm.get(guildId, t.department_id);
  const att = all('SELECT user_id FROM training_attendance WHERE training_id = ? ORDER BY at', t.id);
  const closed = t.status !== 'offen';
  const embed = theme.base(guildId, dept?.color || 'primary', `Training #${t.id}`)
    .setTitle(`🎓 ${dept ? `${dept.short} – ` : ''}${util.truncate(t.title, 200)}`)
    .setDescription(t.description || 'Keine Beschreibung.')
    .addFields(
      { name: 'Zeitpunkt', value: `${util.ts(t.scheduled_at)} (${util.ts(t.scheduled_at, 'R')})`, inline: true },
      { name: 'Ausbilder', value: `<@${t.host_id}>`, inline: true },
      { name: 'Status', value: t.status === 'abgeschlossen' ? '✅ Abgeschlossen' : t.status === 'abgesagt' ? '❌ Abgesagt' : '🟢 Anmeldung offen', inline: true },
      { name: `${closed ? 'Anwesend' : 'Angemeldet'} (${att.length})`, value: att.length ? att.map((a) => `<@${a.user_id}>`).join(', ').slice(0, 1024) : 'Noch niemand' },
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`dept:tjoin:${t.id}`).setStyle(ButtonStyle.Success).setLabel('Anmelden / Abmelden').setEmoji('✋').setDisabled(closed),
    new ButtonBuilder().setCustomId(`dept:tdone:${t.id}`).setStyle(ButtonStyle.Primary).setLabel('Abschließen').setEmoji('✅').setDisabled(closed),
    new ButtonBuilder().setCustomId(`dept:tcancel:${t.id}`).setStyle(ButtonStyle.Secondary).setLabel('Absagen').setDisabled(closed),
  );
  return { embeds: [embed], components: [row] };
}

async function autocomplete(interaction) {
  const g = interaction.guildId;
  const focused = interaction.options.getFocused(true);
  const q = focused.value.toLowerCase();
  if (focused.name === 'abteilung') {
    return interaction.respond(dm.list(g).filter((d) => `${d.short} ${d.name}`.toLowerCase().includes(q)).slice(0, 25).map((d) => ({ name: `${d.short} – ${d.name}`, value: String(d.id) })));
  }
  if (focused.name === 'rang') {
    const dept = dm.find(g, interaction.options.getString('abteilung'));
    if (!dept) return interaction.respond([{ name: 'Bitte zuerst eine Abteilung wählen', value: '0' }]);
    return interaction.respond([...dm.ranks(dept.id)].reverse().filter((r) => r.name.toLowerCase().includes(q)).slice(0, 25).map((r) => ({ name: `${r.position}. ${r.name}${r.is_leadership ? ' (Leitung)' : ''}`, value: String(r.id) })));
  }
  return interaction.respond([]);
}

module.exports = { data, perms: permsMap, execute, autocomplete, trainingPayload };
