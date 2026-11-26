// Bewerbungen: Formulare, Prüfung, Annahme/Ablehnung, Verlauf
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { one, all, run, now, bumpActivity } = require('../core/database');
const settings = require('../core/settings');
const theme = require('../core/theme');
const util = require('../core/util');
const logger = require('../core/logger');

const { E } = theme;

const DEPT_Q = [
  'Wie alt bist du?',
  'Wie lange spielst du schon ER:LC?',
  'Warum möchtest du dieser Abteilung beitreten?',
  'Welche Erfahrungen hast du bereits im Roleplay?',
  'Wie würdest du dich bei einer Verfolgungsjagd verhalten?',
];

const DEFAULT_FORMS = {
  polizei: { label: 'Polizei (LSPD)', emoji: '🚓', dept: 'LSPD', questions: DEPT_Q },
  sheriff: { label: 'Sheriff Department (BCSO)', emoji: '⭐', dept: 'BCSO', questions: DEPT_Q },
  feuerwehr: { label: 'Feuerwehr (FD)', emoji: '🚒', dept: 'FD', questions: ['Wie alt bist du?', 'Wie lange spielst du schon ER:LC?', 'Warum möchtest du zur Feuerwehr?', 'Welche Erfahrungen hast du im Roleplay?', 'Wie gehst du bei einem Großbrand vor?'] },
  rettungsdienst: { label: 'Rettungsdienst (EMS)', emoji: '🚑', dept: 'EMS', questions: ['Wie alt bist du?', 'Wie lange spielst du schon ER:LC?', 'Warum möchtest du zum Rettungsdienst?', 'Welche Erfahrungen hast du im Roleplay?', 'Wie verhältst du dich an einer Unfallstelle?'] },
  dot: { label: 'DOT', emoji: '🚧', dept: 'DOT', questions: ['Wie alt bist du?', 'Wie lange spielst du schon ER:LC?', 'Warum möchtest du zum DOT?', 'Welche Erfahrungen hast du im Roleplay?', 'Wie sicherst du eine Unfallstelle ab?'] },
  support: { label: 'Support-Team', emoji: '💬', questions: ['Wie alt bist du?', 'Wie viel Zeit kannst du pro Woche investieren?', 'Warum möchtest du ins Support-Team?', 'Hast du bereits Erfahrung im Support?', 'Wie gehst du mit einem verärgerten Nutzer um?'] },
  moderation: { label: 'Moderation-Team', emoji: '🛡️', questions: ['Wie alt bist du?', 'Wie viel Zeit kannst du pro Woche investieren?', 'Warum möchtest du ins Moderation-Team?', 'Welche Moderationserfahrung hast du?', 'Ein Spieler betreibt RDM. Wie gehst du vor?', 'Was bedeutet für dich ein fairer Umgang mit Regelverstößen?'] },
  administration: { label: 'Administration', emoji: '👑', questions: ['Wie alt bist du?', 'Wie lange bist du schon in unserer Community?', 'Warum möchtest du in die Administration?', 'Welche Führungserfahrung hast du?', 'Wie würdest du einen Konflikt im Team lösen?', 'Was würdest du an unserem Server verbessern?'] },
};

function forms(g) {
  const custom = settings.get(g, 'applications.forms') || {};
  const out = {};
  for (const [k, def] of Object.entries(DEFAULT_FORMS)) out[k] = { ...def, open: true, role: null, ...(custom[k] || {}) };
  for (const [k, c] of Object.entries(custom)) if (!out[k]) out[k] = { open: true, questions: [], ...c };
  return out;
}

function saveForm(g, key, patch) {
  const custom = settings.get(g, 'applications.forms') || {};
  custom[key] = { ...(custom[key] || {}), ...patch };
  settings.set(g, 'applications.forms', custom);
}

const get = (id) => one('SELECT * FROM applications WHERE id = ?', Number(id));

function panelPayload(g) {
  const f = Object.entries(forms(g));
  const open = f.filter(([, x]) => x.open && x.questions.length);
  const embed = theme.base(g, 'primary').setTitle('📝 Bewerbungen')
    .setDescription(`Du möchtest Teil unseres Teams oder einer Abteilung werden? Wähle unten die passende Bewerbung aus und beantworte die Fragen ehrlich und ausführlich.\n\n${f.map(([, x]) => `${x.emoji || '📄'} **${x.label}** – ${x.open && x.questions.length ? '🟢 offen' : '🔴 geschlossen'}`).join('\n')}\n\n-# Nach dem Absenden prüft das Team deine Bewerbung. Du erhältst das Ergebnis per Privatnachricht.`);
  const components = open.length ? [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('app:pick').setPlaceholder('Bewerbung auswählen …')
    .addOptions(open.slice(0, 25).map(([value, x]) => ({ label: x.label.slice(0, 100), value, emoji: x.emoji || '📄' }))))] : [];
  return { embeds: [embed], components };
}

