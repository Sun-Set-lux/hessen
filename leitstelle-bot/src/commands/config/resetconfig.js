const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const theme = require('../../core/theme');

const SCOPES = { alles: 'Alles', channels: 'Kanäle', roles: 'Rollen', colors: 'Farben', vorlagen: 'Textvorlagen', berechtigungen: 'Berechtigungen & Befehls-Ausnahmen', erlc: 'ER:LC-Einstellungen', session: 'Session-Einstellungen' };

const data = new SlashCommandBuilder()
  .setName('resetconfig')
  .setDescription('Setzt die Konfiguration zurück (Daten wie Sessions bleiben erhalten)')
  .addStringOption((o) => o.setName('bereich').setDescription('Was soll zurückgesetzt werden?').setRequired(true).addChoices(...Object.entries(SCOPES).map(([value, name]) => ({ name, value }))));

async function execute(interaction) {
  const scope = interaction.options.getString('bereich');
  return theme.reply(interaction, {
    embeds: [theme.warning(interaction.guildId, `Möchtest du **${SCOPES[scope]}** wirklich auf die Standardwerte zurücksetzen? Das kann nicht rückgängig gemacht werden.\n-# Sessions, Statistiken, Abteilungen und andere Daten bleiben erhalten.`, 'Zurücksetzen bestätigen')],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`cfg:reset:${scope}`).setStyle(ButtonStyle.Danger).setLabel('Zurücksetzen'),
      new ButtonBuilder().setCustomId('cfg:cancel').setStyle(ButtonStyle.Secondary).setLabel('Abbrechen'),
    )],
  });
}

module.exports = { data, perms: { '*': ['admin'] }, execute, SCOPES };
