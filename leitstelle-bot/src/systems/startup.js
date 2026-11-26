// Startet alle Hintergrunddienste nach dem Login (auch nach Neustarts)
const { log } = require('../core/logger');

function start(client) {
  // Module registrieren ihre geplanten Aufgaben beim Laden
  require('./announcementManager');
  require('./community');
  require('./serverStats');
  require('./jobs').register('queue-panel', 120000, (c) => require('./queueManager').refresh(c, process.env.GUILD_ID));
  require('./departmentManager').ensureDefaults(process.env.GUILD_ID);

  const modules = [
    ['ER:LC-Status & Sessions', () => require('./statusPanel').start(client)],
    ['Geplante Aufgaben', () => require('./jobs').start(client)],
  ];
  for (const [name, fn] of modules) {
    try { fn(); } catch (err) { log.error(`Dienst "${name}" konnte nicht gestartet werden:`, err); }
  }
  log.info('Alle Dienste gestartet');
}

module.exports = { start };
