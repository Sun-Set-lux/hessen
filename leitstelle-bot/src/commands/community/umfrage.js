const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const theme = require('../../core/theme');
const util = require('../../core/util');
const { one, run, now } = require('../../core/database');
const cm = require('../../systems/community');

const data = new SlashCommandBuilder()
  .setName('umfrage')
  .setDescription('Erstellt eine Umfrage')
  .addStringOption((o) => o.setName('frage').setDescription('Frage').setRequired(true).setMaxLength(200))
  .addStringOption((o) => o.setName('optionen').setDescription('Antworten, getrennt mit ; (2–10), z. B. Ja; Nein; Vielleicht').setRequired(true).setMaxLength(800))
  .addStringOption((o) => o.setName('dauer').setDescription('z. B. 1h, 2d (leer = manuell beenden)').setMaxLength(20))
  .addBooleanOption((o) => o.setName('mehrfach').setDescription('Mehrere Antworten erlauben?'))
  .addRoleOption((o) => o.setName('rolle').setDescription('Rolle erwähnen'));

async function execute(interaction) {
  const g = interaction.guildId;
  const opts = interaction.options.getString('optionen').split(';').map((x) => x.trim()).filter(Boolean);
  if (opts.length < 2 || opts.length > 10) return theme.replyError(interaction, 'Bitte gib zwischen 2 und 10 Antworten an, getrennt mit `;`.');
  if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) return theme.replyError(interaction, 'Die Antworten müssen unterschiedlich sein.');
  let ends = null;
  if (interaction.options.getString('dauer')) {
    const ms = util.parseDuration(interaction.options.getString('dauer'));
    if (!ms || ms < 60000 || ms > 30 * 864e5) return theme.replyError(interaction, 'Ungültige Dauer (1 Minute bis 30 Tage).');
    ends = Date.now() + ms;
  }
  const id = run('INSERT INTO polls (guild_id, author_id, question, options, multi, channel_id, ends_at, created_at) VALUES (?,?,?,?,?,?,?,?)',
    g, interaction.user.id, util.clean(interaction.options.getString('frage')), JSON.stringify(opts.map((o) => util.truncate(util.clean(o), 80))), interaction.options.getBoolean('mehrfach') ? 1 : 0, interaction.channelId, ends, now()).lastInsertRowid;
  const role = interaction.options.getRole('rolle');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const msg = await interaction.channel.send({ content: role ? `<@&${role.id}>` : undefined, ...cm.pollPayload(g, one('SELECT * FROM polls WHERE id = ?', id)), allowedMentions: { roles: role ? [role.id] : [] } });
    run('UPDATE polls SET message_id = ? WHERE id = ?', msg.id, id);
  } catch (err) {
    run('DELETE FROM polls WHERE id = ?', id);
    return interaction.editReply({ embeds: [theme.error(g, 'Die Umfrage konnte nicht gesendet werden.')] });
  }
  return interaction.editReply({ embeds: [theme.success(g, `Umfrage #${id} wurde erstellt.`)] });
}

module.exports = { data, perms: { '*': ['management', 'moderation', 'deptlead', 'host'] }, execute };
