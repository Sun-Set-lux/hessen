const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const theme = require('../../core/theme');
const util = require('../../core/util');
const { one, all, run, now } = require('../../core/database');
const cm = require('../../systems/community');

const data = new SlashCommandBuilder()
  .setName('giveaway')
  .setDescription('Gewinnspiele')
  .addSubcommand((s) => s.setName('start').setDescription('Startet ein Gewinnspiel in diesem Kanal')
    .addStringOption((o) => o.setName('preis').setDescription('Was gibt es zu gewinnen?').setRequired(true).setMaxLength(200))
    .addStringOption((o) => o.setName('dauer').setDescription('z. B. 1h, 3d').setRequired(true).setMaxLength(20))
    .addIntegerOption((o) => o.setName('gewinner').setDescription('Anzahl Gewinner').setMinValue(1).setMaxValue(20))
    .addRoleOption((o) => o.setName('voraussetzung').setDescription('Nur Mitglieder mit dieser Rolle'))
    .addRoleOption((o) => o.setName('rolle').setDescription('Rolle erwähnen')))
  .addSubcommand((s) => s.setName('ende').setDescription('Beendet ein Gewinnspiel sofort').addIntegerOption((o) => o.setName('id').setDescription('Nummer').setRequired(true)))
  .addSubcommand((s) => s.setName('reroll').setDescription('Lost einen neuen Gewinner aus').addIntegerOption((o) => o.setName('id').setDescription('Nummer').setRequired(true)))
  .addSubcommand((s) => s.setName('liste').setDescription('Zeigt laufende Gewinnspiele'));

async function execute(interaction) {
  const g = interaction.guildId;
  const sub = interaction.options.getSubcommand();
  if (sub === 'start') {
    const ms = util.parseDuration(interaction.options.getString('dauer'));
    if (!ms || ms < 60000 || ms > 60 * 864e5) return theme.replyError(interaction, 'Ungültige Dauer (1 Minute bis 60 Tage).');
    const id = run('INSERT INTO giveaways (guild_id, host_id, prize, winners, required_role, channel_id, ends_at, created_at) VALUES (?,?,?,?,?,?,?,?)',
      g, interaction.user.id, util.clean(interaction.options.getString('preis')), interaction.options.getInteger('gewinner') || 1, interaction.options.getRole('voraussetzung')?.id || null, interaction.channelId, Date.now() + ms, now()).lastInsertRowid;
    const role = interaction.options.getRole('rolle');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const msg = await interaction.channel.send({ content: role ? `<@&${role.id}>` : undefined, ...cm.giveawayPayload(g, one('SELECT * FROM giveaways WHERE id = ?', id)), allowedMentions: { roles: role ? [role.id] : [] } });
      run('UPDATE giveaways SET message_id = ? WHERE id = ?', msg.id, id);
    } catch { run('DELETE FROM giveaways WHERE id = ?', id); return interaction.editReply({ embeds: [theme.error(g, 'Das Gewinnspiel konnte nicht gesendet werden.')] }); }
    return interaction.editReply({ embeds: [theme.success(g, `Gewinnspiel #${id} gestartet – endet ${util.ts(Date.now() + ms, 'R')}.`)] });
  }
  if (sub === 'liste') {
    const rows = all('SELECT * FROM giveaways WHERE guild_id = ? AND ended = 0 ORDER BY ends_at', g);
    return theme.reply(interaction, { embeds: [theme.base(g, 'primary').setTitle('🎉 Laufende Gewinnspiele').setDescription(rows.map((r) => `**#${r.id}** ${r.prize} ${theme.E.dot} <#${r.channel_id}> ${theme.E.dot} endet ${util.ts(r.ends_at, 'R')}`).join('\n') || 'Keine laufenden Gewinnspiele.')] });
  }
  const gw = one('SELECT * FROM giveaways WHERE id = ? AND guild_id = ?', interaction.options.getInteger('id'), g);
  if (!gw) return theme.replyError(interaction, 'Dieses Gewinnspiel gibt es nicht.');
  if (sub === 'ende') {
    if (gw.ended) return theme.replyError(interaction, 'Dieses Gewinnspiel ist bereits beendet.');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const w = await cm.endGiveaway(interaction.client, gw);
    return interaction.editReply({ embeds: [theme.success(g, `Gewinnspiel beendet. Gewinner: ${w.map((x) => `<@${x}>`).join(', ') || 'keine'}`)] });
  }
  if (!gw.ended) return theme.replyError(interaction, 'Das Gewinnspiel läuft noch.');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const w = await cm.endGiveaway(interaction.client, gw, { reroll: true });
  return interaction.editReply({ embeds: [w.length ? theme.success(g, `Neuer Gewinner: <@${w[0]}>`) : theme.error(g, 'Es gibt keine weiteren Teilnehmer.')] });
}

module.exports = { data, perms: { start: ['management', 'moderation'], ende: ['management', 'moderation'], reroll: ['management', 'moderation'], liste: ['everyone'] }, execute };
