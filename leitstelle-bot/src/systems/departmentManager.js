// Abteilungen: Mitglieder, Ränge, Rollen, Dienstpläne und Verlauf
const { one, all, run, tx, now } = require('../core/database');
const settings = require('../core/settings');
const theme = require('../core/theme');
const logger = require('../core/logger');
const perms = require('../core/permissions');
const panels = require('./panels');

const { E } = theme;

const DEFAULTS = [
  { short: 'LSPD', name: 'Polizei', emoji: '🚓', color: 0x2563eb, ranks: ['Police Cadet', 'Officer', 'Senior Officer', 'Sergeant', 'Lieutenant', 'Captain', 'Assistant Chief', 'Chief of Police'] },
  { short: 'BCSO', name: 'Sheriff Department', emoji: '⭐', color: 0xb7791f, ranks: ['Deputy', 'Senior Deputy', 'Corporal', 'Sergeant', 'Lieutenant', 'Captain', 'Undersheriff', 'Sheriff'] },
  { short: 'FD', name: 'Feuerwehr', emoji: '🚒', color: 0xdc2626, ranks: ['Firefighter', 'Senior Firefighter', 'Lieutenant', 'Captain', 'Battalion Chief', 'Assistant Chief', 'Fire Chief'] },
  { short: 'EMS', name: 'Rettungsdienst', emoji: '🚑', color: 0xf97316, ranks: ['Rettungssanitäter in Ausbildung', 'Rettungssanitäter', 'Notfallsanitäter', 'Praxisanleiter', 'Wachleitung', 'Stellv. Rettungsdienstleitung', 'Rettungsdienstleitung'] },
  { short: 'DOT', name: 'Verkehrsministerium', emoji: '🚧', color: 0xeab308, ranks: ['Praktikant', 'Mitarbeiter', 'Erfahrener Mitarbeiter', 'Vorarbeiter', 'Bereichsleitung', 'Direktor'] },
  { short: 'CIV', name: 'Zivilisten', emoji: '👤', color: 0x64748b, ranks: ['Zivilist', 'Unternehmer'] },
];

function ensureDefaults(guildId) {
  if (settings.get(guildId, 'departments.seeded')) return;
  tx(() => {
    if (one('SELECT COUNT(*) AS n FROM departments WHERE guild_id = ?', guildId).n === 0) {
      for (const d of DEFAULTS) {
        const id = run('INSERT INTO departments (guild_id, name, short, emoji, color, created_at) VALUES (?,?,?,?,?,?)', guildId, d.name, d.short, d.emoji, d.color, now()).lastInsertRowid;
        d.ranks.forEach((r, i) => run('INSERT INTO department_ranks (department_id, name, position, is_leadership) VALUES (?,?,?,?)', id, r, i + 1, i >= d.ranks.length - 2 && d.ranks.length > 2 ? 1 : 0));
      }
    }
    settings.set(guildId, 'departments.seeded', true);
  })();
}

const list = (guildId) => { ensureDefaults(guildId); return all('SELECT * FROM departments WHERE guild_id = ? ORDER BY name', guildId); };
const get = (guildId, id) => one('SELECT * FROM departments WHERE guild_id = ? AND id = ?', guildId, Number(id));
function find(guildId, input) {
  ensureDefaults(guildId);
  if (!input) return null;
  return get(guildId, input) || one('SELECT * FROM departments WHERE guild_id = ? AND (LOWER(short) = LOWER(?) OR LOWER(name) = LOWER(?))', guildId, input, input);
}
const ranks = (deptId) => all('SELECT * FROM department_ranks WHERE department_id = ? ORDER BY position', deptId);
const rank = (deptId, rankId) => one('SELECT * FROM department_ranks WHERE department_id = ? AND id = ?', deptId, Number(rankId));
function findRank(deptId, input) {
  if (!input) return null;
  return rank(deptId, input) || one('SELECT * FROM department_ranks WHERE department_id = ? AND LOWER(name) = LOWER(?)', deptId, input);
}
const membership = (deptId, userId) => one(`SELECT m.*, r.name AS rank_name, r.position, r.role_id AS rank_role, r.is_leadership
  FROM department_members m LEFT JOIN department_ranks r ON r.id = m.rank_id WHERE m.department_id = ? AND m.user_id = ?`, deptId, userId);
const members = (deptId) => all(`SELECT m.*, r.name AS rank_name, r.position, r.is_leadership FROM department_members m
  LEFT JOIN department_ranks r ON r.id = m.rank_id WHERE m.department_id = ? ORDER BY r.position DESC, m.joined_at`, deptId);
