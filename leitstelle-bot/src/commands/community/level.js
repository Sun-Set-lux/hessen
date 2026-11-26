const { SlashCommandBuilder } = require('discord.js');
const theme = require('../../core/theme');
const util = require('../../core/util');
const { one, all, run } = require('../../core/database');
const levels = require('../../systems/levels');

const data = new SlashCommandBuilder()
  .setName('level')
  .setDescription('Level-System')
  .addSubcommand((s) => s.setName('rang').setDescription('Zeigt dein Level oder das einer anderen Person').addUserOption((o) => o.setName('nutzer').setDescription('Person')))
  .addSubcommand((s) => s.setName('rangliste').setDescription('Die aktivsten Mitglieder'))
  .addSubcommand((s) => s.setName('rolle').setDescription('Belohnungsrolle für ein Level festlegen oder entfernen')
    .addIntegerOption((o) => o.setName('level').setDescription('Level').setRequired(true).setMinValue(1).setMaxValue(500))
    .addRoleOption((o) => o.setName('rolle').setDescription('Rolle (leer = entfernen)')))
  .addSubcommand((s) => s.setName('rollen').setDescription('Zeigt alle Level-Rollen'));

async function execute(interaction) {
  const g = interaction.guildId;
  const sub = interaction.options.getSubcommand();
  if (sub === 'rang') {
    const u = interaction.options.getUser('nutzer') || interaction.user;
    const row = one('SELECT * FROM levels WHERE guild_id = ? AND user_id = ?', g, u.id);
    if (!row) return theme.reply(interaction, { embeds: [theme.info(g, `<@${u.id}> hat noch keine XP gesammelt.`)] });
    const p = levels.progress(row.xp);
    const rank = one('SELECT COUNT(*) + 1 AS r FROM levels WHERE guild_id = ? AND xp > ?', g, row.xp).r;
    const pct = Math.floor((p.current / p.next) * 20);
    return theme.reply(interaction, { embeds: [theme.base(g, 'primary').setTitle(`⭐ Level – ${u.username}`).setThumbnail(u.displayAvatarURL()).addFields(
      { name: 'Level', value: String(p.level), inline: true },
      { name: 'Platz', value: `#${rank}`, inline: true },
      { name: 'Nachrichten', value: util.numberDe(row.messages), inline: true },
      { name: 'Fortschritt', value: `${'▰'.repeat(pct)}${'▱'.repeat(20 - pct)}\n${util.numberDe(p.current)} / ${util.numberDe(p.next)} XP` },
    )] }, false);
  }
  if (sub === 'rangliste') {
    const rows = all('SELECT * FROM levels WHERE guild_id = ? ORDER BY xp DESC LIMIT 10', g);
    const medal = ['🥇', '🥈', '🥉'];
    return theme.reply(interaction, { embeds: [theme.base(g, 'primary').setTitle('🏆 Level-Rangliste').setDescription(rows.map((r, i) => `${medal[i] || `\`${i + 1}.\``} <@${r.user_id}> ${theme.E.dot} Level **${r.level}** ${theme.E.dot} ${util.numberDe(r.xp)} XP`).join('\n') || 'Noch keine Daten.')] }, false);
  }
  if (sub === 'rollen') {
    const rows = all('SELECT * FROM level_roles WHERE guild_id = ? ORDER BY level', g);
    return theme.reply(interaction, { embeds: [theme.info(g, rows.map((r) => `Level **${r.level}** → <@&${r.role_id}>`).join('\n') || 'Keine Level-Rollen festgelegt.', 'Level-Rollen')] });
  }
  if (!require('../../core/permissions').inGroup(interaction.member, 'management')) return theme.replyError(interaction, 'Nur das Community-Management kann Level-Rollen festlegen.');
  const level = interaction.options.getInteger('level');
  const role = interaction.options.getRole('rolle');
  if (!role) { run('DELETE FROM level_roles WHERE guild_id = ? AND level = ?', g, level); return theme.replySuccess(interaction, `Level-Rolle für Level ${level} entfernt.`); }
  if (role.position >= interaction.guild.members.me.roles.highest.position || role.managed) return theme.replyError(interaction, 'Diese Rolle kann ich nicht vergeben.');
  run('INSERT OR REPLACE INTO level_roles (guild_id, level, role_id) VALUES (?,?,?)', g, level, role.id);
  return theme.replySuccess(interaction, `Ab Level **${level}** gibt es <@&${role.id}>.`);
}

module.exports = { data, perms: { rang: ['everyone'], rangliste: ['everyone'], rollen: ['everyone'], rolle: ['management'] }, execute };
