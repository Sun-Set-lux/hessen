// Buttons und Menü der Discord-Warteschlange
const theme = require('../core/theme');
const perms = require('../core/permissions');
const util = require('../core/util');
const q = require('../systems/queueManager');

async function handle(interaction, action) {
  const g = interaction.guildId;
  const client = interaction.client;
  if (action === 'join') {
    const res = q.join(g, interaction.user.id);
    if (!res.ok) return theme.replyError(interaction, res.reason);
    await theme.replySuccess(interaction, `Du bist jetzt auf **Platz ${res.position}** der Warteschlange. Wir benachrichtigen dich per Privatnachricht, sobald du dran bist.`);
    await q.notifyTop(client, g);
    return q.refresh(client, g);
  }
  if (action === 'leave') {
    const res = q.leave(g, interaction.user.id);
    if (!res.ok) return theme.replyError(interaction, 'Du stehst nicht in der Warteschlange.');
    await theme.replySuccess(interaction, 'Du hast die Warteschlange verlassen.');
    await q.notifyTop(client, g);
    return q.refresh(client, g);
  }
  if (action === 'pos') {
    const p = q.position(g, interaction.user.id);
    return p ? theme.reply(interaction, { embeds: [theme.info(g, `Du bist auf **Platz ${p}** von ${q.entries(g).length}.`)] }) : theme.replyError(interaction, 'Du stehst nicht in der Warteschlange.');
  }
  if (action === 'next' || action === 'manage') {
    if (!perms.check(interaction.member, 'warteschlange.aufrufen').ok) return theme.replyError(interaction, 'Nur das Team kann die Warteschlange verwalten.');
    let [op, userId] = action === 'next' ? ['call', q.entries(g)[0]?.user_id] : interaction.values[0].split(':');
    if (!userId) return theme.replyError(interaction, 'Die Warteschlange ist leer.');
    if (op === 'call') {
      const res = await q.call(client, g, userId, interaction.user.id);
      return res.ok ? theme.replySuccess(interaction, `<@${userId}> wurde aufgerufen (Wartezeit: ${util.duration(res.wait)}).`) : theme.replyError(interaction, res.reason);
    }
    const res = q.leave(g, userId, 'entfernt', interaction.user.id);
    await q.refresh(client, g);
    return res.ok ? theme.replySuccess(interaction, `<@${userId}> wurde entfernt.`) : theme.replyError(interaction, 'Diese Person steht nicht mehr in der Warteschlange.');
  }
}

module.exports = { prefix: 'queue', handle };
