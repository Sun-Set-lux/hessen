// Panel, Kategorie-Auswahl, Formular und Team-Buttons von Modmail
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const theme = require('../core/theme');
const perms = require('../core/permissions');
const logger = require('../core/logger');
const { run } = require('../core/database');
const mm = require('../systems/modmailManager');
const pending = require('../systems/pending');

async function guildOf(interaction) {
  return interaction.guild || interaction.client.guilds.fetch(process.env.GUILD_ID).catch(() => null);
}

function subjectModal(category, token = '') {
  return new ModalBuilder().setCustomId(`mm:openmodal:${category}:${token}`).setTitle(`Support – ${mm.CATEGORIES[category].label}`.slice(0, 45)).addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('betreff').setLabel('Betreff').setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nachricht').setLabel('Beschreibe dein Anliegen').setStyle(TextInputStyle.Paragraph).setMaxLength(1800).setRequired(!token)),
  );
}

async function handle(interaction, action, args) {
  const guild = await guildOf(interaction);
  const g = guild?.id || process.env.GUILD_ID;

  if (action === 'contact') {
    return theme.reply(interaction, { embeds: [theme.info(g, 'In welcher Kategorie können wir dir helfen?', '📩 Support kontaktieren')], components: [mm.categoryMenu('mm:panelcat')] });
  }
  if (action === 'panelcat') {
    if (mm.openFor(g, interaction.user.id)) return theme.replyError(interaction, 'Du hast bereits eine offene Unterhaltung. Schreibe einfach in deinen Privatnachrichten mit dem Bot weiter.');
    return interaction.showModal(subjectModal(interaction.values[0]));
  }
  // Aus einer Privatnachricht heraus: Kategorie gewählt
  if (action === 'dmcat') {
    const token = args[0];
    if (!pending.get(token)) return interaction.update({ embeds: [theme.error(g, 'Diese Auswahl ist abgelaufen. Bitte schreibe mir erneut.')], components: [] });
    return interaction.showModal(subjectModal(interaction.values[0], token));
  }
  if (action === 'openmodal') {
    const [category, token] = args;
    if (!mm.CATEGORIES[category]) return theme.replyError(interaction, 'Unbekannte Kategorie.');
    if (!guild) return theme.replyError(interaction, 'Der Server ist gerade nicht erreichbar.');
    const member = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) return theme.replyError(interaction, 'Du musst Mitglied unseres Discord-Servers sein, um Modmail zu nutzen.');
    if (!require('../core/util').lock(`mm-open:${interaction.user.id}`, 10000)) return theme.replyError(interaction, 'Deine Unterhaltung wird bereits erstellt.');
    await interaction.deferReply({ flags: interaction.inGuild() ? MessageFlags.Ephemeral : undefined });
    const first = token ? pending.take(token) : null;
    const text = interaction.fields.getTextInputValue('nachricht').trim();
    const firstMsg = first ? { content: [first.content, text].filter(Boolean).join('\n\n'), attachments: new Map(first.attachments.map((u, i) => [i, { url: u }])) } : text;
    const res = await mm.open(interaction.client, guild, interaction.user, category, firstMsg, interaction.fields.getTextInputValue('betreff').trim());
    if (!res.ok) return interaction.editReply({ embeds: [theme.error(g, res.reason)] });
    return interaction.editReply({ embeds: [theme.success(g, interaction.inGuild() ? 'Deine Unterhaltung wurde eröffnet! Schau in deine **Privatnachrichten** – dort geht es weiter.' : 'Deine Unterhaltung wurde eröffnet. Schreibe hier einfach weiter – unser Team antwortet dir hier.')] });
  }

  // ---- Team-Aktionen im Modmail-Kanal ----
  if (['claim', 'close', 'setcat', 'closemodal'].includes(action)) {
    const conv = mm.byId(args[0]);
    if (!conv || conv.status !== 'offen') return theme.replyError(interaction, 'Diese Unterhaltung ist nicht mehr offen.');
    if (!perms.check(interaction.member, 'modmail.close').ok && !mm.canReply(interaction.member, conv).ok) return theme.replyError(interaction, 'Dafür fehlt dir die Berechtigung.');
    if (action === 'claim') {
      if (conv.claimed_by && conv.claimed_by !== interaction.user.id && !perms.inGroup(interaction.member, 'management')) return theme.replyError(interaction, `Bereits übernommen von <@${conv.claimed_by}>.`);
      const newClaim = conv.claimed_by ? null : interaction.user.id;
      run('UPDATE modmail_conversations SET claimed_by = ? WHERE id = ?', newClaim, conv.id);
      mm.saveMessage(conv.id, interaction.user.id, 'system', newClaim ? 'Übernommen' : 'Freigegeben');
      const user = await interaction.client.users.fetch(conv.user_id).catch(() => null);
      const member = await guild.members.fetch(conv.user_id).catch(() => null);
      await interaction.update(mm.headerPayload(guild, mm.byId(conv.id), user, member));
      return interaction.followUp({ embeds: [theme.success(g, newClaim ? `<@${interaction.user.id}> hat die Unterhaltung übernommen.` : 'Die Unterhaltung ist wieder frei.')] });
    }
    if (action === 'close') {
      return interaction.showModal(new ModalBuilder().setCustomId(`mm:closemodal:${conv.id}`).setTitle('Unterhaltung schließen').addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('grund').setLabel('Grund (wird dem Nutzer mitgeteilt)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500)),
      ));
    }
    if (action === 'closemodal') {
      const check = mm.canReply(interaction.member, conv);
      if (!check.ok) return theme.replyError(interaction, check.reason);
      await interaction.reply({ embeds: [theme.info(g, '🔒 Unterhaltung wird geschlossen …')] });
      const res = await mm.close(interaction.client, guild, conv, interaction.user.id, interaction.fields.getTextInputValue('grund').trim() || null);
      if (!res.ok) await interaction.followUp({ embeds: [theme.error(g, res.reason)], flags: MessageFlags.Ephemeral });
      return null;
    }
    if (action === 'setcat') {
      const cat = interaction.values[0];
      if (cat === conv.category) return theme.replyError(interaction, 'Die Unterhaltung hat bereits diese Kategorie.');
      run('UPDATE modmail_conversations SET category = ? WHERE id = ?', cat, conv.id);
      mm.saveMessage(conv.id, interaction.user.id, 'system', `Kategorie geändert: ${conv.category} → ${cat}`);
      const fresh = mm.byId(conv.id);
      const user = await interaction.client.users.fetch(conv.user_id).catch(() => null);
      const member = await guild.members.fetch(conv.user_id).catch(() => null);
      await interaction.update(mm.headerPayload(guild, fresh, user, member));
      await interaction.channel.setName(`${cat}-${(user?.username || conv.user_id).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20)}`).catch(() => {});
      logger.discord(g, 'modmailLog', theme.base(g, 'neutral', `Modmail #${conv.id}`).setDescription(`🏷️ Kategorie geändert: ${mm.catLabel(conv.category)} → ${mm.catLabel(cat)} (durch <@${interaction.user.id}>)`), { event: 'modmail.category', userId: interaction.user.id });
      return interaction.followUp({ embeds: [theme.success(g, `Kategorie geändert zu **${mm.catLabel(cat)}**.`)] });
    }
  }

  // Nutzer schließt selbst (aus der DM)
  if (action === 'userclose') {
    const conv = mm.byId(args[0]);
    if (!conv || conv.user_id !== interaction.user.id) return theme.replyError(interaction, 'Diese Unterhaltung gehört nicht dir.');
    if (conv.status !== 'offen') return interaction.update({ components: [] });
    await interaction.update({ components: [] });
    await mm.close(interaction.client, guild, conv, interaction.user.id, 'Vom Nutzer geschlossen', { byUser: true });
    return interaction.followUp({ embeds: [theme.success(g, 'Deine Unterhaltung wurde geschlossen. Vielen Dank! Schreibe einfach erneut, wenn du wieder Hilfe brauchst.')] });
  }
}

module.exports = { prefix: 'mm', handle };
