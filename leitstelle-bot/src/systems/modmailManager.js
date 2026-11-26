// Modmail: private Unterhaltungen zwischen Nutzern (DM) und dem Team (privater Kanal)
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ChannelType, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const { one, all, run, now, bumpActivity } = require('../core/database');
const settings = require('../core/settings');
const texts = require('../core/texts');
const theme = require('../core/theme');
const util = require('../core/util');
const logger = require('../core/logger');
const perms = require('../core/permissions');

const { E } = theme;

const CATEGORIES = {
  allgemein: { label: 'Allgemeiner Support', emoji: '💬', description: 'Fragen und allgemeine Anliegen' },
  spieler: { label: 'Spieler melden', emoji: '🚩', description: 'Regelverstoß eines Spielers melden' },
  beschwerde: { label: 'Teammitglied beschweren', emoji: '⚖️', description: 'Beschwerde über ein Teammitglied' },
  entbannung: { label: 'Entbannungsantrag', emoji: '🔓', description: 'Antrag auf Aufhebung eines Banns' },
  bewerbung: { label: 'Bewerbung', emoji: '📝', description: 'Fragen zu Bewerbungen' },
  partner: { label: 'Partnerschaft', emoji: '🤝', description: 'Partnerschaftsanfragen' },
  sonstiges: { label: 'Sonstiges', emoji: '📦', description: 'Alles andere' },
};

const STAFF_GROUPS = ['support', 'moderation', 'management', 'admin'];

const byId = (id) => one('SELECT * FROM modmail_conversations WHERE id = ?', Number(id));
const byChannel = (channelId) => one("SELECT * FROM modmail_conversations WHERE channel_id = ? AND status = 'offen'", channelId);
const openFor = (g, userId) => one("SELECT * FROM modmail_conversations WHERE guild_id = ? AND user_id = ? AND status = 'offen'", g, userId);
const historyFor = (g, userId) => all('SELECT * FROM modmail_conversations WHERE guild_id = ? AND user_id = ? ORDER BY id DESC', g, userId);
const catLabel = (k) => CATEGORIES[k] ? `${CATEGORIES[k].emoji} ${CATEGORIES[k].label}` : k;

function saveMessage(convId, authorId, direction, content, attachments = []) {
  run('INSERT INTO modmail_messages (conversation_id, author_id, direction, content, attachments, at) VALUES (?,?,?,?,?,?)',
    convId, authorId, direction, content || null, attachments.length ? JSON.stringify(attachments) : null, now());
}

function categoryMenu(customId, placeholder = 'Wähle eine Kategorie …') {
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder)
    .addOptions(Object.entries(CATEGORIES).map(([value, c]) => ({ label: c.label, value, emoji: c.emoji, description: c.description }))));
}

function panelPayload(g) {
  const embed = theme.base(g, 'primary').setTitle(`${E.mail} Support kontaktieren`)
    .setDescription('Du benötigst Unterstützung oder hast ein Anliegen? Unser Team hilft dir gerne weiter.\n\nWähle eine Kategorie aus und eröffne eine private Unterhaltung mit unserem Team. Die Unterhaltung läuft anschließend bequem über deine **Privatnachrichten** mit dem Bot.\n\n-# Du kannst dem Bot auch direkt eine Privatnachricht schreiben.');
  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('mm:contact').setStyle(ButtonStyle.Primary).setLabel('Support kontaktieren').setEmoji('📩')),
      categoryMenu('mm:panelcat'),
    ],
  };
}

