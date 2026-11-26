// Leitstelle – Deutscher ER:LC Community-Bot
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, Events, ActivityType } = require('discord.js');

for (const key of ['DISCORD_TOKEN', 'GUILD_ID']) {
  if (!process.env[key]) {
    console.error(`❌ In der .env fehlt: ${key}. Bitte .env.example in .env umbenennen und ausfüllen.`);
    process.exit(1);
  }
}

const { log, setClient } = require('./src/core/logger');
const { ensureGuild } = require('./src/core/database');
const handler = require('./src/core/handler');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.User],
});

setClient(client);
handler.load(client);

// Ereignisse laden
const eventDir = path.join(__dirname, 'src', 'events');
for (const file of fs.readdirSync(eventDir).filter((f) => f.endsWith('.js'))) {
  const ev = require(path.join(eventDir, file));
  client[ev.once ? 'once' : 'on'](ev.name, (...args) => Promise.resolve(ev.execute(...args, client)).catch((err) => log.error(`Ereignis ${ev.name}:`, err)));
}

client.once(Events.ClientReady, async (c) => {
  log.info(`Eingeloggt als ${c.user.tag}`);
  ensureGuild(process.env.GUILD_ID);
  await handler.registerCommands(client);
  c.user.setPresence({ activities: [{ name: 'ER:LC Sessions', type: ActivityType.Watching }], status: 'online' });
  require('./src/systems/startup').start(client);
});

process.on('unhandledRejection', (err) => log.error('Unbehandelter Fehler:', err));
process.on('uncaughtException', (err) => log.error('Unerwarteter Fehler:', err));

const shutdown = () => {
  log.info('Bot wird beendet …');
  try { require('./src/core/database').db.close(); } catch { /* bereits geschlossen */ }
  client.destroy().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

client.login(process.env.DISCORD_TOKEN).catch((err) => {
  log.error('Login fehlgeschlagen. Ist der DISCORD_TOKEN korrekt?', err.message);
  process.exit(1);
});
