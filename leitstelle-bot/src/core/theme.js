// Einheitliches Design: Farben, Emojis und Embed-Bausteine
const { EmbedBuilder, MessageFlags } = require('discord.js');
const settings = require('./settings');

const E = {
  ok: '✅', err: '❌', warn: '⚠️', info: 'ℹ️', lock: '🔒', unlock: '🔓',
  session: '🚨', server: '🖥️', players: '👥', code: '🔑', clock: '🕒', host: '🎙️',
  queue: '⏳', stats: '📊', rules: '📜', star: '⭐', dept: '🏛️', mail: '📩',
  shield: '🛡️', user: '👤', note: '📝', bell: '🔔', calendar: '📅', online: '🟢',
  offline: '🔴', idle: '🟡', trophy: '🏆', tools: '🛠️', megaphone: '📢', dot: '•',
};

function colors(guildId) {
  return {
    primary: settings.get(guildId, 'colors.primary'),
    success: settings.get(guildId, 'colors.success'),
    warning: settings.get(guildId, 'colors.warning'),
    danger: settings.get(guildId, 'colors.danger'),
    neutral: settings.get(guildId, 'colors.neutral'),
  };
}

function footer(guildId, extra) {
  const name = settings.get(guildId, 'brand.name') || 'Leitstelle';
  const icon = settings.get(guildId, 'brand.icon') || undefined;
  return { text: extra ? `${name} ${E.dot} ${extra}` : name, iconURL: icon || undefined };
}

function base(guildId, color = 'primary', extraFooter) {
  const c = colors(guildId);
  return new EmbedBuilder()
    .setColor(typeof color === 'number' ? color : c[color] ?? c.primary)
    .setFooter(footer(guildId, extraFooter))
    .setTimestamp();
}

const success = (g, text, title) => base(g, 'success').setDescription(`${E.ok} ${text}`).setTitle(title || null);
const error = (g, text, title) => base(g, 'danger').setDescription(`${E.err} ${text}`).setTitle(title || null);
const warning = (g, text, title) => base(g, 'warning').setDescription(`${E.warn} ${text}`).setTitle(title || null);
const info = (g, text, title) => base(g, 'primary').setDescription(text).setTitle(title || null);

// Antwortet sicher – egal ob die Interaktion schon beantwortet wurde
async function reply(interaction, payload, ephemeral = true) {
  const data = typeof payload === 'string' ? { content: payload } : { ...payload };
  if (ephemeral) data.flags = MessageFlags.Ephemeral;
  try {
    if (interaction.deferred && !interaction.replied) return await interaction.editReply({ ...data, flags: undefined });
    if (interaction.replied) return await interaction.followUp(data);
    return await interaction.reply(data);
  } catch (err) {
    if (err?.code !== 10062) console.error('Antwort fehlgeschlagen:', err?.message);
    return null;
  }
}

const replyError = (i, text) => reply(i, { embeds: [error(i.guildId, text)] });
const replySuccess = (i, text, ephemeral = true) => reply(i, { embeds: [success(i.guildId, text)] }, ephemeral);

module.exports = { E, colors, footer, base, success, error, warning, info, reply, replyError, replySuccess };
