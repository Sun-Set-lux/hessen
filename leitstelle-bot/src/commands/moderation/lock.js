const { SlashCommandBuilder, ChannelType } = require('discord.js');
const theme = require('../../core/theme');
const mod = require('../../systems/moderationManager');

const data = new SlashCommandBuilder().setName('lock').setDescription('Sperrt einen Kanal für Mitglieder')
  .addChannelOption((o) => o.setName('kanal').setDescription('Kanal (Standard: dieser)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
  .addStringOption((o) => o.setName('grund').setDescription('Grund').setMaxLength(300));

async function execute(interaction) {
  const ch = interaction.options.getChannel('kanal') || interaction.channel;
  const everyone = interaction.guild.roles.everyone;
  if (ch.permissionOverwrites.cache.get(everyone.id)?.deny.has('SendMessages')) return theme.replyError(interaction, `${ch} ist bereits gesperrt.`);
  const reason = interaction.options.getString('grund') || 'Kein Grund angegeben';
  try { await ch.permissionOverwrites.edit(everyone, { SendMessages: false, SendMessagesInThreads: false, CreatePublicThreads: false }, { reason }); } catch (err) { return theme.replyError(interaction, `Sperren fehlgeschlagen: ${err.message}`); }
  await ch.send({ embeds: [theme.base(interaction.guildId, 'warning').setDescription(`🔒 **Dieser Kanal wurde vorübergehend gesperrt.**\n**Grund:** ${reason}`)] }).catch(() => {});
  await mod.record(interaction, 'lock', null, reason, { extra: `${ch}` });
  return theme.replySuccess(interaction, `${ch} wurde gesperrt.`);
}

module.exports = { data, perms: { '*': ['moderation'] }, execute };
