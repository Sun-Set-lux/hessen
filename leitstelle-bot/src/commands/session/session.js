const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const theme = require('../../core/theme');
const settings = require('../../core/settings');
const perms = require('../../core/permissions');
const util = require('../../core/util');
const texts = require('../../core/texts');
const { all } = require('../../core/database');
const sessions = require('../../systems/sessionManager');
const erlc = require('../../systems/erlcManager');
const pending = require('../../systems/pending');

const { E } = theme;

const data = new SlashCommandBuilder()
  .setName('session')
  .setDescription('ER:LC-Sessions verwalten')
  .addSubcommand((s) => s.setName('start').setDescription('Startet eine neue ER:LC-Session')
    .addStringOption((o) => o.setName('name').setDescription('Name der Session').setRequired(true).setMaxLength(100))
    .addStringOption((o) => o.setName('typ').setDescription('Art der Session').setRequired(true).addChoices(...sessions.SESSION_TYPES.map((t) => ({ name: t, value: t }))))
    .addUserOption((o) => o.setName('cohost').setDescription('Co-Host der Session'))
    .addUserOption((o) => o.setName('host').setDescription('Host der Session (Standard: du selbst)'))
    .addIntegerOption((o) => o.setName('mindestspieler').setDescription('Mindestanzahl an Spielern').setMinValue(0).setMaxValue(100))
    .addAttachmentOption((o) => o.setName('bild').setDescription('Optionales Session-Bild'))
    .addBooleanOption((o) => o.setName('vorbereitung').setDescription('Zuerst als „Vorbereitung“ veröffentlichen?'))
    .addBooleanOption((o) => o.setName('ping').setDescription('Session-Rolle erwähnen? (Standard: ja)')))
  .addSubcommand((s) => s.setName('end').setDescription('Beendet die laufende Session')
    .addStringOption((o) => o.setName('grund').setDescription('Optionaler Grund').setMaxLength(300))
    .addBooleanOption((o) => o.setName('ingame').setDescription('Zusätzlich eine Ingame-Nachricht senden?')))
  .addSubcommand((s) => s.setName('shutdown').setDescription('Fährt die Session herunter (mit Shutdown-Ankündigung)')
    .addStringOption((o) => o.setName('grund').setDescription('Grund für den Shutdown').setRequired(true).setMaxLength(300))
    .addBooleanOption((o) => o.setName('ingame').setDescription('Zusätzlich eine Ingame-Nachricht senden?')))
  .addSubcommand((s) => s.setName('status').setDescription('Zeigt oder ändert den Session-Status')
    .addStringOption((o) => o.setName('setzen').setDescription('Neuen Status setzen').addChoices(
      { name: 'Vorbereitung', value: 'prep' }, { name: 'Session gestartet', value: 'started' }, { name: 'Session aktiv', value: 'active' },
      { name: 'Session pausiert', value: 'paused' }, { name: 'Server offline', value: 'offline' },
    )))
  .addSubcommand((s) => s.setName('boost').setDescription('Ruft zur Verstärkung auf (Status + Ankündigung)')
    .addBooleanOption((o) => o.setName('ping').setDescription('Verstärkungs-Rolle erwähnen? (Standard: ja)')))
  .addSubcommand((s) => s.setName('low').setDescription('Meldet eine geringe Spielerzahl')
    .addBooleanOption((o) => o.setName('ping').setDescription('Verstärkungs-Rolle erwähnen? (Standard: nein)')))
  .addSubcommand((s) => s.setName('full').setDescription('Meldet, dass der Server fast voll ist'))
  .addSubcommand((s) => s.setName('lock').setDescription('Sperrt die Session für neue Spieler'))
  .addSubcommand((s) => s.setName('unlock').setDescription('Hebt die Sperre der Session auf'))
  .addSubcommand((s) => s.setName('setcode').setDescription('Ändert den Servercode der Session')
    .addStringOption((o) => o.setName('code').setDescription('Neuer Servercode').setRequired(true).setMaxLength(30)))
  .addSubcommand((s) => s.setName('announce').setDescription('Sendet eine Ankündigung zur laufenden Session')
    .addStringOption((o) => o.setName('nachricht').setDescription('Text der Ankündigung').setRequired(true).setMaxLength(1500))
    .addBooleanOption((o) => o.setName('ping').setDescription('Session-Rolle erwähnen?')))
  .addSubcommand((s) => s.setName('stats').setDescription('Zeigt Session-Statistiken')
    .addStringOption((o) => o.setName('zeitraum').setDescription('Zeitraum').addChoices({ name: 'Gesamt', value: '0' }, { name: 'Letzte 30 Tage', value: '30' }, { name: 'Letzte 7 Tage', value: '7' })))
  .addSubcommand((s) => s.setName('history').setDescription('Zeigt vergangene Sessions')
    .addUserOption((o) => o.setName('host').setDescription('Nur Sessions dieses Hosts'))
    .addIntegerOption((o) => o.setName('seite').setDescription('Seite').setMinValue(1)))
  .addSubcommand((s) => s.setName('leaderboard').setDescription('Rangliste der Session-Hosts')
    .addStringOption((o) => o.setName('kriterium').setDescription('Sortierung').addChoices({ name: 'Anzahl Sessions', value: 'sessions' }, { name: 'Hosting-Stunden', value: 'stunden' }, { name: 'Ø Spieler', value: 'spieler' }))
    .addStringOption((o) => o.setName('zeitraum').setDescription('Zeitraum').addChoices({ name: 'Gesamt', value: '0' }, { name: 'Letzte 30 Tage', value: '30' }, { name: 'Letzte 7 Tage', value: '7' })))
  .addSubcommand((s) => s.setName('customize').setDescription('Session-Texte, Standardwerte oder die laufende Session anpassen'));

