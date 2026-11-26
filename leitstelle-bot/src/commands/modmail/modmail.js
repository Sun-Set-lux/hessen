const { SlashCommandBuilder, ChannelType, MessageFlags } = require('discord.js');
const theme = require('../../core/theme');
const settings = require('../../core/settings');
const util = require('../../core/util');
const logger = require('../../core/logger');
const { one, run } = require('../../core/database');
const mm = require('../../systems/modmailManager');
const panels = require('../../systems/panels');

const { E } = theme;

const data = new SlashCommandBuilder()
  .setName('modmail')
  .setDescription('Modmail-System verwalten')
  .addSubcommand((s) => s.setName('setup').setDescription('Richtet Modmail ein und sendet das Support-Panel in diesen Kanal')
    .addChannelOption((o) => o.setName('kategorie').setDescription('Kategorie für Unterhaltungen (leer = automatisch erstellen)').addChannelTypes(ChannelType.GuildCategory))
    .addChannelOption((o) => o.setName('log').setDescription('Log-Kanal für Transkripte').addChannelTypes(ChannelType.GuildText)))
  .addSubcommand((s) => s.setName('close').setDescription('Schließt die Unterhaltung in diesem Kanal')
    .addStringOption((o) => o.setName('grund').setDescription('Grund (wird dem Nutzer mitgeteilt)').setMaxLength(500)))
  .addSubcommand((s) => s.setName('reopen').setDescription('Öffnet die letzte Unterhaltung eines Nutzers erneut')
    .addUserOption((o) => o.setName('nutzer').setDescription('Nutzer').setRequired(true)))
  .addSubcommand((s) => s.setName('claim').setDescription('Übernimmt die Unterhaltung in diesem Kanal'))
  .addSubcommand((s) => s.setName('unclaim').setDescription('Gibt die Unterhaltung in diesem Kanal wieder frei'))
  .addSubcommand((s) => s.setName('add').setDescription('Fügt ein Teammitglied zur Unterhaltung hinzu')
    .addUserOption((o) => o.setName('nutzer').setDescription('Teammitglied').setRequired(true)))
  .addSubcommand((s) => s.setName('remove').setDescription('Entfernt ein hinzugefügtes Teammitglied')
    .addUserOption((o) => o.setName('nutzer').setDescription('Teammitglied').setRequired(true)))
  .addSubcommand((s) => s.setName('note').setDescription('Fügt eine interne Notiz hinzu (nur für das Team sichtbar)')
    .addStringOption((o) => o.setName('text').setDescription('Notiz').setRequired(true).setMaxLength(1500)))
  .addSubcommand((s) => s.setName('user').setDescription('Zeigt Informationen zu einem Nutzer')
    .addUserOption((o) => o.setName('nutzer').setDescription('Nutzer').setRequired(true)))
  .addSubcommand((s) => s.setName('history').setDescription('Zeigt die Modmail-Historie eines Nutzers')
    .addUserOption((o) => o.setName('nutzer').setDescription('Nutzer').setRequired(true)))
  .addSubcommand((s) => s.setName('stats').setDescription('Modmail-Statistiken')
    .addStringOption((o) => o.setName('zeitraum').setDescription('Zeitraum').addChoices({ name: 'Gesamt', value: '0' }, { name: 'Letzte 30 Tage', value: '30' }, { name: 'Letzte 7 Tage', value: '7' })));

