// Bereichsauswahl der Hilfe
const { categoryEmbed, menu } = require('../commands/general/hilfe');

async function handle(interaction) {
  return interaction.update({ embeds: [categoryEmbed(interaction, interaction.values[0])], components: [menu()] });
}

module.exports = { prefix: 'help', handle };