function headerPayload(guild, conv, user, member) {
  const g = guild.id;
  const prev = all("SELECT * FROM modmail_conversations WHERE guild_id = ? AND user_id = ? AND id != ? ORDER BY id DESC LIMIT 5", g, conv.user_id, conv.id);
  const warns = one('SELECT COUNT(*) AS n FROM warnings WHERE guild_id = ? AND user_id = ? AND active = 1', g, conv.user_id).n;
  const embed = theme.base(g, 'primary', `Modmail #${conv.id}`)
    .setTitle(`${E.mail} Neue Unterhaltung – ${catLabel(conv.category)}`)
    .setThumbnail(user?.displayAvatarURL() || null)
    .addFields(
      { name: `${E.user} Nutzer`, value: `<@${conv.user_id}> (${user ? util.clean(user.tag) : 'Unbekannt'})`, inline: true },
      { name: '🆔 Nutzer-ID', value: `\`${conv.user_id}\``, inline: true },
      { name: '🏷️ Kategorie', value: catLabel(conv.category), inline: true },
      { name: '📅 Account erstellt', value: user ? `${util.ts(user.createdTimestamp, 'D')} (${util.ts(user.createdTimestamp, 'R')})` : '–', inline: true },
      { name: '📥 Server beigetreten', value: member?.joinedTimestamp ? `${util.ts(member.joinedTimestamp, 'D')} (${util.ts(member.joinedTimestamp, 'R')})` : 'Nicht auf dem Server', inline: true },
      { name: `${E.warn} Aktive Verwarnungen`, value: String(warns), inline: true },
      { name: '🙋 Bearbeitet von', value: conv.claimed_by ? `<@${conv.claimed_by}>` : 'Noch nicht übernommen', inline: true },
      { name: '🗂️ Frühere Unterhaltungen', value: prev.length ? prev.map((p) => `#${p.id} ${E.dot} ${catLabel(p.category)} ${E.dot} ${util.ts(p.created_at, 'd')}${p.close_reason ? ` ${E.dot} ${util.truncate(p.close_reason, 40)}` : ''}`).join('\n') : 'Keine' },
    );
  if (member?.roles?.cache?.size > 1) embed.addFields({ name: 'Rollen', value: member.roles.cache.filter((r) => r.id !== g).map((r) => `<@&${r.id}>`).slice(0, 15).join(' ') || '–' });
  embed.addFields({ name: 'So funktioniert es', value: 'Jede Nachricht hier wird an den Nutzer gesendet.\nNachrichten mit `//` am Anfang bleiben **intern**.\nNotizen: `/modmail note` ' + E.dot + ' Schließen: Button oder `/modmail close`.' });
  const claimed = !!conv.claimed_by;
  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`mm:claim:${conv.id}`).setStyle(claimed ? ButtonStyle.Secondary : ButtonStyle.Success).setLabel(claimed ? 'Freigeben' : 'Übernehmen').setEmoji('🙋'),
        new ButtonBuilder().setCustomId(`mm:close:${conv.id}`).setStyle(ButtonStyle.Danger).setLabel('Schließen').setEmoji('🔒'),
      ),
      categoryMenu(`mm:setcat:${conv.id}`, 'Kategorie ändern …'),
    ],
  };
}

async function staffOverwrites(guild, extraUserIds = []) {
  const roles = [...new Set(STAFF_GROUPS.flatMap((x) => perms.rolesOf(guild.id, x)))];
  return [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.AddReactions] },
    ...roles.map((id) => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] })),
    ...extraUserIds.map((id) => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] })),
  ];
}

async function createChannel(guild, conv, user) {
  const categoryId = settings.get(guild.id, 'channels.modmailCategory');
  if (!categoryId) throw new Error('Es ist keine Modmail-Kategorie eingestellt (/modmail setup).');
  const extra = all('SELECT user_id FROM modmail_staff WHERE conversation_id = ?', conv.id).map((r) => r.user_id);
  const name = `${conv.category}-${(user?.username || conv.user_id).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || conv.user_id}`;
  const ch = await guild.channels.create({
    name, type: ChannelType.GuildText, parent: categoryId,
    topic: `Modmail #${conv.id} | Nutzer-ID ${conv.user_id} | ${CATEGORIES[conv.category]?.label || conv.category}`,
    permissionOverwrites: await staffOverwrites(guild, extra),
  });
  run('UPDATE modmail_conversations SET channel_id = ? WHERE id = ?', ch.id, conv.id);
  return ch;
}

/**
 * Eröffnet eine Unterhaltung. Prüft vorher, ob der Nutzer Privatnachrichten empfangen kann.
 */
