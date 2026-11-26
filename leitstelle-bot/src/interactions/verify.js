// Verifizierung mit Account-Alter-Prüfung und Rechenaufgabe (bleibt auch nach Neustart gültig)
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const theme = require('../core/theme');
const settings = require('../core/settings');
const util = require('../core/util');
const logger = require('../core/logger');
const { one, run, now } = require('../core/database');

const MAX_FAILS = 5;

function record(g, userId, status, failed = false) {
  run(`INSERT INTO verification (guild_id, user_id, status, attempts, at) VALUES (?,?,?,?,?)
       ON CONFLICT(guild_id, user_id) DO UPDATE SET status = excluded.status, attempts = CASE WHEN ? THEN attempts + 1 ELSE attempts END, at = excluded.at`,
  g, userId, status, failed ? 1 : 0, now(), failed ? 1 : 0);
}

async function grant(member, how, byId) {
  const g = member.guild.id;
  const roleId = settings.role(g, 'verification');
  if (!roleId) return { ok: false, reason: 'Es ist keine Verifiziert-Rolle eingestellt.' };
  if (member.roles.cache.has(roleId)) return { ok: false, reason: 'Diese Person ist bereits verifiziert.' };
  try { await member.roles.add(roleId, `Verifizierung (${how})`); } catch (err) { return { ok: false, reason: `Die Rolle konnte nicht vergeben werden: ${err.message}` }; }
  run('UPDATE verification SET attempts = 0 WHERE guild_id = ? AND user_id = ?', g, member.id);
  record(g, member.id, 'verifiziert');
  await logger.discord(g, 'verificationLog', theme.base(g, 'success').setDescription(`✅ <@${member.id}> wurde verifiziert (${how}).\nAccount erstellt: ${util.ts(member.user.createdTimestamp, 'R')}`), { event: 'verify.success', userId: byId || member.id, targetId: member.id });
  return { ok: true };
}

async function handle(interaction, action, args) {
  const g = interaction.guildId;
  const member = interaction.member;
  const roleId = settings.role(g, 'verification');
  if (!roleId) return theme.replyError(interaction, 'Die Verifizierung ist derzeit nicht eingerichtet.');
  if (member.roles.cache.has(roleId)) return theme.replyError(interaction, 'Du bist bereits verifiziert.');

  const row = one('SELECT * FROM verification WHERE guild_id = ? AND user_id = ?', g, member.id);
  if (row && row.attempts >= MAX_FAILS && now() - row.at < 10 * 60 * 1000) {
    return theme.replyError(interaction, `Zu viele Fehlversuche. Bitte versuche es ${util.ts(row.at + 10 * 60 * 1000, 'R')} erneut.`);
  }
  if (row && row.attempts >= MAX_FAILS) run('UPDATE verification SET attempts = 0 WHERE guild_id = ? AND user_id = ?', g, member.id);

  if (action === 'start') {
    const days = Number(settings.get(g, 'verify.minAccountDays')) || 0;
    const age = now() - interaction.user.createdTimestamp;
    if (days && age < days * 864e5) {
      record(g, member.id, 'zu junger Account');
      await logger.discord(g, 'verificationLog', theme.base(g, 'warning').setDescription(`⛔ <@${member.id}> abgelehnt: Account zu jung (${util.ts(interaction.user.createdTimestamp, 'R')} erstellt, benötigt ${days} Tage).`), { event: 'verify.denied', userId: member.id });
      return theme.replyError(interaction, `Dein Discord-Account muss mindestens **${days} Tage** alt sein. Du kannst dich ${util.ts(interaction.user.createdTimestamp + days * 864e5, 'R')} verifizieren. Bei Fragen wende dich bitte über Modmail an das Team.`);
    }
    if (!settings.get(g, 'verify.captcha')) {
      const res = await grant(member, 'Button');
      return res.ok ? theme.replySuccess(interaction, 'Du wurdest erfolgreich verifiziert. Willkommen!') : theme.replyError(interaction, res.reason);
    }
    const a = 2 + Math.floor(Math.random() * 9);
    const b = 2 + Math.floor(Math.random() * 9);
    const exp = now() + 5 * 60 * 1000;
    const sig = util.sign(`${member.id}:${a + b}:${exp}`);
    return interaction.showModal(new ModalBuilder().setCustomId(`verify:answer:${exp}:${sig}`).setTitle('Bestätige, dass du ein Mensch bist').addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('antwort').setLabel(`Wie viel ist ${a} + ${b}?`).setStyle(TextInputStyle.Short).setMaxLength(3).setRequired(true).setPlaceholder('Ergebnis als Zahl')),
    ));
  }

  if (action === 'answer') {
    const [exp, sig] = args;
    if (Number(exp) < now()) return theme.replyError(interaction, 'Die Aufgabe ist abgelaufen. Bitte klicke erneut auf **Jetzt verifizieren**.');
    const answer = interaction.fields.getTextInputValue('antwort').trim();
    if (!/^\d+$/.test(answer) || util.sign(`${member.id}:${Number(answer)}:${exp}`) !== sig) {
      record(g, member.id, 'falsche Antwort', true);
      const fails = one('SELECT attempts FROM verification WHERE guild_id = ? AND user_id = ?', g, member.id).attempts;
      if (fails >= MAX_FAILS) await logger.discord(g, 'verificationLog', theme.base(g, 'danger').setDescription(`🤖 <@${member.id}> hat die Rechenaufgabe ${fails}× falsch beantwortet (mögliches Bot-Konto).`), { event: 'verify.fail', userId: member.id });
      return theme.replyError(interaction, `Das war leider falsch. Versuche es erneut (${Math.max(0, MAX_FAILS - fails)} Versuche übrig).`);
    }
    const res = await grant(member, 'Rechenaufgabe');
    return res.ok ? theme.replySuccess(interaction, 'Du wurdest erfolgreich verifiziert. Willkommen!') : theme.replyError(interaction, res.reason);
  }
}

module.exports = { prefix: 'verify', handle, grant };
