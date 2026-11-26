const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const theme = require('../../core/theme');
const util = require('../../core/util');
const { all, one } = require('../../core/database');
const am = require('../../systems/applicationManager');
const panels = require('../../systems/panels');

const { E } = theme;
const formOpt = (o) => o.setName('bereich').setDescription('Bewerbungsbereich').setRequired(true).setAutocomplete(true);

const data = new SlashCommandBuilder()
  .setName('bewerbung')
  .setDescription('Bewerbungssystem')
  .addSubcommand((s) => s.setName('panel').setDescription('Sendet das Bewerbungs-Panel in diesen Kanal'))
  .addSubcommand((s) => s.setName('fragen').setDescription('Bearbeitet die Fragen eines Bereichs (bis zu 10)').addStringOption(formOpt))
  .addSubcommand((s) => s.setName('einstellungen').setDescription('Rolle, Abteilung und Status eines Bereichs')
    .addStringOption(formOpt)
    .addBooleanOption((o) => o.setName('offen').setDescription('Bewerbungen annehmen?'))
    .addRoleOption((o) => o.setName('rolle').setDescription('Rolle bei Annahme'))
    .addStringOption((o) => o.setName('abteilung').setDescription('Abteilungskürzel für automatische Aufnahme (z. B. LSPD, „-“ = keine)').setMaxLength(10))
    .addBooleanOption((o) => o.setName('rolle_entfernen').setDescription('Eingestellte Rolle entfernen?')))
  .addSubcommand((s) => s.setName('erstellen').setDescription('Erstellt einen neuen Bewerbungsbereich')
    .addStringOption((o) => o.setName('name').setDescription('Anzeigename').setRequired(true).setMaxLength(50))
    .addStringOption((o) => o.setName('emoji').setDescription('Emoji').setMaxLength(10)))
  .addSubcommand((s) => s.setName('verlauf').setDescription('Bewerbungsverlauf einer Person')
    .addUserOption((o) => o.setName('nutzer').setDescription('Person').setRequired(true)))
  .addSubcommand((s) => s.setName('status').setDescription('Zeigt den Status deiner eigenen Bewerbungen'))
  .addSubcommand((s) => s.setName('statistik').setDescription('Statistiken zu Bewerbungen'));

const permsMap = { panel: ['management'], fragen: ['management'], einstellungen: ['management'], erstellen: ['management'], verlauf: ['support', 'moderation', 'deptlead'], status: ['everyone'], statistik: ['support', 'moderation', 'deptlead'] };