const label = (d) => `${d.emoji || E.dept} ${d.short} – ${d.name}`;

function history(guildId, deptId, userId, action, fromRank, toRank, byId, reason) {
  run('INSERT INTO department_history (guild_id, department_id, user_id, action, from_rank, to_rank, by_id, reason, at) VALUES (?,?,?,?,?,?,?,?,?)',
    guildId, deptId, userId, action, fromRank || null, toRank || null, byId || null, reason || null, now());
}

/**
 * Darf das Mitglied diese Abteilung verwalten? Liefert die höchste vergebbare Rangposition.
 */
function authority(member, dept) {
  if (perms.inGroup(member, 'management')) return { ok: true, maxPosition: Infinity, full: true };
  if (dept.leader_id === member.id) return { ok: true, maxPosition: Infinity, full: false };
  const m = membership(dept.id, member.id);
  if (m && m.is_leadership) return { ok: true, maxPosition: m.position - 1, full: false };
  return { ok: false, reason: `Du gehörst nicht zur Leitung von **${dept.short}** und kannst diese Abteilung daher nicht verwalten.` };
}

// ---------- Discord-Rollen ----------
async function applyRoles(guild, userId, add = [], remove = []) {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { ok: false, note: 'Mitglied nicht auf dem Server – nur Datenbank aktualisiert.' };
  const me = guild.members.me;
  const problems = [];
  const usable = (id) => {
    const role = id && guild.roles.cache.get(id);
    if (!role) return null;
    if (role.position >= me.roles.highest.position) { problems.push(`<@&${id}>`); return null; }
    return role.id;
  };
  const toRemove = remove.map(usable).filter((id) => id && member.roles.cache.has(id) && !add.includes(id));
  const toAdd = add.map(usable).filter((id) => id && !member.roles.cache.has(id));
  try {
    if (toRemove.length) await member.roles.remove(toRemove, 'Abteilungsverwaltung');
    if (toAdd.length) await member.roles.add(toAdd, 'Abteilungsverwaltung');
  } catch (err) {
    return { ok: false, note: `Rollen konnten nicht geändert werden: ${err.message}` };
  }
  return { ok: !problems.length, note: problems.length ? `Diese Rollen stehen über meiner Rolle und wurden übersprungen: ${problems.join(', ')}` : null };
}

// ---------- Mitgliederverwaltung ----------
async function addMember(guild, dept, userId, rk, byId, callsign) {
  if (membership(dept.id, userId)) return { ok: false, reason: `<@${userId}> ist bereits Mitglied von **${dept.short}**.` };
  run('INSERT INTO department_members (guild_id, department_id, user_id, rank_id, callsign, joined_at) VALUES (?,?,?,?,?,?)', guild.id, dept.id, userId, rk.id, callsign || null, now());
  history(guild.id, dept.id, userId, 'aufgenommen', null, rk.name, byId);
  const roles = await applyRoles(guild, userId, [dept.role_id, rk.role_id].filter(Boolean));
  return { ok: true, note: roles.note };
}

async function removeMember(guild, dept, userId, byId, reason) {
  const m = membership(dept.id, userId);
  if (!m) return { ok: false, reason: `<@${userId}> ist kein Mitglied von **${dept.short}**.` };
  run('DELETE FROM department_members WHERE id = ?', m.id);
  history(guild.id, dept.id, userId, 'entfernt', m.rank_name, null, byId, reason);
  if (dept.leader_id === userId) run('UPDATE departments SET leader_id = NULL WHERE id = ?', dept.id);
  const roles = await applyRoles(guild, userId, [], [dept.role_id, ...ranks(dept.id).map((r) => r.role_id)].filter(Boolean));
  return { ok: true, note: roles.note, oldRank: m.rank_name };
}

async function setRank(guild, dept, userId, newRank, byId, reason) {
  const m = membership(dept.id, userId);
  if (!m) return { ok: false, reason: `<@${userId}> ist kein Mitglied von **${dept.short}**.` };
  if (m.rank_id === newRank.id) return { ok: false, reason: `<@${userId}> hat bereits den Rang **${newRank.name}**.` };
  const up = (m.position || 0) < newRank.position;
  run('UPDATE department_members SET rank_id = ?, last_promotion = ? WHERE id = ?', newRank.id, now(), m.id);
  history(guild.id, dept.id, userId, up ? 'befördert' : 'degradiert', m.rank_name, newRank.name, byId, reason);
  const roles = await applyRoles(guild, userId, [newRank.role_id, dept.role_id].filter(Boolean), ranks(dept.id).map((r) => r.role_id).filter(Boolean));
  return { ok: true, up, from: m.rank_name, note: roles.note };
}