async function open(client, guild, user, category, firstMessage, subject) {
  const g = guild.id;
  if (!settings.get(g, 'channels.modmailCategory')) return { ok: false, reason: 'Modmail ist noch nicht eingerichtet. Bitte wende dich an die Administration.' };
  const existing = openFor(g, user.id);
  if (existing) return { ok: false, reason: 'Du hast bereits eine offene Unterhaltung. Schreibe einfach in deinen Privatnachrichten mit dem Bot weiter.' };

  const id = run('INSERT INTO modmail_conversations (guild_id, user_id, category, status, created_at) VALUES (?,?,?,?,?)', g, user.id, category, 'offen', now()).lastInsertRowid;
  const conv = byId(id);
  // Begrüßung per DM – schlägt das fehl, sind DMs geschlossen
  try {
    await user.send({
      embeds: [theme.base(g, 'primary', `Modmail #${id}`).setTitle(`${E.mail} Unterhaltung eröffnet`).setDescription(texts.render(g, 'modmail.greeting', { user: user.username, kategorie: CATEGORIES[category]?.label || category }))],
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`mm:userclose:${id}`).setStyle(ButtonStyle.Secondary).setLabel('Unterhaltung schließen').setEmoji('🔒'))],
    });
  } catch {
    run('DELETE FROM modmail_conversations WHERE id = ?', id);
    return { ok: false, dmClosed: true, reason: '**Ich kann dir keine Privatnachricht senden.**\nBitte erlaube Direktnachrichten: Rechtsklick auf den Server → **Datenschutzeinstellungen** → **Direktnachrichten** aktivieren. Danach erneut auf **Support kontaktieren** klicken.\n\nAlternativ kannst du dich in einem öffentlichen Support-Kanal an ein Teammitglied wenden.' };
  }

  let ch;
  try { ch = await createChannel(guild, conv, user); } catch (err) {
    run('DELETE FROM modmail_conversations WHERE id = ?', id);
    await user.send({ embeds: [theme.error(g, 'Die Unterhaltung konnte leider nicht erstellt werden. Bitte versuche es später erneut.')] }).catch(() => {});
    logger.log.error('Modmail-Kanal konnte nicht erstellt werden:', err.message);
    return { ok: false, reason: 'Die Unterhaltung konnte nicht erstellt werden. Bitte informiere die Administration.' };
  }
  const member = await guild.members.fetch(user.id).catch(() => null);
  const header = await ch.send(headerPayload(guild, byId(id), user, member));
  await header.pin().catch(() => {});
  const pingRoles = perms.rolesOf(g, 'support');
  if (pingRoles.length) await ch.send({ content: pingRoles.map((r) => `<@&${r}>`).join(' '), allowedMentions: { roles: pingRoles } }).catch(() => {});
  if (subject || firstMessage) {
    const text = [subject ? `**Betreff:** ${subject}` : null, firstMessage?.content || firstMessage || null].filter(Boolean).join('\n\n');
    const files = firstMessage?.attachments ? [...firstMessage.attachments.values()].map((a) => a.url) : [];
    await ch.send({ embeds: [userEmbed(g, user, text, files)] });
    saveMessage(id, user.id, 'nutzer', text, files);
  }
  await logger.discord(g, 'modmailLog', theme.base(g, 'primary', `Modmail #${id}`).setDescription(`${E.mail} **Unterhaltung eröffnet** von <@${user.id}> ${E.dot} ${catLabel(category)} ${E.dot} ${ch}`), { event: 'modmail.open', userId: user.id });
  return { ok: true, conv: byId(id), channel: ch };
}

const userEmbed = (g, user, text, files = []) => theme.base(g, 'primary', 'Nutzer').setAuthor({ name: user.tag || user.username, iconURL: user.displayAvatarURL() })
  .setDescription(util.truncate(text || '*(keine Textnachricht)*', 4000) + (files.length ? `\n\n📎 **Anhänge:**\n${files.join('\n')}` : ''));

