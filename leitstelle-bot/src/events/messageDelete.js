// Gelöschte Nachrichten protokollieren
const { Events } = require('discord.js');
const theme = require('../core/theme');
const util = require('../core/util');
const logger = require('../core/logger');

module.exports = {
  name: Events.MessageDelete,
  async execute(message) {
    if (!message.guildId || message.guildId !== process.env.GUILD_ID || message.author?.bot || message.partial) return;
    const files = [...message.attachments.values()].map((a) => a.name).join(', ');
    await logger.discord(message.guildId, 'log', theme.base(message.guildId, 'danger').setTitle('🗑️ Nachricht gelöscht')
      .setDescription(`**Von:** <@${message.author.id}> ${theme.E.dot} **Kanal:** <#${message.channelId}>\n\n${util.truncate(message.content || '*(kein Text)*', 3500)}${files ? `\n\n📎 ${files}` : ''}`), { audit: false });
  },
};
