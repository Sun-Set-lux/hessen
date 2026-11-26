// Automatisches ER:LC-Statuspanel (eine dauerhafte Nachricht)
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const settings = require('../core/settings');
const theme = require('../core/theme');
const util = require('../core/util');
const scheduler = require('../core/scheduler');
const { log } = require('../core/logger');
const erlc = require('./erlcManager');
const panels = require('./panels');
const sessions = require('./sessionManager');

const { E } = theme;
let lastSuccess = 0;

function buildStatusEmbed(guildId, snap) {
  const embed = theme.base(guildId, snap.ok ? 'success' : snap.error?.offline ? 'danger' : 'warning', 'ER:LC Serverstatus')
    .setTitle(`${E.server} ER:LC – Serverstatus`);
  const s = sessions.active(guildId);
  const sessionValue = s ? `${sessions.statusText(s.status)}\n${util.truncate(s.name, 60)}${s.message_id ? ` ${E.dot} [Zur Session](https://discord.com/channels/${guildId}/${s.channel_id}/${s.message_id})` : ''}` : 'Keine aktive Session';

  if (!erlc.hasKey()) {
    return embed.setDescription(`${E.warn} **Kein ER:LC API-Schlüssel hinterlegt.**\nDie Administration muss den Server-Key in der \`.env\` eintragen.`)
      .addFields({ name: `${E.session} Session`, value: sessionValue });
  }
  if (snap.ok) {
    const d = snap.data;
    const showCode = settings.get(guildId, 'erlc.showCode');
    embed.setDescription(`## ${util.truncate(d.Name, 200)}`).addFields(
      { name: 'Status', value: `${E.online} Online`, inline: true },
      { name: `${E.players} Spieler`, value: `**${d.CurrentPlayers}** / ${d.MaxPlayers}`, inline: true },
      { name: `${E.queue} Warteschlange`, value: Array.isArray(d.Queue) ? `${d.Queue.length} wartend` : 'Nicht verfügbar', inline: true },
      { name: `${E.code} Servercode`, value: showCode ? `\`${d.JoinKey}\`` : 'Nicht öffentlich', inline: true },
      { name: `${E.session} Session`, value: sessionValue, inline: true },
      { name: `${E.clock} Letzte Aktualisierung`, value: util.ts(snap.at, 'R'), inline: true },
    );
  } else if (snap.error?.offline) {
    embed.setDescription(`${E.offline} **Der Server ist offline.**\nAktuell befinden sich keine Spieler auf dem Server.`).addFields(
      { name: 'Status', value: `${E.offline} Offline`, inline: true },
      { name: `${E.players} Spieler`, value: '0', inline: true },
      { name: `${E.session} Session`, value: sessionValue, inline: true },
      { name: `${E.clock} Letzte Aktualisierung`, value: util.ts(snap.at, 'R'), inline: true },
    );
  } else {
    embed.setDescription(`${E.warn} **Live-Daten derzeit nicht verfügbar.**\n${snap.error?.message || 'Die ER:LC API antwortet nicht.'}\nEs werden bewusst keine veralteten Werte angezeigt.`).addFields(
      { name: 'Status', value: `${E.idle} Unbekannt`, inline: true },
      { name: `${E.players} Spieler`, value: 'Nicht verfügbar', inline: true },
      { name: `${E.session} Session`, value: sessionValue, inline: true },
      { name: `${E.clock} Letzte erfolgreiche Abfrage`, value: lastSuccess ? util.ts(lastSuccess, 'R') : 'Noch keine', inline: true },
    );
  }
  return embed;
}

const row = () => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('erlc:panelplayers').setStyle(ButtonStyle.Secondary).setLabel('Spielerliste').setEmoji('👥'),
  new ButtonBuilder().setCustomId('erlc:panelcode').setStyle(ButtonStyle.Secondary).setLabel('Servercode').setEmoji('🔑'),
);

let lastSnapshot = null;
const snapshot = () => lastSnapshot;

async function poll() {
  if (!erlc.hasKey()) { lastSnapshot = { ok: false, at: Date.now(), error: new erlc.ErlcError('Kein API-Schlüssel hinterlegt.') }; return lastSnapshot; }
  try {
    const data = await erlc.server(['Players', 'Queue'], 5000);
    lastSnapshot = { ok: true, at: data._fetchedAt, data };
    lastSuccess = data._fetchedAt;
  } catch (err) {
    lastSnapshot = { ok: false, at: Date.now(), error: err };
  }
  return lastSnapshot;
}

async function tick(client) {
  const guildId = process.env.GUILD_ID;
  const snap = await poll();
  await sessions.tick(client, guildId, snap).catch((err) => log.error('Session-Aktualisierung:', err));
  const channelId = settings.channel(guildId, 'status');
  if (channelId) {
    await panels.upsert(client, guildId, 'status', '', channelId, { embeds: [buildStatusEmbed(guildId, snap)], components: erlc.hasKey() ? [row()] : [] })
      .catch((err) => log.warn('Statuspanel:', err.message));
  }
}

function start(client) {
  const seconds = Math.max(30, Number(settings.get(process.env.GUILD_ID, 'erlc.refreshSeconds')) || 60);
  scheduler.every('erlc-status', seconds * 1000, () => tick(client), { immediate: true });
  log.info(`ER:LC-Statuspanel aktiv (alle ${seconds} Sekunden)`);
}

module.exports = { start, tick, buildStatusEmbed, snapshot, poll };