const staffEmbed = (g, member, text, files = []) => theme.base(g, 'success', 'Team')
  .setAuthor({ name: `${member.displayName} ${E.dot} Team`, iconURL: member.displayAvatarURL() })
  .setDescription(util.truncate(text || '*(keine Textnachricht)*', 4000) + (files.length ? `\n\n📎 **Anhänge:**\n${files.join('\n')}` : ''));

function canReply(member, conv) {
  const groups = perms.groupsOf(member);
  if (groups.has('admin') || groups.has('management')) return { ok: true };
  const added = one('SELECT 1 FROM modmail_staff WHERE conversation_id = ? AND user_id = ?', conv.id, member.id);
  const staff = perms.check(member, 'modmail.close').ok || added;
  if (!staff) return { ok: false, reason: 'Du darfst in Modmail-Unterhaltungen nicht antworten.' };
  if (conv.claimed_by && conv.claimed_by !== member.id && !added) return { ok: false, reason: `Diese Unterhaltung wurde von <@${conv.claimed_by}> übernommen.` };
  return { ok: true };
}

// Nachricht im Team-Kanal → an Nutzer weiterleiten
async function onStaffMessage(message, conv) {
  if (message.content.startsWith('//')) { saveMessage(conv.id, message.author.id, 'intern', message.content.slice(2).trim()); return; }
  const check = canReply(message.member, conv);
  if (!check.ok) { await message.react('⛔').catch(() => {}); await message.reply({ embeds: [theme.error(message.guildId, `${check.reason} Interne Nachrichten bitte mit \`//\` beginnen.`)], allowedMentions: { parse: [] } }).catch(() => {}); return; }
  const files = [...message.attachments.values()].map((a) => a.url);
  try {
    const user = await message.client.users.fetch(conv.user_id);
    await user.send({ embeds: [staffEmbed(message.guildId, message.member, message.content, files)] });
    saveMessage(conv.id, message.author.id, 'team', message.content, files);
    if (!conv.first_response_at) run('UPDATE modmail_conversations SET first_response_at = ? WHERE id = ?', now(), conv.id);
    bumpActivity(message.guildId, message.author.id, 'modmail');
    await message.react('✅').catch(() => {});
  } catch {
    await message.react('❌').catch(() => {});
    await message.reply({ embeds: [theme.error(message.guildId, 'Die Nachricht konnte nicht zugestellt werden. Der Nutzer hat vermutlich seine Privatnachrichten geschlossen oder den Server verlassen.')] }).catch(() => {});
  }
}

// Privatnachricht eines Nutzers → an Team-Kanal weiterleiten
async function onUserDM(message, guild) {
  const conv = openFor(guild.id, message.author.id);
  if (!conv) return false;
  const ch = await message.client.channels.fetch(conv.channel_id).catch(() => null);
  if (!ch) {
    await message.reply({ embeds: [theme.error(guild.id, 'Deine Unterhaltung ist gerade nicht erreichbar. Bitte versuche es gleich erneut.')] }).catch(() => {});
    return true;
  }
  const files = [...message.attachments.values()].map((a) => a.url);
  await ch.send({ embeds: [userEmbed(guild.id, message.author, message.content, files)] });
  saveMessage(conv.id, message.author.id, 'nutzer', message.content, files);
  await message.react('✅').catch(() => {});
  return true;
}

function transcript(conv, guild) {
  const rows = all('SELECT * FROM modmail_messages WHERE conversation_id = ? ORDER BY at', conv.id);
  const fmt = (ms) => new Date(ms).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
  const name = (id) => guild.members.cache.get(id)?.user.tag || guild.client.users.cache.get(id)?.tag || id;
  const kind = { nutzer: 'Nutzer', team: 'Team', intern: 'Intern', notiz: 'Notiz', system: 'System' };
  const lines = [
    `Modmail-Transkript #${conv.id}`,
    `Nutzer: ${name(conv.user_id)} (${conv.user_id})`,
    `Kategorie: ${CATEGORIES[conv.category]?.label || conv.category}`,
    `Eröffnet: ${fmt(conv.created_at)}`,
    conv.closed_at ? `Geschlossen: ${fmt(conv.closed_at)} von ${name(conv.closed_by)} – Grund: ${conv.close_reason || 'Keine Angabe'}` : '',
    ''.padEnd(60, '='),
    ...rows.map((r) => `[${fmt(r.at)}] [${kind[r.direction] || r.direction}] ${name(r.author_id)}: ${r.content || ''}${r.attachments ? `\n    Anhänge: ${JSON.parse(r.attachments).join(', ')}` : ''}`),
  ];
  return new AttachmentBuilder(Buffer.from(lines.join('\n'), 'utf8'), { name: `modmail-${conv.id}.txt` });
}

