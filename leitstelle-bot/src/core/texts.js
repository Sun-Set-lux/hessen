// Anpassbare deutsche Textvorlagen. Platzhalter stehen in {geschweiften Klammern}.
const { one, run } = require('./database');

const TEMPLATES = {
  'session.start': {
    label: 'Session gestartet (Ankündigung)',
    vars: '{host} {name} {typ} {code}',
    text: '🚨 **Eine neue ER:LC-Session hat begonnen!**\n{host} hostet **{name}** ({typ}). Tritt jetzt bei und erlebe realistisches Roleplay mit unserer Community!',
  },
  'session.prep': {
    label: 'Session in Vorbereitung (Ankündigung)',
    vars: '{host} {name}',
    text: '🛠️ **Eine Session wird vorbereitet.**\n{host} bereitet **{name}** vor. Halte dich bereit – der Start wird in Kürze bekanntgegeben.',
  },
  'session.boost': {
    label: 'Verstärkung benötigt (Boost)',
    vars: '{spieler} {max} {code} {name}',
    text: '🚨 **Unsere ER:LC-Session benötigt Verstärkung!** Wir suchen weitere Spieler, die gemeinsam mit uns ein realistisches Roleplay-Erlebnis gestalten möchten. Tritt jetzt bei und unterstütze unsere Community!\n\n👥 Aktuell online: **{spieler}/{max}**',
  },
  'session.low': {
    label: 'Geringe Spielerzahl',
    vars: '{spieler} {max} {code}',
    text: '📉 **Die Spielerzahl ist aktuell niedrig.** Jeder weitere Spieler macht das Roleplay lebendiger – schau gerne vorbei!\n\n👥 Aktuell online: **{spieler}/{max}**',
  },
  'session.full': {
    label: 'Server fast voll',
    vars: '{spieler} {max}',
    text: '🔥 **Der Server ist fast voll!** Vielen Dank an alle Spieler. Wer noch dabei sein möchte, sollte sich beeilen.\n\n👥 Aktuell online: **{spieler}/{max}**',
  },
  'session.end': {
    label: 'Session beendet',
    vars: '{host} {dauer} {peak} {name}',
    text: '✅ **Die Session ist beendet.**\nVielen Dank an alle Teilnehmer! Die Session dauerte **{dauer}** mit bis zu **{peak}** Spielern gleichzeitig. Wir sehen uns bei der nächsten Session!',
  },
  'session.shutdown': {
    label: 'Server-Shutdown',
    vars: '{host} {dauer} {peak} {grund}',
    text: '⛔ **Server-Shutdown.**\nDie Session wurde beendet und der Server wird heruntergefahren. Grund: {grund}\nVielen Dank fürs Mitspielen!',
  },
  'session.lock': {
    label: 'Session gesperrt',
    vars: '{name}',
    text: '🔒 **Die Session ist vorübergehend für neue Spieler gesperrt.** Bitte tritt erst bei, wenn die Sperre aufgehoben wurde.',
  },
  'session.unlock': {
    label: 'Session entsperrt',
    vars: '{name} {code}',
    text: '🔓 **Die Session ist wieder für alle geöffnet.** Neue Spieler sind herzlich willkommen!',
  },
  'welcome': {
    label: 'Willkommensnachricht',
    vars: '{user} {name} {server} {anzahl}',
    text: 'Herzlich willkommen auf **{server}**, {user}! 👋\nDu bist unser **{anzahl}.** Mitglied. Bitte lies dir die Regeln durch und verifiziere dich, um loszulegen.',
  },
  'goodbye': {
    label: 'Abschiedsnachricht',
    vars: '{user} {name} {server} {anzahl}',
    text: '**{name}** hat {server} verlassen. Wir wünschen alles Gute! 👋',
  },
  'announce.allgemein': {
    label: 'Ankündigung (allgemein)',
    vars: '',
    text: 'Liebe Community,\n\n',
  },
  'announce.session': {
    label: 'Ankündigung (Session)',
    vars: '',
    text: 'Liebe Community,\n\nwir laden euch herzlich zu unserer nächsten ER:LC-Session ein.\n\n',
  },
  'announce.department': {
    label: 'Ankündigung (Abteilung)',
    vars: '',
    text: 'Liebe Mitglieder der Abteilung,\n\n',
  },
  'announce.emergency': {
    label: 'Ankündigung (Notfall)',
    vars: '',
    text: '⚠️ **Wichtige Mitteilung**\n\n',
  },
  'announce.maintenance': {
    label: 'Ankündigung (Wartung)',
    vars: '',
    text: '🔧 Unser Server wird gewartet. In dieser Zeit kann es zu Einschränkungen kommen.\n\n',
  },
  'modmail.greeting': {
    label: 'Modmail: Begrüßung',
    vars: '{user} {kategorie}',
    text: 'Hallo {user}, vielen Dank für deine Nachricht! Deine Unterhaltung in der Kategorie **{kategorie}** wurde eröffnet. Ein Teammitglied meldet sich so schnell wie möglich bei dir. Schreibe einfach hier im Privatchat weiter – alle Nachrichten werden an unser Team weitergeleitet.',
  },
  'modmail.closed': {
    label: 'Modmail: Unterhaltung geschlossen',
    vars: '{grund}',
    text: 'Deine Unterhaltung mit unserem Team wurde geschlossen.\n**Grund:** {grund}\n\nDu kannst jederzeit eine neue Unterhaltung starten, indem du hier erneut schreibst.',
  },
  'verify.panel': {
    label: 'Verifizierungs-Panel',
    vars: '{server}',
    text: 'Willkommen auf **{server}**!\n\nUm Zugriff auf alle Kanäle zu erhalten, bestätige bitte kurz, dass du ein echter Mensch bist. Klicke dazu auf **Jetzt verifizieren**.',
  },
  'level.up': {
    label: 'Level-Aufstieg',
    vars: '{user} {level}',
    text: '🎉 Glückwunsch {user}, du hast **Level {level}** erreicht!',
  },
};

function get(guildId, key) {
  const row = one('SELECT value FROM templates WHERE guild_id = ? AND key = ?', guildId, key);
  return row ? row.value : TEMPLATES[key]?.text ?? '';
}

function set(guildId, key, value) {
  run('INSERT INTO templates (guild_id, key, value) VALUES (?,?,?) ON CONFLICT(guild_id, key) DO UPDATE SET value = excluded.value',
    guildId, key, value);
}

function reset(guildId, key) {
  run('DELETE FROM templates WHERE guild_id = ? AND key = ?', guildId, key);
}

function render(guildId, key, vars = {}) {
  return get(guildId, key).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));
}

module.exports = { TEMPLATES, get, set, reset, render };
