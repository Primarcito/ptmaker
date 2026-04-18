const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("pt-compo")
    .setDescription("Publica una composición para ZvZ, PvE o GvG"),

  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId("modal_compo")
      .setTitle("🗺 Subir Composición");

    const fields = [
      {
        id: "nombre",
        label: "Nombre de la compo",
        placeholder: "Ej: Compo ZvZ Frontline",
        style: TextInputStyle.Short,
        required: true,
      },
      {
        id: "tipo",
        label: "Tipo",
        placeholder: "ZvZ · GvG · PvE · HCE · Corrupted",
        style: TextInputStyle.Short,
        required: true,
      },
      {
        id: "composicion",
        label: "Composición (Roles y Armas)",
        placeholder: "Tank\nIncubo\nMaza\nHealer\nCaído",
        style: TextInputStyle.Paragraph,
        required: true,
      },
      {
        id: "estrategia",
        label: "Estrategia / notas",
        placeholder: "Explica brevemente el objetivo o la estrategia...",
        style: TextInputStyle.Paragraph,
        required: false,
      },
    ];

    modal.addComponents(
      ...fields.map((f) =>
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(f.id)
            .setLabel(f.label)
            .setPlaceholder(f.placeholder)
            .setStyle(f.style)
            .setRequired(f.required)
        )
      )
    );

    await interaction.showModal(modal);
  },
};
