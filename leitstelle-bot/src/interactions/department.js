// Buttons des Abteilungssystems (Löschen, Trainings)
const { MessageFlags } = require('discord.js');
const theme = require('../core/theme');
const perms = require('../core/permissions');
const { one, all, run, tx, now } = require('../core/database');
const dm = require('../systems/departmentManager');
const panels = require('../systems/panels');

async function handle(interaction, action, args) {
  const g = interaction.guildId;

  if (action === 'cancel') return interaction.update({ embeds: [theme.info(g, 'Abgebrochen.')], components: [] });

  if (action === 'delete') {
    if (!perms.check(interaction.member, 'department.delete').ok) return theme.replyError(interaction, 'Dafür fehlt dir die Berechtigung.');
    const dept = dm.get(g, args[0]);
    if (!dept) return interaction.update({ embeds: [theme.error(g, 'Diese Abteilung existiert nicht mehr.')], components: [] });
    await interaction.update({ embeds: [theme.info(g, '⏳ Abteilung wird gelöscht und Rollen werden entfernt …')], components: [] });
    const roleIds = [dept.role_id, ...dm.ranks(dept.id).map((r) => r.role_id)].filter(Boolean);
    const memberIds = all('SELECT user_id FROM department_members WHERE department_id = ?', dept.id).map((m) => m.user_id);
    for (const uid of memberIds) {
      await dm.applyRoles(interaction.guild, uid, [], roleIds);
      dm.history(g, dept.id, uid, 'entfernt', null, null, interaction.user.id, 'Abteilung gelöscht');
    }
    await panels.remove(interaction.client, g, 'roster', dept.id);
    tx(() => run('DELETE FROM departments WHERE id = ?', dept.id))();
    await dm.auditLog(g, `Abteilung **${dept.short} – ${dept.name}** gelöscht von <@${interaction.user.id}> (${memberIds.length} Mitglieder)`, interaction.user.id, null, 'danger');
    return interaction.editReply({ embeds: [theme.success(g, `**${dept.short} – ${dept.name}** wurde gelöscht.`)] });
  }

  if (['tjoin', 'tdone', 'tcancel'].includes(action)) {
    const t = one('SELECT * FROM department_trainings WHERE id = ? AND guild_id = ?', Number(args[0]), g);
    if (!t) return theme.replyError(interaction, 'Dieses Training existiert nicht mehr.');
    if (t.status !== 'offen') return theme.replyError(interaction, 'Dieses Training ist bereits beendet.');
    const { trainingPayload } = require('../commands/department/department');
    if (action === 'tjoin') {
      const exists = one('SELECT 1 FROM training_attendance WHERE training_id = ? AND user_id = ?', t.id, interaction.user.id);
      if (exists) run('DELETE FROM training_attendance WHERE training_id = ? AND user_id = ?', t.id, interaction.user.id);
      else run('INSERT INTO training_attendance (training_id, user_id, at) VALUES (?,?,?)', t.id, interaction.user.id, now());
      await interaction.update(trainingPayload(g, t));
      return interaction.followUp({ embeds: [theme.success(g, exists ? 'Du hast dich vom Training abgemeldet.' : 'Du bist für das Training angemeldet.')], flags: MessageFlags.Ephemeral });
    }
    const dept = dm.get(g, t.department_id);
    const allowed = t.host_id === interaction.user.id || (dept && dm.authority(interaction.member, dept).ok);
    if (!allowed) return theme.replyError(interaction, 'Nur der Ausbilder oder die Abteilungsleitung kann das Training beenden.');
    run('UPDATE department_trainings SET status = ? WHERE id = ?', action === 'tdone' ? 'abgeschlossen' : 'abgesagt', t.id);
    if (action === 'tcancel') run('DELETE FROM training_attendance WHERE training_id = ?', t.id);
    await interaction.update(trainingPayload(g, one('SELECT * FROM department_trainings WHERE id = ?', t.id)));
    const count = one('SELECT COUNT(*) AS n FROM training_attendance WHERE training_id = ?', t.id).n;
    await dm.auditLog(g, `Training **${t.title}** ${action === 'tdone' ? `abgeschlossen (${count} Teilnehmer)` : 'abgesagt'} von <@${interaction.user.id}>`, interaction.user.id);
    return null;
  }
}

module.exports = { prefix: 'dept', handle };
