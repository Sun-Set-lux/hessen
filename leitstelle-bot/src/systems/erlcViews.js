// Darstellung von ER:LC-Daten als deutsche Embeds
const theme = require('../core/theme');
const util = require('../core/util');
const settings = require('../core/settings');
const logger = require('../core/logger');
const { run, now } = require('../core/database');
const erlc = require('./erlcManager');

const { E } = theme;
const robloxLink = (id, name) => (id ? `[${name || id}](https://www.roblox.com/users/${id}/profile)` : name || '–');
const stand = (d) => `Live-Daten ${E.dot} Stand ${util.ts(d._fetchedAt, 'R')}`;

function errorEmbed(guildId, err) {
  if (err?.offline) return theme.base(guildId, 'danger').setTitle(`${E.offline} Server offline`).setDescription('Der ER:LC Server ist aktuell offline – es befinden sich **keine Spieler** auf dem Server.');
  return theme.warning(guildId, `**ER:LC-Daten nicht verfügbar.**\n${err?.message || 'Unbekannter Fehler.'}`);
}

function infoEmbed(guildId, d) {
  const staff = d.Staff || {};
  const count = (o) => (o ? Object.keys(o).length : 0);
  return theme.base(guildId, 'primary', stand(d)).setTitle(`${E.server} Serverinformationen`)
    .setDescription(`## ${util.truncate(d.Name, 200)}`)
    .addFields(
      { name: '👑 Inhaber', value: robloxLink(d.OwnerId), inline: true },
      { name: '🤝 Co-Owner', value: d.CoOwnerIds?.length ? d.CoOwnerIds.map((id) => robloxLink(id)).join(', ').slice(0, 1024) : 'Keine', inline: true },
      { name: `${E.players} Spieler`, value: `**${d.CurrentPlayers}** / ${d.MaxPlayers}`, inline: true },
      { name: `${E.code} Servercode`, value: `\`${d.JoinKey}\``, inline: true },
      { name: '✔️ Verifizierungspflicht', value: erlc.VERIFY_DE[d.AccVerifiedReq] || d.AccVerifiedReq || '–', inline: true },
      { name: '⚖️ Team-Balance', value: d.TeamBalance ? 'Aktiviert' : 'Deaktiviert', inline: true },
      { name: `${E.shield} Ingame-Team`, value: d.Staff ? `${count(staff.Admins)} Admins ${E.dot} ${count(staff.Mods)} Mods ${E.dot} ${count(staff.Helpers)} Helfer` : 'Nicht verfügbar', inline: true },
      { name: `${E.queue} Warteschlange`, value: Array.isArray(d.Queue) ? `${d.Queue.length} wartend` : 'Nicht abgefragt', inline: true },
    );
}

function playersEmbed(guildId, d, teamFilter) {
  const players = Array.isArray(d.Players) ? d.Players : [];
  const embed = theme.base(guildId, 'primary', stand(d)).setTitle(`${E.players} Spielerliste – ${players.length}/${d.MaxPlayers}`);
  if (!players.length) return embed.setDescription('Aktuell sind **0 Spieler** auf dem Server.');
  const groups = {};
  for (const p of players) {
    const team = erlc.TEAMS_DE[p.Team] || p.Team || 'Unbekannt';
    if (teamFilter && team !== teamFilter) continue;
    const { name, id } = erlc.parsePlayer(p.Player);
    const perm = p.Permission && p.Permission !== 'Normal' ? ` ${E.shield} ${erlc.PERMISSION_DE[p.Permission] || p.Permission}` : '';
    const call = p.Callsign ? ` \`${p.Callsign}\`` : '';
    (groups[team] ||= []).push(`${robloxLink(id, name)}${call}${perm}`);
  }
  const entries = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  if (!entries.length) return embed.setDescription(`Im Team **${teamFilter}** sind aktuell **0 Spieler**.`);
  for (const [team, list] of entries.slice(0, 25)) {
    let value = '';
    for (const line of list) { if ((value + line).length > 1000) { value += '\n…'; break; } value += (value ? '\n' : '') + line; }
    embed.addFields({ name: `${team} (${list.length})`, value, inline: true });
  }
  return embed;
}