async function execute(interaction) {
  const g = interaction.guildId;
  const sub = interaction.options.getSubcommand();
  const o = interaction.options;
  const key = o.getString('bereich');
  const forms = am.forms(g);
  if (key && !forms[key]) return theme.replyError(interaction, 'Diesen Bewerbungsbereich gibt es nicht.');

  switch (sub) {
    case 'panel': {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const msg = await panels.upsert(interaction.client, g, 'applications', '', interaction.channelId, am.panelPayload(g)).catch(() => null);
      return interaction.editReply({ embeds: [msg ? theme.success(g, 'Das Bewerbungs-Panel wurde gesendet.\n-# Eingehende Bewerbungen landen im Kanal **Bewerbungs-Auswertung** (`/setchannel`).') : theme.error(g, 'Ich kann in diesem Kanal nicht schreiben.')] });
    }
    case 'fragen': {
      const m = new ModalBuilder().setCustomId(`app:questions:${key}`).setTitle(`Fragen – ${forms[key].label}`.slice(0, 45)).addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('fragen').setLabel('Eine Frage pro Zeile (max. 10, je 100 Zeichen)').setStyle(TextInputStyle.Paragraph)
          .setValue(forms[key].questions.join('\n')).setRequired(true).setMaxLength(1100)),
      );
      return interaction.showModal(m);
    }
    case 'einstellungen': {
      const patch = {}; const changes = [];
      if (o.getBoolean('offen') !== null) { patch.open = o.getBoolean('offen'); changes.push(`Status: **${patch.open ? 'offen' : 'geschlossen'}**`); }
      if (o.getRole('rolle')) { patch.role = o.getRole('rolle').id; changes.push(`Rolle bei Annahme: <@&${patch.role}>`); }
      if (o.getBoolean('rolle_entfernen')) { patch.role = null; changes.push('Rolle entfernt'); }
      const dept = o.getString('abteilung');
      if (dept) {
        if (dept === '-') { patch.dept = null; changes.push('Keine automatische Abteilungsaufnahme'); }
        else {
          const d = require('../../systems/departmentManager').find(g, dept);
          if (!d) return theme.replyError(interaction, 'Diese Abteilung gibt es nicht. Nutze das Kürzel, z. B. `LSPD`.');
          patch.dept = d.short; changes.push(`Automatische Aufnahme in **${d.short}**`);
        }
      }
      if (!changes.length) {
        const f = forms[key];
        return theme.reply(interaction, { embeds: [theme.info(g, `**Status:** ${f.open ? 'offen' : 'geschlossen'}\n**Rolle bei Annahme:** ${f.role ? `<@&${f.role}>` : '–'}\n**Abteilung:** ${f.dept || '–'}\n**Fragen:** ${f.questions.length}`, `${f.emoji || '📝'} ${f.label}`)] });
      }
      am.saveForm(g, key, patch);
      await refreshPanel(interaction);
      return theme.replySuccess(interaction, `**${forms[key].label}** aktualisiert:\n${changes.join('\n')}`);
    }
    case 'erstellen': {
      const name = o.getString('name');
      const k = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '').slice(0, 20);
      if (!k || forms[k]) return theme.replyError(interaction, 'Ein Bereich mit diesem Namen existiert bereits.');
      if (Object.keys(forms).length >= 25) return theme.replyError(interaction, 'Es sind höchstens 25 Bewerbungsbereiche möglich.');
      am.saveForm(g, k, { label: name, emoji: o.getString('emoji') || '📄', questions: [], open: false });
      return theme.replySuccess(interaction, `Der Bereich **${util.clean(name)}** wurde erstellt. Lege jetzt mit \`/bewerbung fragen\` die Fragen fest und öffne ihn mit \`/bewerbung einstellungen offen:true\`.`);
    }
    case 'verlauf':
    case 'status': {
      const u = sub === 'status' ? interaction.user : o.getUser('nutzer');
      const rows = all('SELECT * FROM applications WHERE guild_id = ? AND user_id = ? ORDER BY id DESC LIMIT 15', g, u.id);
      const icon = { offen: '🟡', angenommen: '✅', abgelehnt: '❌' };
      return theme.reply(interaction, { embeds: [theme.base(g, 'primary').setTitle(`📝 Bewerbungen – ${u.username}`)
        .setDescription(rows.length ? rows.map((r) => `${icon[r.status]} **#${r.id}** ${forms[r.category]?.label || r.category} ${E.dot} ${util.ts(r.created_at, 'd')}${r.reviewer_id && sub === 'verlauf' ? ` ${E.dot} <@${r.reviewer_id}>` : ''}${r.reason ? `\n-# ${util.truncate(r.reason, 100)}` : ''}`).join('\n') : 'Keine Bewerbungen vorhanden.')] });
    }
    case 'statistik': {
      const rows = all('SELECT category, status, COUNT(*) AS n FROM applications WHERE guild_id = ? GROUP BY category, status', g);
      const by = {};
      for (const r of rows) (by[r.category] ||= { offen: 0, angenommen: 0, abgelehnt: 0 })[r.status] = r.n;
      const top = all("SELECT reviewer_id, COUNT(*) AS n FROM applications WHERE guild_id = ? AND reviewer_id IS NOT NULL GROUP BY reviewer_id ORDER BY n DESC LIMIT 5", g);
      const avg = one('SELECT AVG(reviewed_at - created_at) AS a FROM applications WHERE guild_id = ? AND reviewed_at IS NOT NULL', g).a;
      return theme.reply(interaction, { embeds: [theme.base(g, 'primary').setTitle(`${E.stats} Bewerbungsstatistik`).addFields(
        { name: 'Nach Bereich (offen / angenommen / abgelehnt)', value: Object.entries(by).map(([k, v]) => `${forms[k]?.label || k}: ${v.offen} / ${v.angenommen} / ${v.abgelehnt}`).join('\n') || 'Noch keine Bewerbungen' },
        { name: 'Ø Bearbeitungszeit', value: avg ? util.duration(avg) : '–', inline: true },
        { name: 'Aktivste Prüfer', value: top.map((t) => `<@${t.reviewer_id}> – ${t.n}`).join('\n') || '–', inline: true },
      )] });
    }
    default: return theme.replyError(interaction, 'Unbekannter Unterbefehl.');
  }
}

async function refreshPanel(interaction) {
  const p = panels.getPanel(interaction.guildId, 'applications');
  if (p) await panels.upsert(interaction.client, interaction.guildId, 'applications', '', p.channel_id, am.panelPayload(interaction.guildId)).catch(() => {});
}

async function autocomplete(interaction) {
  const q = interaction.options.getFocused().toLowerCase();
  return interaction.respond(Object.entries(am.forms(interaction.guildId)).filter(([k, f]) => k.includes(q) || f.label.toLowerCase().includes(q)).slice(0, 25).map(([k, f]) => ({ name: f.label, value: k })));
}

module.exports = { data, perms: permsMap, execute, autocomplete, refreshPanel };
