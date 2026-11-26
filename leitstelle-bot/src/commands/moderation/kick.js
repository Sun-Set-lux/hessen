const { SlashCommandBuilder } = require('discord.js');
const theme = require('../../core/theme');
const mod = require('../../systems/moderationManager');

const data = new SlashCommandBuilder().setName('kick').setDescription('Kickt eine Person vom Discord-Server')
  .addUserOption((o) => o.setName('nutzer').setDescription('Person').setRequired(true))
  .addStringOption((o) => o.setName('grund').setDescription('Grund').setMaxLength(500));

async function execute(interaction) {
  const g = interaction.guildId;
  const user = interaction.options.getUser('nutzer');
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) return theme.replyError(interaction, 'Diese Person ist nicht auf dem Server.');
  const t = mod.checkTarget(interaction, member); if (!t.ok) return theme.replyError(interaction, t.reason);
  const r = mod.reasonOf(interaction); if (!r.ok) return theme.replyError(interaction, r.reason);
  if (!member.kickable) return theme.replyError(interaction, 'Ich kann diese Person nicht kicken.');
  await interaction.deferReply();
  const dm = await mod.notify(interaction.guild, user, 'kick', r.reason);
  try { await member.kick(`${interaction.user.tag}: ${r.reason}`.slice(0, 512)); } catch (err) { return interaction.editReply({ embeds: [theme.error(g, `Kick fehlgeschlagen: ${err.message}`)] }); }
  const id = await mod.record(interaction, 'kick', user, r.reason);
  return interaction.editReply({ embeds: [theme.success(g, `**${user.tag}** wurde gekickt. (Fall #${id})\n**Grund:** ${r.reason}${dm ? '' : '\n-# Keine Privatnachricht möglich.'}`)] });
}

module.exports = { data, perms: { '*': ['moderation'] }, execute };
