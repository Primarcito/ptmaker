const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("pt")
    .setDescription("Registra tu PT de Albion Online"),

  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId("modal_pt")
      .setTitle("⚔ Registrar PT — Albion Online");

    const fields = [
      {
        id: "ign",
        label: "IGN (nick en el juego)",
        placeholder: "Tu_Nick_AO",
        style: TextInputStyle.Short,
        required: true,
      },
      {
        id: "rol",
        label: "Rol principal",
        placeholder: "Tank · Healer · DPS · Support",
        style: TextInputStyle.Short,
        required: true,
      },
      {
        id: "contenido",
        label: "Contenido",
        placeholder: "PvE · ZvZ · PvP · GvG · Todo",
        style: TextInputStyle.Short,
        required: true,
      },
      {
        id: "ip",
        label: "IP mínima",
        placeholder: "Ej: 1400",
        style: TextInputStyle.Short,
        required: true,
      },
      {
        id: "build",
        label: "Build activa (arma · armadura · casco)",
        placeholder: "Ej: Heavy Mace · Plate Armor · Soldier Helmet",
        style: TextInputStyle.Paragraph,
        required: true,
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
