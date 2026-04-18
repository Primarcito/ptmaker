const TemplateStore = require("../utils/templateStore");
const CompoStore = require("../utils/compoStore");
const { buildCompoEmbed, buildCompoButtons } = require("../utils/embeds");
const { parseComposition } = require("../utils/parsers");
const { StringSelectMenuBuilder, ActionRowBuilder } = require("discord.js");

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
      const composicionRaw = interaction.fields.getTextInputValue("composicion").trim();
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

      const { slots, builds } = parseComposition(composicionRaw);

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

    // ── String Select Menu (Elección de Arma/Asiento) ───────────
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("selectslot_")) {
      const parts = interaction.customId.split("_");
      const msgId = parts[1];
      const role = parts[2];
      const selectedIndex = parseInt(interaction.values[0], 10);

      const compo = CompoStore.get(msgId);
      if (!compo) {
        return interaction.update({ content: "❌ Composición expirada.", components: [] });
      }

      const signupsArr = compo.signups[role];
      if (signupsArr[selectedIndex] !== null) {
        return interaction.update({ content: "❌ Alguien más rápido tomó ese asiento. Intenta de nuevo.", components: [] });
      }

      // Auto-moverlo (limpiar historial en otro lado)
      for (const list of Object.values(compo.signups)) {
        const currentIdx = list.findIndex(s => s && s.userId === interaction.user.id);
        if (currentIdx !== -1) {
          list[currentIdx] = null;
          break; // asume que solo puede estar en 1 lugar
        }
      }

      signupsArr[selectedIndex] = { userId: interaction.user.id, ign: interaction.user.username };
      CompoStore.save(msgId, compo);

      const mainMessage = await interaction.channel.messages.fetch(msgId).catch(()=>null);
      if (mainMessage) {
        await mainMessage.edit({ embeds: [buildCompoEmbed(compo)], components: buildCompoButtons(compo) });
      }
      
      await interaction.update({ content: "✅ Asiento asegurado.", components: [] });
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
          const idx = compo.signups[role].findIndex((s) => s && s.userId === user.id);
          if (idx !== -1) {
            compo.signups[role][idx] = null;
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

      // Verificamos de antemano si ESTÁ en este mismo rol en algún índice, sin importar cuál
      const currentArr = compo.signups[role];
      const isAlreadyInThisRole = currentArr.some(s => s && s.userId === user.id);
      if (isAlreadyInThisRole) {
         return interaction.reply({ content: "❌ Ya estás anotado en este rol.", ephemeral: true });
      }

      // Buscar slots vacíos
      const signupsArr = compo.signups[role];
      const roleBuilds = compo.builds?.[role] || [];
      const freeIndexes = [];
      for (let i = 0; i < compo.slots[role]; i++) {
        if (!signupsArr[i]) freeIndexes.push(i);
      }

      if (freeIndexes.length === 0) {
        return interaction.reply({ content: "❌ No hay slots disponibles para ese rol.", ephemeral: true });
      }

      // Despliegue del Menú Selector si hay builds especificas para escoger y más de 1 hueco
      if (roleBuilds.length > 0 && freeIndexes.length > 1) {
         const options = freeIndexes.map(idx => {
            const buildName = roleBuilds[idx] || `Asiento ${idx + 1}`;
            return {
               label: buildName.slice(0, 100),
               value: idx.toString(),
               description: "Disponible",
               emoji: "🎯"
            };
         });

         const select = new StringSelectMenuBuilder()
            .setCustomId(`selectslot_${message.id}_${role}`)
            .setPlaceholder("Selecciona qué arma vas a usar")
            .addOptions(options.slice(0, 25));

         const row = new ActionRowBuilder().addComponents(select);
         return interaction.reply({
            content: "👇 **Hay múltiples especialidades libres para este Rol.**\nUsa el menú para reclamar exactamente la que puedes jugar:",
            components: [row],
            ephemeral: true
         });
      }

      // Si no hay armas especificas, o si queda un único hueco, asignación lineal
      let wasMoved = false;
      for (const list of Object.values(compo.signups)) {
        const idx = list.findIndex(s => s && s.userId === user.id);
        if (idx !== -1) {
          list[idx] = null;
          wasMoved = true;
          break;
        }
      }

      const firstFree = freeIndexes[0];
      const ign = user.username;
      
      compo.signups[role][firstFree] = { userId: user.id, ign };
      CompoStore.save(message.id, compo);

      await interaction.update({ embeds: [buildCompoEmbed(compo)], components: buildCompoButtons(compo) });
      const roleLabels = { tank: "🛡️ Tank", healer: "🚑 Healer", dps: "🔥 DPS", support: "✨ Support" };
      await interaction.followUp({
        content: `✅ Te has anotado como **${roleLabels[role]}** con el IGN **${ign}**.`,
        ephemeral: true,
      });
    }
  },
};
