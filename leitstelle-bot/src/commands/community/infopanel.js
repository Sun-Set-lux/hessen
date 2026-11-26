const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const theme = require('../../core/theme');
const { one, all, run } = require('../../core/database');

const data = new SlashCommandBuilder()
  .setName('infopanel')
  .setDescription('Community-Informationspanels (Regeln, Infos, Links …)')
  .addSubcommand((s) => s.setName('erstellen').setDescription('Erstellt ein Infopanel in diesem Kanal'))
  .addSubcommand((s) => s.setName('bearbeiten').setDescription('Bearbeitet ein Infopanel').addStringOption((o) => o.setName('panel').setDescription('Panel').setRequired(true).setAutocomplete(true)))
  .addSubcommand((s) => s.setName('loeschen').setDescription('Löscht ein Infopanel').addStringOption((o) => o.setName('panel').setDescription('Panel').setRequired(true).setAutocomplete(true)));

function modal(id, p) {
  return new ModalBuilder().setCustomId(`info:save:${id}`).setTitle(p ? 'Infopanel bearbeiten' : 'Infopanel erstellen').addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titel').setLabel('Titel').setStyle(TextInputStyle.Short).setMaxLength(200).setValue(p?.title || '')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inhalt').setLabel('Inhalt (Markdown möglich)').setStyle(TextInputStyle.Paragraph).setMaxLength(4000).setValue(p?.content || '')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('bild').setLabel('Bild-URL (optional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(500).setValue(p?.image_url || '')),
  );
}

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'erstellen') return interaction.showModal(modal('new'));
  const p = one('SELECT * FROM info_panels WHERE id = ? AND guild_id = ?', Number(interaction.options.getString('panel')), interaction.guildId);
  if (!p) return theme.replyError(interaction, 'Dieses Panel gibt es nicht.');
  if (sub === 'bearbeiten') return interaction.showModal(modal(p.id, p));
  try { const ch = await interaction.client.channels.fetch(p.channel_id); await (await ch.messages.fetch(p.message_id)).delete(); } catch { /* bereits weg */ }
  run('DELETE FROM info_panels WHERE id = ?', p.id);
  return theme.replySuccess(interaction, 'Das Infopanel wurde gelöscht.');
}

async function autocomplete(interaction) {
  const q = interaction.options.getFocused().toLowerCase();
  return interaction.respond(all('SELECT * FROM info_panels WHERE guild_id = ?', interaction.guildId).filter((p) => p.title.toLowerCase().includes(q)).slice(0, 25).map((p) => ({ name: `#${p.id} ${p.title}`.slice(0, 100), value: String(p.id) })));
}

module.exports = { data, perms: { '*': ['management'] }, execute, autocomplete };
