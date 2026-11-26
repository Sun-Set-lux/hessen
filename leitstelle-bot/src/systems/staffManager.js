// Teamverwaltung: Ränge, Dienst, Aktivität, Verwarnungen
const { one, all, run, now } = require('../core/database');
const settings = require('../core/settings');
const theme = require('../core/theme');
const logger = require('../core/logger');

const ranks = (g) => all('SELECT * FROM staff_ranks WHERE guild_id = ? ORDER BY position', g);
const currentRank = (member) => {
  const rs = ranks(member.guild.id).filter((r) => member.roles.cache.has(r.role_id));
  return rs.length ? rs[rs.length - 1] : null;
};

const onDuty = (g, userId) => one('SELECT * FROM staff_duty WHERE guild_id = ? AND user_id = ? AND ended_at IS NULL', g, userId);

async function setDuty(member, on) {
  const g = member.guild.id;
  const open = onDuty(g, member.id);
  const roleId = settings.role(g, 'onDuty');
  if (on) {
    if (open) return { ok: false, reason: `Du bist bereits seit <t:${Math.floor(open.started_at / 1000)}:R> im Dienst.` };
    run('INSERT INTO staff_duty (guild_id, user_id, started_at) VALUES (?,?,?)', g, member.id, now());
    if (roleId) await member.roles.add(roleId, 'Dienstbeginn').catch(() => {});
    return { ok: true };
  }
  if (!open) return { ok: false, reason: 'Du bist aktuell nicht im Dienst.' };
  run('UPDATE staff_duty SET ended_at = ? WHERE id = ?', now(), open.id);
  if (roleId) await member.roles.remove(roleId, 'Dienstende').catch(() => {});
  return { ok: true, duration: now() - open.started_at };
}

function dutyMs(g, userId, since = 0) {
  return one('SELECT COALESCE(SUM(COALESCE(ended_at, ?) - MAX(started_at, ?)),0) AS ms FROM staff_duty WHERE guild_id = ? AND user_id = ? AND COALESCE(ended_at, ?) >= ?', now(), since, g, userId, now(), since).ms;
}

function activity(g, userId, since = 0) {
  const act = Object.fromEntries(all('SELECT type, count FROM staff_activity WHERE guild_id = ? AND user_id = ?', g, userId).map((r) => [r.type, r.count]));
  return {
    duty: dutyMs(g, userId, since),
    modmail: since ? one("SELECT COUNT(*) AS n FROM modmail_messages WHERE author_id = ? AND direction = 'team' AND at >= ?", userId, since).n : act.modmail || 0,
    moderation: one('SELECT COUNT(*) AS n FROM moderation WHERE guild_id = ? AND moderator_id = ? AND at >= ?', g, userId, since).n,
    applications: one('SELECT COUNT(*) AS n FROM applications WHERE guild_id = ? AND reviewer_id = ? AND reviewed_at >= ?', g, userId, since).n,
    sessions: one("SELECT COUNT(DISTINCT session_id) AS n FROM session_hosts WHERE guild_id = ? AND user_id = ? AND started_at >= ?", g, userId, since).n,
    erlc: one('SELECT COUNT(*) AS n FROM erlc_actions WHERE guild_id = ? AND user_id = ? AND success = 1 AND at >= ?', g, userId, since).n,
    warnings: one('SELECT COUNT(*) AS n FROM staff_warnings WHERE guild_id = ? AND user_id = ?', g, userId).n,
  };
}

// Punkte für die Rangliste
const score = (a) => Math.round(a.duty / 3600000 * 2 + a.modmail * 0.5 + a.moderation + a.applications * 2 + a.sessions * 5 + a.erlc * 0.2);

async function log(g, text, userId, targetId, color = 'primary') {
  await logger.discord(g, 'staffLog', theme.base(g, color).setDescription(text), { event: 'staff', userId, targetId });
}

function history(g, userId, action, fromRole, toRole, byId, reason) {
  run('INSERT INTO staff_history (guild_id, user_id, action, from_role, to_role, by_id, reason, at) VALUES (?,?,?,?,?,?,?,?)', g, userId, action, fromRole || null, toRole || null, byId || null, reason || null, now());
}

module.exports = { ranks, currentRank, onDuty, setDuty, dutyMs, activity, score, log, history };