const permsMap = {
  start: ['host'], end: ['host'], shutdown: ['host'], status: ['everyone'], boost: ['host'], low: ['host'], full: ['host'],
  lock: ['host'], unlock: ['host'], setcode: ['host'], announce: ['host'], stats: ['everyone'], history: ['everyone'],
  leaderboard: ['everyone'], customize: ['host'],
};

const noSession = (i) => theme.replyError(i, 'Es läuft aktuell keine Session. Starte eine mit `/session start`.');
const since = (days) => (Number(days) ? Date.now() - Number(days) * 864e5 : 0);

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const g = interaction.guildId;
  const client = interaction.client;
  const s = sessions.active(g);

  switch (sub) {
    case 'start': {
      if (s) return theme.replyError(interaction, `Es läuft bereits eine Session (**${s.name}**). Beende sie zuerst mit \`/session end\`.`);
      if (!settings.channel(g, 'session')) return theme.replyError(interaction, 'Es ist noch kein Session-Kanal eingestellt. Nutze `/setchannel` → **Session-Kanal**.');
      const host = interaction.options.getUser('host') || interaction.user;
      if (host.id !== interaction.user.id && !perms.inGroup(interaction.member, 'management')) return theme.replyError(interaction, 'Nur das Community-Management darf Sessions für andere Personen starten.');
      if (host.bot) return theme.replyError(interaction, 'Ein Bot kann keine Session hosten.');
      const cohost = interaction.options.getUser('cohost');
      if (cohost && cohost.id === host.id) return theme.replyError(interaction, 'Host und Co-Host müssen unterschiedliche Personen sein.');
      const bild = interaction.options.getAttachment('bild');
      if (bild && !bild.contentType?.startsWith('image/')) return theme.replyError(interaction, 'Das Session-Bild muss eine Bilddatei sein.');

      const draft = {
        name: interaction.options.getString('name'), type: interaction.options.getString('typ'), hostId: host.id, cohostId: cohost?.id || null,
        minPlayers: interaction.options.getInteger('mindestspieler') ?? settings.get(g, 'session.minPlayers'),
        image: bild ? bild.url : null, imageName: bild ? bild.name : null,
        prep: interaction.options.getBoolean('vorbereitung') ?? false, ping: interaction.options.getBoolean('ping') ?? true, user: interaction.user.id,
      };
      const token = pending.put(draft);
      const live = erlc.status();
      const code = live.ok && Date.now() - live.at < 300000 ? live.data.JoinKey : '';
      const modal = new ModalBuilder().setCustomId(`sess:startmodal:${token}`).setTitle('Session-Details').addComponents(
        row(new TextInputBuilder().setCustomId('beschreibung').setLabel('Beschreibung').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1500).setPlaceholder('Worum geht es in dieser Session?')),
        row(new TextInputBuilder().setCustomId('code').setLabel('Servercode').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(30).setValue(code || '').setPlaceholder('Leer lassen = Live-Code der ER:LC API')),
        row(new TextInputBuilder().setCustomId('anforderungen').setLabel('Anforderungen').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000).setValue(settings.get(g, 'session.defaultRequirements') || '')),
        row(new TextInputBuilder().setCustomId('regeln').setLabel('Session-Regeln').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(3000).setValue(settings.get(g, 'session.defaultRules') || '')),
      );
      return interaction.showModal(modal);
    }

    case 'end':
    case 'shutdown': {
      if (!s) return noSession(interaction);
      if (!util.lock(`session-end:${s.id}`, 15000)) return theme.replyError(interaction, 'Die Session wird bereits beendet.');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const res = await sessions.end(client, s, { userId: interaction.user.id, reason: interaction.options.getString('grund'), shutdown: sub === 'shutdown', ingame: interaction.options.getBoolean('ingame') ?? false });
      return interaction.editReply({ embeds: [theme.success(g, `Die Session **${res.session.name}** wurde ${sub === 'shutdown' ? 'heruntergefahren' : 'beendet'}.\n⏱️ Dauer: **${util.duration(res.session.duration)}** ${E.dot} 👥 Höchststand: **${res.session.peak_players || 0}**${res.ingameResult ? `\n${res.ingameResult}` : ''}`)] });
    }

    case 'status': {
      const neu = interaction.options.getString('setzen');
      if (!s) return neu ? noSession(interaction) : theme.reply(interaction, { embeds: [theme.info(g, 'Aktuell läuft **keine Session**.', `${E.session} Session-Status`)] });
      if (!neu) return theme.reply(interaction, { embeds: [sessions.buildEmbed(g, s)] });
      const check = perms.check(interaction.member, 'session.start');
      if (!check.ok) return theme.replyError(interaction, 'Nur Session-Hosts dürfen den Status ändern.');
      if (s.status === neu) return theme.replyError(interaction, `Die Session hat bereits den Status **${sessions.STATUS[neu].label}**.`);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await sessions.setStatus(client, s, neu, interaction.user.id);
      if (s.status === 'prep' && neu === 'started') {
        await sessions.announce(client, sessions.get(s.id), texts.render(g, 'session.start', sessions.vars(sessions.get(s.id))), { ping: settings.role(g, 'sessionPing') });
      }
      return interaction.editReply({ embeds: [theme.success(g, `Status geändert: ${sessions.statusText(s.status)} → **${sessions.statusText(neu)}**`)] });
    }

    case 'boost':
    case 'low':
    case 'full': {
      if (!s) return noSession(interaction);
      if (['prep', 'paused'].includes(s.status)) return theme.replyError(interaction, 'Das ist erst möglich, wenn die Session läuft.');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const newStatus = sub === 'full' ? 'full' : 'boost';
      if (s.status !== newStatus) await sessions.setStatus(client, s, newStatus, interaction.user.id);
      const fresh = sessions.get(s.id);
      const pingDefault = sub === 'boost';
      const ping = (interaction.options.getBoolean('ping') ?? pingDefault) ? settings.role(g, 'boostPing') || settings.role(g, 'sessionPing') : null;
      const live = sessions.vars(fresh);
      if (!fresh.last_update || Date.now() - fresh.last_update > 300000) { live.spieler = '?'; live.max = '?'; }
      const res = await sessions.announce(client, fresh, texts.render(g, `session.${sub}`, live), { ping, cooldownKey: sub });
      sessions.event(s.id, sub, interaction.user.id);
      if (!res.ok) return interaction.editReply({ embeds: [theme.warning(g, `Status aktualisiert, aber: ${res.reason}`)] });
      return interaction.editReply({ embeds: [theme.success(g, `${sub === 'full' ? 'Server-fast-voll-Meldung' : sub === 'boost' ? 'Verstärkungsaufruf' : 'Hinweis zur geringen Spielerzahl'} wurde gesendet.`)] });
    }

    case 'lock':
    case 'unlock': {
      if (!s) return noSession(interaction);
      const lock = sub === 'lock';
      if (!!s.locked === lock) return theme.replyError(interaction, lock ? 'Die Session ist bereits gesperrt.' : 'Die Session ist nicht gesperrt.');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await sessions.setLocked(client, s, lock, interaction.user.id);
      return interaction.editReply({ embeds: [theme.success(g, lock ? 'Die Session ist jetzt für neue Spieler gesperrt. Der Servercode wird ausgeblendet.\n-# Hinweis: Die Sperre gilt für Discord – die ER:LC API bietet keine Server-Sperre.' : 'Die Session ist wieder geöffnet.')] });
    }

    case 'setcode': {
      if (!s) return noSession(interaction);
      const code = interaction.options.getString('code').trim();
      sessions.update(s.id, { server_code: code });
      sessions.event(s.id, 'code', interaction.user.id, { code });
      await sessions.refreshMessage(client, s.id, true);
      return theme.replySuccess(interaction, `Der Servercode der Session ist jetzt **\`${util.clean(code)}\`**.`);
    }

    case 'announce': {
      if (!s) return noSession(interaction);
      const ping = interaction.options.getBoolean('ping') ? settings.role(g, 'sessionPing') : null;
      const text = `${E.megaphone} **Session-Ankündigung**\n${util.clean(interaction.options.getString('nachricht'))}\n\n-# Von <@${interaction.user.id}>`;
      const res = await sessions.announce(client, s, text, { ping });
      sessions.event(s.id, 'ankündigung', interaction.user.id);
      return res.ok ? theme.replySuccess(interaction, 'Die Ankündigung wurde gesendet.') : theme.replyError(interaction, res.reason);
    }

    case 'stats': {
      const days = interaction.options.getString('zeitraum') || '0';
      const st = sessions.overallStats(g, since(days));
      const embed = theme.base(g, 'primary', days === '0' ? 'Gesamter Zeitraum' : `Letzte ${days} Tage`).setTitle(`${E.stats} Session-Statistiken`)
        .addFields(
          { name: 'Sessions gesamt', value: util.numberDe(st.total), inline: true },
          { name: 'Gesamtdauer', value: util.duration(st.dur), inline: true },
          { name: 'Ø Dauer', value: st.total ? util.duration(st.dur / st.total) : '–', inline: true },
          { name: 'Höchste Spielerzahl', value: String(st.peak || 0), inline: true },
          { name: 'Ø Spieler', value: st.avgPlayers ? st.avgPlayers.toFixed(1).replace('.', ',') : '–', inline: true },
          { name: 'Hosting-Stunden', value: `${util.hours(st.dur)} Std.`, inline: true },
          { name: `${E.trophy} Sessions pro Host`, value: st.perHost.length ? st.perHost.map((h, i) => `\`${i + 1}.\` <@${h.host_id}> – **${h.n}**`).join('\n') : 'Noch keine Daten' },
          { name: `${E.dept} Ø Teilnahme je Abteilung (ingame)`, value: st.teams.length ? st.teams.map((t) => `${t.team}: **${t.avg.toFixed(1).replace('.', ',')}**`).join('\n') : 'Noch keine Daten' },
        );
      if (s) embed.setDescription(`Aktuell läuft: **${util.truncate(s.name, 80)}** (${sessions.statusText(s.status)})`);
      return theme.reply(interaction, { embeds: [embed] }, false);
    }

    case 'history': {
      const host = interaction.options.getUser('host');
      const page = (interaction.options.getInteger('seite') || 1) - 1;
      const rows = host
        ? all(`SELECT * FROM sessions WHERE guild_id = ? AND status = 'ended' AND id IN (SELECT session_id FROM session_hosts WHERE user_id = ? AND role = 'host') ORDER BY id DESC LIMIT 10 OFFSET ?`, g, host.id, page * 10)
        : all(`SELECT * FROM sessions WHERE guild_id = ? AND status = 'ended' ORDER BY id DESC LIMIT 10 OFFSET ?`, g, page * 10);
      const embed = theme.base(g, 'primary', `Seite ${page + 1}`).setTitle(`${E.calendar} Session-Verlauf${host ? ` – ${host.username}` : ''}`)
        .setDescription(rows.length ? rows.map((r) => `**#${r.id} ${util.truncate(r.name, 50)}** ${E.dot} ${r.type}\n${E.host} <@${r.host_id}> ${E.dot} ${util.ts(r.started_at || r.created_at, 'd')} ${E.dot} ⏱️ ${util.duration(r.duration)} ${E.dot} 👥 max. ${r.peak_players || 0}${r.end_reason ? `\n-# Grund: ${util.truncate(r.end_reason, 80)}` : ''}`).join('\n\n') : 'Keine Sessions gefunden.');
      return theme.reply(interaction, { embeds: [embed] }, false);
    }

    case 'leaderboard': {
      const by = interaction.options.getString('kriterium') || 'sessions';
      const days = interaction.options.getString('zeitraum') || '0';
      const rows = sessions.hostLeaderboard(g, by, since(days));
      const medal = ['🥇', '🥈', '🥉'];
      const embed = theme.base(g, 'primary', days === '0' ? 'Gesamter Zeitraum' : `Letzte ${days} Tage`).setTitle(`${E.trophy} Host-Rangliste`)
        .setDescription(rows.length ? rows.map((r, i) => `${medal[i] || `\`${i + 1}.\``} <@${r.user_id}> ${E.dot} **${r.sessions}** Sessions ${E.dot} **${util.hours(r.ms || 0)}** Std. ${E.dot} Ø ${r.avg ? r.avg.toFixed(1).replace('.', ',') : '–'} Spieler`).join('\n') : 'Noch keine Daten vorhanden.');
      return theme.reply(interaction, { embeds: [embed] }, false);
    }

    case 'customize': {
      const options = [];
      if (s) options.push({ label: 'Laufende Session bearbeiten', value: 'current', description: 'Name, Beschreibung, Anforderungen, Regeln, Bild', emoji: '✏️' });
      if (perms.inGroup(interaction.member, 'management')) {
        options.push(
          { label: 'Standard-Anforderungen', value: 'def:defaultRequirements', emoji: '📋' },
          { label: 'Standard-Regeln', value: 'def:defaultRules', emoji: '📜' },
        );
        for (const [key, t] of Object.entries(texts.TEMPLATES).filter(([k]) => k.startsWith('session.'))) options.push({ label: `Text: ${t.label}`, value: `tpl:${key}`, emoji: '📝' });
      }
      if (!options.length) return theme.replyError(interaction, 'Es läuft keine Session. Standardtexte darf nur das Community-Management anpassen.');
      const menu = new StringSelectMenuBuilder().setCustomId('sess:customize').setPlaceholder('Was möchtest du anpassen?').addOptions(options.slice(0, 25));
      return theme.reply(interaction, { embeds: [theme.info(g, 'Wähle aus, was du anpassen möchtest. Platzhalter wie `{host}` oder `{spieler}` werden automatisch ersetzt.', `${E.tools} Session anpassen`)], components: [new ActionRowBuilder().addComponents(menu)] });
    }
    default: return theme.replyError(interaction, 'Unbekannter Unterbefehl.');
  }
}

const row = (input) => new ActionRowBuilder().addComponents(input);

module.exports = { data, perms: permsMap, execute };
