const { SlashCommandBuilder } = require('discord.js');
const theme = require('../../core/theme');
const perms = require('../../core/permissions');
const util = require('../../core/util');
const logger = require('../../core/logger');
const { all } = require('../../core/database');
const sessions = require('../../systems/sessionManager');

const { E } = theme;

const data = new SlashCommandBuilder()
  .setName('host')
  .setDescription('Session-Hosting verwalten')
  .addSubcommand((s) => s.setName('start').setDescription('Übernimmt das Hosting der laufenden Session')
    .addStringOption((o) => o.setName('rolle').setDescription('Als Host oder Co-Host?').setRequired(true).addChoices({ name: 'Host', value: 'host' }, { name: 'Co-Host', value: 'cohost' }))
    .addUserOption((o) => o.setName('nutzer').setDescription('Andere Person eintragen (Community-Management)')))
  .addSubcommand((s) => s.setName('end').setDescription('Beendet dein Co-Hosting bzw. trägt den Co-Host aus'))
  .addSubcommand((s) => s.setName('transfer').setDescription('Überträgt die Host-Rechte an eine andere Person')
    .addUserOption((o) => o.setName('nutzer').setDescription('Neuer Host').setRequired(true)))
  .addSubcommand((s) => s.setName('info').setDescription('Zeigt Host und Co-Host der laufenden Session'))
  .addSubcommand((s) => s.setName('history').setDescription('Zeigt den Hosting-Verlauf einer Person')
    .addUserOption((o) => o.setName('nutzer').setDescription('Person (Standard: du)')))
  .addSubcommand((s) => s.setName('stats').setDescription('Zeigt Hosting-Statistiken einer Person')
    .addUserOption((o) => o.setName('nutzer').setDescription('Person (Standard: du)')))
  .addSubcommand((s) => s.setName('leaderboard').setDescription('Rangliste der Hosts')
    .addStringOption((o) => o.setName('kriterium').setDescription('Sortierung').addChoices({ name: 'Anzahl Sessions', value: 'sessions' }, { name: 'Hosting-Stunden', value: 'stunden' }, { name: 'Ø Spieler', value: 'spieler' })));

