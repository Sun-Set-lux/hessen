// Rollenbasiertes Berechtigungssystem mit Befehls-Ausnahmen
const { PermissionFlagsBits } = require('discord.js');
const { all, run, one } = require('./database');

// Berechtigungsgruppen
const GROUPS = {
  management: 'Community-Management',
  server: 'Server-Management (ER:LC)',
  host: 'Session-Host',
  deptlead: 'Abteilungsleitung',
  moderation: 'Moderationsteam',
  support: 'Supportteam',
  admin: 'Administration',
};

// Modi für Befehls-Ausnahmen (/config befehl)
const MODES = {
  standard: 'Standard (wie vorgesehen)',
  deaktiviert: 'Deaktiviert',
  admin: 'Nur Administratoren',
  staff: 'Nur Team (Moderation, Support, Server-Management)',
  host: 'Nur Session-Hosts',
  abteilungsleitung: 'Nur Abteilungsleitung',
  alle: 'Alle Mitglieder',
};
const MODE_GROUPS = {
  admin: ['admin'],
  staff: ['moderation', 'support', 'server'],
  host: ['host'],
  abteilungsleitung: ['deptlead'],
  alle: ['everyone'],
};

// Registrierte Standardrechte aller Befehle: key -> Gruppen
const registry = new Map();
function register(key, groups, label) {
  registry.set(key, { groups: Array.isArray(groups) ? groups : [groups], label: label || key });
}

function rolesOf(guildId, grp) {
  return all('SELECT role_id FROM permission_roles WHERE guild_id = ? AND grp = ?', guildId, grp).map((r) => r.role_id);
}

function addRole(guildId, grp, roleId) {
  run('INSERT OR IGNORE INTO permission_roles (guild_id, grp, role_id) VALUES (?,?,?)', guildId, grp, roleId);
}
function removeRole(guildId, grp, roleId) {
  return run('DELETE FROM permission_roles WHERE guild_id = ? AND grp = ? AND role_id = ?', guildId, grp, roleId).changes > 0;
}

function isAdmin(member) {
  if (!member) return false;
  if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  if (member.guild && member.id === member.guild.ownerId) return true;
  return rolesOf(member.guild.id, 'admin').some((r) => member.roles.cache.has(r));
}

function groupsOf(member) {
  const set = new Set(['everyone']);
  if (!member?.guild) return set;
  if (isAdmin(member)) set.add('admin');
  for (const row of all('SELECT grp, role_id FROM permission_roles WHERE guild_id = ?', member.guild.id)) {
    if (member.roles.cache.has(row.role_id)) set.add(row.grp);
  }
  return set;
}

const inGroup = (member, grp) => {
  const g = groupsOf(member);
  return g.has('admin') || g.has(grp) || (grp !== 'admin' && g.has('management'));
};

const isStaff = (member) => {
  const g = groupsOf(member);
  return ['admin', 'management', 'moderation', 'support', 'server', 'host', 'deptlead'].some((x) => g.has(x));
};

function ruleFor(guildId, key) {
  const exact = one('SELECT mode FROM command_rules WHERE guild_id = ? AND key = ?', guildId, key);
  if (exact) return exact.mode;
  const parent = one('SELECT mode FROM command_rules WHERE guild_id = ? AND key = ?', guildId, key.split('.')[0]);
  return parent ? parent.mode : 'standard';
}

function setRule(guildId, key, mode) {
  if (mode === 'standard') return run('DELETE FROM command_rules WHERE guild_id = ? AND key = ?', guildId, key);
  run('INSERT INTO command_rules (guild_id, key, mode) VALUES (?,?,?) ON CONFLICT(guild_id, key) DO UPDATE SET mode = excluded.mode', guildId, key, mode);
}

/**
 * Prüft, ob ein Mitglied einen Befehl ausführen darf.
 * @returns {{ ok: boolean, reason?: string }}
 */
function check(member, key) {
  const mode = ruleFor(member.guild.id, key);
  if (mode === 'deaktiviert') return { ok: false, reason: 'Dieser Befehl wurde von der Administration deaktiviert.' };
  const groups = groupsOf(member);
  if (groups.has('admin')) return { ok: true };
  const required = mode === 'standard' ? registry.get(key)?.groups || ['admin'] : MODE_GROUPS[mode] || ['admin'];
  if (required.includes('everyone')) return { ok: true };
  if (required.includes('admin') && required.length === 1) return { ok: false, reason: 'Dieser Befehl ist ausschließlich der Administration vorbehalten.' };
  if (groups.has('management')) return { ok: true };
  if (required.some((g) => groups.has(g))) return { ok: true };
  const names = required.map((g) => GROUPS[g] || g).join(', ');
  return { ok: false, reason: `Dafür fehlt dir die Berechtigung. Benötigt wird: **${names}**.` };
}

module.exports = { GROUPS, MODES, registry, register, rolesOf, addRole, removeRole, isAdmin, groupsOf, inGroup, isStaff, ruleFor, setRule, check };
