const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const theme = require('../../core/theme');
const mod = require('../../systems/moderationManager');

const data = new SlashCommandBuilder().setName('ban').setDescription('Bannt eine Person vom Discord-Server')
  .addUserOption((o) => o.setName('nutzer').setDescription('Person').setRequired(true))
  .addStringOption((o) => o.setName('grund').setDescription('Grund').setMaxLength(500))
  .addIntegerOption((o) => o.setName('nachrichten_loeschen').setDescription('Nachrichten der letzten Tage löschen').addChoices(
    { name: 'Keine', value: 0 }, { name: 'Letzte 24 Stunden', value: 1 }, { name: 'Letzte 7 Tage', value: 7 }));

async function execute(interaction) {
  const g = interaction.guildId;
  const user = interaction.options.getUser('nutzer');
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  const t = mod.checkTarget(interaction, member); if (!t.ok) return theme.replyError(interaction, t.reason);
  const r = mod.reasonOf(interaction); if (!r.ok) return theme.replyError(interaction, r.reason);
  if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) return theme.replyError(interaction, 'Mir fehlt die Berechtigung **Mitglieder bannen**.');
  if (await interaction.guild.bans.fetch(user.id).catch(() => null)) return theme.replyError(interaction, 'Diese Person ist bereits gebannt.');
  await interaction.deferReply();
  const dm = member ? await mod.notify(interaction.guild, user, 'ban', r.reason) : false;
  try {
    await interaction.guild.members.ban(user.id, { reason: `${interaction.user.tag}: ${r.reason}`.slice(0, 512), deleteMessageSeconds: (interaction.options.getInteger('nachrichten_loeschen') || 0) * 86400 });
  } catch (err) { return interaction.editReply({ embeds: [theme.error(g, `Bann fehlgeschlagen: ${err.message}`)] }); }
  const id = await mod.record(interaction, 'ban', user, r.reason);
  return interaction.editReply({ embeds: [theme.success(g, `**${user.tag}** wurde gebannt. (Fall #${id})\n**Grund:** ${r.reason}${dm ? '' : '\n-# Keine Privatnachricht möglich.'}`)] });
}

module.exports = { data, perms: { '*': ['admin'] }, execute };
