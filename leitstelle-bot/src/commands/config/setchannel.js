const { SlashCommandBuilder, ChannelType } = require('discord.js');
const theme = require('../../core/theme');
const settings = require('../../core/settings');
const logger = require('../../core/logger');

const data = new SlashCommandBuilder()
  .setName('setchannel')
  .setDescription('Legt einen Kanal für eine Funktion fest')
  .addStringOption((o) => o.setName('art').setDescription('Wofür wird der Kanal genutzt?').setRequired(true)
    .addChoices(...Object.entries(settings.CHANNEL_TYPES).map(([value, name]) => ({ name, value }))))
  .addChannelOption((o) => o.setName('kanal').setDescription('Kanal (leer lassen zum Entfernen)')
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildCategory));

async function execute(interaction) {
  const g = interaction.guildId;
  const type = interaction.options.getString('art');
  const ch = interaction.options.getChannel('kanal');
  const name = settings.CHANNEL_TYPES[type];
  if (!ch) {
    settings.set(g, `channels.${type}`, null);
    return theme.replySuccess(interaction, `**${name}** wurde entfernt.`);
  }
  const wantsCategory = type === 'modmailCategory';
  if (wantsCategory !== (ch.type === ChannelType.GuildCategory)) {
    return theme.replyError(interaction, wantsCategory ? 'Für die Modmail-Kategorie musst du eine **Kategorie** auswählen.' : 'Bitte wähle einen **Textkanal** aus, keine Kategorie.');
  }
  const me = interaction.guild.members.me;
  const needed = wantsCategory ? ['ViewChannel', 'ManageChannels'] : ['ViewChannel', 'SendMessages', 'EmbedLinks'];
  const missing = needed.filter((p) => !ch.permissionsFor(me)?.has(p));
  if (missing.length) return theme.replyError(interaction, `Mir fehlen in ${ch} folgende Rechte: **${missing.join(', ')}**.`);
  settings.set(g, `channels.${type}`, ch.id);
  logger.discord(g, 'log', theme.base(g, 'neutral').setDescription(`🛠️ **${name}** → ${ch} (durch <@${interaction.user.id}>)`), { event: 'config.channel', userId: interaction.user.id });
  if (type === 'status') require('../../systems/statusPanel').tick(interaction.client).catch(() => {});
  return theme.replySuccess(interaction, `**${name}** ist jetzt ${ch}.${type === 'status' ? '\nDas Statuspanel wird dort automatisch erstellt.' : ''}`);
}

module.exports = { data, perms: { '*': ['admin'] }, execute };
