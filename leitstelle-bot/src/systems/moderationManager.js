// Moderation: Prüfungen, Benachrichtigungen, Einträge und Logs
const { run, now, bumpActivity } = require('../core/database');
const settings = require('../core/settings');
const theme = require('../core/theme');
const util = require('../core/util');
const logger = require('../core/logger');

const ACTIONS = {
  ban: { label: 'Bann', past: 'gebannt', emoji: '🔨', color: 'danger' },
  unban: { label: 'Entbannung', past: 'entbannt', emoji: '🔓', color: 'success' },
  kick: { label: 'Kick', past: 'gekickt', emoji: '👢', color: 'warning' },
  timeout: { label: 'Timeout', past: 'in den Timeout versetzt', emoji: '⏳', color: 'warning' },
  untimeout: { label: 'Timeout aufgehoben', past: 'aus dem Timeout entlassen', emoji: '✅', color: 'success' },
  warn: { label: 'Verwarnung', past: 'verwarnt', emoji: '⚠️', color: 'warning' },
  unwarn: { label: 'Verwarnung entfernt', past: 'entlastet', emoji: '🧹', color: 'success' },
  clear: { label: 'Nachrichten gelöscht', emoji: '🧽', color: 'neutral' },
  lock: { label: 'Kanal gesperrt', emoji: '🔒', color: 'warning' },
  unlock: { label: 'Kanal entsperrt', emoji: '🔓', color: 'success' },
  slowmode: { label: 'Slowmode', emoji: '🐢', color: 'neutral' },
};

/**
 * Prüft Hierarchie: niemand darf sich selbst, den Owner oder Höhergestellte bestrafen.
 */
function checkTarget(interaction, target) {
  const me = interaction.guild.members.me;
  if (!target) return { ok: true };
  if (target.id === interaction.user.id) return { ok: false, reason: 'Du kannst diese Aktion nicht an dir selbst ausführen.' };
  if (target.id === interaction.guild.ownerId) return { ok: false, reason: 'Der Serverinhaber kann nicht bestraft werden.' };
  if (target.id === me.id) return { ok: false, reason: 'Diese Aktion kann nicht auf mich angewendet werden.' };
  if (interaction.user.id !== interaction.guild.ownerId && target.roles.highest.position >= interaction.member.roles.highest.position) return { ok: false, reason: 'Diese Person hat eine gleich hohe oder höhere Rolle als du.' };
  if (target.roles.highest.position >= me.roles.highest.position) return { ok: false, reason: 'Diese Person steht über meiner Rolle – ich kann sie nicht bestrafen.' };
  return { ok: true };
}

function reasonOf(interaction) {
  const reason = interaction.options.getString('grund');
  if (!reason && settings.get(interaction.guildId, 'mod.requireReason')) return { ok: false, reason: 'Bitte gib einen Grund an (Pflichtfeld laut Konfiguration).' };
  return { ok: true, reason: reason || 'Kein Grund angegeben' };
}

async function notify(guild, user, action, reason, extra) {
  if (!settings.get(guild.id, 'mod.dmUsers')) return false;
  const a = ACTIONS[action];
  try {
    await user.send({ embeds: [theme.base(guild.id, a.color).setTitle(`${a.emoji} ${a.label}`)
      .setDescription(`Du wurdest auf **${guild.name}** ${a.past}.\n\n**Grund:** ${reason}${extra ? `\n${extra}` : ''}\n\n-# Bei Fragen oder Einspruch kannst du dich über Modmail an das Team wenden.`)] });
    return true;
  } catch { return false; }
}

async function record(interaction, action, targetUser, reason, { duration, extra } = {}) {
  const g = interaction.guildId;
  const id = targetUser ? run('INSERT INTO moderation (guild_id, user_id, moderator_id, action, reason, duration, at) VALUES (?,?,?,?,?,?,?)', g, targetUser.id, interaction.user.id, action, reason, duration || null, now()).lastInsertRowid : null;
  bumpActivity(g, interaction.user.id, 'moderation');
  const a = ACTIONS[action];
  const embed = theme.base(g, a.color, id ? `Fall #${id}` : undefined).setTitle(`${a.emoji} ${a.label}`).addFields(
    ...(targetUser ? [{ name: 'Betroffen', value: `<@${targetUser.id}> (\`${targetUser.id}\`)`, inline: true }] : []),
    { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
    ...(duration ? [{ name: 'Dauer', value: util.duration(duration), inline: true }] : []),
    { name: 'Grund', value: util.truncate(reason || '–', 1024) },
    ...(extra ? [{ name: 'Details', value: extra }] : []),
  );
  await logger.discord(g, 'modLog', embed, { event: `mod.${action}`, userId: interaction.user.id, targetId: targetUser?.id, details: { reason, duration } });
  return id;
}

module.exports = { ACTIONS, checkTarget, reasonOf, notify, record };
