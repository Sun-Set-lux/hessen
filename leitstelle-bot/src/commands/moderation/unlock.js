const { SlashCommandBuilder, ChannelType } = require('discord.js');
const theme = require('../../core/theme');
const mod = require('../../systems/moderationManager');

const data = new SlashCommandBuilder().setName('unlock').setDescription('Entsperrt einen Kanal')
  .addChannelOption((o) => o.setName('kanal').setDescription('Kanal (Standard: dieser)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
  .addStringOption((o) => o.setName('grund').setDescription('Grund').setMaxLength(300));

async function execute(interaction) {
  const ch = interaction.options.getChannel('kanal') || interaction.channel;
  const everyone = interaction.guild.roles.everyone;
  if (!ch.permissionOverwrites.cache.get(everyone.id)?.deny.has('SendMessages')) return theme.replyError(interaction, `${ch} ist nicht gesperrt.`);
  const reason = interaction.options.getString('grund') || 'Kein Grund angegeben';
  try { await ch.permissionOverwrites.edit(everyone, { SendMessages: null, SendMessagesInThreads: null, CreatePublicThreads: null }, { reason }); } catch (err) { return theme.replyError(interaction, `Entsperren fehlgeschlagen: ${err.message}`); }
  await ch.send({ embeds: [theme.base(interaction.guildId, 'success').setDescription('🔓 **Dieser Kanal ist wieder geöffnet.**')] }).catch(() => {});
  await mod.record(interaction, 'unlock', null, reason, { extra: `${ch}` });
  return theme.replySuccess(interaction, `${ch} wurde entsperrt.`);
}

module.exports = { data, perms: { '*': ['moderation'] }, execute };
