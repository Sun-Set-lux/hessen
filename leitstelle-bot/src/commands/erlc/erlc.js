const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const theme = require('../../core/theme');
const settings = require('../../core/settings');
const perms = require('../../core/permissions');
const util = require('../../core/util');
const erlc = require('../../systems/erlcManager');
const views = require('../../systems/erlcViews');
const statusPanel = require('../../systems/statusPanel');
const pending = require('../../systems/pending');

const playerOpt = (o, desc = 'Roblox-Benutzername oder -ID des Spielers') => o.setName('spieler').setDescription(desc).setRequired(true).setAutocomplete(true).setMaxLength(20);

const data = new SlashCommandBuilder()
  .setName('erlc')
  .setDescription('ER:LC-Server: Live-Informationen und Ingame-Verwaltung')
  .addSubcommand((s) => s.setName('status').setDescription('Zeigt den aktuellen Serverstatus'))
  .addSubcommand((s) => s.setName('info').setDescription('Zeigt ausführliche Serverinformationen'))
  .addSubcommand((s) => s.setName('players').setDescription('Zeigt alle Spieler auf dem Server')
    .addStringOption((o) => o.setName('team').setDescription('Nur ein bestimmtes Team anzeigen')
      .addChoices(...['Polizei', 'Sheriff', 'Feuerwehr', 'Rettungsdienst', 'DOT', 'Zivilist', 'Gefängnis'].map((n) => ({ name: n, value: n })))))
  .addSubcommand((s) => s.setName('servercode').setDescription('Zeigt den Servercode zum Beitreten'))
  .addSubcommand((s) => s.setName('queue').setDescription('Zeigt die Ingame-Warteschlange'))
  .addSubcommand((s) => s.setName('refresh').setDescription('Lädt alle Live-Daten neu (Statuspanel & Session)'))
  .addSubcommand((s) => s.setName('team').setDescription('Zeigt das Ingame-Team (Admins, Mods, Helfer)'))
  .addSubcommand((s) => s.setName('logs').setDescription('Zeigt Ingame-Protokolle')
    .addStringOption((o) => o.setName('art').setDescription('Welches Protokoll?').setRequired(true)
      .addChoices(...Object.entries(views.LOG_TYPES).map(([value, name]) => ({ name, value })))))
  .addSubcommand((s) => s.setName('announce').setDescription('Sendet eine Ingame-Nachricht an alle Spieler (:m)')
    .addStringOption((o) => o.setName('nachricht').setDescription('Text der Nachricht').setRequired(true).setMaxLength(200)))
  .addSubcommand((s) => s.setName('hinweis').setDescription('Zeigt allen Spielern einen Hinweis am Bildschirmrand (:h)')
    .addStringOption((o) => o.setName('nachricht').setDescription('Text des Hinweises').setRequired(true).setMaxLength(200)))
  .addSubcommand((s) => s.setName('pm').setDescription('Sendet einem Spieler eine private Ingame-Nachricht (:pm)')
    .addStringOption((o) => playerOpt(o))
    .addStringOption((o) => o.setName('nachricht').setDescription('Text der Nachricht').setRequired(true).setMaxLength(200)))
  .addSubcommand((s) => s.setName('kick').setDescription('Kickt einen Spieler vom ER:LC Server')
    .addStringOption((o) => playerOpt(o))
    .addStringOption((o) => o.setName('grund').setDescription('Grund (wird protokolliert)').setRequired(true).setMaxLength(300)))
  .addSubcommand((s) => s.setName('ban').setDescription('Bannt einen Spieler vom ER:LC Server')
    .addStringOption((o) => playerOpt(o))
    .addStringOption((o) => o.setName('grund').setDescription('Grund (wird protokolliert)').setRequired(true).setMaxLength(300)))
  .addSubcommand((s) => s.setName('unban').setDescription('Entbannt einen Spieler auf dem ER:LC Server')
    .addStringOption((o) => o.setName('spieler').setDescription('Roblox-Benutzername oder -ID').setRequired(true).setMaxLength(20))
    .addStringOption((o) => o.setName('grund').setDescription('Grund (wird protokolliert)').setMaxLength(300)))
  .addSubcommand((s) => s.setName('spieler').setDescription('Führt eine Spieleraktion ingame aus')
    .addStringOption((o) => o.setName('aktion').setDescription('Welche Aktion?').setRequired(true).addChoices(
      { name: 'Ins Gefängnis (:jail)', value: 'jail' },
      { name: 'Aus dem Gefängnis (:unjail)', value: 'unjail' },
      { name: 'Fahndung setzen (:wanted)', value: 'wanted' },
      { name: 'Fahndung entfernen (:unwanted)', value: 'unwanted' },
      { name: 'Heilen (:heal)', value: 'heal' },
      { name: 'Respawnen (:load)', value: 'load' },
      { name: 'Charakter neu laden (:refresh)', value: 'refresh' },
      { name: 'Töten (:kill)', value: 'kill' },
    ))
    .addStringOption((o) => playerOpt(o)))
  .addSubcommand((s) => s.setName('server').setDescription('Ändert Servereinstellungen ingame')
    .addStringOption((o) => o.setName('aktion').setDescription('Welche Einstellung?').setRequired(true).addChoices(
      { name: 'Wetter (:weather)', value: 'weather' },
      { name: 'Uhrzeit (:time)', value: 'time' },
      { name: 'Prioritäts-Timer (:prty)', value: 'prty' },
      { name: 'Friedens-Timer (:pt)', value: 'pt' },
      { name: 'Alle Brände löschen (:stopfire)', value: 'stopfire' },
    ))
    .addStringOption((o) => o.setName('wert').setDescription('Wetter: clear/rain/thunderstorm/fog/snow · Uhrzeit: 0–24 · Timer: Sekunden').setMaxLength(20)))
  .addSubcommand((s) => s.setName('befehl').setDescription('Führt einen beliebigen Ingame-Befehl aus (nur Administration)')
    .addStringOption((o) => o.setName('befehl').setDescription('z. B. :h Willkommen!').setRequired(true).setMaxLength(240)))
  .addSubcommand((s) => s.setName('panel').setDescription('Richtet das automatische Statuspanel in diesem Kanal ein'));