async function close(client, guild, conv, byUserId, reason, { byUser = false } = {}) {
  const g = guild.id;
  if (!util.lock(`mm-close:${conv.id}`, 10000)) return { ok: false, reason: 'Die Unterhaltung wird bereits geschlossen.' };
  run("UPDATE modmail_conversations SET status = 'geschlossen', closed_at = ?, closed_by = ?, close_reason = ? WHERE id = ?", now(), byUserId, reason || null, conv.id);
  saveMessage(conv.id, byUserId, 'system', `Unterhaltung geschlossen${byUser ? ' (durch den Nutzer)' : ''}. Grund: ${reason || 'Keine Angabe'}`);
  const closed = byId(conv.id);
  if (!byUser) {
    const user = await client.users.fetch(conv.user_id).catch(() => null);
    await user?.send({ embeds: [theme.base(g, 'neutral', `Modmail #${conv.id}`).setTitle('🔒 Unterhaltung geschlossen').setDescription(texts.render(g, 'modmail.closed', { grund: reason || 'Keine Angabe' }))] }).catch(() => {});
  }
  if (!byUserId || byUser) { /* keine Team-Aktivität */ } else bumpActivity(g, byUserId, 'modmail_closed');
  const count = one('SELECT COUNT(*) AS n FROM modmail_messages WHERE conversation_id = ?', conv.id).n;
  await logger.discord(g, 'modmailLog', theme.base(g, 'neutral', `Modmail #${conv.id}`).setTitle('🔒 Modmail geschlossen')
    .addFields(
      { name: 'Nutzer', value: `<@${conv.user_id}>`, inline: true },
      { name: 'Kategorie', value: catLabel(conv.category), inline: true },
      { name: 'Geschlossen von', value: byUser ? 'Nutzer selbst' : `<@${byUserId}>`, inline: true },
      { name: 'Bearbeitet von', value: conv.claimed_by ? `<@${conv.claimed_by}>` : '–', inline: true },
      { name: 'Nachrichten', value: String(count), inline: true },
      { name: 'Dauer', value: util.duration(closed.closed_at - conv.created_at), inline: true },
      { name: 'Grund', value: util.truncate(reason || 'Keine Angabe', 1024) },
    ), { event: 'modmail.close', userId: byUserId, targetId: conv.user_id, files: [transcript(closed, guild)] });
  const ch = conv.channel_id ? await client.channels.fetch(conv.channel_id).catch(() => null) : null;
  if (ch) {
    await ch.send({ embeds: [theme.base(g, 'neutral').setDescription(`🔒 Unterhaltung geschlossen${byUser ? ' durch den Nutzer' : ` von <@${byUserId}>`}. Das Transkript wurde gespeichert. Dieser Kanal wird in 10 Sekunden gelöscht.`)] }).catch(() => {});
    setTimeout(() => ch.delete('Modmail geschlossen').catch(() => {}), 10000);
  }
  return { ok: true };
}

