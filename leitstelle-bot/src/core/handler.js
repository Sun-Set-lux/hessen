// Lädt Befehle und Komponenten, prüft Berechtigungen zentral
const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');
const perms = require('./permissions');
const theme = require('./theme');
const { log } = require('./logger');
const util = require('./util');

const commands = new Collection();
const components = new Map(); // prefix -> handler(interaction, action, args)

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []));
}

function load(client) {
  for (const file of walk(path.join(__dirname, '..', 'commands'))) {
    const cmd = require(file);
    if (!cmd.data) continue;
    const json = cmd.data.toJSON();
    commands.set(json.name, cmd);
    // Standardrechte registrieren
    const subs = [];
    for (const opt of json.options || []) {
      if (opt.type === 1) subs.push(opt.name);
      if (opt.type === 2) for (const s of opt.options || []) subs.push(`${opt.name}.${s.name}`);
    }
    if (!subs.length) perms.register(json.name, cmd.perms?.['*'] || ['admin'], `/${json.name}`);
    for (const s of subs) perms.register(`${json.name}.${s}`, cmd.perms?.[s] || cmd.perms?.['*'] || ['admin'], `/${json.name} ${s.replace('.', ' ')}`);
  }
  for (const file of walk(path.join(__dirname, '..', 'interactions'))) {
    const mod = require(file);
    for (const prefix of [].concat(mod.prefix)) components.set(prefix, mod.handle);
  }
  client.commands = commands;
  log.info(`${commands.size} Befehle und ${components.size} Komponenten-Module geladen`);
}

async function registerCommands(client) {
  const body = commands.map((c) => c.data.toJSON());
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    await guild.commands.set(body);
    log.info(`${body.length} Slash-Befehle auf "${guild.name}" registriert`);
  } catch (err) {
    log.error('Befehle konnten nicht registriert werden. Stimmt die GUILD_ID und ist der Bot auf dem Server?', err.message);
  }
}

function keyOf(interaction) {
  const parts = [interaction.commandName];
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand(false);
  if (group) parts.push(group);
  if (sub) parts.push(sub);
  return parts.join('.');
}

async function handle(interaction) {
  // Nur auf dem konfigurierten Server
  if (interaction.guildId && interaction.guildId !== process.env.GUILD_ID) {
    if (interaction.isRepliable()) return theme.reply(interaction, 'Dieser Bot ist nur für einen bestimmten Server eingerichtet.');
    return;
  }

  if (interaction.isAutocomplete()) {
    const cmd = commands.get(interaction.commandName);
    if (cmd?.autocomplete) await cmd.autocomplete(interaction).catch(() => interaction.respond([]).catch(() => {}));
    return;
  }

  if (interaction.isChatInputCommand()) {
    if (!interaction.inGuild()) return theme.reply(interaction, 'Befehle funktionieren nur auf dem Server.');
    const cmd = commands.get(interaction.commandName);
    if (!cmd) return;
    const key = keyOf(interaction);
    const member = interaction.member;
    const result = perms.check(member, key);
    if (!result.ok) return theme.replyError(interaction, result.reason);
    return cmd.execute(interaction, { key });
  }

  if (interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) {
    const [prefix, action, ...args] = interaction.customId.split(':');
    const fn = components.get(prefix);
    if (!fn) return;
    // Doppelte Klicks abfangen: gesperrt nur, solange die vorherige Aktion noch läuft
    const lockKey = `${interaction.user.id}:${interaction.customId}:${interaction.message?.id}`;
    if (!interaction.isModalSubmit() && !util.lock(lockKey, 15000)) {
      return theme.reply(interaction, 'Bitte einen Moment warten – deine letzte Aktion wird noch verarbeitet.');
    }
    try { return await fn(interaction, action, args); } finally { if (!interaction.isModalSubmit()) util.unlock(lockKey); }
  }
}

module.exports = { load, registerCommands, handle, commands, components };