const perms_ = {
  status: ['everyone'], info: ['everyone'], players: ['everyone'], servercode: ['everyone'], queue: ['everyone'],
  refresh: ['server', 'host', 'moderation'], team: ['server', 'moderation', 'support'], logs: ['server', 'moderation'],
  announce: ['server', 'host'], hinweis: ['server', 'host'], pm: ['server', 'moderation'], kick: ['server', 'moderation'],
  ban: ['admin'], unban: ['admin'], spieler: ['server', 'moderation'], server: ['server'], befehl: ['admin'], panel: ['admin'],
};

const refreshCooldown = { until: 0 };

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const g = interaction.guildId;

  if (['status', 'info', 'players', 'queue', 'team', 'servercode', 'logs'].includes(sub)) {
    const secret = sub === 'servercode' || sub === 'team' || sub === 'logs';
    await interaction.deferReply({ flags: secret ? MessageFlags.Ephemeral : undefined });
    try {
      if (sub === 'status') {
        const snap = await statusPanel.poll();
        return interaction.editReply({ embeds: [statusPanel.buildStatusEmbed(g, snap)] });
      }
      if (sub === 'info') return interaction.editReply({ embeds: [views.infoEmbed(g, await erlc.server(['Staff', 'Queue'], 15000))] });
      if (sub === 'players') return interaction.editReply({ embeds: [views.playersEmbed(g, await erlc.server(['Players'], 15000), interaction.options.getString('team'))] });
      if (sub === 'queue') return interaction.editReply({ embeds: [views.queueEmbed(g, await erlc.server(['Queue'], 15000))] });
      if (sub === 'team') return interaction.editReply({ embeds: [views.staffEmbed(g, await erlc.server(['Staff'], 30000))] });
      if (sub === 'servercode') {
        if (!views.showCode(g) && !perms.isStaff(interaction.member)) return interaction.editReply({ embeds: [theme.warning(g, 'Der Servercode wird nur während einer Session bzw. im Session-Kanal veröffentlicht.')] });
        const d = await erlc.server([], 60000);
        return interaction.editReply({ embeds: [theme.info(g, `So trittst du bei:\n1. Starte **ER:LC** in Roblox.\n2. Wähle **Server** → **Privaten Server beitreten**.\n3. Gib den Code ein: **\`${d.JoinKey}\`**`, `${theme.E.code} Servercode`)] });
      }
      if (sub === 'logs') {
        const art = interaction.options.getString('art');
        const data = art === 'Bans' ? await erlc.bans() : await erlc.server([art], 15000);
        return interaction.editReply({ embeds: [views.logsEmbed(g, art, data)] });
      }
    } catch (err) {
      return interaction.editReply({ embeds: [views.errorEmbed(g, err)] });
    }
  }

  if (sub === 'refresh') {
    if (refreshCooldown.until > Date.now()) return theme.replyError(interaction, `Die Daten wurden gerade erst aktualisiert. Erneut möglich ${util.ts(refreshCooldown.until, 'R')}.`);
    refreshCooldown.until = Date.now() + 30000;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await statusPanel.tick(interaction.client);
    const snap = statusPanel.snapshot();
    return interaction.editReply({ embeds: [snap?.ok ? theme.success(g, `Live-Daten aktualisiert: **${snap.data.CurrentPlayers}/${snap.data.MaxPlayers}** Spieler online. Statuspanel und Session-Embed sind auf dem neuesten Stand.`) : views.errorEmbed(g, snap?.error)] });
  }

  if (sub === 'panel') {
    settings.set(g, 'channels.status', interaction.channelId);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await statusPanel.tick(interaction.client);
    return interaction.editReply({ embeds: [theme.success(g, `Das Statuspanel wurde in <#${interaction.channelId}> eingerichtet und aktualisiert sich automatisch alle **${settings.get(g, 'erlc.refreshSeconds')} Sekunden**.`)] });
  }

  // ---- Ingame-Befehle ----
  if (!erlc.hasKey()) return theme.replyError(interaction, 'Es ist kein ER:LC API-Schlüssel hinterlegt. Ingame-Befehle sind nicht möglich.');
  const target = interaction.options.getString('spieler');
  if (target !== null && !erlc.validTarget(target)) return theme.replyError(interaction, 'Ungültiger Spielername. Erlaubt sind Roblox-Benutzernamen (3–20 Zeichen, Buchstaben, Zahlen, _) oder Roblox-IDs.');
  const text = interaction.options.getString('nachricht');

  switch (sub) {
    case 'announce': return views.runCommand(interaction, `:m ${erlc.cleanText(text)}`, `Ingame-Nachricht gesendet:\n> ${util.clean(erlc.cleanText(text))}`);
    case 'hinweis': return views.runCommand(interaction, `:h ${erlc.cleanText(text)}`, `Ingame-Hinweis gesendet:\n> ${util.clean(erlc.cleanText(text))}`);
    case 'pm': return views.runCommand(interaction, `:pm ${target} ${erlc.cleanText(text)}`, `Private Nachricht an **${target}** gesendet.`);
    case 'kick': return views.runCommand(interaction, `:kick ${target}`, `**${target}** wurde vom Server gekickt.\n**Grund:** ${util.clean(interaction.options.getString('grund'))}`);
    case 'unban': return views.runCommand(interaction, `:unban ${target}`, `**${target}** wurde entbannt.${interaction.options.getString('grund') ? `\n**Grund:** ${util.clean(interaction.options.getString('grund'))}` : ''}`);
    case 'ban': {
      const token = pending.put({ cmd: `:ban ${target}`, text: `**${target}** wurde vom Server gebannt.\n**Grund:** ${util.clean(interaction.options.getString('grund'))}`, user: interaction.user.id });
      return theme.reply(interaction, {
        embeds: [theme.warning(g, `Möchtest du **${target}** wirklich vom ER:LC Server bannen?\n**Grund:** ${util.clean(interaction.options.getString('grund'))}`, 'Bann bestätigen')],
        components: [confirmRow(token)],
      });
    }
    case 'spieler': {
      const a = interaction.options.getString('aktion');
      const labels = { jail: 'ins Gefängnis gebracht', unjail: 'aus dem Gefängnis entlassen', wanted: 'zur Fahndung ausgeschrieben', unwanted: 'von der Fahndung entfernt', heal: 'geheilt', load: 'respawnt', refresh: 'neu geladen', kill: 'getötet' };
      return views.runCommand(interaction, `:${a} ${target}`, `**${target}** wurde ${labels[a]}.`);
    }
    case 'server': {
      const a = interaction.options.getString('aktion');
      const wert = (interaction.options.getString('wert') || '').trim().toLowerCase();
      if (a === 'stopfire') return views.runCommand(interaction, ':stopfire', 'Alle Brände wurden gelöscht.');
      if (a === 'weather') {
        const ok = ['clear', 'rain', 'thunderstorm', 'fog', 'snow'];
        if (!ok.includes(wert)) return theme.replyError(interaction, `Bitte gib ein gültiges Wetter an: ${ok.map((w) => `\`${w}\``).join(', ')}.`);
        return views.runCommand(interaction, `:weather ${wert}`, `Das Wetter wurde auf **${wert}** gesetzt.`);
      }
      if (a === 'time') {
        const h = Number(wert.replace(',', '.'));
        if (!wert || Number.isNaN(h) || h < 0 || h > 24) return theme.replyError(interaction, 'Bitte gib eine Uhrzeit zwischen **0** und **24** an.');
        return views.runCommand(interaction, `:time ${h}`, `Die Ingame-Uhrzeit wurde auf **${h} Uhr** gesetzt.`);
      }
      const sec = Number(wert);
      if (!wert || !Number.isInteger(sec) || sec < 0 || sec > 3600) return theme.replyError(interaction, 'Bitte gib eine Zeit in Sekunden an (0–3600).');
      return views.runCommand(interaction, `:${a} ${sec}`, `${a === 'prty' ? 'Prioritäts-Timer' : 'Friedens-Timer'} auf **${sec} Sekunden** gesetzt.`);
    }
    case 'befehl': {
      const cmd = interaction.options.getString('befehl').replace(/[\r\n]+/g, ' ').trim();
      if (!cmd.startsWith(':')) return theme.replyError(interaction, 'Ingame-Befehle beginnen mit einem Doppelpunkt, z. B. `:h Hallo`.');
      const token = pending.put({ cmd, text: `Befehl \`${cmd.replace(/`/g, "'")}\` wurde ausgeführt.`, user: interaction.user.id });
      return theme.reply(interaction, { embeds: [theme.warning(g, `Soll dieser Befehl ingame ausgeführt werden?\n\`\`\`${cmd.replace(/`/g, "'")}\`\`\``, 'Befehl bestätigen')], components: [confirmRow(token)] });
    }
    default: return theme.replyError(interaction, 'Unbekannter Unterbefehl.');
  }
}

const confirmRow = (token) => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`erlc:confirm:${token}`).setStyle(ButtonStyle.Danger).setLabel('Bestätigen'),
  new ButtonBuilder().setCustomId(`erlc:cancel:${token}`).setStyle(ButtonStyle.Secondary).setLabel('Abbrechen'),
);

async function autocomplete(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const snap = statusPanel.snapshot();
  const players = snap?.ok && Array.isArray(snap.data.Players) ? snap.data.Players.map((p) => erlc.parsePlayer(p.Player).name) : [];
  const list = players.filter((n) => n.toLowerCase().includes(focused)).slice(0, 25).map((n) => ({ name: n, value: n }));
  if (!list.length && focused && erlc.validTarget(focused)) list.push({ name: interaction.options.getFocused(), value: interaction.options.getFocused() });
  return interaction.respond(list);
}

module.exports = { data, perms: perms_, execute, autocomplete };