/**
 * Prüft, ob sich ein Nutzer bewerben darf.
 */
function canApply(g, userId, key) {
  const form = forms(g)[key];
  if (!form || !form.open) return { ok: false, reason: 'Diese Bewerbung ist aktuell geschlossen.' };
  if (!form.questions.length) return { ok: false, reason: 'Für diese Bewerbung sind noch keine Fragen hinterlegt.' };
  const pendingApp = one("SELECT id FROM applications WHERE guild_id = ? AND user_id = ? AND category = ? AND status = 'offen'", g, userId, key);
  if (pendingApp) return { ok: false, reason: 'Du hast bereits eine offene Bewerbung in diesem Bereich. Bitte warte auf das Ergebnis.' };
  const days = Number(settings.get(g, 'applications.cooldownDays')) || 0;
  const last = one("SELECT reviewed_at FROM applications WHERE guild_id = ? AND user_id = ? AND category = ? AND status = 'abgelehnt' ORDER BY reviewed_at DESC LIMIT 1", g, userId, key);
  if (days && last && last.reviewed_at + days * 864e5 > now()) return { ok: false, reason: `Du kannst dich in diesem Bereich erst wieder ${util.ts(last.reviewed_at + days * 864e5, 'R')} bewerben.` };
  return { ok: true, form };
}

function modal(g, key, part) {
  const form = forms(g)[key];
  const qs = form.questions.slice(part * 5, part * 5 + 5);
  const total = Math.ceil(form.questions.length / 5);
  const m = new ModalBuilder().setCustomId(`app:submit:${key}:${part}`).setTitle(`${form.label}${total > 1 ? ` (${part + 1}/${total})` : ''}`.slice(0, 45));
  qs.forEach((q, i) => m.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId(`q${part * 5 + i}`).setLabel(util.truncate(q, 45)).setPlaceholder(util.truncate(q, 100))
      .setStyle(q.length > 30 || i > 1 ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(true).setMaxLength(1000),
  )));
  return m;
}

function reviewPayload(g, app) {
  const form = forms(g)[app.category] || { label: app.category, questions: [] };
  const answers = JSON.parse(app.answers);
  const notes = all('SELECT * FROM application_notes WHERE application_id = ? ORDER BY at', app.id);
  const statusText = { offen: '🟡 Offen', angenommen: '✅ Angenommen', abgelehnt: '❌ Abgelehnt' }[app.status];
  const embed = theme.base(g, app.status === 'angenommen' ? 'success' : app.status === 'abgelehnt' ? 'danger' : 'primary', `Bewerbung #${app.id}`)
    .setTitle(`${form.emoji || '📝'} Bewerbung – ${form.label}`)
    .setDescription(`**Bewerber:** <@${app.user_id}> (\`${app.user_id}\`)\n**Eingereicht:** ${util.ts(app.created_at)}\n**Status:** ${statusText}${app.reviewer_id ? ` von <@${app.reviewer_id}>` : ''}${app.reason ? `\n**Begründung:** ${util.truncate(app.reason, 300)}` : ''}`);
  answers.forEach((a, i) => { if (i < 20) embed.addFields({ name: util.truncate(`${i + 1}. ${a.q}`, 256), value: util.truncate(a.a || '–', 1024) }); });
  if (notes.length && embed.data.fields.length < 25) embed.addFields({ name: `${E.note} Team-Notizen`, value: notes.map((n) => `<@${n.author_id}>: ${util.truncate(n.note, 150)}`).join('\n').slice(0, 1024) });
  const done = app.status !== 'offen';
  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`app:accept:${app.id}`).setStyle(ButtonStyle.Success).setLabel('Annehmen').setEmoji('✅').setDisabled(done),
      new ButtonBuilder().setCustomId(`app:reject:${app.id}`).setStyle(ButtonStyle.Danger).setLabel('Ablehnen').setEmoji('✖️').setDisabled(done),
      new ButtonBuilder().setCustomId(`app:note:${app.id}`).setStyle(ButtonStyle.Secondary).setLabel('Notiz').setEmoji('📝'),
      new ButtonBuilder().setCustomId(`app:history:${app.id}`).setStyle(ButtonStyle.Secondary).setLabel('Verlauf').setEmoji('🗂️'),
    )],
  };
}

