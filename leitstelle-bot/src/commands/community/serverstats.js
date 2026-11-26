const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const theme = require('../../core/theme');
const util = require('../../core/util');
const settings = require('../../core/settings');
const { one } = require('../../core/database');
const stats = require('../../systems/serverStats');
const statusPanel = require('../../systems/statusPanel');

const data = new SlashCommandBuilder()
  .setName('serverstats')
  .setDescription('Server-Statistiken')
  .addSubcommand((s) => s.setName('anzeigen').setDescription('Zeigt die Statistiken des Servers'))
  .addSubcommand((s) => s.setName('kanaele').setDescription('Erstellt automatische Statistik-Kanäle'))
  .addSubcommand((s) => s.setName('entfernen').setDescription('Entfernt die Statistik-Kanäle'));

async function execute(interaction) {
  const g = interaction.guildId;
  const guild = interaction.guild;
  const sub = interaction.options.getSubcommand();
  if (sub === 'anzeigen') {
    const snap = statusPanel.snapshot();
    const month = Date.now() - 30 * 864e5;
    return theme.reply(interaction, { embeds: [theme.base(g, 'primary').setTitle(`📊 ${guild.name}`).setThumbnail(guild.iconURL()).addFields(
      { name: 'Mitglieder', value: util.numberDe(guild.memberCount), inline: true },
      { name: 'Kanäle', value: String(guild.channels.cache.size), inline: true },
      { name: 'Rollen', value: String(guild.roles.cache.size), inline: true },
      { name: 'Boosts', value: `${guild.premiumSubscriptionCount || 0} (Stufe ${guild.premiumTier})`, inline: true },
      { name: 'Erstellt', value: util.ts(guild.createdTimestamp, 'D'), inline: true },
      { name: 'ER:LC', value: snap?.ok ? `${snap.data.CurrentPlayers}/${snap.data.MaxPlayers} Spieler` : snap?.error?.offline ? 'Offline' : 'Nicht verfügbar', inline: true },
      { name: 'Sessions (30 Tage)', value: String(one("SELECT COUNT(*) AS n FROM sessions WHERE guild_id = ? AND created_at >= ?", g, month).n), inline: true },
      { name: 'Modmail (30 Tage)', value: String(one('SELECT COUNT(*) AS n FROM modmail_conversations WHERE guild_id = ? AND created_at >= ?', g, month).n), inline: true },
      { name: 'Bewerbungen (30 Tage)', value: String(one('SELECT COUNT(*) AS n FROM applications WHERE guild_id = ? AND created_at >= ?', g, month).n), inline: true },
    )] }, false);
  }
  if (sub === 'kanaele') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try { await stats.setup(guild); } catch (err) { return interaction.editReply({ embeds: [theme.error(g, `Fehler: ${err.message}`)] }); }
    return interaction.editReply({ embeds: [theme.success(g, 'Die Statistik-Kanäle wurden erstellt und aktualisieren sich alle 10 Minuten (Discord-Limit).')] });
  }
  const map = settings.get(g, 'stats.channels') || {};
  let parent = null;
  for (const id of Object.values(map)) { const ch = guild.channels.cache.get(id); parent = ch?.parentId || parent; await ch?.delete().catch(() => {}); }
  if (parent) { const cat = guild.channels.cache.get(parent); if (cat && cat.children.cache.size === 0) await cat.delete().catch(() => {}); }
  settings.set(g, 'stats.channels', {});
  return theme.replySuccess(interaction, 'Die Statistik-Kanäle wurden entfernt.');
}

module.exports = { data, perms: { anzeigen: ['everyone'], kanaele: ['admin'], entfernen: ['admin'] }, execute };
