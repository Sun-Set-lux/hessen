// Allgemeine Hilfsfunktionen
const crypto = require('crypto');

const ts = (ms, style = 'f') => (ms ? `<t:${Math.floor(ms / 1000)}:${style}>` : '–');

function duration(ms) {
  if (!ms || ms < 0) return '0 Min.';
  const totalMin = Math.round(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  const parts = [];
  if (d) parts.push(`${d} ${d === 1 ? 'Tag' : 'Tage'}`);
  if (h) parts.push(`${h} Std.`);
  if (m || !parts.length) parts.push(`${m} Min.`);
  return parts.join(' ');
}

const hours = (ms) => (ms / 3600000).toLocaleString('de-DE', { maximumFractionDigits: 1 });

// "30m", "2h", "1d", "1w", "1h30m" -> Millisekunden
function parseDuration(input) {
  if (!input) return null;
  const re = /(\d+)\s*(s|sek|m|min|h|std|d|t|tag|tage|w|wo)/gi;
  let total = 0; let match; let found = false;
  const unit = { s: 1e3, sek: 1e3, m: 6e4, min: 6e4, h: 36e5, std: 36e5, d: 864e5, t: 864e5, tag: 864e5, tage: 864e5, w: 6048e5, wo: 6048e5 };
  while ((match = re.exec(input))) { found = true; total += Number(match[1]) * unit[match[2].toLowerCase()]; }
  return found && total > 0 ? total : null;
}

// Berlin-Offset für ein Datum berechnen (Sommer-/Winterzeit)
function berlinOffsetMs(date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(date).reduce((a, p) => ({ ...a, [p.type]: p.value }), {});
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Zeitpunkt aus deutscher Eingabe: "in 30m", "30m", "18:30", "24.12.2026 18:30" (deutsche Zeit)
 */
function parseTime(input) {
  if (!input) return null;
  const s = input.trim().toLowerCase();
  const rel = parseDuration(s.replace(/^in\s+/, ''));
  if (rel && !/[.:]/.test(s)) return Date.now() + rel;
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})\s+(\d{1,2}):(\d{2})$/);
  let y; let mo; let d; let h; let mi;
  if (m) { [, d, mo, y, h, mi] = m.map(Number); if (y < 100) y += 2000; }
  else {
    m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const nowBerlin = new Date(Date.now() + berlinOffsetMs(new Date()));
    y = nowBerlin.getUTCFullYear(); mo = nowBerlin.getUTCMonth() + 1; d = nowBerlin.getUTCDate();
    h = Number(m[1]); mi = Number(m[2]);
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let result = guess - berlinOffsetMs(new Date(guess));
  if (!/\./.test(s) && result < Date.now()) result += 864e5; // nur Uhrzeit -> nächster Tag
  return result;
}

const truncate = (s, n) => (!s ? '' : s.length > n ? s.slice(0, n - 1) + '…' : s);
const clean = (s) => String(s ?? '').replace(/@(everyone|here)/g, '@​$1');

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const isUrl = (s) => /^https?:\/\/\S+$/i.test(s || '');

function parseColor(input) {
  if (!input) return null;
  const hex = input.trim().replace('#', '');
  return /^[0-9a-f]{6}$/i.test(hex) ? parseInt(hex, 16) : null;
}

// Signierte Werte für customIds (z. B. Captcha), bleiben auch nach Neustart gültig
const SECRET = crypto.createHash('sha256').update(String(process.env.DISCORD_TOKEN || 'leitstelle')).digest();
const sign = (value) => crypto.createHmac('sha256', SECRET).update(String(value)).digest('hex').slice(0, 16);

// Verhindert doppelte Ausführung derselben Aktion (z. B. Doppelklick)
const locks = new Map();
function lock(key, ms = 3000) {
  const t = locks.get(key);
  if (t && t > Date.now()) return false;
  locks.set(key, Date.now() + ms);
  if (locks.size > 5000) for (const [k, v] of locks) if (v < Date.now()) locks.delete(k);
  return true;
}
const unlock = (key) => locks.delete(key);

const numberDe = (n) => Number(n || 0).toLocaleString('de-DE');

module.exports = { ts, duration, hours, parseDuration, parseTime, truncate, clean, chunk, isUrl, parseColor, sign, lock, unlock, numberDe };
