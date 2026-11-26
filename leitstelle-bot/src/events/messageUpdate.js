// Bearbeitete Nachrichten protokollieren
const { Events } = require('discord.js');
const theme = require('../core/theme');
const util = require('../core/util');
const logger = require('../core/logger');

module.exports = {
  name: Events.MessageUpdate,
  async execute(before, after) {
    if (!after.guildId || after.guildId !== process.env.GUILD_ID || after.author?.bot || before.partial || before.content === after.content) return;
    await logger.discord(after.guildId, 'log', theme.base(after.guildId, 'warning').setTitle('✏️ Nachricht bearbeitet')
      .setDescription(`**Von:** <@${after.author.id}> ${theme.E.dot} <#${after.channelId}> ${theme.E.dot} [Zur Nachricht](${after.url})`)
      .addFields({ name: 'Vorher', value: util.truncate(before.content || '–', 1024) }, { name: 'Nachher', value: util.truncate(after.content || '–', 1024) }), { audit: false });
  },
};
