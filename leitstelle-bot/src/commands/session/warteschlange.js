const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const theme = require('../../core/theme');
const util = require('../../core/util');
const { run } = require('../../core/database');
const panels = require('../../systems/panels');
const q = require('../../systems/queueManager');

const data = new SlashCommandBuilder()
  .setName('warteschlange')
  .setDescription('Discord-Warteschlange für Sessions')
  .addSubcommand((s) => s.setName('panel').setDescription('Erstellt das Warteschlangen-Panel in diesem Kanal'))
  .addSubcommand((s) => s.setName('liste').setDescription('Zeigt alle Wartenden'))
  .addSubcommand((s) => s.setName('aufrufen').setDescription('Ruft die nächste Person (oder eine bestimmte) auf')
    .addUserOption((o) => o.setName('nutzer').setDescription('Bestimmte Person aufrufen')))
  .addSubcommand((s) => s.setName('entfernen').setDescription('Entfernt eine Person aus der Warteschlange')
    .addUserOption((o) => o.setName('nutzer').setDescription('Person').setRequired(true)))
  .addSubcommand((s) => s.setName('leeren').setDescription('Leert die gesamte Warteschlange'))
  .addSubcommand((s) => s.setName('stats').setDescription('Statistiken der Warteschlange'));

const permsMap = { panel: ['management'], liste: ['everyone'], aufrufen: ['host', 'moderation', 'support'], entfernen: ['host', 'moderation', 'support'], leeren: ['host', 'management'], stats: ['host', 'moderation', 'support'] };

async function execute(interaction) {
  const g = interaction.guildId;
  const sub = interaction.options.getSubcommand();
  switch (sub) {
    case 'panel': {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const msg = await panels.upsert(interaction.client, g, 'queue', '', interaction.channelId, q.panelPayload(g)).catch(() => null);
      return interaction.editReply({ embeds: [msg ? theme.success(g, 'Das Warteschlangen-Panel wurde erstellt. Ein älteres Panel wurde automatisch entfernt.') : theme.error(g, 'Ich kann in diesem Kanal nicht schreiben.')] });
    }
    case 'liste': {
      const list = q.entries(g);
      return theme.reply(interaction, { embeds: [theme.base(g, 'primary').setTitle('⏳ Warteschlange').setDescription(list.length ? list.slice(0, 40).map((e, i) => `\`${i + 1}.\` <@${e.user_id}> ${theme.E.dot} ${util.ts(e.joined_at, 'R')}`).join('\n') : 'Niemand wartet.')] });
    }
    case 'aufrufen': {
      const target = interaction.options.getUser('nutzer')?.id || q.entries(g)[0]?.user_id;
      if (!target) return theme.replyError(interaction, 'Die Warteschlange ist leer.');
      const res = await q.call(interaction.client, g, target, interaction.user.id);
      return res.ok ? theme.replySuccess(interaction, `<@${target}> wurde aufgerufen (Wartezeit: ${util.duration(res.wait)}).${res.dm ? '' : '\n⚠️ Privatnachricht nicht möglich – die Person wurde im Kanal erwähnt.'}`) : theme.replyError(interaction, res.reason);
    }
    case 'entfernen': {
      const u = interaction.options.getUser('nutzer');
      const res = q.leave(g, u.id, 'entfernt', interaction.user.id);
      await q.refresh(interaction.client, g);
      return res.ok ? theme.replySuccess(interaction, `<@${u.id}> wurde aus der Warteschlange entfernt.`) : theme.replyError(interaction, 'Diese Person steht nicht in der Warteschlange.');
    }
    case 'leeren': {
      const n = q.entries(g).length;
      for (const e of q.entries(g)) q.leave(g, e.user_id, 'entfernt', interaction.user.id);
      run('DELETE FROM queue_entries WHERE guild_id = ?', g);
      await q.refresh(interaction.client, g);
      return theme.replySuccess(interaction, `Die Warteschlange wurde geleert (${n} Personen).`);
    }
    case 'stats': {
      const s = q.stats(g, Date.now() - 30 * 864e5);
      return theme.reply(interaction, { embeds: [theme.base(g, 'primary', 'Letzte 30 Tage').setTitle('📊 Warteschlangen-Statistik').addFields(
        { name: 'Aktuell wartend', value: String(s.waiting), inline: true },
        { name: 'Beigetreten', value: String(s.joined), inline: true },
        { name: 'Aufgerufen', value: String(s.called), inline: true },
        { name: 'Selbst verlassen', value: String(s.left), inline: true },
        { name: 'Ø Wartezeit bis Aufruf', value: s.avgWait ? util.duration(s.avgWait) : '–', inline: true },
      )] });
    }
    default: return theme.replyError(interaction, 'Unbekannter Unterbefehl.');
  }
}

module.exports = { data, perms: permsMap, execute };
