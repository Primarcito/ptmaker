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

    // ── Autocomplete para el comando /pt-lanzar y /pt-dashboard ────────────────
    if (interaction.isAutocomplete()) {
      if (interaction.commandName === "pt-lanzar" || interaction.commandName === "pt-dashboard") {
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
        rawComposicion: composicionRaw,
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

    // ── Dashboard: Select Template ──────────────────────────────
    if (interaction.isStringSelectMenu() && interaction.customId === "dash_select_template") {
      const templateName = interaction.values[0];
      const template = TemplateStore.get(templateName);

      if (!template) {
        return interaction.update({ content: "❌ Plantilla no encontrada.", components: [] });
      }

      const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require("discord.js");

      // Calculate totals
      const totalSlots = Object.values(template.slots).reduce((a, b) => a + b, 0);

      const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle(`📂 Plantilla: ${template.nombre}`)
        .addFields(
           { name: "Tipo", value: template.tipo, inline: true },
           { name: "Slots Totales", value: `${totalSlots}`, inline: true },
           { name: "Estrategia", value: template.estrategia || "*Sin estrategia*", inline: false },
        );

      let rawText = template.rawComposicion;
      if (!rawText) {
         rawText = "";
         ["tank", "healer", "dps", "support"].forEach(rol => {
            if(template.slots[rol] > 0) {
               rawText += rol.toUpperCase() + ":\n";
               if(template.builds[rol]) {
                  template.builds[rol].forEach(b => rawText += " - " + b + "\n");
               }
               rawText += "\n";
            }
         });
      }

      embed.addFields({ name: "Composición (Vista Previa)", value: `\`\`\`text\n${rawText.slice(0, 1000) || "Sin armas listadas"}\n\`\`\``, inline: false });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`dash_btn_edit_${templateName}`).setLabel("✏️ Editar").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`dash_btn_askdelete_${templateName}`).setLabel("🗑️ Borrar").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`dash_btn_back`).setLabel("⬅️ Volver").setStyle(ButtonStyle.Secondary)
      );

      await interaction.update({ content: "Detalles de la Plantilla:", embeds: [embed], components: [row] });
      return;
    }

    // ── Dashboard: Botones ──────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith("dash_btn_")) {
      const parts = interaction.customId.split("_");
      const action = parts[2]; // edit, delete, back, askdelete, confirmdelete
      const templateName = parts.slice(3).join("_");

      if (action === "back") {
        const templates = TemplateStore.all();
        const templateNames = Object.keys(templates);
        if (templateNames.length === 0) {
          return interaction.update({ content: "📂 Tu Bóveda de Plantillas está vacía.", embeds: [], components: [] });
        }
        const options = templateNames.map(name => ({
          label: name.slice(0, 100),
          description: `Tipo: ${templates[name].tipo}`,
          value: name,
          emoji: "📁"
        })).slice(0, 25);
        const select = new StringSelectMenuBuilder().setCustomId("dash_select_template").setPlaceholder("Selecciona una plantilla...").addOptions(options);
        const row = new ActionRowBuilder().addComponents(select);
        await interaction.update({ content: "## 🎛️ Dashboard de Plantillas\nElige cuál deseas administrar actualmente:", embeds: [], components: [row] });
        return;
      }

      if (action === "askdelete") {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`dash_btn_confirmdelete_${templateName}`).setLabel("⚠️ SÍ, BORRAR DEFINITIVAMENTE").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`dash_btn_back`).setLabel("Cancelar").setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({
          content: `### 🛑 ¿Estás seguro?\nVas a eliminar permanentemente la plantilla **${templateName}**. Esta acción no se puede deshacer.`,
          embeds: [],
          components: [row]
        });
      }

      if (action === "confirmdelete") {
        TemplateStore.remove(templateName);
        await interaction.update({ content: `✅ Plantilla **${templateName}** borrada con éxito de la base de datos.`, embeds: [], components: [] });
        return;
      }

      if (action === "edit") {
        const template = TemplateStore.get(templateName);
        if (!template) return interaction.reply({ content: "❌ No encontrada.", ephemeral: true });

        const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");
        const modal = new ModalBuilder()
          .setCustomId(`dash_modal_edit_${templateName}`)
          .setTitle(`✏️ Editar: ${templateName}`.slice(0, 45));

        let rawText = template.rawComposicion;
        if (!rawText) {
          rawText = "";
          ["tank", "healer", "dps", "support"].forEach(rol => {
              if(template.slots[rol] > 0) {
                rawText += rol + "\n";
                if(template.builds[rol]) {
                    template.builds[rol].forEach(b => rawText += b + "\n");
                }
                rawText += "\n";
              }
          });
        }

        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("tipo").setLabel("Tipo").setStyle(TextInputStyle.Short).setValue(template.tipo).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("composicion").setLabel("Composición (Roles y Armas)").setStyle(TextInputStyle.Paragraph).setValue(rawText.slice(0, 4000)).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("estrategia").setLabel("Estrategia / Notas").setStyle(TextInputStyle.Paragraph).setValue(template.estrategia || "").setRequired(false))
        );

        await interaction.showModal(modal);
        return;
      }
    }

    // ── Dashboard: Submit Edit Modal ────────────────────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith("dash_modal_edit_")) {
      const templateName = interaction.customId.replace("dash_modal_edit_", "");
      const tipo = interaction.fields.getTextInputValue("tipo").trim();
      const composicionRaw = interaction.fields.getTextInputValue("composicion").trim();
      const estrategia = interaction.fields.getTextInputValue("estrategia").trim();

      const { slots, builds } = parseComposition(composicionRaw);
      const totalSlots = Object.values(slots).reduce((a, b) => a + b, 0);

      if (totalSlots === 0) {
        return interaction.reply({ content: "❌ No se detectaron cupos o formato inválido.", ephemeral: true });
      }

      const existing = TemplateStore.get(templateName) || {};
      const templateData = {
        nombre: templateName,
        tipo,
        slots,
        builds,
        estrategia,
        rawComposicion: composicionRaw,
        authorId: interaction.user.id,
        authorTag: interaction.user.username,
        createdAt: existing.createdAt || Date.now(),
      };

      TemplateStore.save(templateName, templateData);
      await interaction.update({ content: `✅ Plantilla **${templateName}** actualizada correctamente.`, embeds: [], components: [] });
      return;
    }

    // ── String Select Menu (Elección de Arma/Asiento) ───────────
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("selectslot_")) {
      const parts = interaction.customId.split("_");
      const msgId = parts[1];
      const role = parts[2];
      const selectedIndex = parseInt(interaction.values[0], 10);

      // Respuesta rápida para evitar el error rojo de Discord
      await interaction.deferUpdate();

      const compo = CompoStore.get(msgId);
      if (!compo) {
        return interaction.followUp({ content: "❌ Composición expirada.", ephemeral: true });
      }

      const roleBuilds = compo.builds?.[role] || [];
      const signupsArr = compo.signups[role];

      if (signupsArr[selectedIndex] !== null) {
        return interaction.followUp({ content: "❌ Alguien ocupó ese lugar hace un instante. Prueba otro.", ephemeral: true });
      }

      // Auto-moverlo
      for (const list of Object.values(compo.signups)) {
        const currentIdx = list.findIndex(s => s && s.userId === interaction.user.id);
        if (currentIdx !== -1) {
          list[currentIdx] = null;
        }
      }

      signupsArr[selectedIndex] = { userId: interaction.user.id, ign: interaction.user.username };
      CompoStore.save(msgId, compo);

      // Actualizar el cartel principal
      try {
        const mainMessage = await interaction.channel.messages.fetch(msgId);
        if (mainMessage) {
          await mainMessage.edit({ 
            embeds: [buildCompoEmbed(compo)], 
            components: buildCompoButtons(compo) 
          });
        }
      } catch (e) {
        console.error("Error editando cartel:", e);
      }
      
      await interaction.editReply({ 
        content: `✅ <@${interaction.user.id}>, has reclamado el asiento de **${roleBuilds[selectedIndex] || role}** con éxito.`, 
        components: [] 
      });
      return;
    }

    // ── Buttons: anotarse / desanotarse ────────────────────────────
    if (interaction.isButton()) {
      const { customId, message, user } = interaction;

      const VALID_BUTTONS = ["signup_tank", "signup_heal", "signup_dps", "signup_sup", "signup_out"];
      if (!VALID_BUTTONS.includes(customId)) return;

      try {
        const compo = CompoStore.get(message.id);
        if (!compo) {
          return interaction.reply({ content: "❌ Esta compo ya no está disponible (fue eliminada o expiró).", ephemeral: true });
        }

        // ── Desanotarse ──
        if (customId === "signup_out") {
          await interaction.deferUpdate();
          let removed = false;
          for (const role of Object.keys(compo.signups)) {
            const idx = compo.signups[role].findIndex((s) => s && s.userId === user.id);
            if (idx !== -1) {
              compo.signups[role][idx] = null;
              removed = true;
            }
          }

          if (!removed) {
            return interaction.followUp({ content: "❌ No estás anotado en esta compo.", ephemeral: true });
          }

          CompoStore.save(message.id, compo);
          await interaction.editReply({ embeds: [buildCompoEmbed(compo)], components: buildCompoButtons(compo) });
          await interaction.followUp({ content: "✅ Te has desanotado de la compo.", ephemeral: true });
          return;
        }

        // ── Anotarse ──
        const roleMap = { signup_tank: "tank", signup_heal: "healer", signup_dps: "dps", signup_sup: "support" };
        const role = roleMap[customId];

        // Verificamos si ya está en ESTE mismo rol
        const isAlreadyInThisRole = compo.signups[role].some(s => s && s.userId === user.id);
        if (isAlreadyInThisRole) {
          return interaction.reply({ content: "❌ Ya estás anotado en este rol.", ephemeral: true });
        }

        // Buscar slots vacíos
        const freeIndexes = [];
        for (let i = 0; i < compo.slots[role]; i++) {
          if (!compo.signups[role][i]) freeIndexes.push(i);
        }

        if (freeIndexes.length === 0) {
          return interaction.reply({ content: "❌ No hay slots disponibles para ese rol.", ephemeral: true });
        }

        const roleBuilds = compo.builds?.[role] || [];
        if (roleBuilds.length > 0 && freeIndexes.length > 1) {
          const options = freeIndexes.map(idx => ({
            label: (roleBuilds[idx] || `Asiento ${idx + 1}`).slice(0, 100),
            value: idx.toString(),
            description: "Cupo disponible",
            emoji: "🎯"
          }));

          const select = new StringSelectMenuBuilder()
            .setCustomId(`selectslot_${message.id}_${role}`)
            .setPlaceholder("Selecciona tu especialidad...")
            .addOptions(options.slice(0, 25));

          return interaction.reply({
            content: "👇 **Hay múltiples especialidades libres.** Selecciona la tuya:",
            components: [new ActionRowBuilder().addComponents(select)],
            ephemeral: true
          });
        }

        // Asignación rápida (Lineal)
        await interaction.deferUpdate();
        for (const list of Object.values(compo.signups)) {
          const idx = list.findIndex(s => s && s.userId === user.id);
          if (idx !== -1) list[idx] = null;
        }

        const firstFree = freeIndexes[0];
        compo.signups[role][firstFree] = { userId: user.id, ign: user.username };
        CompoStore.save(message.id, compo);

        await interaction.editReply({ embeds: [buildCompoEmbed(compo)], components: buildCompoButtons(compo) });
        await interaction.followUp({
          content: `✅ <@${user.id}>, te has anotado como **${role.toUpperCase()}** con éxito.`,
          ephemeral: true,
        });
      } catch (err) {
        console.error("Error en interacción de botones:", err);
        return interaction.reply({ content: "❌ Hubo un error procesando tu anotación.", ephemeral: true }).catch(() => null);
      }
    }
  },
};
