const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const theme = require('../../core/theme');
const mod = require('../../systems/moderationManager');

const data = new SlashCommandBuilder().setName('clear').setDescription('Löscht Nachrichten in diesem Kanal')
  .addIntegerOption((o) => o.setName('anzahl').setDescription('Anzahl (1–100)').setRequired(true).setMinValue(1).setMaxValue(100))
  .addUserOption((o) => o.setName('nutzer').setDescription('Nur Nachrichten dieser Person'));

async function execute(interaction) {
  const g = interaction.guildId;
  if (!interaction.channel.permissionsFor(interaction.guild.members.me).has(PermissionFlagsBits.ManageMessages)) return theme.replyError(interaction, 'Mir fehlt hier die Berechtigung **Nachrichten verwalten**.');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const amount = interaction.options.getInteger('anzahl');
  const user = interaction.options.getUser('nutzer');
  let messages = await interaction.channel.messages.fetch({ limit: 100 });
  if (user) messages = messages.filter((m) => m.author.id === user.id);
  const fresh = [...messages.filter((m) => Date.now() - m.createdTimestamp < 14 * 864e5 && !m.pinned).values()].slice(0, amount);
  const deleted = await interaction.channel.bulkDelete(fresh, true).catch(() => null);
  const n = deleted?.size || 0;
  await mod.record(interaction, 'clear', null, `${n} Nachrichten in ${interaction.channel}${user ? ` von ${user.tag}` : ''}`);
  return interaction.editReply({ embeds: [theme.success(g, `**${n}** Nachrichten wurden gelöscht.${n < amount ? '\n-# Nachrichten älter als 14 Tage und angepinnte Nachrichten können nicht gelöscht werden.' : ''}`)] });
}

module.exports = { data, perms: { '*': ['moderation'] }, execute };
