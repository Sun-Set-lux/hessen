const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const theme = require('../../core/theme');
const settings = require('../../core/settings');
const util = require('../../core/util');
const { one, run, now } = require('../../core/database');
const cm = require('../../systems/community');

const data = new SlashCommandBuilder()
  .setName('vorschlag')
  .setDescription('Vorschläge für die Community')
  .addSubcommand((s) => s.setName('erstellen').setDescription('Reicht einen Vorschlag ein')
    .addStringOption((o) => o.setName('vorschlag').setDescription('Dein Vorschlag').setRequired(true).setMinLength(10).setMaxLength(1500)))
  .addSubcommand((s) => s.setName('status').setDescription('Ändert den Status eines Vorschlags (Team)')
    .addIntegerOption((o) => o.setName('id').setDescription('Nummer des Vorschlags').setRequired(true))
    .addStringOption((o) => o.setName('status').setDescription('Neuer Status').setRequired(true).addChoices(
      { name: 'In Prüfung', value: 'pruefung' }, { name: 'Angenommen', value: 'angenommen' }, { name: 'Abgelehnt', value: 'abgelehnt' }, { name: 'Umgesetzt', value: 'umgesetzt' }, { name: 'Offen', value: 'offen' }))
    .addStringOption((o) => o.setName('antwort').setDescription('Antwort des Teams').setMaxLength(1000)));

async function execute(interaction) {
  const g = interaction.guildId;
  const sub = interaction.options.getSubcommand();
  if (sub === 'erstellen') {
    const chId = settings.channel(g, 'suggestion');
    if (!chId) return theme.replyError(interaction, 'Es ist noch kein Vorschlagskanal eingestellt.');
    const recent = one('SELECT created_at FROM suggestions WHERE guild_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1', g, interaction.user.id);
    if (recent && Date.now() - recent.created_at < 5 * 60 * 1000) return theme.replyError(interaction, `Bitte warte etwas, bevor du einen weiteren Vorschlag einreichst (${util.ts(recent.created_at + 5 * 60 * 1000, 'R')}).`);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const id = run('INSERT INTO suggestions (guild_id, user_id, content, created_at) VALUES (?,?,?,?)', g, interaction.user.id, util.clean(interaction.options.getString('vorschlag')), now()).lastInsertRowid;
    try {
      const ch = await interaction.client.channels.fetch(chId);
      const msg = await ch.send(cm.suggestionPayload(g, one('SELECT * FROM suggestions WHERE id = ?', id), interaction.user));
      run('UPDATE suggestions SET channel_id = ?, message_id = ? WHERE id = ?', ch.id, msg.id, id);
      msg.startThread({ name: `Diskussion zu Vorschlag #${id}` }).catch(() => {});
      return interaction.editReply({ embeds: [theme.success(g, `Dein Vorschlag #${id} wurde veröffentlicht. [Ansehen](${msg.url})`)] });
    } catch (err) {
      run('DELETE FROM suggestions WHERE id = ?', id);
      return interaction.editReply({ embeds: [theme.error(g, 'Der Vorschlag konnte nicht veröffentlicht werden.')] });
    }
  }
  const s = one('SELECT * FROM suggestions WHERE id = ? AND guild_id = ?', interaction.options.getInteger('id'), g);
  if (!s) return theme.replyError(interaction, 'Diesen Vorschlag gibt es nicht.');
  const status = interaction.options.getString('status');
  run('UPDATE suggestions SET status = ?, staff_id = ?, staff_reason = ? WHERE id = ?', status, interaction.user.id, interaction.options.getString('antwort') || s.staff_reason, s.id);
  const fresh = one('SELECT * FROM suggestions WHERE id = ?', s.id);
  const author = await interaction.client.users.fetch(s.user_id).catch(() => null);
  try { const ch = await interaction.client.channels.fetch(s.channel_id); const msg = await ch.messages.fetch(s.message_id); await msg.edit(cm.suggestionPayload(g, fresh, author)); } catch { /* gelöscht */ }
  author?.send({ embeds: [theme.info(g, `Dein Vorschlag #${s.id} hat einen neuen Status: **${cm.SUGG_STATUS[status].t}**${interaction.options.getString('antwort') ? `\n**Antwort:** ${interaction.options.getString('antwort')}` : ''}`, '💡 Vorschlag aktualisiert')] }).catch(() => {});
  return theme.replySuccess(interaction, `Vorschlag #${s.id}: **${cm.SUGG_STATUS[status].t}**`);
}

module.exports = { data, perms: { erstellen: ['everyone'], status: ['management', 'moderation'] }, execute };
