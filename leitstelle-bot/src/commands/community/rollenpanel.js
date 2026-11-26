const { SlashCommandBuilder, ChannelType, MessageFlags } = require('discord.js');
const theme = require('../../core/theme');
const { one, all, run, now } = require('../../core/database');
const cm = require('../../systems/community');

const panelOpt = (o) => o.setName('panel').setDescription('Panel').setRequired(true).setAutocomplete(true);

const data = new SlashCommandBuilder()
  .setName('rollenpanel')
  .setDescription('Selbstrollen per Button (Reaction Roles)')
  .addSubcommand((s) => s.setName('erstellen').setDescription('Erstellt ein neues Rollen-Panel')
    .addStringOption((o) => o.setName('titel').setDescription('Titel').setRequired(true).setMaxLength(100))
    .addStringOption((o) => o.setName('beschreibung').setDescription('Beschreibung').setMaxLength(1000)))
  .addSubcommand((s) => s.setName('hinzufuegen').setDescription('Fügt eine Rolle hinzu').addStringOption(panelOpt)
    .addRoleOption((o) => o.setName('rolle').setDescription('Rolle').setRequired(true))
    .addStringOption((o) => o.setName('beschriftung').setDescription('Text auf dem Button').setRequired(true).setMaxLength(80))
    .addStringOption((o) => o.setName('emoji').setDescription('Emoji').setMaxLength(60)))
  .addSubcommand((s) => s.setName('entfernen').setDescription('Entfernt eine Rolle').addStringOption(panelOpt)
    .addRoleOption((o) => o.setName('rolle').setDescription('Rolle').setRequired(true)))
  .addSubcommand((s) => s.setName('senden').setDescription('Sendet oder aktualisiert das Panel').addStringOption(panelOpt)
    .addChannelOption((o) => o.setName('kanal').setDescription('Kanal (Standard: hier)').addChannelTypes(ChannelType.GuildText)))
  .addSubcommand((s) => s.setName('loeschen').setDescription('Löscht ein Panel').addStringOption(panelOpt));

async function execute(interaction) {
  const g = interaction.guildId;
  const sub = interaction.options.getSubcommand();
  if (sub === 'erstellen') {
    const id = run('INSERT INTO role_panels (guild_id, title, description, created_at) VALUES (?,?,?,?)', g, interaction.options.getString('titel'), interaction.options.getString('beschreibung'), now()).lastInsertRowid;
    return theme.replySuccess(interaction, `Rollen-Panel #${id} erstellt. Füge Rollen mit \`/rollenpanel hinzufuegen\` hinzu und sende es mit \`/rollenpanel senden\`.`);
  }
  const panel = one('SELECT * FROM role_panels WHERE id = ? AND guild_id = ?', Number(interaction.options.getString('panel')), g);
  if (!panel) return theme.replyError(interaction, 'Dieses Panel gibt es nicht.');
  const update = async () => {
    if (!panel.channel_id) return;
    try { const ch = await interaction.client.channels.fetch(panel.channel_id); const msg = await ch.messages.fetch(panel.message_id); await msg.edit(cm.rolePanelPayload(g, panel)); } catch { /* gelöscht */ }
  };
  if (sub === 'hinzufuegen') {
    const role = interaction.options.getRole('rolle');
    if (role.managed || role.id === g) return theme.replyError(interaction, 'Diese Rolle kann nicht verwendet werden.');
    if (role.position >= interaction.guild.members.me.roles.highest.position) return theme.replyError(interaction, 'Diese Rolle steht über meiner Rolle – ich kann sie nicht vergeben.');
    if (role.permissions.has('Administrator') || role.permissions.has('ManageGuild') || role.permissions.has('BanMembers')) return theme.replyError(interaction, 'Rollen mit Verwaltungsrechten dürfen aus Sicherheitsgründen nicht frei wählbar sein.');
    if (one('SELECT COUNT(*) AS n FROM role_panel_roles WHERE panel_id = ?', panel.id).n >= 25) return theme.replyError(interaction, 'Ein Panel kann höchstens 25 Rollen enthalten.');
    run('INSERT OR REPLACE INTO role_panel_roles (panel_id, role_id, label, emoji) VALUES (?,?,?,?)', panel.id, role.id, interaction.options.getString('beschriftung'), interaction.options.getString('emoji'));
    await update();
    return theme.replySuccess(interaction, `<@&${role.id}> wurde zu Panel #${panel.id} hinzugefügt.`);
  }
  if (sub === 'entfernen') {
    run('DELETE FROM role_panel_roles WHERE panel_id = ? AND role_id = ?', panel.id, interaction.options.getRole('rolle').id);
    await update();
    return theme.replySuccess(interaction, 'Die Rolle wurde entfernt.');
  }
  if (sub === 'senden') {
    if (!all('SELECT 1 FROM role_panel_roles WHERE panel_id = ?', panel.id).length) return theme.replyError(interaction, 'Füge zuerst mindestens eine Rolle hinzu.');
    const ch = interaction.options.getChannel('kanal') || interaction.channel;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (panel.channel_id) { try { const old = await interaction.client.channels.fetch(panel.channel_id); await (await old.messages.fetch(panel.message_id)).delete(); } catch { /* bereits weg */ } }
    const msg = await ch.send(cm.rolePanelPayload(g, panel)).catch(() => null);
    if (!msg) return interaction.editReply({ embeds: [theme.error(g, 'Ich kann dort nicht schreiben.')] });
    run('UPDATE role_panels SET channel_id = ?, message_id = ? WHERE id = ?', ch.id, msg.id, panel.id);
    return interaction.editReply({ embeds: [theme.success(g, `Panel gesendet in ${ch}.`)] });
  }
  if (sub === 'loeschen') {
    if (panel.channel_id) { try { const ch = await interaction.client.channels.fetch(panel.channel_id); await (await ch.messages.fetch(panel.message_id)).delete(); } catch { /* bereits weg */ } }
    run('DELETE FROM role_panels WHERE id = ?', panel.id);
    return theme.replySuccess(interaction, `Panel #${panel.id} wurde gelöscht.`);
  }
}

async function autocomplete(interaction) {
  const q = interaction.options.getFocused().toLowerCase();
  return interaction.respond(all('SELECT * FROM role_panels WHERE guild_id = ?', interaction.guildId).filter((p) => p.title.toLowerCase().includes(q)).slice(0, 25).map((p) => ({ name: `#${p.id} ${p.title}`.slice(0, 100), value: String(p.id) })));
}

module.exports = { data, perms: { '*': ['admin'] }, execute, autocomplete };
