// Community: Vorschläge, Umfragen, Gewinnspiele, Rollen-Panels, Info-Panels
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { one, all, run, now } = require('../core/database');
const theme = require('../core/theme');
const util = require('../core/util');
const logger = require('../core/logger');
const jobs = require('./jobs');

const { E } = theme;

// ---------- Vorschläge ----------
const SUGG_STATUS = { offen: { t: '🗳️ Offen', c: 'primary' }, pruefung: { t: '🔎 In Prüfung', c: 'warning' }, angenommen: { t: '✅ Angenommen', c: 'success' }, abgelehnt: { t: '❌ Abgelehnt', c: 'danger' }, umgesetzt: { t: '🚀 Umgesetzt', c: 'success' } };

function suggestionPayload(g, s, author) {
  const up = one('SELECT COUNT(*) AS n FROM suggestion_votes WHERE suggestion_id = ? AND vote = 1', s.id).n;
  const down = one('SELECT COUNT(*) AS n FROM suggestion_votes WHERE suggestion_id = ? AND vote = -1', s.id).n;
  const total = up + down;
  const bar = total ? `${'🟩'.repeat(Math.round((up / total) * 10))}${'🟥'.repeat(10 - Math.round((up / total) * 10))}` : '⬜'.repeat(10);
  const st = SUGG_STATUS[s.status] || SUGG_STATUS.offen;
  const embed = theme.base(g, st.c, `Vorschlag #${s.id}`).setTitle(`💡 Vorschlag #${s.id}`)
    .setDescription(s.content)
    .addFields(
      { name: 'Status', value: st.t, inline: true },
      { name: 'Stimmen', value: `👍 ${up} ${E.dot} 👎 ${down}`, inline: true },
      { name: 'Eingereicht von', value: `<@${s.user_id}>`, inline: true },
      { name: 'Zustimmung', value: `${bar} ${total ? Math.round((up / total) * 100) : 0} %` },
    );
  if (author) embed.setAuthor({ name: author.username, iconURL: author.displayAvatarURL() });
  if (s.staff_reason) embed.addFields({ name: `Antwort des Teams${s.staff_id ? ` (${'<@' + s.staff_id + '>'})` : ''}`, value: s.staff_reason });
  const closed = ['angenommen', 'abgelehnt', 'umgesetzt'].includes(s.status);
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`sugg:up:${s.id}`).setStyle(ButtonStyle.Success).setEmoji('👍').setLabel(String(up)).setDisabled(closed),
    new ButtonBuilder().setCustomId(`sugg:down:${s.id}`).setStyle(ButtonStyle.Danger).setEmoji('👎').setLabel(String(down)).setDisabled(closed),
  )] };
}

// ---------- Umfragen ----------
const NUM = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
function pollPayload(g, p) {
  const opts = JSON.parse(p.options);
  const counts = opts.map((_, i) => one('SELECT COUNT(*) AS n FROM poll_votes WHERE poll_id = ? AND option_index = ?', p.id, i).n);
  const voters = one('SELECT COUNT(DISTINCT user_id) AS n FROM poll_votes WHERE poll_id = ?', p.id).n;
  const total = counts.reduce((a, b) => a + b, 0);
  const max = Math.max(...counts);
  const lines = opts.map((o, i) => {
    const pct = total ? Math.round((counts[i] / total) * 100) : 0;
    return `${NUM[i]} **${o}**${p.ended && counts[i] === max && max > 0 ? ' 🏆' : ''}\n${'█'.repeat(Math.round(pct / 10))}${'░'.repeat(10 - Math.round(pct / 10))} ${pct} % (${counts[i]})`;
  });
  const embed = theme.base(g, p.ended ? 'neutral' : 'primary', `Umfrage #${p.id}`).setTitle(`📊 ${p.question}`)
    .setDescription(lines.join('\n\n'))
    .addFields(
      { name: 'Teilnehmer', value: String(voters), inline: true },
      { name: p.ended ? 'Beendet' : 'Endet', value: p.ends_at ? util.ts(p.ends_at, 'R') : 'Manuell', inline: true },
      { name: 'Modus', value: p.multi ? 'Mehrfachauswahl' : 'Einfachauswahl', inline: true },
    );
  const rows = [];
  if (!p.ended) {
    util.chunk(opts.map((o, i) => new ButtonBuilder().setCustomId(`poll:vote:${p.id}:${i}`).setStyle(ButtonStyle.Secondary).setEmoji(NUM[i]).setLabel(util.truncate(o, 70))), 5)
      .forEach((c) => rows.push(new ActionRowBuilder().addComponents(c)));
    rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`poll:end:${p.id}`).setStyle(ButtonStyle.Danger).setLabel('Umfrage beenden')));
  }
  return { embeds: [embed], components: rows.slice(0, 5) };
}

async function endPoll(client, p) {
  run('UPDATE polls SET ended = 1 WHERE id = ?', p.id);
  const fresh = one('SELECT * FROM polls WHERE id = ?', p.id);
  try { const ch = await client.channels.fetch(p.channel_id); const msg = await ch.messages.fetch(p.message_id); await msg.edit(pollPayload(p.guild_id, fresh)); } catch { /* gelöscht */ }
}

