const { SlashCommandBuilder } = require('discord.js');
const theme = require('../../core/theme');
const mod = require('../../systems/moderationManager');

const data = new SlashCommandBuilder().setName('untimeout').setDescription('Hebt einen Timeout auf')
  .addUserOption((o) => o.setName('nutzer').setDescription('Person').setRequired(true))
  .addStringOption((o) => o.setName('grund').setDescription('Grund').setMaxLength(500));

async function execute(interaction) {
  const user = interaction.options.getUser('nutzer');
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) return theme.replyError(interaction, 'Diese Person ist nicht auf dem Server.');
  if (!member.isCommunicationDisabled()) return theme.replyError(interaction, 'Diese Person ist nicht im Timeout.');
  const r = mod.reasonOf(interaction); if (!r.ok) return theme.replyError(interaction, r.reason);
  try { await member.timeout(null, `${interaction.user.tag}: ${r.reason}`.slice(0, 512)); } catch (err) { return theme.replyError(interaction, `Fehlgeschlagen: ${err.message}`); }
  await mod.notify(interaction.guild, user, 'untimeout', r.reason);
  await mod.record(interaction, 'untimeout', user, r.reason);
  return theme.replySuccess(interaction, `Der Timeout von **${user.tag}** wurde aufgehoben.`, false);
}

module.exports = { data, perms: { '*': ['moderation'] }, execute };
