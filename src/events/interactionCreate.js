const PTStore = require("../utils/ptStore");
const CompoStore = require("../utils/compoStore");
const { buildPTEmbed, buildCompoEmbed, buildCompoButtons } = require("../utils/embeds");
const { parseSlots, parseBuilds, normalizeRol, normalizeContenido } = require("../utils/parsers");

module.exports = {
  name: "interactionCreate",

  async execute(interaction, client) {
    // ── Slash Commands ─────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      // 1. Validar Canales Autorizados (aplica a todos los comandos)
      if (process.env.ALLOWED_CHANNELS) {
        const allowedChannels = process.env.ALLOWED_CHANNELS.split(",").map(c => c.trim());
        if (allowedChannels.length > 0 && !allowedChannels.includes(interaction.channelId)) {
          return interaction.reply({ content: "❌ No puedes usar comandos del bot en este canal.", ephemeral: true });
        }
      }

      // 2. Validar Roles Autorizados (solo aplica para crear compos)
      if (interaction.commandName === "pt-compo" && process.env.ALLOWED_ROLES) {
        const allowedRoles = process.env.ALLOWED_ROLES.split(",").map(r => r.trim());
        if (allowedRoles.length > 0) {
          const hasRole = interaction.member.roles.cache.some(r => allowedRoles.includes(r.id));
          if (!hasRole) {
            return interaction.reply({ content: "❌ No tienes permisos de líder para crear composiciones.", ephemeral: true });
          }
        }
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

    // ── Modal: /pt ─────────────────────────────────────────────────
    if (interaction.isModalSubmit() && interaction.customId === "modal_pt") {
      const data = {
        ign:       interaction.fields.getTextInputValue("ign").trim(),
        rol:       normalizeRol(interaction.fields.getTextInputValue("rol")),
        contenido: normalizeContenido(interaction.fields.getTextInputValue("contenido")),
        ip:        interaction.fields.getTextInputValue("ip").trim(),
        build:     interaction.fields.getTextInputValue("build").trim(),
        updatedAt: Date.now(),
      };

      PTStore.save(interaction.user.id, data);
      const embed = buildPTEmbed(data, interaction.user);

      await interaction.reply({
        content: "✅ ¡PT registrado correctamente!",
        embeds: [embed],
      });
      return;
    }

    // ── Modal: /pt-compo ───────────────────────────────────────────
    if (interaction.isModalSubmit() && interaction.customId === "modal_compo") {
      const nombre     = interaction.fields.getTextInputValue("nombre").trim();
      const tipo       = interaction.fields.getTextInputValue("tipo").trim();
      const slotsRaw   = interaction.fields.getTextInputValue("slots").trim();
      const buildsRaw  = interaction.fields.getTextInputValue("builds").trim();
      const estrategia = interaction.fields.getTextInputValue("estrategia").trim();

      const slots  = parseSlots(slotsRaw);
      const builds = parseBuilds(buildsRaw);

      // Validar que al menos un slot sea > 0
      const totalSlots = Object.values(slots).reduce((a, b) => a + b, 0);
      if (totalSlots === 0) {
        return interaction.reply({
          content: "❌ No se pudo leer el formato de slots. Usa: `Tank:2 Healer:3 DPS:5 Support:2`",
          ephemeral: true,
        });
      }

      const compoData = {
        nombre,
        tipo,
        slots,
        builds,
        estrategia,
        signups: { tank: [], healer: [], dps: [], support: [] },
        authorId:  interaction.user.id,
        authorTag: interaction.user.username,
        createdAt: Date.now(),
      };

      const embed    = buildCompoEmbed(compoData);
      const buttons  = buildCompoButtons(compoData);

      // Publicar en el canal
      const msg = await interaction.reply({
        content: `📋 **${interaction.user.username}** publicó una composición. ¡Anotate!`,
        embeds: [embed],
        components: buttons,
        fetchReply: true,
      });

      // Guardar usando el ID del mensaje como clave
      CompoStore.save(msg.id, compoData);
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
        await message.edit({ embeds: [buildCompoEmbed(compo)], components: buildCompoButtons(compo) });
        await interaction.reply({ content: "✅ Te has desanotado de la compo.", ephemeral: true });
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

      // Obtener IGN del PT del jugador (o usar su username)
      const pt  = PTStore.get(user.id);
      const ign = pt ? pt.ign : user.username;

      compo.signups[role].push({ userId: user.id, ign });
      CompoStore.save(message.id, compo);

      await message.edit({ embeds: [buildCompoEmbed(compo)], components: buildCompoButtons(compo) });

      const roleLabels = { tank: "🛡 Tank", healer: "💚 Healer", dps: "⚔ DPS", support: "✨ Support" };
      await interaction.reply({
        content: `✅ Te has anotado como **${roleLabels[role]}** con el IGN **${ign}**.`,
        ephemeral: true,
      });
    }
  },
};
