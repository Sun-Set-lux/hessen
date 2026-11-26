const { SlashCommandBuilder } = require('discord.js');
const theme = require('../../core/theme');
const { run, one, now } = require('../../core/database');
const mod = require('../../systems/moderationManager');

const data = new SlashCommandBuilder().setName('warn').setDescription('Verwarnt eine Person')
  .addUserOption((o) => o.setName('nutzer').setDescription('Person').setRequired(true))
  .addStringOption((o) => o.setName('grund').setDescription('Grund').setRequired(true).setMaxLength(500));

async function execute(interaction) {
  const g = interaction.guildId;
  const user = interaction.options.getUser('nutzer');
  if (user.bot) return theme.replyError(interaction, 'Bots können nicht verwarnt werden.');
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (member) { const t = mod.checkTarget(interaction, member); if (!t.ok) return theme.replyError(interaction, t.reason); }
  const reason = interaction.options.getString('grund');
  const wid = run('INSERT INTO warnings (guild_id, user_id, moderator_id, reason, at) VALUES (?,?,?,?,?)', g, user.id, interaction.user.id, reason, now()).lastInsertRowid;
  const total = one('SELECT COUNT(*) AS n FROM warnings WHERE guild_id = ? AND user_id = ? AND active = 1', g, user.id).n;
  const dm = await mod.notify(interaction.guild, user, 'warn', reason, `**Aktive Verwarnungen:** ${total}`);
  await mod.record(interaction, 'warn', user, reason, { extra: `Verwarnung #${wid} ${theme.E.dot} insgesamt ${total} aktiv` });
  return theme.replySuccess(interaction, `**${user.tag}** wurde verwarnt (Verwarnung #${wid}, insgesamt **${total}** aktiv).\n**Grund:** ${reason}${dm ? '' : '\n-# Keine Privatnachricht möglich.'}`, false);
}

module.exports = { data, perms: { '*': ['moderation'] }, execute };
