// Dauerhafte Nachrichten (Panels) ohne Duplikate verwalten
const { one, run } = require('../core/database');
const { log } = require('../core/logger');

function getPanel(guildId, type, ref = '') {
  return one('SELECT * FROM panels WHERE guild_id = ? AND type = ? AND ref = ?', guildId, type, String(ref));
}

/**
 * Bearbeitet die bestehende Panel-Nachricht oder erstellt sie neu (nur eine pro Typ).
 */
async function upsert(client, guildId, type, ref, channelId, payload) {
  ref = String(ref ?? '');
  const existing = getPanel(guildId, type, ref);
  if (existing && existing.channel_id === channelId) {
    try {
      const ch = await client.channels.fetch(existing.channel_id);
      const msg = await ch.messages.fetch(existing.message_id);
      await msg.edit(payload);
      return msg;
    } catch (err) {
      if (![10008, 10003].includes(err.code)) { log.warn(`Panel ${type} konnte nicht bearbeitet werden: ${err.message}`); return null; }
    }
  } else if (existing) {
    // Kanal geändert: alte Nachricht entfernen
    try { const ch = await client.channels.fetch(existing.channel_id); await (await ch.messages.fetch(existing.message_id)).delete(); } catch { /* bereits weg */ }
  }
  const ch = await client.channels.fetch(channelId).catch(() => null);
  if (!ch?.isTextBased()) return null;
  const msg = await ch.send(payload);
  run(`INSERT INTO panels (guild_id, type, ref, channel_id, message_id) VALUES (?,?,?,?,?)
       ON CONFLICT(guild_id, type, ref) DO UPDATE SET channel_id = excluded.channel_id, message_id = excluded.message_id`,
  guildId, type, ref, channelId, msg.id);
  return msg;
}

async function remove(client, guildId, type, ref = '') {
  const p = getPanel(guildId, type, ref);
  if (!p) return false;
  try { const ch = await client.channels.fetch(p.channel_id); await (await ch.messages.fetch(p.message_id)).delete(); } catch { /* bereits weg */ }
  run('DELETE FROM panels WHERE guild_id = ? AND type = ? AND ref = ?', guildId, type, String(ref));
  return true;
}

module.exports = { getPanel, upsert, remove };