function queueEmbed(guildId, d) {
  const q = Array.isArray(d.Queue) ? d.Queue : [];
  return theme.base(guildId, 'primary', stand(d)).setTitle(`${E.queue} Ingame-Warteschlange`)
    .setDescription(q.length ? `**${q.length}** Spieler warten auf einen Platz.\n\n${q.slice(0, 20).map((id, i) => `\`${i + 1}.\` ${robloxLink(id)}`).join('\n')}${q.length > 20 ? '\n…' : ''}` : 'Aktuell wartet **niemand** in der Ingame-Warteschlange.')
    .addFields({ name: `${E.players} Spieler`, value: `${d.CurrentPlayers} / ${d.MaxPlayers}`, inline: true });
}

function staffEmbed(guildId, d) {
  const s = d.Staff || {};
  const list = (o) => (o && Object.keys(o).length ? Object.entries(o).map(([id, n]) => robloxLink(id, n)).join(', ').slice(0, 1024) : 'Keine');
  return theme.base(guildId, 'primary', stand(d)).setTitle(`${E.shield} Ingame-Team`).addFields(
    { name: 'Administratoren', value: list(s.Admins) },
    { name: 'Moderatoren', value: list(s.Mods) },
    { name: 'Helfer', value: list(s.Helpers) },
  );
}

const LOG_TYPES = {
  JoinLogs: 'Beitritte & Austritte',
  KillLogs: 'Kills',
  CommandLogs: 'Ingame-Befehle',
  ModCalls: 'Mod-Calls',
  EmergencyCalls: 'Notrufe',
  Vehicles: 'Fahrzeuge',
  Bans: 'Bans',
};

function logsEmbed(guildId, type, data) {
  const embed = theme.base(guildId, 'primary', data?._fetchedAt ? stand(data) : 'Live-Daten').setTitle(`📜 ${LOG_TYPES[type]}`);
  const p = (s) => { const x = erlc.parsePlayer(s); return robloxLink(x.id, x.name); };
  let lines = [];
  const desc = (arr) => [...arr].sort((a, b) => (b.Timestamp || b.StartedAt || 0) - (a.Timestamp || a.StartedAt || 0)).slice(0, 15);
  const t = (sec) => (sec ? `<t:${sec}:R>` : '');
  switch (type) {
    case 'JoinLogs': lines = desc(data.JoinLogs || []).map((l) => `${l.Join ? '🟢' : '🔴'} ${p(l.Player)} ${l.Join ? 'beigetreten' : 'verlassen'} ${t(l.Timestamp)}`); break;
    case 'KillLogs': lines = desc(data.KillLogs || []).map((l) => `💀 ${p(l.Killer)} → ${p(l.Killed)} ${t(l.Timestamp)}`); break;
    case 'CommandLogs': lines = desc(data.CommandLogs || []).map((l) => `⌨️ ${p(l.Player)}: \`${util.truncate(l.Command, 80).replace(/`/g, "'")}\` ${t(l.Timestamp)}`); break;
    case 'ModCalls': lines = desc(data.ModCalls || []).map((l) => `📞 ${p(l.Caller)} ${l.Moderator ? `– übernommen von ${p(l.Moderator)}` : '– **offen**'} ${t(l.Timestamp)}`); break;
    case 'EmergencyCalls': lines = desc(data.EmergencyCalls || []).map((c) => `🚑 **#${c.CallNumber}** ${erlc.TEAMS_DE[c.Team] || c.Team}: ${util.truncate(c.Description || 'Keine Beschreibung', 80)}${c.PositionDescriptor ? ` (${c.PositionDescriptor})` : ''} ${t(c.StartedAt)}`); break;
    case 'Vehicles': lines = (data.Vehicles || []).slice(0, 25).map((v) => `🚗 **${v.Name}** ${E.dot} ${v.Owner}${v.Plate ? ` ${E.dot} \`${v.Plate}\`` : ''}${v.ColorName ? ` ${E.dot} ${v.ColorName}` : ''}`); break;
    case 'Bans': {
      const entries = Array.isArray(data) ? data.map((x) => [x.PlayerId || x.id, x.Name || x.name]) : Object.entries(data || {}).filter(([k]) => !k.startsWith('_'));
      lines = entries.slice(0, 25).map(([id, name]) => `⛔ ${robloxLink(id, typeof name === 'string' ? name : String(id))}`);
      if (entries.length > 25) lines.push(`… und ${entries.length - 25} weitere`);
      break;
    }
    default: break;
  }
  return embed.setDescription(lines.length ? lines.join('\n').slice(0, 4000) : 'Keine Einträge vorhanden.');
}

// Ingame-Aktion protokollieren (Datenbank + Log-Kanal)
async function logAction(interaction, command, ok, error) {
  run('INSERT INTO erlc_actions (guild_id, user_id, command, success, error, at) VALUES (?,?,?,?,?,?)', interaction.guildId, interaction.user.id, command, ok ? 1 : 0, error || null, now());
  const embed = theme.base(interaction.guildId, ok ? 'success' : 'danger', 'ER:LC-Befehl')
    .setTitle(ok ? `${E.ok} Ingame-Befehl ausgeführt` : `${E.err} Ingame-Befehl fehlgeschlagen`)
    .addFields(
      { name: 'Befehl', value: `\`${util.truncate(command, 200).replace(/`/g, "'")}\`` },
      { name: 'Ausgeführt von', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Ergebnis', value: ok ? 'Von der ER:LC API bestätigt' : util.truncate(error || 'Fehler', 1000), inline: true },
    );
  await logger.discord(interaction.guildId, 'erlcLog', embed, { event: 'erlc.command', userId: interaction.user.id, details: { command, ok } });
}

/**
 * Führt einen Ingame-Befehl aus und antwortet mit einem deutschen Ergebnis.
 */
async function runCommand(interaction, command, successText) {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply();
  const waiting = erlc.queuedCommands();
  try {
    await erlc.command(command);
    await logAction(interaction, command, true);
    await interaction.editReply({ embeds: [theme.success(interaction.guildId, `${successText}\n-# Vom ER:LC-Server angenommen${waiting ? ` ${E.dot} kurz verzögert wegen API-Limit` : ''}.`)] });
    return true;
  } catch (err) {
    await logAction(interaction, command, false, err.message);
    await interaction.editReply({ embeds: [errorEmbed(interaction.guildId, err).setTitle(`${E.err} Befehl nicht ausgeführt`)] });
    return false;
  }
}

const showCode = (guildId) => settings.get(guildId, 'erlc.showCode');

module.exports = { errorEmbed, infoEmbed, playersEmbed, queueEmbed, staffEmbed, logsEmbed, LOG_TYPES, runCommand, logAction, robloxLink, showCode };