async function submit(client, g, user, key, answers) {
  const channelId = settings.channel(g, 'application');
  if (!channelId) return { ok: false, reason: 'Bewerbungen sind noch nicht eingerichtet (kein Auswertungskanal). Bitte wende dich an das Team.' };
  const id = run('INSERT INTO applications (guild_id, user_id, category, answers, status, created_at) VALUES (?,?,?,?,?,?)', g, user.id, key, JSON.stringify(answers), 'offen', now()).lastInsertRowid;
  const app = get(id);
  try {
    const ch = await client.channels.fetch(channelId);
    const msg = await ch.send(reviewPayload(g, app));
    run('UPDATE applications SET channel_id = ?, message_id = ? WHERE id = ?', ch.id, msg.id, id);
  } catch (err) {
    run('DELETE FROM applications WHERE id = ?', id);
    return { ok: false, reason: 'Deine Bewerbung konnte nicht übermittelt werden. Bitte versuche es später erneut.' };
  }
  await logger.discord(g, 'applicationLog', theme.base(g, 'primary', `Bewerbung #${id}`).setDescription(`📝 Neue Bewerbung von <@${user.id}> – **${forms(g)[key].label}**`), { event: 'application.submit', userId: user.id });
  user.send({ embeds: [theme.success(g, `Deine Bewerbung für **${forms(g)[key].label}** ist eingegangen. Wir melden uns per Privatnachricht, sobald sie geprüft wurde.`, '📝 Bewerbung eingegangen')] }).catch(() => {});
  return { ok: true, id };
}

async function decide(client, guild, app, reviewer, accept, reason) {
  const g = guild.id;
  const form = forms(g)[app.category] || { label: app.category };
  run('UPDATE applications SET status = ?, reviewer_id = ?, reason = ?, reviewed_at = ? WHERE id = ?', accept ? 'angenommen' : 'abgelehnt', reviewer.id, reason || null, now(), app.id);
  bumpActivity(g, reviewer.id, 'applications');
  const notes = [];
  if (accept) {
    const member = await guild.members.fetch(app.user_id).catch(() => null);
    if (!member) notes.push('Bewerber ist nicht mehr auf dem Server – keine Rollen vergeben.');
    else {
      if (form.role) {
        const role = guild.roles.cache.get(form.role);
        if (role && role.position < guild.members.me.roles.highest.position) await member.roles.add(role, `Bewerbung #${app.id} angenommen`).then(() => notes.push(`Rolle <@&${role.id}> vergeben.`)).catch((e) => notes.push(`Rolle konnte nicht vergeben werden: ${e.message}`));
        else notes.push('Die eingestellte Rolle existiert nicht oder steht über meiner Rolle.');
      }
      if (form.dept) {
        const dm = require('./departmentManager');
        const dept = dm.find(g, form.dept);
        const first = dept && dm.ranks(dept.id)[0];
        if (dept && first) {
          const r = await dm.addMember(guild, dept, app.user_id, first, reviewer.id);
          notes.push(r.ok ? `In **${dept.short}** als **${first.name}** aufgenommen.` : r.reason);
          if (r.ok) { await dm.updateRoster(client, g, dept.id); await dm.auditLog(g, `<@${app.user_id}> über Bewerbung #${app.id} in **${dept.short}** aufgenommen (durch <@${reviewer.id}>)`, reviewer.id, app.user_id, 'success'); }
        }
      }
    }
  }
  const fresh = get(app.id);
  try {
    const ch = await client.channels.fetch(app.channel_id);
    const msg = await ch.messages.fetch(app.message_id);
    await msg.edit(reviewPayload(g, fresh));
  } catch { /* Nachricht gelöscht */ }
  const user = await client.users.fetch(app.user_id).catch(() => null);
  let dm = true;
  try {
    await user.send({ embeds: [theme.base(g, accept ? 'success' : 'danger', `Bewerbung #${app.id}`).setTitle(accept ? '🎉 Bewerbung angenommen' : 'Bewerbung abgelehnt')
      .setDescription(accept ? `Herzlichen Glückwunsch! Deine Bewerbung für **${form.label}** wurde **angenommen**.${reason ? `\n\n**Nachricht vom Team:** ${reason}` : ''}\n\nWillkommen im Team!` : `Leider wurde deine Bewerbung für **${form.label}** **abgelehnt**.\n\n**Begründung:** ${reason || 'Keine Angabe'}\n\nDu kannst dich zu einem späteren Zeitpunkt erneut bewerben.`)] });
  } catch { dm = false; }
  await logger.discord(g, 'applicationLog', theme.base(g, accept ? 'success' : 'danger', `Bewerbung #${app.id}`)
    .setDescription(`${accept ? '✅ Angenommen' : '❌ Abgelehnt'}: <@${app.user_id}> – **${form.label}** von <@${reviewer.id}>${reason ? `\nBegründung: ${util.truncate(reason, 500)}` : ''}${notes.length ? `\n${notes.join('\n')}` : ''}`),
  { event: accept ? 'application.accept' : 'application.reject', userId: reviewer.id, targetId: app.user_id });
  return { notes, dm };
}

module.exports = { DEFAULT_FORMS, forms, saveForm, get, panelPayload, canApply, modal, reviewPayload, submit, decide };