const staff = ['support', 'moderation'];
const permsMap = { setup: ['admin'], close: staff, reopen: staff, claim: staff, unclaim: staff, add: staff, remove: staff, note: staff, user: staff, history: staff, stats: staff };

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const g = interaction.guildId;
  const guild = interaction.guild;
  const o = interaction.options;

  if (sub === 'setup') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    let cat = o.getChannel('kategorie');
    if (!cat && !settings.get(g, 'channels.modmailCategory')) {
      cat = await guild.channels.create({ name: '📩 Modmail', type: ChannelType.GuildCategory, permissionOverwrites: await mm.staffOverwrites(guild) }).catch(() => null);
      if (!cat) return interaction.editReply({ embeds: [theme.error(g, 'Ich konnte keine Kategorie erstellen (Berechtigung **Kanäle verwalten** fehlt).')] });
    }
    if (cat) settings.set(g, 'channels.modmailCategory', cat.id);
    if (o.getChannel('log')) settings.set(g, 'channels.modmailLog', o.getChannel('log').id);
    const msg = await panels.upsert(interaction.client, g, 'modmail', '', interaction.channelId, mm.panelPayload(g)).catch(() => null);
    if (!msg) return interaction.editReply({ embeds: [theme.error(g, 'Ich kann in diesem Kanal nicht schreiben.')] });
    return interaction.editReply({ embeds: [theme.success(g, `Modmail ist eingerichtet.\n${E.dot} Kategorie: <#${settings.get(g, 'channels.modmailCategory')}>\n${E.dot} Log: ${settings.channel(g, 'modmailLog') ? `<#${settings.channel(g, 'modmailLog')}>` : 'nicht gesetzt (/setlogchannel)'}\n${E.dot} Panel: in diesem Kanal\n\nTeamrollen der Gruppen **Supportteam** und **Moderationsteam** sehen neue Unterhaltungen automatisch.`)] });
  }

  if (['close', 'claim', 'unclaim', 'add', 'remove', 'note'].includes(sub)) {
    const conv = mm.byChannel(interaction.channelId);
    if (!conv) return theme.replyError(interaction, 'Dieser Befehl funktioniert nur in einem offenen Modmail-Kanal.');
    switch (sub) {
      case 'close': {
        const check = mm.canReply(interaction.member, conv);
        if (!check.ok) return theme.replyError(interaction, check.reason);
        await theme.reply(interaction, { embeds: [theme.info(g, '🔒 Unterhaltung wird geschlossen …')] }, false);
        const res = await mm.close(interaction.client, guild, conv, interaction.user.id, o.getString('grund'));
        if (!res.ok) await interaction.followUp({ embeds: [theme.error(g, res.reason)], flags: MessageFlags.Ephemeral });
        return null;
      }
      case 'claim':
      case 'unclaim': {
        if (sub === 'claim' && conv.claimed_by) return theme.replyError(interaction, `Diese Unterhaltung wurde bereits von <@${conv.claimed_by}> übernommen.`);
        if (sub === 'unclaim' && !conv.claimed_by) return theme.replyError(interaction, 'Diese Unterhaltung ist nicht übernommen.');
        if (sub === 'unclaim' && conv.claimed_by !== interaction.user.id && !require('../../core/permissions').inGroup(interaction.member, 'management')) return theme.replyError(interaction, 'Nur die Person, die übernommen hat, oder das Management kann freigeben.');
        run('UPDATE modmail_conversations SET claimed_by = ? WHERE id = ?', sub === 'claim' ? interaction.user.id : null, conv.id);
        mm.saveMessage(conv.id, interaction.user.id, 'system', sub === 'claim' ? 'Übernommen' : 'Freigegeben');
        await mm.refreshHeader(interaction.channel, mm.byId(conv.id));
        return theme.reply(interaction, { embeds: [theme.success(g, sub === 'claim' ? `<@${interaction.user.id}> hat die Unterhaltung übernommen.` : 'Die Unterhaltung ist wieder frei.')] }, false);
      }
      case 'add':
      case 'remove': {
        const u = o.getUser('nutzer');
        if (u.bot || u.id === conv.user_id) return theme.replyError(interaction, 'Diese Person kann nicht hinzugefügt werden.');
        if (sub === 'add') {
          run('INSERT OR IGNORE INTO modmail_staff (conversation_id, user_id) VALUES (?,?)', conv.id, u.id);
          await interaction.channel.permissionOverwrites.edit(u.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true });
        } else {
          run('DELETE FROM modmail_staff WHERE conversation_id = ? AND user_id = ?', conv.id, u.id);
          await interaction.channel.permissionOverwrites.delete(u.id).catch(() => {});
        }
        mm.saveMessage(conv.id, interaction.user.id, 'system', `${sub === 'add' ? 'Hinzugefügt' : 'Entfernt'}: ${u.tag}`);
        logger.discord(g, 'modmailLog', theme.base(g, 'neutral', `Modmail #${conv.id}`).setDescription(`👥 <@${u.id}> wurde ${sub === 'add' ? 'hinzugefügt' : 'entfernt'} von <@${interaction.user.id}>`), { event: `modmail.${sub}`, userId: interaction.user.id, targetId: u.id });
        return theme.reply(interaction, { embeds: [theme.success(g, `<@${u.id}> wurde ${sub === 'add' ? 'zur Unterhaltung hinzugefügt' : 'aus der Unterhaltung entfernt'}.`)] }, false);
      }
      case 'note': {
        const text = o.getString('text');
        mm.saveMessage(conv.id, interaction.user.id, 'notiz', text);
        return theme.reply(interaction, { embeds: [theme.base(g, 'warning', 'Interne Notiz – nicht an den Nutzer gesendet').setAuthor({ name: interaction.member.displayName, iconURL: interaction.user.displayAvatarURL() }).setDescription(`${E.note} ${util.clean(text)}`)] }, false);
      }
      default: return null;
    }
  }

  if (sub === 'reopen') {
    const u = o.getUser('nutzer');
    const conv = one("SELECT * FROM modmail_conversations WHERE guild_id = ? AND user_id = ? AND status = 'geschlossen' ORDER BY closed_at DESC LIMIT 1", g, u.id);
    if (!conv) return theme.replyError(interaction, 'Dieser Nutzer hat keine geschlossene Unterhaltung.');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const res = await mm.reopen(interaction.client, guild, conv, interaction.user.id);
    return interaction.editReply({ embeds: [res.ok ? theme.success(g, `Unterhaltung #${conv.id} wurde in ${res.channel} wiedereröffnet.${res.dm ? '' : `\n${E.warn} Der Nutzer konnte nicht per DM benachrichtigt werden.`}`) : theme.error(g, res.reason)] });
  }

  if (sub === 'user' || sub === 'history') {
    const u = o.getUser('nutzer');
    const hist = mm.historyFor(g, u.id);
    if (sub === 'history') {
      return theme.reply(interaction, { embeds: [theme.base(g, 'primary').setTitle(`${E.mail} Modmail-Historie – ${u.username}`)
        .setDescription(hist.length ? hist.slice(0, 20).map((c) => `**#${c.id}** ${E.dot} ${mm.catLabel(c.category)} ${E.dot} ${util.ts(c.created_at, 'd')} ${E.dot} ${c.status === 'offen' ? '🟢 offen' : `🔒 ${util.truncate(c.close_reason || 'geschlossen', 50)}`}${c.claimed_by ? ` ${E.dot} <@${c.claimed_by}>` : ''}`).join('\n') : 'Keine Unterhaltungen.')] });
    }
    const member = await guild.members.fetch(u.id).catch(() => null);
    const warns = one('SELECT COUNT(*) AS n FROM warnings WHERE guild_id = ? AND user_id = ? AND active = 1', g, u.id).n;
    const mods = one('SELECT COUNT(*) AS n FROM moderation WHERE guild_id = ? AND user_id = ?', g, u.id).n;
    return theme.reply(interaction, { embeds: [theme.base(g, 'primary').setTitle(`${E.user} ${u.tag}`).setThumbnail(u.displayAvatarURL()).addFields(
      { name: 'Nutzer-ID', value: `\`${u.id}\``, inline: true },
      { name: 'Account erstellt', value: util.ts(u.createdTimestamp, 'D'), inline: true },
      { name: 'Beigetreten', value: member?.joinedTimestamp ? util.ts(member.joinedTimestamp, 'D') : 'Nicht auf dem Server', inline: true },
      { name: 'Modmail-Unterhaltungen', value: String(hist.length), inline: true },
      { name: 'Aktive Verwarnungen', value: String(warns), inline: true },
      { name: 'Moderationseinträge', value: String(mods), inline: true },
    )] });
  }

  if (sub === 'stats') {
    const days = Number(o.getString('zeitraum') || 0);
    const s = mm.stats(g, days ? Date.now() - days * 864e5 : 0);
    return theme.reply(interaction, { embeds: [theme.base(g, 'primary', days ? `Letzte ${days} Tage` : 'Gesamt').setTitle(`${E.stats} Modmail-Statistiken`).addFields(
      { name: 'Offen', value: String(s.open), inline: true },
      { name: 'Eröffnet', value: String(s.total), inline: true },
      { name: 'Geschlossen', value: String(s.closed), inline: true },
      { name: 'Ø erste Antwort', value: s.firstResponse ? util.duration(s.firstResponse) : '–', inline: true },
      { name: 'Ø Bearbeitungsdauer', value: s.duration ? util.duration(s.duration) : '–', inline: true },
      { name: 'Nach Kategorie', value: s.perCategory.map((c) => `${mm.catLabel(c.category)}: **${c.n}**`).join('\n') || '–' },
      { name: 'Aktivste Teammitglieder', value: s.topStaff.map((t, i) => `\`${i + 1}.\` <@${t.author_id}> – ${t.n} Antworten`).join('\n') || '–' },
    )] }, false);
  }
}

module.exports = { data, perms: permsMap, execute };