// ---------- Gewinnspiele ----------
function giveawayPayload(g, gw) {
  const entries = one('SELECT COUNT(*) AS n FROM giveaway_entries WHERE giveaway_id = ?', gw.id).n;
  const winners = gw.winner_ids ? JSON.parse(gw.winner_ids) : [];
  const embed = theme.base(g, gw.ended ? 'neutral' : 'success', `Gewinnspiel #${gw.id}`).setTitle(`🎉 ${gw.prize}`)
    .setDescription(gw.ended
      ? `**Gewinner:** ${winners.length ? winners.map((w) => `<@${w}>`).join(', ') : 'Keine gültigen Teilnehmer'}`
      : `Klicke auf **Teilnehmen**, um mitzumachen!${gw.required_role ? `\nVoraussetzung: <@&${gw.required_role}>` : ''}`)
    .addFields(
      { name: gw.ended ? 'Beendet' : 'Endet', value: `${util.ts(gw.ends_at)} (${util.ts(gw.ends_at, 'R')})`, inline: true },
      { name: 'Gewinner', value: String(gw.winners), inline: true },
      { name: 'Teilnehmer', value: String(entries), inline: true },
      { name: 'Veranstaltet von', value: `<@${gw.host_id}>`, inline: true },
    );
  return { embeds: [embed], components: gw.ended ? [] : [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gw:enter:${gw.id}`).setStyle(ButtonStyle.Success).setEmoji('🎉').setLabel('Teilnehmen'))] };
}

function draw(gwId, count, exclude = []) {
  const pool = all('SELECT user_id FROM giveaway_entries WHERE giveaway_id = ?', gwId).map((r) => r.user_id).filter((u) => !exclude.includes(u));
  const out = [];
  while (pool.length && out.length < count) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

async function endGiveaway(client, gw, { reroll = false } = {}) {
  const winners = draw(gw.id, reroll ? 1 : gw.winners, reroll ? JSON.parse(gw.winner_ids || '[]') : []);
  const all_ = reroll ? [...JSON.parse(gw.winner_ids || '[]'), ...winners] : winners;
  run('UPDATE giveaways SET ended = 1, winner_ids = ? WHERE id = ?', JSON.stringify(all_), gw.id);
  const fresh = one('SELECT * FROM giveaways WHERE id = ?', gw.id);
  try {
    const ch = await client.channels.fetch(gw.channel_id);
    const msg = await ch.messages.fetch(gw.message_id);
    await msg.edit(giveawayPayload(gw.guild_id, fresh));
    await msg.reply({ content: winners.length ? `🎉 Herzlichen Glückwunsch ${winners.map((w) => `<@${w}>`).join(', ')}! Ihr habt **${gw.prize}** gewonnen!${reroll ? ' (Neu ausgelost)' : ''}` : `Für **${gw.prize}** gab es leider keine gültigen Teilnehmer.`, allowedMentions: { users: winners } });
  } catch { /* gelöscht */ }
  await logger.discord(gw.guild_id, 'log', theme.base(gw.guild_id, 'neutral', `Gewinnspiel #${gw.id}`).setDescription(`🎉 Gewinnspiel **${gw.prize}** ${reroll ? 'neu ausgelost' : 'beendet'}: ${winners.map((w) => `<@${w}>`).join(', ') || 'keine Gewinner'}`), { event: 'giveaway.end' });
  return winners;
}

// ---------- Rollen-Panels ----------
function rolePanelPayload(g, panel) {
  const roles = all('SELECT * FROM role_panel_roles WHERE panel_id = ?', panel.id);
  const embed = theme.base(g, 'primary', `Rollen-Panel #${panel.id}`).setTitle(`🎭 ${panel.title}`)
    .setDescription(`${panel.description || 'Klicke auf einen Button, um dir die Rolle zu geben oder sie wieder zu entfernen.'}\n\n${roles.map((r) => `${r.emoji || '▫️'} <@&${r.role_id}> – ${r.label}`).join('\n')}`);
  const rows = util.chunk(roles.slice(0, 25).map((r) => {
    const b = new ButtonBuilder().setCustomId(`rr:toggle:${panel.id}:${r.role_id}`).setStyle(ButtonStyle.Secondary).setLabel(util.truncate(r.label, 80));
    if (r.emoji) { try { b.setEmoji(r.emoji); } catch { /* ungültiges Emoji */ } }
    return b;
  }), 5).map((c) => new ActionRowBuilder().addComponents(c));
  return { embeds: [embed], components: rows };
}

// ---------- Info-Panels ----------
function infoPanelPayload(g, p) {
  const embed = theme.base(g, 'primary').setTitle(p.title).setDescription(p.content);
  if (p.image_url) embed.setImage(p.image_url);
  return { embeds: [embed] };
}

// ---------- Geplante Aufgaben ----------
jobs.register('polls-giveaways', 20000, async (client) => {
  for (const p of all('SELECT * FROM polls WHERE ended = 0 AND ends_at IS NOT NULL AND ends_at <= ?', now())) await endPoll(client, p);
  for (const gw of all('SELECT * FROM giveaways WHERE ended = 0 AND ends_at <= ?', now())) await endGiveaway(client, gw);
});

module.exports = { SUGG_STATUS, suggestionPayload, pollPayload, endPoll, giveawayPayload, endGiveaway, rolePanelPayload, infoPanelPayload, NUM };
