// Ankündigungen: Versand, Planung und Protokoll
const fs = require('fs');
const path = require('path');
const { one, all, run, now } = require('../core/database');
const theme = require('../core/theme');
const util = require('../core/util');
const logger = require('../core/logger');
const jobs = require('./jobs');

const uploadDir = path.join(__dirname, '..', '..', 'data', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const TYPES = {
  allgemein: { label: 'Ankündigung', emoji: '📢', color: 'primary' },
  session: { label: 'Session-Ankündigung', emoji: '🚨', color: 'primary' },
  department: { label: 'Abteilungs-Ankündigung', emoji: '🏛️', color: 'primary' },
  emergency: { label: 'Wichtige Mitteilung', emoji: '⚠️', color: 'danger' },
  maintenance: { label: 'Wartungsarbeiten', emoji: '🔧', color: 'warning' },
};

async function storeImage(url, name) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 8 * 1024 * 1024) throw new Error('Bild zu groß (max. 8 MB)');
  const ext = (name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z]/g, '') || 'png';
  const file = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  fs.writeFileSync(path.join(uploadDir, file), buf);
  return `file:${file}`;
}

async function send(client, a) {
  const g = a.guild_id;
  const t = TYPES[a.type] || TYPES.allgemein;
  const ch = await client.channels.fetch(a.channel_id);
  const embed = theme.base(g, a.color ?? t.color, t.label).setTitle(`${t.emoji} ${a.title || t.label}`).setDescription(a.content);
  const files = [];
  if (a.image_url?.startsWith('file:')) {
    const file = path.join(uploadDir, a.image_url.slice(5));
    if (fs.existsSync(file)) { files.push({ attachment: file, name: `bild.${file.split('.').pop()}` }); embed.setImage(`attachment://bild.${file.split('.').pop()}`); }
  } else if (a.image_url) embed.setImage(a.image_url);
  const ping = a.role_id === 'everyone' ? '@everyone' : a.role_id ? `<@&${a.role_id}>` : undefined;
  const msg = await ch.send({ content: ping, embeds: [embed], files, allowedMentions: a.role_id === 'everyone' ? { parse: ['everyone'] } : { roles: a.role_id ? [a.role_id] : [] } });
  run("UPDATE announcements SET status = 'gesendet', sent_at = ?, message_id = ? WHERE id = ?", now(), msg.id, a.id);
  if (ch.type === 5) msg.crosspost().catch(() => {}); // Ankündigungskanal: veröffentlichen
  await logger.discord(g, 'log', theme.base(g, 'neutral', `Ankündigung #${a.id}`).setDescription(`📢 **${t.label}** von <@${a.author_id}> in <#${a.channel_id}>${a.send_at ? ' (geplant)' : ''}\n[Zur Nachricht](${msg.url})`), { event: 'announcement.sent', userId: a.author_id });
  return msg;
}

function create(data) {
  return run(`INSERT INTO announcements (guild_id, type, channel_id, title, content, role_id, image_url, color, author_id, send_at, status, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, data.guildId, data.type, data.channelId, data.title || null, data.content, data.roleId || null, data.image || null,
  data.color ?? null, data.authorId, data.sendAt || null, data.sendAt ? 'geplant' : 'wird gesendet', now()).lastInsertRowid;
}

const get = (id) => one('SELECT * FROM announcements WHERE id = ?', Number(id));

jobs.register('announcements', 30000, async (client) => {
  for (const a of all("SELECT * FROM announcements WHERE status = 'geplant' AND send_at <= ?", now())) {
    try { await send(client, a); } catch (err) {
      run("UPDATE announcements SET status = 'fehlgeschlagen', error = ? WHERE id = ?", err.message, a.id);
      await logger.discord(a.guild_id, 'log', theme.error(a.guild_id, `Geplante Ankündigung #${a.id} konnte nicht gesendet werden: ${util.truncate(err.message, 300)}`), { event: 'announcement.failed' });
    }
  }
});

module.exports = { TYPES, storeImage, send, create, get };
