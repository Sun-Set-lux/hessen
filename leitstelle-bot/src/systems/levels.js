// Level-System: XP für Nachrichten mit Abklingzeit, Level-Rollen
const { one, all, run, now } = require('../core/database');
const settings = require('../core/settings');
const texts = require('../core/texts');
const theme = require('../core/theme');

const needed = (level) => 5 * level * level + 50 * level + 100; // XP bis zum nächsten Level

function progress(xp) {
  let level = 0; let rest = xp;
  while (rest >= needed(level)) { rest -= needed(level); level++; }
  return { level, current: rest, next: needed(level) };
}

async function onMessage(message) {
  const g = message.guildId;
  if (!settings.get(g, 'level.enabled') || message.content.length < 3) return;
  const row = one('SELECT * FROM levels WHERE guild_id = ? AND user_id = ?', g, message.author.id);
  const cooldown = (Number(settings.get(g, 'level.cooldownSeconds')) || 60) * 1000;
  if (row && now() - row.last_xp_at < cooldown) {
    run('UPDATE levels SET messages = messages + 1 WHERE guild_id = ? AND user_id = ?', g, message.author.id);
    return;
  }
  const gain = 15 + Math.floor(Math.random() * 11);
  const xp = (row?.xp || 0) + gain;
  const { level } = progress(xp);
  run(`INSERT INTO levels (guild_id, user_id, xp, level, messages, last_xp_at) VALUES (?,?,?,?,1,?)
       ON CONFLICT(guild_id, user_id) DO UPDATE SET xp = excluded.xp, level = excluded.level, messages = messages + 1, last_xp_at = excluded.last_xp_at`, g, message.author.id, xp, level, now());
  if (level > (row?.level || 0)) {
    // Level-Rollen vergeben
    const roles = all('SELECT * FROM level_roles WHERE guild_id = ? AND level <= ?', g, level);
    const add = roles.map((r) => r.role_id).filter((id) => !message.member.roles.cache.has(id));
    if (add.length) await message.member.roles.add(add, `Level ${level}`).catch(() => {});
    if (settings.get(g, 'level.announce')) {
      const chId = settings.channel(g, 'level');
      const ch = chId ? await message.client.channels.fetch(chId).catch(() => null) : message.channel;
      await ch?.send({ embeds: [theme.base(g, 'success').setDescription(texts.render(g, 'level.up', { user: `<@${message.author.id}>`, level }))], allowedMentions: { users: [] } }).catch(() => {});
    }
  }
}

module.exports = { needed, progress, onMessage };