// ---------- Darstellung ----------
function rosterEmbed(guildId, dept) {
  const rs = ranks(dept.id);
  const ms = members(dept.id);
  const embed = theme.base(guildId, dept.color || 'primary', `${ms.length} Mitglieder`).setTitle(`${dept.emoji || E.dept} Dienstliste – ${dept.short} ${dept.name}`);
  if (dept.leader_id) embed.setDescription(`**Leitung:** <@${dept.leader_id}>`);
  let fields = 0;
  for (const r of [...rs].reverse()) {
    const inRank = ms.filter((m) => m.rank_id === r.id);
    if (!inRank.length) continue;
    let value = '';
    for (const m of inRank) {
      const line = `<@${m.user_id}>${m.callsign ? ` \`${m.callsign}\`` : ''}`;
      if (value.length + line.length > 1000) { value += '\n…'; break; }
      value += (value ? '\n' : '') + line;
    }
    if (fields++ < 25) embed.addFields({ name: `${r.is_leadership ? '⭐ ' : ''}${r.name} (${inRank.length})`, value });
  }
  const noRank = ms.filter((m) => !m.rank_id);
  if (noRank.length && fields < 25) embed.addFields({ name: `Ohne Rang (${noRank.length})`, value: noRank.map((m) => `<@${m.user_id}>`).join('\n').slice(0, 1024) });
  if (!ms.length) embed.setDescription(`${dept.leader_id ? `**Leitung:** <@${dept.leader_id}>\n\n` : ''}Diese Abteilung hat noch keine Mitglieder.`);
  return embed;
}

async function updateRoster(client, guildId, deptId) {
  const p = panels.getPanel(guildId, 'roster', deptId);
  const dept = get(guildId, deptId);
  if (!p || !dept) return;
  await panels.upsert(client, guildId, 'roster', deptId, p.channel_id, { embeds: [rosterEmbed(guildId, dept)] }).catch(() => {});
}

function stats(guildId, dept) {
  const month = now() - 30 * 864e5;
  const count = (action) => one('SELECT COUNT(*) AS n FROM department_history WHERE department_id = ? AND action = ? AND at >= ?', dept.id, action, month).n;
  return {
    members: one('SELECT COUNT(*) AS n FROM department_members WHERE department_id = ?', dept.id).n,
    leadership: all(`SELECT m.user_id, r.name FROM department_members m JOIN department_ranks r ON r.id = m.rank_id WHERE m.department_id = ? AND r.is_leadership = 1 ORDER BY r.position DESC`, dept.id),
    perRank: all(`SELECT r.name, COUNT(m.id) AS n FROM department_ranks r LEFT JOIN department_members m ON m.rank_id = r.id WHERE r.department_id = ? GROUP BY r.id ORDER BY r.position DESC`, dept.id),
    joined: count('aufgenommen'), removed: count('entfernt'), promoted: count('befördert'), demoted: count('degradiert'),
    trainings: one(`SELECT COUNT(*) AS n FROM department_trainings WHERE department_id = ? AND status = 'abgeschlossen'`, dept.id).n,
    attendance: one(`SELECT AVG(c) AS a FROM (SELECT COUNT(a.user_id) AS c FROM department_trainings t LEFT JOIN training_attendance a ON a.training_id = t.id WHERE t.department_id = ? AND t.status = 'abgeschlossen' GROUP BY t.id)`, dept.id).a,
    newest: all('SELECT user_id, joined_at FROM department_members WHERE department_id = ? ORDER BY joined_at DESC LIMIT 5', dept.id),
    topTraining: all(`SELECT a.user_id, COUNT(*) AS n FROM training_attendance a JOIN department_trainings t ON t.id = a.training_id WHERE t.department_id = ? GROUP BY a.user_id ORDER BY n DESC LIMIT 5`, dept.id),
  };
}

async function auditLog(guildId, text, userId, targetId, color = 'primary') {
  await logger.discord(guildId, 'departmentLog', theme.base(guildId, color).setDescription(`${E.dept} ${text}`), { event: 'department', userId, targetId });
}

module.exports = {
  DEFAULTS, ensureDefaults, list, get, find, ranks, rank, findRank, membership, members, label, history, authority,
  applyRoles, addMember, removeMember, setRank, rosterEmbed, updateRoster, stats, auditLog,
};