async function reopen(client, guild, conv, byUserId) {
  const g = guild.id;
  if (openFor(g, conv.user_id)) return { ok: false, reason: 'Dieser Nutzer hat bereits eine offene Unterhaltung.' };
  run("UPDATE modmail_conversations SET status = 'offen', closed_at = NULL, closed_by = NULL, close_reason = NULL, claimed_by = NULL WHERE id = ?", conv.id);
  const user = await client.users.fetch(conv.user_id).catch(() => null);
  let ch;
  try { ch = await createChannel(guild, byId(conv.id), user); } catch (err) {
    run("UPDATE modmail_conversations SET status = 'geschlossen' WHERE id = ?", conv.id);
    return { ok: false, reason: err.message };
  }
  const member = await guild.members.fetch(conv.user_id).catch(() => null);
  const header = await ch.send(headerPayload(guild, byId(conv.id), user, member));
  await header.pin().catch(() => {});
  const last = all('SELECT * FROM modmail_messages WHERE conversation_id = ? ORDER BY at DESC LIMIT 10', conv.id).reverse();
  if (last.length) {
    await ch.send({ embeds: [theme.base(g, 'neutral', 'Bisheriger Verlauf').setTitle('🔁 Wiedereröffnet – letzte Nachrichten')
      .setDescription(last.map((m) => `**${m.direction === 'nutzer' ? 'Nutzer' : m.direction === 'team' ? `<@${m.author_id}>` : m.direction}:** ${util.truncate(m.content || '', 200)}`).join('\n').slice(0, 4000))] });
  }
  saveMessage(conv.id, byUserId, 'system', 'Unterhaltung wiedereröffnet');
  let dm = true;
  try { await user.send({ embeds: [theme.info(g, 'Deine Unterhaltung mit unserem Team wurde **wiedereröffnet**. Du kannst hier im Privatchat einfach weiterschreiben.', `${E.mail} Unterhaltung wiedereröffnet`)] }); } catch { dm = false; }
  await logger.discord(g, 'modmailLog', theme.base(g, 'primary', `Modmail #${conv.id}`).setDescription(`🔁 **Wiedereröffnet** von <@${byUserId}> ${E.dot} ${ch}`), { event: 'modmail.reopen', userId: byUserId, targetId: conv.user_id });
  return { ok: true, channel: ch, dm };
}

async function refreshHeader(channel, conv) {
  const pins = await channel.messages.fetchPinned().catch(() => null);
  const header = pins?.find((m) => m.author.id === channel.client.user.id && m.embeds[0]?.footer?.text?.includes(`Modmail #${conv.id}`));
  if (!header) return;
  const user = await channel.client.users.fetch(conv.user_id).catch(() => null);
  const member = await channel.guild.members.fetch(conv.user_id).catch(() => null);
  await header.edit(headerPayload(channel.guild, conv, user, member)).catch(() => {});
}

function stats(g, since = 0) {
  return {
    open: one("SELECT COUNT(*) AS n FROM modmail_conversations WHERE guild_id = ? AND status = 'offen'", g).n,
    total: one('SELECT COUNT(*) AS n FROM modmail_conversations WHERE guild_id = ? AND created_at >= ?', g, since).n,
    closed: one("SELECT COUNT(*) AS n FROM modmail_conversations WHERE guild_id = ? AND status = 'geschlossen' AND closed_at >= ?", g, since).n,
    firstResponse: one('SELECT AVG(first_response_at - created_at) AS a FROM modmail_conversations WHERE guild_id = ? AND first_response_at IS NOT NULL AND created_at >= ?', g, since).a,
    duration: one("SELECT AVG(closed_at - created_at) AS a FROM modmail_conversations WHERE guild_id = ? AND status = 'geschlossen' AND created_at >= ?", g, since).a,
    perCategory: all('SELECT category, COUNT(*) AS n FROM modmail_conversations WHERE guild_id = ? AND created_at >= ? GROUP BY category ORDER BY n DESC', g, since),
    topStaff: all(`SELECT author_id, COUNT(*) AS n FROM modmail_messages m JOIN modmail_conversations c ON c.id = m.conversation_id
      WHERE c.guild_id = ? AND m.direction = 'team' AND m.at >= ? GROUP BY author_id ORDER BY n DESC LIMIT 5`, g, since),
  };
}

module.exports = {
  CATEGORIES, catLabel, byId, byChannel, openFor, historyFor, saveMessage, categoryMenu, panelPayload, headerPayload,
  open, close, reopen, onStaffMessage, onUserDM, canReply, staffOverwrites, refreshHeader, transcript, stats,
};
