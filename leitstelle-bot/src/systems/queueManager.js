// Discord-Warteschlange für Sessions (steuert NICHT die Ingame-Warteschlange)
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { one, all, run, now } = require('../core/database');
const settings = require('../core/settings');
const theme = require('../core/theme');
const util = require('../core/util');
const panels = require('./panels');
const sessions = require('./sessionManager');

const { E } = theme;

const entries = (g) => all('SELECT * FROM queue_entries WHERE guild_id = ? ORDER BY joined_at', g);
const position = (g, userId) => {
  const e = one('SELECT joined_at FROM queue_entries WHERE guild_id = ? AND user_id = ?', g, userId);
  if (!e) return null;
  return one('SELECT COUNT(*) AS n FROM queue_entries WHERE guild_id = ? AND joined_at <= ?', g, e.joined_at).n;
};
const log = (g, userId, action, byId, waitMs) => run('INSERT INTO queue_log (guild_id, user_id, action, by_id, wait_ms, at) VALUES (?,?,?,?,?,?)', g, userId, action, byId || null, waitMs ?? null, now());

function join(g, userId) {
  if (one('SELECT 1 FROM queue_entries WHERE guild_id = ? AND user_id = ?', g, userId)) return { ok: false, reason: `Du stehst bereits in der Warteschlange (Platz **${position(g, userId)}**).` };
  run('INSERT INTO queue_entries (guild_id, user_id, joined_at) VALUES (?,?,?)', g, userId, now());
  log(g, userId, 'beigetreten');
  return { ok: true, position: position(g, userId) };
}

function leave(g, userId, action = 'verlassen', byId) {
  const e = one('SELECT * FROM queue_entries WHERE guild_id = ? AND user_id = ?', g, userId);
  if (!e) return { ok: false };
  run('DELETE FROM queue_entries WHERE guild_id = ? AND user_id = ?', g, userId);
  log(g, userId, action, byId, now() - e.joined_at);
  return { ok: true, wait: now() - e.joined_at };
}

