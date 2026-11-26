const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const theme = require('../../core/theme');
const settings = require('../../core/settings');
const texts = require('../../core/texts');
const util = require('../../core/util');
const { one } = require('../../core/database');
const panels = require('../../systems/panels');
const verify = require('../../interactions/verify');

const data = new SlashCommandBuilder()
  .setName('verifizierung')
  .setDescription('Verifizierungssystem')
  .addSubcommand((s) => s.setName('panel').setDescription('Sendet das Verifizierungs-Panel in diesen Kanal'))
  .addSubcommand((s) => s.setName('manuell').setDescription('Verifiziert eine Person manuell')
    .addUserOption((o) => o.setName('nutzer').setDescription('Person').setRequired(true)))
  .addSubcommand((s) => s.setName('status').setDescription('Zeigt den Verifizierungsstatus einer Person')
    .addUserOption((o) => o.setName('nutzer').setDescription('Person').setRequired(true)));

const permsMap = { panel: ['admin'], manuell: ['moderation', 'support'], status: ['moderation', 'support'] };

function panelPayload(g, guildName) {
  return {
    embeds: [theme.base(g, 'primary').setTitle('✅ Verifizierung').setDescription(texts.render(g, 'verify.panel', { server: guildName }))],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('verify:start').setStyle(ButtonStyle.Success).setLabel('Jetzt verifizieren').setEmoji('✅'))],
  };
}

async function execute(interaction) {
  const g = interaction.guildId;
  const sub = interaction.options.getSubcommand();
  if (sub === 'panel') {
    if (!settings.role(g, 'verification')) return theme.replyError(interaction, 'Bitte lege zuerst die **Verifiziert-Rolle** fest (`/setrole`).');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const msg = await panels.upsert(interaction.client, g, 'verification', '', interaction.channelId, panelPayload(g, interaction.guild.name)).catch(() => null);
    return interaction.editReply({ embeds: [msg ? theme.success(g, `Das Verifizierungs-Panel wurde gesendet.\nMindestalter des Accounts: **${settings.get(g, 'verify.minAccountDays')} Tage** ${theme.E.dot} Rechenaufgabe: **${settings.get(g, 'verify.captcha') ? 'an' : 'aus'}** (\`/config verifizierung\`).`) : theme.error(g, 'Ich kann in diesem Kanal nicht schreiben.')] });
  }
  const user = interaction.options.getUser('nutzer');
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) return theme.replyError(interaction, 'Diese Person ist nicht auf dem Server.');
  if (sub === 'manuell') {
    const res = await verify.grant(member, `manuell durch ${interaction.user.tag}`, interaction.user.id);
    return res.ok ? theme.replySuccess(interaction, `<@${user.id}> wurde verifiziert.`) : theme.replyError(interaction, res.reason);
  }
  const row = one('SELECT * FROM verification WHERE guild_id = ? AND user_id = ?', g, user.id);
  const roleId = settings.role(g, 'verification');
  return theme.reply(interaction, { embeds: [theme.info(g, `**Rolle:** ${roleId && member.roles.cache.has(roleId) ? '✅ vorhanden' : '❌ fehlt'}\n**Status:** ${row?.status || 'Noch nicht versucht'}\n**Fehlversuche:** ${row?.attempts || 0}\n**Letzte Aktion:** ${row ? util.ts(row.at, 'R') : '–'}\n**Account erstellt:** ${util.ts(user.createdTimestamp, 'R')}`, `Verifizierung – ${user.tag}`)] });
}

module.exports = { data, perms: permsMap, execute, panelPayload };
