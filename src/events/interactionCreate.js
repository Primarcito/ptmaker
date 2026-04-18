const TemplateStore = require("../utils/templateStore");
const CompoStore = require("../utils/compoStore");
const { buildCompoEmbed, buildCompoButtons } = require("../utils/embeds");
const { parseSlots, parseBuilds } = require("../utils/parsers");

module.exports = {
  name: "interactionCreate",

  async execute(interaction, client) {
    if (interaction.isChatInputCommand()) {
      // 1. Validar Canales Permitidos Globales (IDs quemadas)
      const allowedChannelsGlobal = ["1402080321150652426", "1423098812938981449", "1471843096018026669"];
      if (!allowedChannelsGlobal.includes(interaction.channelId)) {
        return interaction.reply({ content: "❌ No puedes usar comandos del bot en este canal.", ephemeral: true });
      }

      const cmd = client.commands.get(interaction.commandName);
      if (!cmd) return;
      try {
        await cmd.execute(interaction);
      } catch (err) {
        console.error(err);
        const msg = { content: "❌ Error al ejecutar el comando.", ephemeral: true };
        interaction.replied ? interaction.followUp(msg) : interaction.reply(msg);
      }
      return;
    }

    // ── Autocomplete para el comando /pt ───────────────────────────
    if (interaction.isAutocomplete()) {
      if (interaction.commandName === "pt") {
        const focusedValue = interaction.options.getFocused();
        const templates = TemplateStore.all();
        const choices = Object.keys(templates);
        const filtered = choices
          .filter((choice) => choice.toLowerCase().includes(focusedValue.toLowerCase()))
          .slice(0, 25);
        await interaction.respond(
          filtered.map((choice) => ({ name: choice, value: choice }))
        );
      }
      return;
    }

    // ── Modal: /pt-compo (Crear Plantilla) ─────────────────────────
    if (interaction.isModalSubmit() && interaction.customId === "modal_compo") {
      const nombre     = interaction.fields.getTextInputValue("nombre").trim();
      const tipo       = interaction.fields.getTextInputValue("tipo").trim();
      const slotsRaw   = interaction.fields.getTextInputValue("slots").trim();
      const buildsRaw  = interaction.fields.getTextInputValue("builds").trim();
      const estrategia = interaction.fields.getTextInputValue("estrategia").trim();

      // Roles autorizados para CREAR plantillas
      const zvzRole = "1468028696148312189";
      const pvpPveRole = "1493273036369952860";
      const adminRoles = ["852823068475785217", "983987481961717782"]; // Roles Supremos (bypass)

      const tipoLower = tipo.toLowerCase();
      const hasAdmin = interaction.member.roles.cache.some(r => adminRoles.includes(r.id));
      const hasZvzRole = interaction.member.roles.cache.has(zvzRole) || hasAdmin;
      const hasPvpPveRole = interaction.member.roles.cache.has(pvpPveRole) || hasAdmin;

      if (tipoLower.includes("zvz") && !hasZvzRole) {
         return interaction.reply({ content: "❌ No tienes el rol permitido para crear plantillas de ZvZ.", ephemeral: true });
      } else if ((tipoLower.includes("pvp") || tipoLower.includes("pve")) && !hasPvpPveRole) {
         return interaction.reply({ content: "❌ No tienes el rol permitido para crear plantillas de PvP o PvE.", ephemeral: true });
      }

      const slots  = parseSlots(slotsRaw);
      const builds = parseBuilds(buildsRaw);

      const totalSlots = Object.values(slots).reduce((a, b) => a + b, 0);
      if (totalSlots === 0) {
        return interaction.reply({
          content: "❌ No se pudo leer el formato de slots. Usa: `Tank:2 Healer:3 DPS:5 Support:2`",
          ephemeral: true,
        });
      }

      const templateData = {
        nombre,
        tipo,
        slots,
        builds,
        estrategia,
        authorId:  interaction.user.id,
        authorTag: interaction.user.username,
        createdAt: Date.now(),
      };

      // Guardar plantilla usando su nombre como clave
      TemplateStore.save(nombre, templateData);
      
      await interaction.reply({
        content: `✅ ¡Plantilla **${nombre}** creada y guardada con éxito! Ahora usa \`/pt\` en el canal respectivo para lanzarla.`,
        ephemeral: true
      });
      return;
    }

    // ── Buttons: anotarse / desanotarse ────────────────────────────
    if (interaction.isButton()) {
      const { customId, message, user } = interaction;

      const VALID_BUTTONS = ["signup_tank", "signup_heal", "signup_dps", "signup_sup", "signup_out"];
      if (!VALID_BUTTONS.includes(customId)) return;

      const compo = CompoStore.get(message.id);
      if (!compo) {
        return interaction.reply({ content: "❌ Esta compo ya no está disponible.", ephemeral: true });
      }

      // ── Desanotarse ──
      if (customId === "signup_out") {
        let removed = false;
        for (const role of Object.keys(compo.signups)) {
          const idx = compo.signups[role].findIndex((s) => s.userId === user.id);
          if (idx !== -1) {
            compo.signups[role].splice(idx, 1);
            removed = true;
          }
        }

        if (!removed) {
          return interaction.reply({ content: "❌ No estás anotado en esta compo.", ephemeral: true });
        }

        CompoStore.save(message.id, compo);
        await interaction.update({ embeds: [buildCompoEmbed(compo)], components: buildCompoButtons(compo) });
        await interaction.followUp({ content: "✅ Te has desanotado de la compo.", ephemeral: true });
        return;
      }

      // ── Anotarse ──
      const roleMap = { signup_tank: "tank", signup_heal: "healer", signup_dps: "dps", signup_sup: "support" };
      const role = roleMap[customId];

      // Verificar si ya está anotado en cualquier rol
      const alreadyIn = Object.values(compo.signups).some((arr) =>
        arr.some((s) => s.userId === user.id)
      );
      if (alreadyIn) {
        return interaction.reply({
          content: "❌ Ya estás anotado. Usa **✗ Desanotarme** primero para cambiar de rol.",
          ephemeral: true,
        });
      }

      // Verificar slots disponibles
      if ((compo.slots[role] || 0) === 0) {
        return interaction.reply({ content: "❌ Este rol no existe en la compo.", ephemeral: true });
      }
      if (compo.signups[role].length >= compo.slots[role]) {
        return interaction.reply({ content: "❌ No hay slots disponibles para ese rol.", ephemeral: true });
      }

      // Solo usar nombre de Discord ya que se eliminó el sistema estricto de PTs
      const ign = user.username;

      compo.signups[role].push({ userId: user.id, ign });
      CompoStore.save(message.id, compo);

      await interaction.update({ embeds: [buildCompoEmbed(compo)], components: buildCompoButtons(compo) });

      const roleLabels = { tank: "🛡 Tank", healer: "💚 Healer", dps: "⚔ DPS", support: "✨ Support" };
      await interaction.followUp({
        content: `✅ Te has anotado como **${roleLabels[role]}** con el IGN **${ign}**.`,
        ephemeral: true,
      });
    }
  },
};
