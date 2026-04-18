const { SlashCommandBuilder } = require("discord.js");
const PTStore = require("../utils/ptStore");
const { buildPTEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("pt-ver")
    .setDescription("Ver el PT de un jugador")
    .addUserOption((o) =>
      o
        .setName("usuario")
        .setDescription("Usuario a consultar (vacío = el tuyo)")
        .setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("usuario") ?? interaction.user;
    const pt = PTStore.get(target.id);

    if (!pt) {
      return interaction.reply({
        content: `❌ **${target.username}** no tiene ningún PT registrado. Usa \`/pt\` para crear uno.`,
        ephemeral: true,
      });
    }

    await interaction.reply({ embeds: [buildPTEmbed(pt, target)] });
  },
};
