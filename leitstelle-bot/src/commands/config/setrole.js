const { SlashCommandBuilder } = require('discord.js');
const theme = require('../../core/theme');
const settings = require('../../core/settings');

const data = new SlashCommandBuilder()
  .setName('setrole')
  .setDescription('Legt eine Rolle für eine Funktion fest')
  .addStringOption((o) => o.setName('art').setDescription('Wofür wird die Rolle genutzt?').setRequired(true)
    .addChoices(...Object.entries(settings.ROLE_TYPES).map(([value, name]) => ({ name, value }))))
  .addRoleOption((o) => o.setName('rolle').setDescription('Rolle (leer lassen zum Entfernen)'));

async function execute(interaction) {
  const g = interaction.guildId;
  const type = interaction.options.getString('art');
  const role = interaction.options.getRole('rolle');
  if (!role) { settings.set(g, `roles.${type}`, null); return theme.replySuccess(interaction, `**${settings.ROLE_TYPES[type]}** wurde entfernt.`); }
  if (role.managed || role.id === g) return theme.replyError(interaction, 'Diese Rolle kann nicht verwendet werden.');
  const assignable = ['verification', 'onDuty', 'autoRole'].includes(type);
  if (assignable && role.position >= interaction.guild.members.me.roles.highest.position) {
    return theme.replyError(interaction, `Ich kann <@&${role.id}> nicht vergeben, weil sie über meiner höchsten Rolle steht. Bitte ziehe meine Rolle in den Servereinstellungen nach oben.`);
  }
  settings.set(g, `roles.${type}`, role.id);
  return theme.replySuccess(interaction, `**${settings.ROLE_TYPES[type]}** ist jetzt <@&${role.id}>.`);
}

module.exports = { data, perms: { '*': ['admin'] }, execute };
