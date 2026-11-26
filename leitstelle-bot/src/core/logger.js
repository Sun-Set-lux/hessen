// Konsolen-/Datei-Logging und Discord-Log-Kanäle
const fs = require('fs');
const path = require('path');
const settings = require('./settings');
const { audit } = require('./database');

const logDir = path.join(__dirname, '..', '..', 'logs');
fs.mkdirSync(logDir, { recursive: true });
const file = () => path.join(logDir, `bot-${new Date().toISOString().slice(0, 10)}.log`);

function write(level, args) {
  const line = `[${new Date().toISOString()}] [${level}] ${args.map((a) => (a instanceof Error ? a.stack : typeof a === 'object' ? JSON.stringify(a) : a)).join(' ')}`;
  (level === 'FEHLER' ? console.error : console.log)(line);
  fs.appendFile(file(), line + '\n', () => {});
}

const log = {
  info: (...a) => write('INFO', a),
  warn: (...a) => write('WARNUNG', a),
  error: (...a) => write('FEHLER', a),
};

let client = null;
const setClient = (c) => { client = c; };

/**
 * Sendet ein Embed in den passenden Log-Kanal und speichert es im Audit-Log.
 */
async function discord(guildId, type, embed, meta = {}) {
  if (meta.audit !== false) audit(guildId, meta.event || type, meta.userId, meta.targetId, meta.details);
  if (!client) return;
  const channelId = settings.channel(guildId, type);
  if (!channelId) return;
  try {
    const ch = await client.channels.fetch(channelId);
    if (ch?.isTextBased()) await ch.send({ embeds: [embed], files: meta.files || [], allowedMentions: { parse: [] } });
  } catch (err) {
    log.warn(`Log-Kanal ${type} (${channelId}) nicht erreichbar: ${err.message}`);
  }
}

module.exports = { log, discord, setClient };
