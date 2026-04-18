const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const TemplateStore = require("../utils/templateStore");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("pt-dashboard")
    .setDescription("Panel de Administración de Plantillas (Composiciones)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Para que no estorbe a los usuarios, aunque tiene hard check.

  async execute(interaction) {
    const adminRole = "983987481961717782";

    if (!interaction.member.roles.cache.has(adminRole)) {
      return interaction.reply({
        content: "❌ No tienes los superpoderes (Rol de Admin) necesarios para usar el Dashboard.",
        ephemeral: true,
      });
    }

    const templates = TemplateStore.all();
    const templateNames = Object.keys(templates);

    if (templateNames.length === 0) {
      return interaction.reply({
         content: "📂 Tu Bóveda de Plantillas está totalmente vacía. Empieza creando una con `/pt-compo`.",
         ephemeral: true
      });
    }

    // Listar las plantillas en un SelectMenu
    const options = templateNames.map(name => ({
      label: name.slice(0, 100),
      description: `Composición de tipo: ${templates[name].tipo}`,
      value: name,
      emoji: "📁"
    })).slice(0, 25);

    const select = new StringSelectMenuBuilder()
      .setCustomId("dash_select_template")
      .setPlaceholder("Selecciona una plantilla para inspeccionar...")
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(select);

    await interaction.reply({
      content: "## 🎛️ Dashboard de Plantillas\nElige cuál deseas administrar actualmente:",
      components: [row],
      ephemeral: true,
    });
  },
};
