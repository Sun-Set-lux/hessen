// Offizielle ER:LC (PRC) Private-Server-API – https://apidocs.erlc.gg
// Nur dokumentierte Endpunkte: GET /v2/server (+ Flags), POST /v2/server/command, GET /v1/server/bans
const { log } = require('../core/logger');

const BASE = 'https://api.erlc.gg';
const COMMAND_GAP_MS = 5200; // Dokumentiert: 1 Befehl pro 5 Sekunden

const ERROR_TEXT = {
  0: 'Unbekannter Fehler der ER:LC API.',
  1001: 'Die ER:LC API konnte den Spielserver nicht erreichen (Roblox-Kommunikationsfehler).',
  1002: 'Interner Fehler der ER:LC API.',
  2000: 'Es ist kein ER:LC Server-Key hinterlegt.',
  2001: 'Der ER:LC Server-Key hat ein ungültiges Format.',
  2002: 'Der ER:LC Server-Key ist ungültig oder abgelaufen. Bitte erzeuge im Spiel einen neuen Schlüssel.',
  2003: 'Der globale ER:LC API-Schlüssel ist ungültig.',
  2004: 'Dieser Server-Key wurde von der ER:LC API gesperrt.',
  2005: 'Anfragen für mehrere Server sind ohne globalen API-Schlüssel nicht erlaubt.',
  3001: 'Es wurde kein gültiger Befehl übermittelt.',
  3002: 'Der ER:LC Server ist offline (keine Spieler auf dem Server).',
  4000: 'Kein Zugriff auf diesen ER:LC Server.',
  4001: 'Die ER:LC API hat die Anfragen vorübergehend begrenzt. Bitte kurz warten.',
  4002: 'Dieser Ingame-Befehl ist über die API gesperrt.',
  4003: 'Diese Nachricht wurde von der ER:LC API abgelehnt (unzulässiger Inhalt).',
  9998: 'Diese Funktion ist für diesen Server eingeschränkt.',
  9999: 'Das Ingame-Modul ist veraltet. Bitte alle Spieler kicken bzw. den Server neu starten und es erneut versuchen.',
};

class ErlcError extends Error {
  constructor(message, { code = null, status = null, offline = false, retryAfter = null } = {}) {
    super(message);
    this.code = code; this.status = status; this.offline = offline; this.retryAfter = retryAfter;
  }
}

let blockedUntil = 0;           // globale Pause nach 429
let keyInvalidUntil = 0;        // nach ungültigem Schlüssel nicht weiter anfragen (verhindert API-Sperre)
const bucketReset = new Map();  // Bucket -> Zeitpunkt, ab dem wieder Anfragen erlaubt sind

const hasKey = () => Boolean(process.env.ERLC_API_KEY);

async function request(method, path, body, bucket = 'global') {
  if (!hasKey()) throw new ErlcError(ERROR_TEXT[2000] + ' Trage ihn als ERLC_API_KEY in der .env ein.', { code: 2000 });
  const t = Date.now();
  if (keyInvalidUntil > t) throw new ErlcError(ERROR_TEXT[2002], { code: 2002 });
  const wait = Math.max(blockedUntil, bucketReset.get(bucket) || 0) - t;
  if (wait > 0) {
    if (wait > 8000) throw new ErlcError(`Die ER:LC API ist gerade ausgelastet. Bitte in ${Math.ceil(wait / 1000)} Sekunden erneut versuchen.`, { code: 4001, retryAfter: wait });
    await new Promise((r) => setTimeout(r, wait));
  }

  const headers = { 'server-key': process.env.ERLC_API_KEY, Accept: 'application/json' };
  if (process.env.ERLC_GLOBAL_KEY) headers.Authorization = process.env.ERLC_GLOBAL_KEY;
  if (body) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(12000) });
  } catch (err) {
    throw new ErlcError('Die ER:LC API ist momentan nicht erreichbar. Bitte später erneut versuchen.', { code: 'network' });
  }

  // Rate-Limit-Header beachten
  const remaining = Number(res.headers.get('x-ratelimit-remaining'));
  const reset = Number(res.headers.get('x-ratelimit-reset'));
  const bucketName = res.headers.get('x-ratelimit-bucket') || bucket;
  if (!Number.isNaN(remaining) && remaining <= 0 && reset) bucketReset.set(bucketName, reset * 1000 + 250);

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }

  if (res.ok) return data;

  const code = data?.code ?? null;
  if (res.status === 429) {
    const retry = Number(res.headers.get('retry-after')) || Number(data?.retry_after) || 5;
    blockedUntil = Date.now() + retry * 1000 + 250;
    log.warn(`ER:LC API Rate-Limit – Pause für ${retry}s (Bucket ${bucketName}, Code ${code})`);
    throw new ErlcError(`Die ER:LC API hat das Anfragelimit erreicht. Bitte in ${Math.ceil(retry)} Sekunden erneut versuchen.`, { code: code ?? 4001, status: 429, retryAfter: retry * 1000 });
  }
  if (res.status === 422 || code === 3002) throw new ErlcError(ERROR_TEXT[3002], { code: 3002, status: res.status, offline: true });
  if (code && [2001, 2002, 2004].includes(code)) keyInvalidUntil = Date.now() + 10 * 60 * 1000;
  if (res.status === 403 && !code) keyInvalidUntil = Date.now() + 5 * 60 * 1000;
  const msg = (code !== null && ERROR_TEXT[code]) || (res.status === 403 ? 'Zugriff verweigert – bitte den ER:LC Server-Key prüfen.' : `Die ER:LC API meldet einen Fehler (HTTP ${res.status}).`);
  throw new ErlcError(msg, { code, status: res.status });
}