const permsMap = { start: ['host'], end: ['host'], transfer: ['host'], info: ['everyone'], history: ['everyone'], stats: ['everyone'], leaderboard: ['everyone'] };

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const g = interaction.guildId;
  const s = sessions.active(g);
  const isMgmt = perms.inGroup(interaction.member, 'management');

  const logHost = (text) => logger.discord(g, 'sessionLog', theme.base(g, 'primary', s ? `Session #${s.id}` : undefined).setDescription(`${E.host} ${text}`), { event: 'host.change', userId: interaction.user.id });

  switch (sub) {
    case 'start': {
      if (!s) return theme.replyError(interaction, 'Es läuft keine Session. Starte eine mit `/session start`.');
      const role = interaction.options.getString('rolle');
      const target = interaction.options.getUser('nutzer') || interaction.user;
      if (target.bot) return theme.replyError(interaction, 'Bots können nicht hosten.');
      if (target.id !== interaction.user.id && !isMgmt) return theme.replyError(interaction, 'Nur das Community-Management darf andere Personen als Host eintragen.');
      if (role === 'host' && s.host_id && s.host_id !== target.id && !isMgmt) return theme.replyError(interaction, `Die Session hat bereits einen Host (<@${s.host_id}>). Der Host kann sie dir mit \`/host transfer\` übertragen.`);
      if ((role === 'host' ? s.host_id : s.cohost_id) === target.id) return theme.replyError(interaction, 'Diese Person hat diese Rolle bereits.');
      if (role === 'cohost' && s.host_id === target.id) return theme.replyError(interaction, 'Der Host kann nicht gleichzeitig Co-Host sein.');
      if (role === 'host' && s.cohost_id === target.id) sessions.assignHost(s, null, 'cohost', interaction.user.id);
      sessions.assignHost(sessions.get(s.id), target.id, role, interaction.user.id);
      await sessions.refreshMessage(interaction.client, s.id, true);
      await logHost(`<@${target.id}> ist jetzt **${role === 'host' ? 'Host' : 'Co-Host'}** (eingetragen von <@${interaction.user.id}>).`);
      return theme.replySuccess(interaction, `<@${target.id}> ist jetzt **${role === 'host' ? 'Host' : 'Co-Host'}** der Session.`, false);
    }
    case 'end': {
      if (!s) return theme.replyError(interaction, 'Es läuft keine Session.');
      if (s.host_id === interaction.user.id) return theme.replyError(interaction, 'Als Host beendest du die Session mit `/session end` oder überträgst sie mit `/host transfer`.');
      if (!s.cohost_id) return theme.replyError(interaction, 'Die Session hat keinen Co-Host.');
      if (s.cohost_id !== interaction.user.id && !isMgmt && s.host_id !== interaction.user.id) return theme.replyError(interaction, 'Nur der Co-Host selbst, der Host oder das Management kann den Co-Host austragen.');
      const old = s.cohost_id;
      sessions.assignHost(s, null, 'cohost', interaction.user.id);
      await sessions.refreshMessage(interaction.client, s.id, true);
      await logHost(`<@${old}> ist nicht mehr Co-Host.`);
      return theme.replySuccess(interaction, `<@${old}> ist nicht mehr Co-Host.`, false);
    }
    case 'transfer': {
      if (!s) return theme.replyError(interaction, 'Es läuft keine Session.');
      const target = interaction.options.getUser('nutzer');
      if (target.bot) return theme.replyError(interaction, 'Bots können nicht hosten.');
      if (s.host_id !== interaction.user.id && !isMgmt) return theme.replyError(interaction, 'Nur der aktuelle Host oder das Community-Management darf die Host-Rechte übertragen.');
      if (target.id === s.host_id) return theme.replyError(interaction, 'Diese Person ist bereits Host.');
      const member = await interaction.guild.members.fetch(target.id).catch(() => null);
      if (!member) return theme.replyError(interaction, 'Diese Person ist nicht auf dem Server.');
      if (!perms.check(member, 'session.start').ok) return theme.replyError(interaction, 'Diese Person hat keine Session-Host-Berechtigung.');
      const old = s.host_id;
      if (s.cohost_id === target.id) sessions.assignHost(s, null, 'cohost', interaction.user.id);
      sessions.assignHost(sessions.get(s.id), target.id, 'host', interaction.user.id);
      await sessions.refreshMessage(interaction.client, s.id, true);
      await logHost(`Host-Rechte übertragen: <@${old}> → <@${target.id}> (durch <@${interaction.user.id}>).`);
      return theme.replySuccess(interaction, `Die Host-Rechte wurden an <@${target.id}> übertragen.`, false);
    }
    case 'info': {
      if (!s) return theme.reply(interaction, { embeds: [theme.info(g, 'Aktuell läuft keine Session.')] });
      const hosts = all('SELECT * FROM session_hosts WHERE session_id = ? ORDER BY started_at', s.id);
      const embed = theme.base(g, 'primary', `Session #${s.id}`).setTitle(`${E.host} Hosting – ${util.truncate(s.name, 80)}`)
        .addFields(
          { name: 'Host', value: `<@${s.host_id}>`, inline: true },
          { name: 'Co-Host', value: s.cohost_id ? `<@${s.cohost_id}>` : '–', inline: true },
          { name: 'Status', value: sessions.statusText(s.status), inline: true },
          { name: 'Verlauf', value: hosts.map((h) => `${h.role === 'host' ? 'Host' : 'Co-Host'} <@${h.user_id}> ${E.dot} seit ${util.ts(h.started_at, 't')}${h.ended_at ? ` bis ${util.ts(h.ended_at, 't')}` : ''}`).join('\n').slice(0, 1024) },
        );
      return theme.reply(interaction, { embeds: [embed] }, false);
    }
    case 'history': {
      const u = interaction.options.getUser('nutzer') || interaction.user;
      const rows = all(`SELECT h.*, s.name, s.duration, s.peak_players FROM session_hosts h JOIN sessions s ON s.id = h.session_id
        WHERE h.guild_id = ? AND h.user_id = ? ORDER BY h.started_at DESC LIMIT 15`, g, u.id);
      const embed = theme.base(g, 'primary').setTitle(`${E.calendar} Hosting-Verlauf – ${u.username}`)
        .setDescription(rows.length ? rows.map((r) => `**#${r.session_id} ${util.truncate(r.name, 40)}** ${E.dot} ${r.role === 'host' ? 'Host' : 'Co-Host'}\n${util.ts(r.started_at, 'd')} ${E.dot} ${util.duration((r.ended_at || Date.now()) - r.started_at)}${r.ended_at ? '' : ' (läuft)'}`).join('\n') : 'Noch keine Sessions gehostet.');
      return theme.reply(interaction, { embeds: [embed] }, false);
    }
    case 'stats': {
      const u = interaction.options.getUser('nutzer') || interaction.user;
      const st = sessions.hostStats(g, u.id);
      const embed = theme.base(g, 'primary').setTitle(`${E.stats} Hosting-Statistiken – ${u.username}`).setThumbnail(u.displayAvatarURL())
        .addFields(
          { name: 'Gehostete Sessions', value: String(st.sessions), inline: true },
          { name: 'Hosting-Stunden', value: `${util.hours(st.ms)} Std.`, inline: true },
          { name: 'Ø Spieler', value: st.avg ? st.avg.toFixed(1).replace('.', ',') : '–', inline: true },
          { name: 'Co-Host-Sessions', value: String(st.coSessions), inline: true },
          { name: 'Co-Host-Stunden', value: `${util.hours(st.coMs)} Std.`, inline: true },
          { name: 'Höchste Spielerzahl', value: String(st.peak || '–'), inline: true },
          { name: 'Zuletzt aktiv', value: st.last ? util.ts(st.last, 'R') : '–', inline: true },
        );
      return theme.reply(interaction, { embeds: [embed] }, false);
    }
    case 'leaderboard': {
      const rows = sessions.hostLeaderboard(g, interaction.options.getString('kriterium') || 'sessions');
      const medal = ['🥇', '🥈', '🥉'];
      return theme.reply(interaction, { embeds: [theme.base(g, 'primary').setTitle(`${E.trophy} Host-Rangliste`)
        .setDescription(rows.length ? rows.map((r, i) => `${medal[i] || `\`${i + 1}.\``} <@${r.user_id}> ${E.dot} **${r.sessions}** Sessions ${E.dot} **${util.hours(r.ms || 0)}** Std. ${E.dot} Ø ${r.avg ? r.avg.toFixed(1).replace('.', ',') : '–'} Spieler`).join('\n') : 'Noch keine Daten vorhanden.')] }, false);
    }
    default: return theme.replyError(interaction, 'Unbekannter Unterbefehl.');
  }
}

module.exports = { data, perms: permsMap, execute };
