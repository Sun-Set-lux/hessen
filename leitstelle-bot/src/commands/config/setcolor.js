const { SlashCommandBuilder } = require('discord.js');
const theme = require('../../core/theme');
const settings = require('../../core/settings');
const util = require('../../core/util');

const KINDS = { primary: 'Hauptfarbe', success: 'Erfolg', warning: 'Warnung', danger: 'Fehler', neutral: 'Neutral' };

const data = new SlashCommandBuilder()
  .setName('setcolor')
  .setDescription('Ändert die Embed-Farben des Bots')
  .addStringOption((o) => o.setName('art').setDescription('Welche Farbe?').setRequired(true).addChoices(...Object.entries(KINDS).map(([value, name]) => ({ name, value }))))
  .addStringOption((o) => o.setName('farbe').setDescription('Hex-Farbe, z. B. #4C7DFF („standard“ zum Zurücksetzen)').setRequired(true).setMaxLength(9));

async function execute(interaction) {
  const g = interaction.guildId;
  const kind = interaction.options.getString('art');
  const input = interaction.options.getString('farbe');
  if (input.toLowerCase() === 'standard') { settings.set(g, `colors.${kind}`, null); return theme.replySuccess(interaction, `**${KINDS[kind]}** wurde auf den Standard zurückgesetzt.`); }
  const color = util.parseColor(input);
  if (color === null) return theme.replyError(interaction, 'Ungültige Farbe. Bitte im Format `#RRGGBB` angeben, z. B. `#4C7DFF`.');
  settings.set(g, `colors.${kind}`, color);
  return theme.reply(interaction, { embeds: [theme.base(g, color).setDescription(`✅ **${KINDS[kind]}** ist jetzt \`#${color.toString(16).padStart(6, '0').toUpperCase()}\`. So sieht sie aus.`)] });
}

module.exports = { data, perms: { '*': ['admin'] }, execute };
