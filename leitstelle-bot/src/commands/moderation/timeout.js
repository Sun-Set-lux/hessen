const { SlashCommandBuilder } = require('discord.js');
const theme = require('../../core/theme');
const util = require('../../core/util');
const mod = require('../../systems/moderationManager');

const data = new SlashCommandBuilder().setName('timeout').setDescription('Versetzt eine Person in den Timeout')
  .addUserOption((o) => o.setName('nutzer').setDescription('Person').setRequired(true))
  .addStringOption((o) => o.setName('dauer').setDescription('z. B. 10m, 2h, 1d (max. 28 Tage)').setRequired(true).setMaxLength(20))
  .addStringOption((o) => o.setName('grund').setDescription('Grund').setMaxLength(500));

async function execute(interaction) {
  const g = interaction.guildId;
  const user = interaction.options.getUser('nutzer');
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) return theme.replyError(interaction, 'Diese Person ist nicht auf dem Server.');
  const t = mod.checkTarget(interaction, member); if (!t.ok) return theme.replyError(interaction, t.reason);
  const r = mod.reasonOf(interaction); if (!r.ok) return theme.replyError(interaction, r.reason);
  const ms = util.parseDuration(interaction.options.getString('dauer'));
  if (!ms || ms < 60000 || ms > 28 * 864e5) return theme.replyError(interaction, 'Ungültige Dauer. Erlaubt: 1 Minute bis 28 Tage, z. B. `10m`, `2h`, `1d`.');
  if (!member.moderatable) return theme.replyError(interaction, 'Ich kann diese Person nicht in den Timeout versetzen.');
  await interaction.deferReply();
  try { await member.timeout(ms, `${interaction.user.tag}: ${r.reason}`.slice(0, 512)); } catch (err) { return interaction.editReply({ embeds: [theme.error(g, `Timeout fehlgeschlagen: ${err.message}`)] }); }
  const dm = await mod.notify(interaction.guild, user, 'timeout', r.reason, `**Dauer:** ${util.duration(ms)} (bis ${util.ts(Date.now() + ms)})`);
  const id = await mod.record(interaction, 'timeout', user, r.reason, { duration: ms });
  return interaction.editReply({ embeds: [theme.success(g, `**${user.tag}** ist für **${util.duration(ms)}** im Timeout. (Fall #${id})\n**Grund:** ${r.reason}${dm ? '' : '\n-# Keine Privatnachricht möglich.'}`)] });
}

module.exports = { data, perms: { '*': ['moderation'] }, execute };
