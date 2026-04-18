const { SlashCommandBuilder } = require("discord.js");
const TemplateStore = require("../utils/templateStore");
const CompoStore = require("../utils/compoStore");
const { buildCompoEmbed, buildCompoButtons } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("pt")
    .setDescription("Lanza una composición previamente guardada como plantilla")
    .addStringOption((o) =>
      o
        .setName("plantilla")
        .setDescription("Elige la plantilla de composición a lanzar")
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async execute(interaction) {
    const templateName = interaction.options.getString("plantilla");
    const template = TemplateStore.get(templateName);

    if (!template) {
      return interaction.reply({
        content: `❌ No se encontró ninguna plantilla llamada **${templateName}**.`,
        ephemeral: true,
      });
    }

    // Roles autorizados
    const zvzRole = "1468028696148312189";
    const pvpPveRole = "1493273036369952860";
    const adminRoles = ["852823068475785217", "983987481961717782"]; // Roles Supremos (bypass)

    // Validación por actividad basada en la plantilla
    const tipoLower = template.tipo.toLowerCase();
    const channelId = interaction.channelId;
    const testChannel = "1402080321150652426";
    const pvpPveChannel = "1423098812938981449";
    const pvpZvzPveChannel = "1471843096018026669";

    const hasAdmin = interaction.member.roles.cache.some(r => adminRoles.includes(r.id));
    const hasZvzRole = interaction.member.roles.cache.has(zvzRole) || hasAdmin;
    const hasPvpPveRole = interaction.member.roles.cache.has(pvpPveRole) || hasAdmin;

    if (tipoLower.includes("zvz")) {
      if (!hasZvzRole) {
         return interaction.reply({ content: "❌ No tienes el rol permitido para lanzar composiciones de ZvZ.", ephemeral: true });
      }
      if (channelId !== testChannel && channelId !== pvpZvzPveChannel) {
         return interaction.reply({ content: `❌ Composiciones de ZvZ solo se pueden lanzar en <#${pvpZvzPveChannel}>.`, ephemeral: true });
      }
    } else if (tipoLower.includes("pvp") || tipoLower.includes("pve")) {
      if (!hasPvpPveRole) {
         return interaction.reply({ content: "❌ No tienes el rol permitido para lanzar composiciones de PvP o PvE.", ephemeral: true });
      }
      if (channelId !== testChannel && channelId !== pvpPveChannel && channelId !== pvpZvzPveChannel) {
         return interaction.reply({ content: `❌ Composiciones de PvP/PvE solo en <#${pvpPveChannel}> o <#${pvpZvzPveChannel}>.`, ephemeral: true });
      }
    }

    // Instanciar la composición viva a partir del molde
    const compoData = {
      nombre: template.nombre,
      tipo: template.tipo,
      slots: template.slots,
      builds: template.builds,
      estrategia: template.estrategia,
      signups: { tank: [], healer: [], dps: [], support: [] },
      authorId: interaction.user.id,
      authorTag: interaction.user.username,
      createdAt: Date.now(),
    };

    const embed = buildCompoEmbed(compoData);
    const buttons = buildCompoButtons(compoData);

    const msg = await interaction.reply({
      content: `📋 **${interaction.user.username}** publicó la composición **${template.nombre}**. ¡Anotate!`,
      embeds: [embed],
      components: buttons,
      fetchReply: true,
    });

    CompoStore.save(msg.id, compoData);
  },
};