function panelPayload(g) {
  const list = entries(g);
  const s = sessions.active(g);
  const embed = theme.base(g, 'primary', `${list.length} wartend`).setTitle(`${E.queue} Session-Warteschlange`)
    .setDescription([
      'Melde dich hier an, wenn der Server voll ist. Sobald ein Platz frei wird, ruft dich das Team auf und du erhältst eine Nachricht.',
      '',
      `**Session:** ${s ? `${sessions.statusText(s.status)} – ${util.truncate(s.name, 60)}` : 'Keine aktive Session'}`,
      `**Wartende:** ${list.length}`,
      list.length ? `\n${list.slice(0, 15).map((e, i) => `\`${i + 1}.\` <@${e.user_id}> ${E.dot} seit ${util.ts(e.joined_at, 'R')}`).join('\n')}${list.length > 15 ? `\n… und ${list.length - 15} weitere` : ''}` : '',
      '',
      '-# Hinweis: Dies ist eine Discord-Warteschlange. Die Ingame-Warteschlange von ER:LC wird davon nicht beeinflusst.',
    ].join('\n'));
  const rows = [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('queue:join').setStyle(ButtonStyle.Success).setLabel('Beitreten').setEmoji('➕'),
    new ButtonBuilder().setCustomId('queue:leave').setStyle(ButtonStyle.Danger).setLabel('Verlassen').setEmoji('➖'),
    new ButtonBuilder().setCustomId('queue:pos').setStyle(ButtonStyle.Secondary).setLabel('Meine Position').setEmoji('🔢'),
    new ButtonBuilder().setCustomId('queue:next').setStyle(ButtonStyle.Primary).setLabel('Nächsten aufrufen (Team)').setEmoji('📣').setDisabled(!list.length),
  )];
  if (list.length) {
    rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('queue:manage').setPlaceholder('Team: Person aufrufen oder entfernen …')
      .addOptions(list.slice(0, 25).flatMap((e, i) => [{ label: `Platz ${i + 1} aufrufen`, value: `call:${e.user_id}`, description: `Nutzer-ID ${e.user_id}`, emoji: '📣' }]).slice(0, 12)
        .concat(list.slice(0, 12).map((e, i) => ({ label: `Platz ${i + 1} entfernen`, value: `kick:${e.user_id}`, description: `Nutzer-ID ${e.user_id}`, emoji: '🗑️' }))))));
  }
  return { embeds: [embed], components: rows };
}

async function refresh(client, g) {
  const p = panels.getPanel(g, 'queue');
  if (p) await panels.upsert(client, g, 'queue', '', p.channel_id, panelPayload(g)).catch(() => {});
}

// Benachrichtigt die ersten Plätze, dass sie bald dran sind (nur einmal)
async function notifyTop(client, g) {
  const top = Number(settings.get(g, 'queue.notifyTop')) || 3;
  for (const e of entries(g).slice(0, top)) {
    if (e.notified) continue;
    run('UPDATE queue_entries SET notified = 1 WHERE guild_id = ? AND user_id = ?', g, e.user_id);
    try {
      const u = await client.users.fetch(e.user_id);
      await u.send({ embeds: [theme.info(g, `Du bist in der Session-Warteschlange jetzt auf **Platz ${position(g, e.user_id)}**. Halte dich bereit – du wirst bald aufgerufen!`, `${E.bell} Gleich bist du dran`)] });
    } catch { /* DMs geschlossen */ }
  }
}

async function call(client, g, userId, byId) {
  const res = leave(g, userId, 'aufgerufen', byId);
  if (!res.ok) return { ok: false, reason: 'Diese Person steht nicht (mehr) in der Warteschlange.' };
  const s = sessions.active(g);
  const code = s ? sessions.sessionCode(s) : null;
  let dm = true;
  try {
    const u = await client.users.fetch(userId);
    await u.send({ embeds: [theme.success(g, `**Du bist dran!** Ein Platz ist frei geworden.${code && !s?.locked ? `\nServercode: **\`${code}\`**` : ''}\nBitte tritt jetzt dem Server bei.`, '🎮 Aufruf aus der Warteschlange')] });
  } catch { dm = false; }
  const role = settings.role(g, 'queueCall');
  const chId = settings.channel(g, 'queue') || panels.getPanel(g, 'queue')?.channel_id;
  if (chId) {
    const ch = await client.channels.fetch(chId).catch(() => null);
    await ch?.send({ content: `<@${userId}> ${E.bell} Du wurdest aus der Warteschlange aufgerufen! Bitte tritt jetzt bei.${role ? ` <@&${role}>` : ''}`, allowedMentions: { users: [userId], roles: role ? [role] : [] } }).catch(() => {});
  }
  await notifyTop(client, g);
  await refresh(client, g);
  return { ok: true, dm, wait: res.wait };
}

function stats(g, since = 0) {
  return {
    waiting: one('SELECT COUNT(*) AS n FROM queue_entries WHERE guild_id = ?', g).n,
    joined: one("SELECT COUNT(*) AS n FROM queue_log WHERE guild_id = ? AND action = 'beigetreten' AND at >= ?", g, since).n,
    called: one("SELECT COUNT(*) AS n FROM queue_log WHERE guild_id = ? AND action = 'aufgerufen' AND at >= ?", g, since).n,
    left: one("SELECT COUNT(*) AS n FROM queue_log WHERE guild_id = ? AND action = 'verlassen' AND at >= ?", g, since).n,
    avgWait: one("SELECT AVG(wait_ms) AS a FROM queue_log WHERE guild_id = ? AND action = 'aufgerufen' AND at >= ?", g, since).a,
  };
}

module.exports = { entries, position, join, leave, panelPayload, refresh, notifyTop, call, stats };
