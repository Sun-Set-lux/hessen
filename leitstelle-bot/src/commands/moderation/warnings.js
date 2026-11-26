const { SlashCommandBuilder } = require('discord.js');
const theme = require('../../core/theme');
const util = require('../../core/util');
const { all, one, run } = require('../../core/database');
const mod = require('../../systems/moderationManager');

const data = new SlashCommandBuilder().setName('warnings').setDescription('Zeigt oder entfernt Verwarnungen')
  .addUserOption((o) => o.setName('nutzer').setDescription('Person').setRequired(true))
  .addIntegerOption((o) => o.setName('entfernen').setDescription('Nummer der Verwarnung, die entfernt werden soll').setMinValue(1))
  .addStringOption((o) => o.setName('grund').setDescription('Grund für das Entfernen').setMaxLength(300));

async function execute(interaction) {
  const g = interaction.guildId;
  const user = interaction.options.getUser('nutzer');
  const remove = interaction.options.getInteger('entfernen');
  if (remove) {
    const w = one('SELECT * FROM warnings WHERE id = ? AND guild_id = ? AND user_id = ?', remove, g, user.id);
    if (!w || !w.active) return theme.replyError(interaction, 'Diese Verwarnung gibt es nicht oder sie wurde bereits entfernt.');
    run('UPDATE warnings SET active = 0 WHERE id = ?', w.id);
    await mod.record(interaction, 'unwarn', user, interaction.options.getString('grund') || 'Kein Grund angegeben', { extra: `Verwarnung #${w.id}: ${util.truncate(w.reason, 200)}` });
    return theme.replySuccess(interaction, `Verwarnung #${w.id} von **${user.tag}** wurde entfernt.`);
  }
  const rows = all('SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY id DESC LIMIT 25', g, user.id);
  const active = rows.filter((r) => r.active);
  return theme.reply(interaction, { embeds: [theme.base(g, active.length ? 'warning' : 'primary').setTitle(`⚠️ Verwarnungen – ${user.tag}`)
    .setDescription(rows.length ? rows.map((w) => `${w.active ? '🟠' : '⚪~~'} **#${w.id}** ${util.ts(w.at, 'd')} ${theme.E.dot} <@${w.moderator_id}>\n${util.truncate(w.reason, 150)}${w.active ? '' : '~~'}`).join('\n') : 'Keine Verwarnungen vorhanden.')
    .addFields({ name: 'Aktiv', value: String(active.length), inline: true }, { name: 'Gesamt', value: String(rows.length), inline: true })] });
}

module.exports = { data, perms: { '*': ['moderation'] }, execute };
