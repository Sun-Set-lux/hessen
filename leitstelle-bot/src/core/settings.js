// Gespeicherte Server-Einstellungen (alles über Discord änderbar)
const { one, all, run } = require('./database');

const DEFAULTS = {
  'brand.name': 'Leitstelle',
  'brand.icon': '',

  'colors.primary': 0x4c7dff,
  'colors.success': 0x2fbf71,
  'colors.warning': 0xf5a524,
  'colors.danger': 0xe5484d,
  'colors.neutral': 0x2b2d31,

  'erlc.refreshSeconds': 60,
  'erlc.showCode': true,
  'erlc.joinLink': '',

  'session.defaultType': 'Standard-Roleplay',
  'session.defaultRequirements': 'Verifizierter Discord-Account\nMindestalter laut Serverregeln\nFunktionierendes Mikrofon empfohlen',
  'session.defaultRules': '1. Respektvoller Umgang mit allen Spielern.\n2. Kein RDM / VDM.\n3. Realistisches Roleplay – kein Fail-RP.\n4. Anweisungen des Teams sind zu befolgen.\n5. Teamkontakt über :modcall oder Modmail.',
  'session.minPlayers': 10,
  'session.fullThreshold': 90,

  'verify.minAccountDays': 0,
  'verify.captcha': true,

  'mod.requireReason': true,
  'mod.dmUsers': true,

  'applications.cooldownDays': 7,

  'level.enabled': true,
  'level.cooldownSeconds': 60,
  'level.announce': true,

  'welcome.enabled': true,
  'goodbye.enabled': true,

  'queue.notifyTop': 3,

  'stats.channels': {},
};

// Kanal- und Rollenarten mit deutschen Namen (für /setchannel, /setrole, /setup)
const CHANNEL_TYPES = {
  session: 'Session-Kanal',
  status: 'ER:LC-Statuskanal',
  sessionLog: 'Session-Log',
  erlcLog: 'ER:LC-Befehlslog',
  modmailCategory: 'Modmail-Kategorie',
  modmailLog: 'Modmail-Log',
  application: 'Bewerbungs-Auswertung',
  applicationLog: 'Bewerbungs-Log',
  modLog: 'Moderations-Log',
  log: 'Allgemeines Log',
  staffLog: 'Team-Log',
  departmentLog: 'Abteilungs-Log',
  verificationLog: 'Verifizierungs-Log',
  welcome: 'Willkommenskanal',
  goodbye: 'Abschiedskanal',
  announcement: 'Ankündigungskanal',
  suggestion: 'Vorschlagskanal',
  level: 'Level-Benachrichtigungen',
  queue: 'Warteschlangen-Kanal',
};

const ROLE_TYPES = {
  verification: 'Verifiziert-Rolle',
  sessionPing: 'Session-Ping',
  boostPing: 'Verstärkungs-Ping',
  announcement: 'Ankündigungs-Ping',
  onDuty: 'Im-Dienst-Rolle',
  autoRole: 'Automatische Beitrittsrolle',
  queueCall: 'Warteschlangen-Aufruf',
};

// Log-Arten fallen auf das allgemeine Log zurück
const LOG_FALLBACK = ['sessionLog', 'erlcLog', 'modmailLog', 'applicationLog', 'modLog', 'staffLog', 'departmentLog', 'verificationLog'];

function get(guildId, key) {
  const row = one('SELECT value FROM config WHERE guild_id = ? AND key = ?', guildId, key);
  if (row && row.value !== null) {
    try { return JSON.parse(row.value); } catch { return row.value; }
  }
  return DEFAULTS[key] ?? null;
}

function set(guildId, key, value) {
  if (value === null || value === undefined) return run('DELETE FROM config WHERE guild_id = ? AND key = ?', guildId, key);
  run('INSERT INTO config (guild_id, key, value) VALUES (?,?,?) ON CONFLICT(guild_id, key) DO UPDATE SET value = excluded.value',
    guildId, key, JSON.stringify(value));
}

function channel(guildId, type) {
  const id = get(guildId, `channels.${type}`);
  if (id) return id;
  if (LOG_FALLBACK.includes(type)) return get(guildId, 'channels.log');
  return null;
}

const role = (guildId, type) => get(guildId, `roles.${type}`);

function allSet(guildId) {
  return all('SELECT key, value FROM config WHERE guild_id = ?', guildId);
}

function reset(guildId, scope) {
  if (!scope || scope === 'alles') {
    run('DELETE FROM config WHERE guild_id = ?', guildId);
    run('DELETE FROM templates WHERE guild_id = ?', guildId);
    run('DELETE FROM permission_roles WHERE guild_id = ?', guildId);
    run('DELETE FROM command_rules WHERE guild_id = ?', guildId);
    return;
  }
  if (scope === 'vorlagen') return run('DELETE FROM templates WHERE guild_id = ?', guildId);
  if (scope === 'berechtigungen') {
    run('DELETE FROM permission_roles WHERE guild_id = ?', guildId);
    return run('DELETE FROM command_rules WHERE guild_id = ?', guildId);
  }
  run('DELETE FROM config WHERE guild_id = ? AND key LIKE ?', guildId, `${scope}.%`);
}

module.exports = { DEFAULTS, CHANNEL_TYPES, ROLE_TYPES, get, set, channel, role, allSet, reset };
