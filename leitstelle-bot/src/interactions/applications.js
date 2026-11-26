// Bewerbungsformulare und Prüfung
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const theme = require('../core/theme');
const perms = require('../core/permissions');
const util = require('../core/util');
const { one, all, run, now } = require('../core/database');
const am = require('../systems/applicationManager');

const REVIEW_GROUPS = ['support', 'moderation', 'deptlead'];

function canReview(member, app) {
  if (perms.inGroup(member, 'management')) return true;
  const form = am.forms(member.guild.id)[app.category];
  // Abteilungsbewerbungen: Leitung der jeweiligen Abteilung; Team-Bewerbungen: Team
  if (form?.dept) {
    const dm = require('../systems/departmentManager');
    const dept = dm.find(member.guild.id, form.dept);
    return !!dept && dm.authority(member, dept).ok;
  }
  return REVIEW_GROUPS.some((g) => perms.groupsOf(member).has(g));
}

async function handle(interaction, action, args) {
  const g = interaction.guildId;

  if (action === 'pick') {
    const key = interaction.values[0];
    const check = am.canApply(g, interaction.user.id, key);
    if (!check.ok) return theme.replyError(interaction, check.reason);
    run('DELETE FROM application_drafts WHERE guild_id = ? AND user_id = ?', g, interaction.user.id);
    return interaction.showModal(am.modal(g, key, 0));
  }

  if (action === 'continue') {
    const [key, part] = args;
    const draft = one('SELECT * FROM application_drafts WHERE guild_id = ? AND user_id = ? AND category = ?', g, interaction.user.id, key);
    if (!draft) return theme.replyError(interaction, 'Dein Entwurf ist abgelaufen. Bitte beginne die Bewerbung erneut.');
    return interaction.showModal(am.modal(g, key, Number(part)));
  }

  if (action === 'submit') {
    const [key, partStr] = args;
    const part = Number(partStr);
    const form = am.forms(g)[key];
    if (!form) return theme.replyError(interaction, 'Diese Bewerbung existiert nicht mehr.');
    const check = am.canApply(g, interaction.user.id, key);
    if (!check.ok) return theme.replyError(interaction, check.reason);
    const draft = one('SELECT * FROM application_drafts WHERE guild_id = ? AND user_id = ? AND category = ?', g, interaction.user.id, key);
    const answers = part === 0 || !draft ? [] : JSON.parse(draft.answers);
    form.questions.slice(part * 5, part * 5 + 5).forEach((q, i) => {
      answers[part * 5 + i] = { q, a: interaction.fields.getTextInputValue(`q${part * 5 + i}`) };
    });
    const totalParts = Math.ceil(form.questions.length / 5);
    if (part + 1 < totalParts) {
      run(`INSERT INTO application_drafts (guild_id, user_id, category, answers, updated_at) VALUES (?,?,?,?,?)
           ON CONFLICT(guild_id, user_id) DO UPDATE SET category = excluded.category, answers = excluded.answers, updated_at = excluded.updated_at`, g, interaction.user.id, key, JSON.stringify(answers), now());
      return interaction.reply({
        embeds: [theme.info(g, `Teil ${part + 1} von ${totalParts} gespeichert. Klicke auf **Weiter**, um fortzufahren.`)],
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`app:continue:${key}:${part + 1}`).setStyle(ButtonStyle.Primary).setLabel(`Weiter zu Teil ${part + 2}`))],
        flags: MessageFlags.Ephemeral,
      });
    }
    run('DELETE FROM application_drafts WHERE guild_id = ? AND user_id = ?', g, interaction.user.id);
    if (!util.lock(`app-submit:${interaction.user.id}:${key}`, 10000)) return theme.replyError(interaction, 'Deine Bewerbung wird bereits übermittelt.');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const res = await am.submit(interaction.client, g, interaction.user, key, answers.filter(Boolean));
    return interaction.editReply({ embeds: [res.ok ? theme.success(g, `Deine Bewerbung für **${form.label}** wurde erfolgreich eingereicht (#${res.id}). Du erhältst das Ergebnis per Privatnachricht.`) : theme.error(g, res.reason)] });
  }

  if (action === 'questions') {
    if (!perms.inGroup(interaction.member, 'management')) return theme.replyError(interaction, 'Dafür fehlt dir die Berechtigung.');
    const qs = interaction.fields.getTextInputValue('fragen').split('\n').map((q) => q.trim()).filter(Boolean);
    if (!qs.length || qs.length > 10) return theme.replyError(interaction, 'Bitte gib zwischen 1 und 10 Fragen an (eine pro Zeile).');
    if (qs.some((q) => q.length > 100)) return theme.replyError(interaction, 'Jede Frage darf höchstens 100 Zeichen lang sein.');
    am.saveForm(g, args[0], { questions: qs });
    await require('../commands/applications/bewerbung').refreshPanel(interaction);
    return theme.replySuccess(interaction, `${qs.length} Fragen gespeichert.${qs.some((q) => q.length > 45) ? '\n-# Hinweis: Discord zeigt im Formular nur 45 Zeichen als Überschrift; die vollständige Frage steht im Eingabefeld.' : ''}`);
  }

  // ---- Prüfung ----
  const app = am.get(args[0]);
  if (!app) return theme.replyError(interaction, 'Diese Bewerbung existiert nicht mehr.');
  if (!canReview(interaction.member, app)) return theme.replyError(interaction, 'Du darfst diese Bewerbung nicht bearbeiten.');

  if (action === 'history') {
    const rows = all('SELECT * FROM applications WHERE guild_id = ? AND user_id = ? ORDER BY id DESC LIMIT 10', g, app.user_id);
    const forms = am.forms(g);
    return theme.reply(interaction, { embeds: [theme.base(g, 'primary').setTitle('🗂️ Bewerbungsverlauf').setDescription(rows.map((r) => `**#${r.id}** ${forms[r.category]?.label || r.category} ${theme.E.dot} ${r.status} ${theme.E.dot} ${util.ts(r.created_at, 'd')}`).join('\n'))] });
  }
  if (action === 'note') {
    return interaction.showModal(new ModalBuilder().setCustomId(`app:notesave:${app.id}`).setTitle('Team-Notiz').addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('text').setLabel('Notiz (nur für das Team)').setStyle(TextInputStyle.Paragraph).setMaxLength(500)),
    ));
  }
  if (action === 'notesave') {
    run('INSERT INTO application_notes (application_id, author_id, note, at) VALUES (?,?,?,?)', app.id, interaction.user.id, interaction.fields.getTextInputValue('text'), now());
    await interaction.deferUpdate().catch(() => {});
    await interaction.message?.edit(am.reviewPayload(g, am.get(app.id))).catch(() => {});
    return interaction.followUp({ embeds: [theme.success(g, 'Notiz gespeichert.')], flags: MessageFlags.Ephemeral });
  }
  if (app.status !== 'offen') return theme.replyError(interaction, 'Diese Bewerbung wurde bereits bearbeitet.');
  if (app.user_id === interaction.user.id) return theme.replyError(interaction, 'Du kannst deine eigene Bewerbung nicht bearbeiten.');
  if (action === 'accept' || action === 'reject') {
    return interaction.showModal(new ModalBuilder().setCustomId(`app:${action}save:${app.id}`).setTitle(action === 'accept' ? 'Bewerbung annehmen' : 'Bewerbung ablehnen').addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('grund').setLabel(action === 'accept' ? 'Nachricht an den Bewerber (optional)' : 'Begründung (wird mitgeteilt)')
        .setStyle(TextInputStyle.Paragraph).setRequired(action === 'reject').setMaxLength(800)),
    ));
  }
  if (action === 'acceptsave' || action === 'rejectsave') {
    if (!util.lock(`app-decide:${app.id}`, 15000)) return theme.replyError(interaction, 'Diese Bewerbung wird gerade bearbeitet.');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const res = await am.decide(interaction.client, interaction.guild, app, interaction.user, action === 'acceptsave', interaction.fields.getTextInputValue('grund').trim() || null);
    return interaction.editReply({ embeds: [theme.success(g, `Bewerbung #${app.id} wurde ${action === 'acceptsave' ? 'angenommen' : 'abgelehnt'}.${res.notes.length ? `\n${res.notes.join('\n')}` : ''}${res.dm ? '' : '\n⚠️ Der Bewerber konnte nicht per DM benachrichtigt werden.'}`)] });
  }
}

module.exports = { prefix: 'app', handle };
