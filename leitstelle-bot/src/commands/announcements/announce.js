const { SlashCommandBuilder, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const theme = require('../../core/theme');
const settings = require('../../core/settings');
const texts = require('../../core/texts');
const util = require('../../core/util');
const { all, run } = require('../../core/database');
const pending = require('../../systems/pending');
const an = require('../../systems/announcementManager');
const dm = require('../../systems/departmentManager');

const common = (s, withRole = true) => {
  s.addChannelOption((o) => o.setName('kanal').setDescription('Zielkanal (Standard: Ankündigungskanal)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption((o) => o.setName('titel').setDescription('Titel').setMaxLength(200));
  if (withRole) s.addRoleOption((o) => o.setName('rolle').setDescription('Rolle erwähnen'));
  s.addBooleanOption((o) => o.setName('everyone').setDescription('@everyone erwähnen? (nur Management)'))
    .addAttachmentOption((o) => o.setName('bild').setDescription('Bild'))
    .addStringOption((o) => o.setName('farbe').setDescription('Hex-Farbe, z. B. #4C7DFF').setMaxLength(7))
    .addStringOption((o) => o.setName('zeitpunkt').setDescription('Geplant senden: 20:00, 24.12.2026 18:00 oder in 2h').setMaxLength(30));
  return s;
};

const data = new SlashCommandBuilder()
  .setName('announce')
  .setDescription('Ankündigungen senden und planen')
  .addSubcommand((s) => common(s.setName('allgemein').setDescription('Allgemeine Ankündigung')))
  .addSubcommand((s) => common(s.setName('session').setDescription('Session-Ankündigung')))
  .addSubcommand((s) => common(s.setName('department').setDescription('Ankündigung an eine Abteilung')
    .addStringOption((o) => o.setName('abteilung').setDescription('Abteilung').setRequired(true).setAutocomplete(true)), false))
  .addSubcommand((s) => common(s.setName('emergency').setDescription('Wichtige Mitteilung / Notfall')))
  .addSubcommand((s) => common(s.setName('maintenance').setDescription('Wartungsankündigung')))
  .addSubcommand((s) => s.setName('geplant').setDescription('Zeigt geplante Ankündigungen'))
  .addSubcommand((s) => s.setName('abbrechen').setDescription('Bricht eine geplante Ankündigung ab')
    .addIntegerOption((o) => o.setName('id').setDescription('Nummer der Ankündigung').setRequired(true)));

const permsMap = { allgemein: ['management'], session: ['host', 'management'], department: ['deptlead'], emergency: ['management'], maintenance: ['management', 'server'], geplant: ['management', 'host', 'deptlead'], abbrechen: ['management', 'host', 'deptlead'] };

async function execute(interaction) {
  const g = interaction.guildId;
  const sub = interaction.options.getSubcommand();
  const o = interaction.options;

  if (sub === 'geplant') {
    const rows = all("SELECT * FROM announcements WHERE guild_id = ? AND status = 'geplant' ORDER BY send_at", g);
    return theme.reply(interaction, { embeds: [theme.base(g, 'primary').setTitle('🗓️ Geplante Ankündigungen').setDescription(rows.length ? rows.map((r) => `**#${r.id}** ${an.TYPES[r.type]?.label} ${theme.E.dot} <#${r.channel_id}> ${theme.E.dot} ${util.ts(r.send_at)} (${util.ts(r.send_at, 'R')})\n-# ${util.truncate(r.title || r.content, 80)} – von <@${r.author_id}>`).join('\n') : 'Keine geplanten Ankündigungen.')] });
  }
  if (sub === 'abbrechen') {
    const a = an.get(o.getInteger('id'));
    if (!a || a.guild_id !== g || a.status !== 'geplant') return theme.replyError(interaction, 'Es gibt keine geplante Ankündigung mit dieser Nummer.');
    if (a.author_id !== interaction.user.id && !require('../../core/permissions').inGroup(interaction.member, 'management')) return theme.replyError(interaction, 'Du kannst nur deine eigenen Ankündigungen abbrechen.');
    run("UPDATE announcements SET status = 'abgebrochen' WHERE id = ?", a.id);
    return theme.replySuccess(interaction, `Ankündigung #${a.id} wurde abgebrochen.`);
  }

  const channel = o.getChannel('kanal') || (settings.channel(g, 'announcement') ? { id: settings.channel(g, 'announcement') } : interaction.channel);
  let roleId = o.getRole('rolle')?.id || null;
  let color = o.getString('farbe') ? util.parseColor(o.getString('farbe')) : null;
  if (o.getString('farbe') && color === null) return theme.replyError(interaction, 'Ungültige Farbe. Format: `#RRGGBB`.');
  let dept = null;
  if (sub === 'department') {
    dept = dm.find(g, o.getString('abteilung'));
    if (!dept) return theme.replyError(interaction, 'Diese Abteilung gibt es nicht.');
    if (!dm.authority(interaction.member, dept).ok) return theme.replyError(interaction, `Du darfst nur für deine eigene Abteilung Ankündigungen senden.`);
    roleId = dept.role_id; color = color ?? dept.color;
  }
  if (!roleId && !o.getBoolean('everyone') && ['session'].includes(sub)) roleId = settings.role(g, 'sessionPing');
  if (!roleId && !o.getBoolean('everyone') && ['allgemein', 'emergency', 'maintenance'].includes(sub)) roleId = settings.role(g, 'announcement');
  if (o.getBoolean('everyone')) {
    if (!require('../../core/permissions').inGroup(interaction.member, 'management')) return theme.replyError(interaction, '@everyone darf nur das Community-Management erwähnen.');
    roleId = 'everyone';
  }
  let sendAt = null;
  if (o.getString('zeitpunkt')) {
    sendAt = util.parseTime(o.getString('zeitpunkt'));
    if (!sendAt || sendAt < Date.now() + 30000) return theme.replyError(interaction, 'Ungültiger oder vergangener Zeitpunkt. Beispiele: `20:00`, `24.12.2026 18:00`, `in 2h`.');
    if (sendAt > Date.now() + 60 * 864e5) return theme.replyError(interaction, 'Ankündigungen können höchstens 60 Tage im Voraus geplant werden.');
  }
  const bild = o.getAttachment('bild');
  if (bild && !bild.contentType?.startsWith('image/')) return theme.replyError(interaction, 'Die Datei muss ein Bild sein.');
  const token = pending.put({ type: sub, channelId: channel.id, title: o.getString('titel') || (dept ? `${dept.short} – ${dept.name}` : null), roleId, color, sendAt, image: bild ? { url: bild.url, name: bild.name } : null, user: interaction.user.id });
  const tplKey = `announce.${sub}`;
  return interaction.showModal(new ModalBuilder().setCustomId(`ann:text:${token}`).setTitle(an.TYPES[sub].label).addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('text').setLabel('Text der Ankündigung').setStyle(TextInputStyle.Paragraph).setMaxLength(4000).setRequired(true).setValue(texts.get(g, tplKey) || '')),
  ));
}

async function autocomplete(interaction) {
  const q = interaction.options.getFocused().toLowerCase();
  return interaction.respond(dm.list(interaction.guildId).filter((d) => `${d.short} ${d.name}`.toLowerCase().includes(q)).slice(0, 25).map((d) => ({ name: `${d.short} – ${d.name}`, value: String(d.id) })));
}

module.exports = { data, perms: permsMap, execute, autocomplete };
