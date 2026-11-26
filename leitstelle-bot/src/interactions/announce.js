// Formular der Ankündigungen
const { MessageFlags } = require('discord.js');
const theme = require('../core/theme');
const util = require('../core/util');
const pending = require('../systems/pending');
const an = require('../systems/announcementManager');

async function handle(interaction, action, args) {
  const g = interaction.guildId;
  if (action !== 'text') return;
  const d = pending.take(args[0]);
  if (!d || d.user !== interaction.user.id) return theme.replyError(interaction, 'Die Eingabe ist abgelaufen. Bitte den Befehl erneut ausführen.');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  let image = null;
  if (d.image) {
    try { image = await an.storeImage(d.image.url, d.image.name); } catch (err) { return interaction.editReply({ embeds: [theme.error(g, `Das Bild konnte nicht gespeichert werden: ${err.message}`)] }); }
  }
  const content = interaction.fields.getTextInputValue('text').trim();
  const id = an.create({ guildId: g, type: d.type, channelId: d.channelId, title: d.title, content, roleId: d.roleId, image, color: d.color, authorId: interaction.user.id, sendAt: d.sendAt });
  if (d.sendAt) return interaction.editReply({ embeds: [theme.success(g, `Ankündigung #${id} ist geplant für ${util.ts(d.sendAt)} (${util.ts(d.sendAt, 'R')}) in <#${d.channelId}>.\nAbbrechen mit \`/announce abbrechen id:${id}\`.`)] });
  try {
    const msg = await an.send(interaction.client, an.get(id));
    return interaction.editReply({ embeds: [theme.success(g, `Die Ankündigung wurde gesendet. [Zur Nachricht](${msg.url})`)] });
  } catch (err) {
    require('../core/database').run("UPDATE announcements SET status = 'fehlgeschlagen', error = ? WHERE id = ?", err.message, id);
    return interaction.editReply({ embeds: [theme.error(g, `Die Ankündigung konnte nicht gesendet werden: ${err.message}`)] });
  }
}

module.exports = { prefix: 'ann', handle };
