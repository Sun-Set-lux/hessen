const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const theme = require('../../core/theme');
const { one, all, run } = require('../../core/database');

const nameOpt = (o) => o.setName('name').setDescription('Name des Textbausteins').setRequired(true).setAutocomplete(true).setMaxLength(32);

const data = new SlashCommandBuilder()
  .setName('textbaustein')
  .setDescription('Eigene Befehle / Textbausteine')
  .addSubcommand((s) => s.setName('senden').setDescription('Sendet einen Textbaustein').addStringOption(nameOpt).addUserOption((o) => o.setName('nutzer').setDescription('Person erwähnen')))
  .addSubcommand((s) => s.setName('erstellen').setDescription('Erstellt oder bearbeitet einen Textbaustein').addStringOption((o) => o.setName('name').setDescription('Name').setRequired(true).setMaxLength(32)))
  .addSubcommand((s) => s.setName('loeschen').setDescription('Löscht einen Textbaustein').addStringOption(nameOpt))
  .addSubcommand((s) => s.setName('liste').setDescription('Zeigt alle Textbausteine'));

async function execute(interaction) {
  const g = interaction.guildId;
  const sub = interaction.options.getSubcommand();
  const name = interaction.options.getString('name')?.toLowerCase().replace(/[^a-z0-9äöüß_-]/g, '');
  if (sub === 'liste') {
    const rows = all('SELECT name, uses FROM custom_commands WHERE guild_id = ? ORDER BY name', g);
    return theme.reply(interaction, { embeds: [theme.base(g, 'primary').setTitle('📎 Textbausteine').setDescription(rows.map((r) => `\`${r.name}\` (${r.uses}× genutzt)`).join(', ') || 'Noch keine Textbausteine.')] });
  }
  if (!name) return theme.replyError(interaction, 'Ungültiger Name (erlaubt: Buchstaben, Zahlen, _ und -).');
  const cc = one('SELECT * FROM custom_commands WHERE guild_id = ? AND name = ?', g, name);
  if (sub === 'erstellen') {
    return interaction.showModal(new ModalBuilder().setCustomId(`tag:save:${name}`).setTitle(`Textbaustein „${name}“`.slice(0, 45)).addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('text').setLabel('Inhalt').setStyle(TextInputStyle.Paragraph).setMaxLength(2000).setValue(cc?.content || '')),
    ));
  }
  if (!cc) return theme.replyError(interaction, 'Diesen Textbaustein gibt es nicht.');
  if (sub === 'loeschen') { run('DELETE FROM custom_commands WHERE guild_id = ? AND name = ?', g, name); return theme.replySuccess(interaction, `\`${name}\` wurde gelöscht.`); }
  run('UPDATE custom_commands SET uses = uses + 1 WHERE guild_id = ? AND name = ?', g, name);
  const u = interaction.options.getUser('nutzer');
  return interaction.reply({ content: u ? `<@${u.id}>` : undefined, embeds: [theme.base(g, 'primary').setDescription(cc.content)], allowedMentions: { users: u ? [u.id] : [] } });
}

async function autocomplete(interaction) {
  const q = interaction.options.getFocused().toLowerCase();
  return interaction.respond(all('SELECT name FROM custom_commands WHERE guild_id = ? AND name LIKE ? LIMIT 25', interaction.guildId, `%${q}%`).map((r) => ({ name: r.name, value: r.name })));
}

module.exports = { data, perms: { senden: ['moderation', 'support', 'host', 'deptlead'], erstellen: ['management'], loeschen: ['management'], liste: ['moderation', 'support', 'host', 'deptlead'] }, execute, autocomplete };
