// Buttons, Menüs und Formulare des Session-Systems
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const theme = require('../core/theme');
const settings = require('../core/settings');
const texts = require('../core/texts');
const perms = require('../core/permissions');
const util = require('../core/util');
const sessions = require('../systems/sessionManager');
const pending = require('../systems/pending');

const { E } = theme;
const row = (input) => new ActionRowBuilder().addComponents(input);

async function handle(interaction, action, args) {
  const g = interaction.guildId;
  const client = interaction.client;

  // ---------- Öffentliche Session-Buttons ----------
  if (['join', 'code', 'info', 'rules', 'host', 'stats'].includes(action)) {
    const s = sessions.get(Number(args[0]));
    if (!s) return theme.replyError(interaction, 'Diese Session existiert nicht mehr.');
    const ended = s.status === 'ended';
    if (action === 'join' || action === 'code') {
      if (ended) return theme.replyError(interaction, 'Diese Session ist bereits beendet.');
      if (s.locked) return theme.replyError(interaction, 'Die Session ist aktuell für neue Spieler **gesperrt**. Bitte warte, bis sie wieder geöffnet wird.');
      const code = sessions.sessionCode(s);
      if (!code) return theme.replyError(interaction, 'Der Servercode ist gerade nicht verfügbar. Bitte wende dich an den Host.');
      if (action === 'code') return theme.reply(interaction, { embeds: [theme.info(g, `Servercode: **\`${code}\`**`, `${E.code} Servercode`)] });
      return theme.reply(interaction, { embeds: [theme.info(g, `So trittst du der Session bei:\n\n**1.** Starte **Emergency Response: Liberty County** in Roblox.\n**2.** Öffne im Menü **Server** → **Privaten Server beitreten**.\n**3.** Gib den Code **\`${code}\`** ein.\n\nViel Spaß beim Roleplay! ${s.min_players ? `\n-# Mindestspielerzahl dieser Session: ${s.min_players}` : ''}`, '🎮 Server beitreten')] });
    }
    if (action === 'info') {
      const embed = theme.base(g, sessions.STATUS[s.status]?.color ?? 'primary', `Session #${s.id}`).setTitle(`ℹ️ ${util.truncate(s.name, 200)}`)
        .setDescription(s.description || 'Keine Beschreibung angegeben.')
        .addFields(
          { name: 'Status', value: sessions.statusText(s.status), inline: true },
          { name: 'Typ', value: s.type, inline: true },
          { name: 'Mindestspieler', value: String(s.min_players || '–'), inline: true },
          { name: 'Start', value: s.started_at ? util.ts(s.started_at) : 'Noch nicht gestartet', inline: true },
          { name: ended ? 'Dauer' : 'Läuft seit', value: ended ? util.duration(s.duration) : s.started_at ? util.ts(s.started_at, 'R') : '–', inline: true },
          { name: 'Anforderungen', value: util.truncate(s.requirements || 'Keine besonderen Anforderungen.', 1024) },
        );
      return theme.reply(interaction, { embeds: [embed] });
    }
    if (action === 'rules') {
      return theme.reply(interaction, { embeds: [theme.base(g, 'primary', `Session #${s.id}`).setTitle(`${E.rules} Session-Regeln`).setDescription(util.truncate(s.rules || 'Es gelten die allgemeinen Serverregeln.', 4000))] });
    }
    if (action === 'host') {
      const hs = sessions.hostStats(g, s.host_id);
      const embed = theme.base(g, 'primary', `Session #${s.id}`).setTitle(`${E.host} Session-Host`)
        .addFields(
          { name: 'Host', value: `<@${s.host_id}>`, inline: true },
          { name: 'Co-Host', value: s.cohost_id ? `<@${s.cohost_id}>` : '–', inline: true },
          { name: 'Gehostete Sessions', value: String(hs.sessions), inline: true },
          { name: 'Hosting-Stunden', value: `${util.hours(hs.ms)} Std.`, inline: true },
        );
      const member = await interaction.guild.members.fetch(s.host_id).catch(() => null);
      if (member) embed.setThumbnail(member.displayAvatarURL());
      return theme.reply(interaction, { embeds: [embed] });
    }
    if (action === 'stats') {
      const dur = ended ? s.duration : s.started_at ? Date.now() - s.started_at : 0;
      const teams = sessions.teamStats(s.id);
      const embed = theme.base(g, 'primary', `Session #${s.id}`).setTitle(`${E.stats} Session-Statistiken`)
        .addFields(
          { name: ended ? 'Dauer' : 'Bisherige Dauer', value: util.duration(dur), inline: true },
          { name: 'Höchststand', value: String(s.peak_players || 0), inline: true },
          { name: 'Ø Spieler', value: s.samples_count ? (s.samples_sum / s.samples_count).toFixed(1).replace('.', ',') : '–', inline: true },
          { name: 'Aktuell', value: ended ? '–' : s.last_update && Date.now() - s.last_update < 300000 ? `${s.last_players}/${s.max_players} ${E.dot} ${util.ts(s.last_update, 'R')}` : 'Nicht verfügbar', inline: true },
        );
      if (teams.length) embed.addFields({ name: 'Ø Spieler je Abteilung (ingame)', value: teams.map((t) => `${t.team}: **${t.avg}**`).join('\n') });
      return theme.reply(interaction, { embeds: [embed] });
    }
  }

  // ---------- Session-Start: Formular → Vorschau → Veröffentlichen ----------
  if (action === 'startmodal') {
    const draft = pending.get(args[0]);
    if (!draft || draft.user !== interaction.user.id) return theme.replyError(interaction, 'Die Eingabe ist abgelaufen. Bitte `/session start` erneut ausführen.');
    draft.description = interaction.fields.getTextInputValue('beschreibung').trim() || null;
    draft.code = interaction.fields.getTextInputValue('code').trim() || null;
    draft.requirements = interaction.fields.getTextInputValue('anforderungen').trim() || null;
    draft.rules = interaction.fields.getTextInputValue('regeln').trim() || null;
    const preview = {
      id: '–', guild_id: g, name: draft.name, type: draft.type, host_id: draft.hostId, cohost_id: draft.cohostId, description: draft.description,
      server_code: draft.code, requirements: draft.requirements, min_players: draft.minPlayers, rules: draft.rules, image_url: draft.image,
      status: draft.prep ? 'prep' : 'started', locked: 0, started_at: draft.prep ? null : Date.now(), last_players: null,
    };
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sess:publish:${args[0]}`).setStyle(ButtonStyle.Success).setLabel('Veröffentlichen').setEmoji('🚀'),
      new ButtonBuilder().setCustomId(`sess:discard:${args[0]}`).setStyle(ButtonStyle.Secondary).setLabel('Abbrechen'),
    );
    return interaction.reply({ content: `**Vorschau** – so wird die Session in <#${settings.channel(g, 'session')}> angezeigt:`, embeds: [sessions.buildEmbed(g, preview)], components: [buttons], flags: MessageFlags.Ephemeral });
  }

  if (action === 'publish' || action === 'discard') {
    const draft = pending.get(args[0]);
    if (!draft || draft.user !== interaction.user.id) return interaction.update({ content: '', embeds: [theme.error(g, 'Diese Vorschau ist abgelaufen. Bitte `/session start` erneut ausführen.')], components: [] });
    pending.take(args[0]);
    if (action === 'discard') return interaction.update({ content: '', embeds: [theme.info(g, 'Der Session-Start wurde abgebrochen.')], components: [] });
    const check = perms.check(interaction.member, 'session.start');
    if (!check.ok) return interaction.update({ content: '', embeds: [theme.error(g, check.reason)], components: [] });
    await interaction.update({ content: '', embeds: [theme.info(g, `${E.queue} Session wird veröffentlicht …`)], components: [] });
    const res = await sessions.create(client, g, draft, interaction.user.id);
    return interaction.editReply({ embeds: [res.ok ? theme.success(g, `Die Session **${util.clean(res.session.name)}** wurde veröffentlicht. [Zur Session](${res.url})\nDer Spielerstand wird automatisch über die ER:LC API aktualisiert.`) : theme.error(g, res.reason)] });
  }

  // ---------- Anpassen ----------
  if (action === 'customize') {
    const choice = interaction.values[0];
    if (choice === 'current') {
      const s = sessions.active(g);
      if (!s) return theme.replyError(interaction, 'Es läuft keine Session mehr.');
      const modal = new ModalBuilder().setCustomId(`sess:editcurrent:${s.id}`).setTitle('Session bearbeiten').addComponents(
        row(new TextInputBuilder().setCustomId('name').setLabel('Name').setStyle(TextInputStyle.Short).setMaxLength(100).setValue(s.name)),
        row(new TextInputBuilder().setCustomId('beschreibung').setLabel('Beschreibung').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1500).setValue(s.description || '')),
        row(new TextInputBuilder().setCustomId('anforderungen').setLabel('Anforderungen').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000).setValue(s.requirements || '')),
        row(new TextInputBuilder().setCustomId('regeln').setLabel('Regeln').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(3000).setValue(s.rules || '')),
        row(new TextInputBuilder().setCustomId('bild').setLabel('Bild-URL (optional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(500).setValue(s.image_url && !s.image_url.startsWith('attachment://') ? s.image_url : '')),
      );
      return interaction.showModal(modal);
    }
    if (!perms.inGroup(interaction.member, 'management')) return theme.replyError(interaction, 'Nur das Community-Management darf Standardtexte ändern.');
    const [type, key] = choice.split(':');
    const label = type === 'def' ? (key === 'defaultRules' ? 'Standard-Regeln' : 'Standard-Anforderungen') : texts.TEMPLATES[key].label;
    const value = type === 'def' ? settings.get(g, `session.${key}`) : texts.get(g, key);
    const modal = new ModalBuilder().setCustomId(`sess:savetext:${choice}`).setTitle(util.truncate(label, 45)).addComponents(
      row(new TextInputBuilder().setCustomId('text').setLabel(type === 'tpl' ? `Platzhalter: ${texts.TEMPLATES[key].vars || 'keine'}`.slice(0, 45) : 'Text').setStyle(TextInputStyle.Paragraph)
        .setRequired(false).setMaxLength(type === 'def' && key === 'defaultRules' ? 3000 : 1800).setValue(value || '').setPlaceholder('Leer lassen = Standardtext wiederherstellen')),
    );
    return interaction.showModal(modal);
  }

  if (action === 'editcurrent') {
    const s = sessions.get(Number(args[0]));
    if (!s || s.status === 'ended') return theme.replyError(interaction, 'Diese Session läuft nicht mehr.');
    if (!perms.check(interaction.member, 'session.customize').ok) return theme.replyError(interaction, 'Dafür fehlt dir die Berechtigung.');
    const bild = interaction.fields.getTextInputValue('bild').trim();
    if (bild && !util.isUrl(bild)) return theme.replyError(interaction, 'Die Bild-URL muss mit http:// oder https:// beginnen.');
    sessions.update(s.id, {
      name: interaction.fields.getTextInputValue('name').trim() || s.name,
      description: interaction.fields.getTextInputValue('beschreibung').trim() || null,
      requirements: interaction.fields.getTextInputValue('anforderungen').trim() || null,
      rules: interaction.fields.getTextInputValue('regeln').trim() || null,
      image_url: bild || (s.image_url?.startsWith('attachment://') ? s.image_url : null),
    });
    sessions.event(s.id, 'bearbeitet', interaction.user.id);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await sessions.refreshMessage(client, s.id, true);
    return interaction.editReply({ embeds: [theme.success(g, 'Die Session wurde aktualisiert.')] });
  }

  if (action === 'savetext') {
    if (!perms.inGroup(interaction.member, 'management')) return theme.replyError(interaction, 'Dafür fehlt dir die Berechtigung.');
    const [type, key] = args;
    const value = interaction.fields.getTextInputValue('text').trim();
    if (type === 'def') settings.set(g, `session.${key}`, value || null);
    else if (value) texts.set(g, key, value);
    else texts.reset(g, key);
    return theme.replySuccess(interaction, value ? 'Der Text wurde gespeichert.' : 'Der Standardtext wurde wiederhergestellt.');
  }
}

module.exports = { prefix: 'sess', handle };
