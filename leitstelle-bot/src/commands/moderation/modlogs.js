const { SlashCommandBuilder } = require('discord.js');
const theme = require('../../core/theme');
const util = require('../../core/util');
const { all, one } = require('../../core/database');
const mod = require('../../systems/moderationManager');

const data = new SlashCommandBuilder().setName('modlogs').setDescription('Zeigt die Strafhistorie einer Person')
  .addUserOption((o) => o.setName('nutzer').setDescription('Person').setRequired(true))
  .addIntegerOption((o) => o.setName('seite').setDescription('Seite').setMinValue(1));

async function execute(interaction) {
  const g = interaction.guildId;
  const user = interaction.options.getUser('nutzer');
  const page = (interaction.options.getInteger('seite') || 1) - 1;
  const rows = all('SELECT * FROM moderation WHERE guild_id = ? AND user_id = ? ORDER BY id DESC LIMIT 10 OFFSET ?', g, user.id, page * 10);
  const total = one('SELECT COUNT(*) AS n FROM moderation WHERE guild_id = ? AND user_id = ?', g, user.id).n;
  const counts = all('SELECT action, COUNT(*) AS n FROM moderation WHERE guild_id = ? AND user_id = ? GROUP BY action', g, user.id);
  return theme.reply(interaction, { embeds: [theme.base(g, 'primary', `Seite ${page + 1} von ${Math.max(1, Math.ceil(total / 10))}`).setTitle(`📁 Strafhistorie – ${user.tag}`).setThumbnail(user.displayAvatarURL())
    .setDescription(rows.length ? rows.map((r) => `${mod.ACTIONS[r.action]?.emoji || '•'} **#${r.id} ${mod.ACTIONS[r.action]?.label || r.action}** ${theme.E.dot} ${util.ts(r.at, 'd')} ${theme.E.dot} <@${r.moderator_id}>${r.duration ? ` ${theme.E.dot} ${util.duration(r.duration)}` : ''}\n${util.truncate(r.reason || '–', 150)}`).join('\n') : 'Keine Einträge vorhanden.')
    .addFields({ name: 'Übersicht', value: counts.map((c) => `${mod.ACTIONS[c.action]?.label || c.action}: **${c.n}**`).join(' • ') || '–' })] });
}

module.exports = { data, perms: { '*': ['moderation'] }, execute };
