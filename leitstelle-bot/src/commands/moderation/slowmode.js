const { SlashCommandBuilder, ChannelType } = require('discord.js');
const theme = require('../../core/theme');
const mod = require('../../systems/moderationManager');

const data = new SlashCommandBuilder().setName('slowmode').setDescription('Stellt den Slowmode eines Kanals ein')
  .addIntegerOption((o) => o.setName('sekunden').setDescription('0 = aus, maximal 21600 (6 Stunden)').setRequired(true).setMinValue(0).setMaxValue(21600))
  .addChannelOption((o) => o.setName('kanal').setDescription('Kanal (Standard: dieser)').addChannelTypes(ChannelType.GuildText));

async function execute(interaction) {
  const ch = interaction.options.getChannel('kanal') || interaction.channel;
  const s = interaction.options.getInteger('sekunden');
  try { await ch.setRateLimitPerUser(s, `Slowmode durch ${interaction.user.tag}`); } catch (err) { return theme.replyError(interaction, `Fehlgeschlagen: ${err.message}`); }
  await mod.record(interaction, 'slowmode', null, s ? `${s} Sekunden` : 'Deaktiviert', { extra: `${ch}` });
  return theme.replySuccess(interaction, s ? `Slowmode in ${ch}: **${s} Sekunden**.` : `Slowmode in ${ch} wurde deaktiviert.`);
}

module.exports = { data, perms: { '*': ['moderation'] }, execute };
