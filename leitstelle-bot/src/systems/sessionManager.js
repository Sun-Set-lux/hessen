// Kernsystem: ER:LC-Sessions (Embeds, Status, Hosts, Statistiken)
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { one, all, run, tx, now } = require('../core/database');
const settings = require('../core/settings');
const texts = require('../core/texts');
const theme = require('../core/theme');
const logger = require('../core/logger');
const util = require('../core/util');
const erlc = require('./erlcManager');

const { E } = theme;

const STATUS = {
  prep: { label: 'Vorbereitung', emoji: '🛠️', color: 0xf5a524, title: 'ER:LC – Session in Vorbereitung' },
  started: { label: 'Session gestartet', emoji: '🚨', color: null, title: 'ER:LC – Session gestartet' },
  active: { label: 'Session aktiv', emoji: '🟢', color: 0x2fbf71, title: 'ER:LC – Session aktiv' },
  boost: { label: 'Verstärkung benötigt', emoji: '📣', color: 0xff7a1a, title: 'ER:LC – Verstärkung benötigt' },
  full: { label: 'Server fast voll', emoji: '🔥', color: 0xe5484d, title: 'ER:LC – Server fast voll' },
  paused: { label: 'Session pausiert', emoji: '⏸️', color: 0x8a8f98, title: 'ER:LC – Session pausiert' },
  ended: { label: 'Session beendet', emoji: '✅', color: 0x4f545c, title: 'ER:LC – Session beendet' },
  offline: { label: 'Server offline', emoji: '🔴', color: 0xa12d2f, title: 'ER:LC – Server offline' },
};
const RUNNING = ['started', 'active', 'boost', 'full'];

const SESSION_TYPES = ['Standard-Roleplay', 'Ernstes Roleplay', 'Event-Session', 'Training', 'Abteilungs-Session', 'Weekend-Session', 'Sonstiges'];

const statusText = (s) => `${STATUS[s]?.emoji || ''} ${STATUS[s]?.label || s}`;

// ---------- Datenzugriff ----------
const get = (id) => one('SELECT * FROM sessions WHERE id = ?', id);
const active = (guildId) => one("SELECT * FROM sessions WHERE guild_id = ? AND status != 'ended' ORDER BY id DESC LIMIT 1", guildId);

function event(sessionId, type, userId, data) {
  run('INSERT INTO session_events (session_id, type, user_id, data, at) VALUES (?,?,?,?,?)', sessionId, type, userId || null, data ? JSON.stringify(data) : null, now());
}

