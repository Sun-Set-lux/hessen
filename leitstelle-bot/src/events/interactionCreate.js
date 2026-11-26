// Zentrale Verarbeitung aller Interaktionen mit Fehlerschutz
const { Events } = require('discord.js');
const handler = require('../core/handler');
const theme = require('../core/theme');
const { log } = require('../core/logger');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    try {
      await handler.handle(interaction);
    } catch (err) {
      log.error(`Interaktion ${interaction.commandName || interaction.customId}:`, err);
      if (interaction.isRepliable()) {
        await theme.replyError(interaction, 'Bei der Verarbeitung ist ein unerwarteter Fehler aufgetreten. Bitte versuche es erneut oder wende dich an die Administration.');
      }
    }
  },
};