// ---------- Serverdaten mit Cache ----------
const cache = new Map(); // flagsKey -> { data, at }
const inflight = new Map();

/**
 * Lädt Serverinformationen. flags: ['Players','Staff','JoinLogs','Queue','KillLogs','CommandLogs','ModCalls','EmergencyCalls','Vehicles']
 * maxAge: maximal erlaubtes Alter gecachter Daten in ms
 */
async function server(flags = [], maxAge = 10000) {
  const key = [...flags].sort().join(',');
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at <= maxAge) return { ...cached.data, _fetchedAt: cached.at, _cached: true };
  // Ein umfassenderer Cache-Eintrag reicht auch
  for (const [k, v] of cache) {
    if (Date.now() - v.at <= maxAge && flags.every((f) => k.split(',').includes(f))) return { ...v.data, _fetchedAt: v.at, _cached: true };
  }
  if (inflight.has(key)) return inflight.get(key);
  const qs = flags.length ? '?' + flags.map((f) => `${f}=true`).join('&') : '';
  const p = request('GET', `/v2/server${qs}`)
    .then((data) => {
      const at = Date.now();
      cache.set(key, { data, at });
      lastStatus = { ok: true, at, data, error: null };
      return { ...data, _fetchedAt: at, _cached: false };
    })
    .catch((err) => {
      lastStatus = { ok: false, at: Date.now(), data: null, error: err };
      throw err;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

let lastStatus = { ok: false, at: 0, data: null, error: null };
const status = () => lastStatus;

const bans = () => request('GET', '/v1/server/bans');

// ---------- Ingame-Befehle (seriell, 1 pro 5 s) ----------
let chain = Promise.resolve();
let lastCommandAt = 0;

function command(cmd) {
  const run = async () => {
    const gap = lastCommandAt + COMMAND_GAP_MS - Date.now();
    if (gap > 0) await new Promise((r) => setTimeout(r, gap));
    lastCommandAt = Date.now();
    const res = await request('POST', '/v2/server/command', { command: cmd }, 'command');
    // Erfolg nur, wenn die API ihn bestätigt
    if (!res || String(res.message).toLowerCase() !== 'success') {
      throw new ErlcError(`Die ER:LC API hat den Befehl nicht bestätigt${res?.message ? ` (${res.message})` : ''}.`);
    }
    return res;
  };
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}

const queuedCommands = () => Math.max(0, Math.ceil((lastCommandAt + COMMAND_GAP_MS - Date.now()) / COMMAND_GAP_MS));

// "Name:12345" -> { name, id }
function parsePlayer(s) {
  const str = String(s ?? '');
  const i = str.lastIndexOf(':');
  return i === -1 ? { name: str, id: null } : { name: str.slice(0, i), id: str.slice(i + 1) };
}

// Roblox-Benutzername oder -ID prüfen (verhindert manipulierte Befehle)
const validTarget = (s) => /^[A-Za-z0-9_]{3,20}$/.test(s) || /^\d{1,20}$/.test(s);
// Text für :m / :h / :pm säubern
const cleanText = (s) => String(s).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);

const TEAMS_DE = {
  Police: 'Polizei', Sheriff: 'Sheriff', Fire: 'Feuerwehr', EMS: 'Rettungsdienst', DOT: 'DOT', Civilian: 'Zivilist', Jail: 'Gefängnis', 'Fire/EMS': 'Feuerwehr/RD',
};
const PERMISSION_DE = {
  Normal: 'Spieler', 'Server Helper': 'Helfer', 'Server Moderator': 'Moderator', 'Server Administrator': 'Administrator', 'Server Co-Owner': 'Co-Owner', 'Server Owner': 'Inhaber',
};
const VERIFY_DE = { Disabled: 'Deaktiviert', Email: 'E-Mail', 'Phone/ID': 'Telefon/Ausweis' };

module.exports = { ErlcError, hasKey, server, status, bans, command, queuedCommands, parsePlayer, validTarget, cleanText, TEAMS_DE, PERMISSION_DE, VERIFY_DE, request };