function update(id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  run(`UPDATE sessions SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => fields[k]), id);
}

// ---------- Live-Daten ----------
function liveFresh(guildId, session) {
  const maxAge = Math.max(30, Number(settings.get(guildId, 'erlc.refreshSeconds')) || 60) * 3000;
  return session.last_update && now() - session.last_update <= maxAge;
}

function playersField(guildId, s) {
  if (!erlc.hasKey()) return 'Nicht verfügbar (kein API-Schlüssel)';
  if (s.status === 'offline') return '0 – Server offline';
  if (!liveFresh(guildId, s) || s.last_players === null || s.last_players === undefined) return `${E.warn} Live-Daten nicht verfügbar`;
  return `**${s.last_players}** / ${s.max_players ?? '?'} ${E.dot} Stand ${util.ts(s.last_update, 'R')}`;
}

const sessionCode = (s) => s.server_code || erlc.status().data?.JoinKey || null;

// ---------- Darstellung ----------
function buildEmbed(guildId, s) {
  const st = STATUS[s.status] || STATUS.started;
  const embed = theme.base(guildId, st.color ?? 'primary', `Session #${s.id}`)
    .setTitle(`${st.emoji} ${st.title}`)
    .setDescription(`## ${util.truncate(s.name, 200)}\n${s.description ? util.truncate(s.description, 1500) : ''}`);

  const code = sessionCode(s);
  embed.addFields(
    { name: `${E.info} Status`, value: statusText(s.status) + (s.locked ? `\n${E.lock} Beitritt gesperrt` : ''), inline: true },
    { name: `${E.host} Host`, value: `<@${s.host_id}>`, inline: true },
    { name: '🤝 Co-Host', value: s.cohost_id ? `<@${s.cohost_id}>` : '–', inline: true },
    { name: `${E.code} Servercode`, value: s.status === 'ended' ? '–' : s.locked ? `${E.lock} Gesperrt` : code ? `\`${code}\`` : 'Nicht verfügbar', inline: true },
    { name: `${E.players} Spieler`, value: s.status === 'ended' ? `Höchststand: **${s.peak_players || 0}**` : playersField(guildId, s), inline: true },
    { name: '🏷️ Sessiontyp', value: s.type, inline: true },
    { name: `${E.clock} Start`, value: s.started_at ? `${util.ts(s.started_at)} (${util.ts(s.started_at, 'R')})` : 'Noch nicht gestartet', inline: true },
    { name: '🎯 Mindestspieler', value: s.min_players ? String(s.min_players) : '–', inline: true },
  );
  if (s.status === 'ended') {
    embed.addFields(
      { name: '🏁 Ende', value: util.ts(s.ended_at), inline: true },
      { name: '⏱️ Dauer', value: util.duration(s.duration), inline: true },
      { name: `${E.stats} Ø Spieler`, value: s.samples_count ? (s.samples_sum / s.samples_count).toFixed(1).replace('.', ',') : '–', inline: true },
    );
  }
  if (s.requirements) embed.addFields({ name: '📋 Anforderungen', value: util.truncate(s.requirements, 1024) });
  if (s.rules) embed.addFields({ name: `${E.rules} Session-Regeln`, value: util.truncate(s.rules, 600) + (s.rules.length > 600 ? '\n*Alle Regeln über „Session-Regeln“.*' : '') });
  if (s.image_url) embed.setImage(s.image_url);
  return embed;
}

function buildButtons(guildId, s) {
  const ended = s.status === 'ended';
  const joinLink = settings.get(guildId, 'erlc.joinLink');
  const join = joinLink && util.isUrl(joinLink)
    ? new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(joinLink).setLabel('Server beitreten').setEmoji('🎮').setDisabled(ended || !!s.locked)
    : new ButtonBuilder().setCustomId(`sess:join:${s.id}`).setStyle(ButtonStyle.Success).setLabel('Server beitreten').setEmoji('🎮').setDisabled(ended || !!s.locked);
  return [
    new ActionRowBuilder().addComponents(
      join,
      new ButtonBuilder().setCustomId(`sess:code:${s.id}`).setStyle(ButtonStyle.Secondary).setLabel('Servercode anzeigen').setEmoji('🔑').setDisabled(ended || !!s.locked),
      new ButtonBuilder().setCustomId(`sess:info:${s.id}`).setStyle(ButtonStyle.Secondary).setLabel('Session-Informationen').setEmoji('ℹ️'),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sess:rules:${s.id}`).setStyle(ButtonStyle.Secondary).setLabel('Session-Regeln').setEmoji('📜'),
      new ButtonBuilder().setCustomId(`sess:host:${s.id}`).setStyle(ButtonStyle.Secondary).setLabel('Session-Host').setEmoji('🎙️'),
      new ButtonBuilder().setCustomId(`sess:stats:${s.id}`).setStyle(ButtonStyle.Secondary).setLabel('Session-Statistiken').setEmoji('📊'),
    ),
  ];
}

const payload = (guildId, s) => ({ embeds: [buildEmbed(guildId, s)], components: buildButtons(guildId, s) });

const lastRender = new Map(); // sessionId -> Hash, verhindert unnötige Bearbeitungen

/**
 * Aktualisiert die bestehende Session-Nachricht. Wurde sie gelöscht, wird sie einmalig neu gesendet.
 */
async function refreshMessage(client, sessionId, force = false) {
  const s = get(sessionId);
  if (!s || !s.channel_id) return;
  const p = payload(s.guild_id, s);
  const hash = JSON.stringify(p.embeds[0].toJSON().fields) + JSON.stringify(p.embeds[0].toJSON().title) + s.locked + s.status;
  if (!force && lastRender.get(s.id) === hash) return;
  try {
    const ch = await client.channels.fetch(s.channel_id);
    if (s.message_id) {
      try {
        const msg = await ch.messages.fetch(s.message_id);
        await msg.edit(p);
        lastRender.set(s.id, hash);
        return;
      } catch (err) {
        if (err.code !== 10008) throw err;
      }
    }
    if (s.status === 'ended') return; // beendete Sessions nicht neu posten
    if (s.image_url?.startsWith('attachment://')) { update(s.id, { image_url: null }); p.embeds[0].setImage(null); }
    const msg = await ch.send(p);
    update(s.id, { message_id: msg.id });
    lastRender.set(s.id, hash);
  } catch (err) {
    logger.log.warn(`Session-Nachricht #${s.id} konnte nicht aktualisiert werden: ${err.message}`);
  }
}

// ---------- Ankündigungen ----------
const announceCooldown = new Map();

async function announce(client, s, text, { ping = null, cooldownKey = null, embedColor } = {}) {
  if (cooldownKey) {
    const k = `${s.id}:${cooldownKey}`;
    const until = announceCooldown.get(k) || 0;
    if (until > now()) return { ok: false, reason: `Diese Ankündigung wurde gerade erst gesendet. Erneut möglich ${util.ts(until, 'R')}.` };
    announceCooldown.set(k, now() + 10 * 60 * 1000);
  }
  try {
    const ch = await client.channels.fetch(s.channel_id);
    const embed = theme.base(s.guild_id, embedColor ?? STATUS[s.status]?.color ?? 'primary', `Session #${s.id}`).setDescription(text);
    const msg = await ch.send({
      content: ping ? `<@&${ping}>` : undefined,
      embeds: [embed],
      allowedMentions: { roles: ping ? [ping] : [] },
      reply: s.message_id ? { messageReference: s.message_id, failIfNotExists: false } : undefined,
    });
    return { ok: true, msg };
  } catch (err) {
    return { ok: false, reason: `Die Ankündigung konnte nicht gesendet werden: ${err.message}` };
  }
}

const vars = (s, extra = {}) => ({
  host: `<@${s.host_id}>`, name: s.name, typ: s.type, code: sessionCode(s) || '–',
  spieler: s.last_players ?? '–', max: s.max_players ?? '–', ...extra,
});

// ---------- Aktionen ----------
async function create(client, guildId, data, userId) {
  if (active(guildId)) return { ok: false, reason: 'Es läuft bereits eine Session. Beende sie zuerst mit `/session end` oder `/session shutdown`.' };
  const channelId = settings.channel(guildId, 'session');
  if (!channelId) return { ok: false, reason: 'Es ist noch kein Session-Kanal eingestellt. Nutze `/setchannel` mit der Art **Session-Kanal**.' };
  const ch = await client.channels.fetch(channelId).catch(() => null);
  if (!ch?.isTextBased()) return { ok: false, reason: 'Der eingestellte Session-Kanal ist nicht erreichbar.' };

  // Hochgeladenes Bild direkt an die Session-Nachricht anhängen (Discord-Links laufen sonst ab)
  let files = [];
  if (data.image && data.imageName) {
    try {
      const res = await fetch(data.image, { signal: AbortSignal.timeout(10000) });
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 8 * 1024 * 1024) throw new Error('zu groß');
      const ext = (data.imageName.split('.').pop() || 'png').toLowerCase().replace(/[^a-z]/g, '') || 'png';
      files = [{ attachment: buf, name: `session.${ext}` }];
      data.image = `attachment://session.${ext}`;
    } catch (err) {
      logger.log.warn(`Session-Bild konnte nicht geladen werden: ${err.message}`);
      data.image = null;
    }
  }

  const t = now();
  const status = data.prep ? 'prep' : 'started';
  const live = erlc.status();
  const liveOk = live.ok && t - live.at < 120000;
  const id = tx(() => {
    const r = run(`INSERT INTO sessions (guild_id, name, type, host_id, cohost_id, description, server_code, requirements, min_players, rules, image_url, status, channel_id, created_by, created_at, started_at, max_players, last_players, last_update, peak_players)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    guildId, data.name, data.type, data.hostId, data.cohostId || null, data.description || null, data.code || null, data.requirements || null,
    data.minPlayers || 0, data.rules || null, data.image || null, status, channelId, userId, t, data.prep ? null : t,
    liveOk ? live.data.MaxPlayers : null, liveOk ? live.data.CurrentPlayers : null, liveOk ? live.at : null, liveOk ? live.data.CurrentPlayers : 0);
    const sid = r.lastInsertRowid;
    run('INSERT INTO session_hosts (guild_id, session_id, user_id, role, started_at) VALUES (?,?,?,?,?)', guildId, sid, data.hostId, 'host', t);
    if (data.cohostId) run('INSERT INTO session_hosts (guild_id, session_id, user_id, role, started_at) VALUES (?,?,?,?,?)', guildId, sid, data.cohostId, 'cohost', t);
    return sid;
  })();
  event(id, 'erstellt', userId, { status });

  const s = get(id);
  const pingRole = data.ping ? settings.role(guildId, 'sessionPing') : null;
  const intro = texts.render(guildId, data.prep ? 'session.prep' : 'session.start', vars(s));
  const msg = await ch.send({
    content: `${pingRole ? `<@&${pingRole}>\n` : ''}${intro}`,
    ...payload(guildId, s),
    files,
    allowedMentions: { roles: pingRole ? [pingRole] : [], users: [] },
  });
  update(id, { message_id: msg.id });

  await logger.discord(guildId, 'sessionLog', theme.base(guildId, 'primary', `Session #${id}`)
    .setTitle(`${E.session} Session ${data.prep ? 'in Vorbereitung' : 'gestartet'}`)
    .addFields(
      { name: 'Name', value: s.name, inline: true },
      { name: 'Typ', value: s.type, inline: true },
      { name: 'Host', value: `<@${s.host_id}>`, inline: true },
      { name: 'Co-Host', value: s.cohost_id ? `<@${s.cohost_id}>` : '–', inline: true },
      { name: 'Erstellt von', value: `<@${userId}>`, inline: true },
      { name: 'Nachricht', value: `[Zur Session](${msg.url})`, inline: true },
    ), { event: 'session.start', userId, details: { id } });
  return { ok: true, session: get(id), url: msg.url };
}

async function setStatus(client, s, status, userId, { silent = false } = {}) {
  const fields = { status };
  if (status !== 'prep' && !s.started_at) fields.started_at = now();
  update(s.id, fields);
  event(s.id, 'status', userId, { von: s.status, zu: status });
  await refreshMessage(client, s.id, true);
  if (!silent) {
    await logger.discord(s.guild_id, 'sessionLog', theme.base(s.guild_id, STATUS[status]?.color ?? 'primary', `Session #${s.id}`)
      .setDescription(`${E.tools} **Status geändert:** ${statusText(s.status)} → ${statusText(status)}${userId ? `\nDurch <@${userId}>` : ' (automatisch)'}`),
    { event: 'session.status', userId, details: { id: s.id, status } });
  }
  return get(s.id);
}

async function setLocked(client, s, locked, userId) {
  update(s.id, { locked: locked ? 1 : 0 });
  event(s.id, locked ? 'gesperrt' : 'entsperrt', userId);
  await refreshMessage(client, s.id, true);
  const fresh = get(s.id);
  await announce(client, fresh, texts.render(s.guild_id, locked ? 'session.lock' : 'session.unlock', vars(fresh)));
  await logger.discord(s.guild_id, 'sessionLog', theme.base(s.guild_id, 'warning', `Session #${s.id}`)
    .setDescription(`${locked ? E.lock : E.unlock} Session ${locked ? 'gesperrt' : 'entsperrt'} durch <@${userId}>`), { event: 'session.lock', userId });
  return fresh;
}

async function end(client, s, { userId, reason, shutdown = false, ingame = false }) {
  const t = now();
  const startedAt = s.started_at || s.created_at;
  const duration = t - startedAt;
  tx(() => {
    update(s.id, { status: 'ended', ended_at: t, duration, end_reason: reason || null, ended_by: userId, locked: 0, started_at: startedAt });
    run('UPDATE session_hosts SET ended_at = ? WHERE session_id = ? AND ended_at IS NULL', t, s.id);
  })();
  event(s.id, shutdown ? 'shutdown' : 'beendet', userId, { grund: reason });
  await refreshMessage(client, s.id, true);
  const done = get(s.id);
  const v = vars(done, { dauer: util.duration(duration), peak: done.peak_players || 0, grund: reason || 'Keine Angabe' });

  let ingameResult = null;
  if (ingame) {
    try {
      await erlc.command(`:m ${erlc.cleanText(shutdown ? `Server-Shutdown: ${reason || 'Die Session ist beendet.'} Danke fürs Mitspielen!` : 'Die Session ist beendet. Vielen Dank fürs Mitspielen!')}`);
      ingameResult = 'Ingame-Nachricht wurde vom Server bestätigt.';
    } catch (err) { ingameResult = `Ingame-Nachricht fehlgeschlagen: ${err.message}`; }
  }

  await announce(client, done, texts.render(s.guild_id, shutdown ? 'session.shutdown' : 'session.end', v), { embedColor: shutdown ? 0xa12d2f : 0x4f545c });

  const avg = done.samples_count ? (done.samples_sum / done.samples_count).toFixed(1).replace('.', ',') : '–';
  const teams = teamStats(done.id);
  const log = theme.base(s.guild_id, shutdown ? 'danger' : 'neutral', `Session #${s.id}`)
    .setTitle(shutdown ? '⛔ Session-Shutdown' : '✅ Session beendet')
    .addFields(
      { name: 'Name', value: done.name, inline: true },
      { name: 'Typ', value: done.type, inline: true },
      { name: 'Host', value: `<@${done.host_id}>`, inline: true },
      { name: 'Start', value: util.ts(startedAt), inline: true },
      { name: 'Ende', value: util.ts(t), inline: true },
      { name: 'Dauer', value: util.duration(duration), inline: true },
      { name: 'Höchststand', value: String(done.peak_players || 0), inline: true },
      { name: 'Ø Spieler', value: avg, inline: true },
      { name: 'Beendet von', value: `<@${userId}>`, inline: true },
    );
  if (reason) log.addFields({ name: 'Grund', value: util.truncate(reason, 1024) });
  if (teams.length) log.addFields({ name: 'Ø Spieler je Team', value: teams.map((x) => `${x.team}: **${x.avg}**`).join('\n') });
  if (ingameResult) log.addFields({ name: 'Ingame', value: ingameResult });
  await logger.discord(s.guild_id, 'sessionLog', log, { event: shutdown ? 'session.shutdown' : 'session.end', userId, details: { id: s.id, duration } });
  lastRender.delete(s.id);
  return { session: done, ingameResult };
}

// ---------- Hosts ----------
function assignHost(s, userId, role, byId) {
  const t = now();
  tx(() => {
    const current = role === 'host' ? s.host_id : s.cohost_id;
    if (current) run('UPDATE session_hosts SET ended_at = ? WHERE session_id = ? AND user_id = ? AND role = ? AND ended_at IS NULL', t, s.id, current, role);
    if (userId) run('INSERT INTO session_hosts (guild_id, session_id, user_id, role, started_at) VALUES (?,?,?,?,?)', s.guild_id, s.id, userId, role, t);
    update(s.id, role === 'host' ? { host_id: userId } : { cohost_id: userId || null });
  })();
  event(s.id, role === 'host' ? 'host' : 'cohost', byId, { neu: userId, alt: role === 'host' ? s.host_id : s.cohost_id });
  return get(s.id);
}

// ---------- Live-Tick (vom Statuspanel aufgerufen) ----------
async function tick(client, guildId, snapshot) {
  const s = active(guildId);
  if (!s) return;
  const t = now();
  const fields = {};
  if (snapshot.ok) {
    const d = snapshot.data;
    fields.last_players = d.CurrentPlayers;
    fields.max_players = d.MaxPlayers;
    fields.last_update = snapshot.at;
    if (s.status !== 'prep' && s.status !== 'paused') {
      fields.peak_players = Math.max(s.peak_players || 0, d.CurrentPlayers);
      fields.samples_sum = (s.samples_sum || 0) + d.CurrentPlayers;
      fields.samples_count = (s.samples_count || 0) + 1;
      // Teilnahme je Team aus der offiziellen Spielerliste
      if (Array.isArray(d.Players)) {
        const counts = {};
        for (const p of d.Players) { const team = erlc.TEAMS_DE[p.Team] || p.Team || 'Unbekannt'; counts[team] = (counts[team] || 0) + 1; }
        const all = new Set([...Object.keys(counts), ...teamStats(s.id).map((x) => x.team)]);
        for (const team of all) {
          run(`INSERT INTO session_team_stats (session_id, team, sum, samples) VALUES (?,?,?,1)
               ON CONFLICT(session_id, team) DO UPDATE SET sum = sum + excluded.sum, samples = samples + 1`, s.id, team, counts[team] || 0);
        }
      }
    }
    update(s.id, fields);
    // Automatische Statuswechsel
    const fresh = get(s.id);
    const pct = d.MaxPlayers ? (d.CurrentPlayers / d.MaxPlayers) * 100 : 0;
    const threshold = Number(settings.get(guildId, 'session.fullThreshold')) || 90;
    if (fresh.status === 'offline') await setStatus(client, fresh, 'active', null);
    else if (fresh.status === 'started' && t - (fresh.started_at || t) > 15 * 60 * 1000) await setStatus(client, fresh, 'active', null, { silent: true });
    else if (['active', 'boost'].includes(fresh.status) && pct >= threshold) await setStatus(client, fresh, 'full', null);
    else if (fresh.status === 'full' && pct < threshold - 10) await setStatus(client, fresh, 'active', null);
    else await refreshMessage(client, s.id);
  } else if (snapshot.error?.offline) {
    update(s.id, { last_players: 0, last_update: snapshot.at });
    const fresh = get(s.id);
    if (RUNNING.includes(fresh.status)) await setStatus(client, fresh, 'offline', null);
    else await refreshMessage(client, s.id);
  } else {
    await refreshMessage(client, s.id); // zeigt "Live-Daten nicht verfügbar", sobald veraltet
  }
}

// ---------- Statistiken ----------
function teamStats(sessionId) {
  return all('SELECT team, sum, samples FROM session_team_stats WHERE session_id = ? ORDER BY sum DESC', sessionId)
    .filter((r) => r.sum > 0)
    .map((r) => ({ team: r.team, avg: (r.sum / r.samples).toFixed(1).replace('.', ',') }));
}

function overallStats(guildId, since = 0) {
  const base = one(`SELECT COUNT(*) AS total, COALESCE(SUM(duration),0) AS dur, COALESCE(MAX(peak_players),0) AS peak,
      AVG(CASE WHEN samples_count > 0 THEN samples_sum * 1.0 / samples_count END) AS avgPlayers
    FROM sessions WHERE guild_id = ? AND status = 'ended' AND ended_at >= ?`, guildId, since);
  const perHost = all(`SELECT host_id, COUNT(*) AS n FROM sessions WHERE guild_id = ? AND status = 'ended' AND ended_at >= ? GROUP BY host_id ORDER BY n DESC LIMIT 5`, guildId, since);
  const teams = all(`SELECT t.team, SUM(t.sum) * 1.0 / SUM(t.samples) AS avg FROM session_team_stats t JOIN sessions s ON s.id = t.session_id
    WHERE s.guild_id = ? AND s.ended_at >= ? GROUP BY t.team HAVING SUM(t.sum) > 0 ORDER BY avg DESC`, guildId, since);
  return { ...base, perHost, teams };
}

function hostStats(guildId, userId) {
  const t = now();
  const h = one(`SELECT COUNT(DISTINCT session_id) AS sessions, COALESCE(SUM(COALESCE(ended_at, ?) - started_at),0) AS ms
    FROM session_hosts WHERE guild_id = ? AND user_id = ? AND role = 'host'`, t, guildId, userId);
  const co = one(`SELECT COUNT(DISTINCT session_id) AS sessions, COALESCE(SUM(COALESCE(ended_at, ?) - started_at),0) AS ms
    FROM session_hosts WHERE guild_id = ? AND user_id = ? AND role = 'cohost'`, t, guildId, userId);
  const att = one(`SELECT AVG(s.samples_sum * 1.0 / s.samples_count) AS avg, MAX(s.peak_players) AS peak FROM sessions s
    WHERE s.guild_id = ? AND s.samples_count > 0 AND s.id IN (SELECT session_id FROM session_hosts WHERE user_id = ? AND role = 'host')`, guildId, userId);
  const last = one(`SELECT MAX(started_at) AS last FROM session_hosts WHERE guild_id = ? AND user_id = ?`, guildId, userId);
  return { sessions: h.sessions, ms: h.ms, coSessions: co.sessions, coMs: co.ms, avg: att.avg, peak: att.peak, last: last.last };
}

function hostLeaderboard(guildId, by = 'sessions', since = 0) {
  const t = now();
  const order = by === 'stunden' ? 'ms' : by === 'spieler' ? 'avg' : 'sessions';
  return all(`SELECT h.user_id, COUNT(DISTINCT h.session_id) AS sessions, SUM(COALESCE(h.ended_at, ?) - h.started_at) AS ms,
      (SELECT AVG(s.samples_sum * 1.0 / s.samples_count) FROM sessions s WHERE s.samples_count > 0 AND s.id IN
         (SELECT session_id FROM session_hosts x WHERE x.user_id = h.user_id AND x.role = 'host' AND x.guild_id = h.guild_id)) AS avg
    FROM session_hosts h WHERE h.guild_id = ? AND h.role = 'host' AND h.started_at >= ?
    GROUP BY h.user_id ORDER BY ${order} DESC NULLS LAST LIMIT 10`, t, guildId, since);
}

module.exports = {
  STATUS, RUNNING, SESSION_TYPES, statusText, get, active, update, event, payload, buildEmbed, refreshMessage,
  announce, vars, create, setStatus, setLocked, end, assignHost, tick, teamStats, overallStats, hostStats, hostLeaderboard, sessionCode,
};
