const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const TemplateStore = require("../utils/templateStore");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("pt-admin")
    .setDescription("Administración avanzada de plantillas")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Requiere Permisos generales para no estorbar, aunque se valida rol por código
    .addSubcommand((sub) =>
      sub
        .setName("borrar")
        .setDescription("Borrar una plantilla de la bóveda")
        .addStringOption((o) =>
          o
            .setName("plantilla")
            .setDescription("La plantilla a eliminar")
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),

  async execute(interaction) {
    const adminRole = "983987481961717782"; // Rol Estricto

    if (!interaction.member.roles.cache.has(adminRole)) {
      return interaction.reply({
        content: "❌ No tienes los superpoderes (Rol de Admin) necesarios para usar este comando.",
        ephemeral: true,
      });
    }

    if (interaction.options.getSubcommand() === "borrar") {
      const templateName = interaction.options.getString("plantilla");
      const template = TemplateStore.get(templateName);

      if (!template) {
        return interaction.reply({
          content: `❌ No se encontró ninguna plantilla llamada **${templateName}**.`,
          ephemeral: true,
        });
      }

      TemplateStore.remove(templateName);

      await interaction.reply({
        content: `✅ La plantilla **${templateName}** ha sido eliminada permanentemente y vaporizada de la base de datos.`,
        ephemeral: true,
      });
    }
  },
};
