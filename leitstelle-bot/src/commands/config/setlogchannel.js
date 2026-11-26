const { SlashCommandBuilder, ChannelType } = require('discord.js');
const theme = require('../../core/theme');
const settings = require('../../core/settings');

const LOGS = ['log', 'sessionLog', 'erlcLog', 'modmailLog', 'applicationLog', 'modLog', 'staffLog', 'departmentLog', 'verificationLog'];

const data = new SlashCommandBuilder()
  .setName('setlogchannel')
  .setDescription('Legt einen Log-Kanal fest')
  .addStringOption((o) => o.setName('art').setDescription('Welches Log?').setRequired(true)
    .addChoices(...LOGS.map((value) => ({ name: settings.CHANNEL_TYPES[value], value }))))
  .addChannelOption((o) => o.setName('kanal').setDescription('Kanal (leer lassen zum Entfernen)').addChannelTypes(ChannelType.GuildText));

async function execute(interaction) {
  const g = interaction.guildId;
  const type = interaction.options.getString('art');
  const ch = interaction.options.getChannel('kanal');
  if (!ch) { settings.set(g, `channels.${type}`, null); return theme.replySuccess(interaction, `**${settings.CHANNEL_TYPES[type]}** entfernt${type === 'log' ? '' : ' – es wird das allgemeine Log genutzt'}.`); }
  if (!ch.permissionsFor(interaction.guild.members.me)?.has(['ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles'])) return theme.replyError(interaction, `Ich kann in ${ch} nicht schreiben (benötigt: Nachrichten senden, Links einbetten, Dateien anhängen).`);
  settings.set(g, `channels.${type}`, ch.id);
  return theme.replySuccess(interaction, `**${settings.CHANNEL_TYPES[type]}** ist jetzt ${ch}.`);
}

module.exports = { data, perms: { '*': ['admin'] }, execute };
