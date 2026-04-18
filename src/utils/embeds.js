const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const GOLD   = 0xE8A838;
const RED    = 0xE05B5B;
const GREEN  = 0x57C457;

// ─────────────────────────────────────────────────────────────────
//  PT embed (perfil del jugador)
// ─────────────────────────────────────────────────────────────────
function buildPTEmbed(pt, user) {
  const rolEmoji = { tank: "🛡", healer: "💚", dps: "⚔", support: "✨" };
  const emoji = rolEmoji[pt.rol?.toLowerCase()] ?? "⚔";

  return new EmbedBuilder()
    .setColor(GOLD)
    .setTitle(`⚔ ${pt.ign} — Registro de Personaje`)
    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: "🎮 IGN",           value: pt.ign,       inline: true },
      { name: `${emoji} Rol`,     value: pt.rol,       inline: true },
      { name: "📦 Contenido",     value: pt.contenido, inline: true },
      { name: "⚡ IP mínima",     value: pt.ip,        inline: true },
      { name: "🔧 Build activa",  value: pt.build,     inline: false }
    )
    .setFooter({
      text: `PT de ${user.username} · ${new Date(pt.updatedAt).toLocaleDateString("es-PE")}`,
      iconURL: user.displayAvatarURL({ dynamic: true }),
    });
}

// ─────────────────────────────────────────────────────────────────
//  Compo embed (composición con slots)
// ─────────────────────────────────────────────────────────────────
function buildCompoEmbed(compo) {
  const { nombre, tipo, estrategia, slots, builds, signups, authorTag } = compo;

  const totalSlots  = Object.values(slots).reduce((a, b) => a + b, 0);
  const totalFilled = Object.values(signups).reduce((a, arr) => a + arr.length, 0);
  const isFull      = totalFilled >= totalSlots;

  const color = isFull ? GREEN : RED;
  const statusIcon = isFull ? "✅" : "🗺";

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${statusIcon} ${nombre}`)
    .addFields({ name: "📌 Tipo", value: tipo, inline: true })
    .addFields({ name: "👥 Slots", value: `${totalFilled}/${totalSlots}`, inline: true });

  // Campos por rol
  const roleConfig = [
    { key: "tank",    emoji: "🛡", label: "Tank"    },
    { key: "healer",  emoji: "💚", label: "Healer"  },
    { key: "dps",     emoji: "⚔",  label: "DPS"     },
    { key: "support", emoji: "✨", label: "Support" },
  ];

  for (const { key, emoji, label } of roleConfig) {
    const max = slots[key] || 0;
    if (max === 0) continue;

    const filled   = signups[key] || [];
    const build    = builds?.[key] ? ` · ${builds[key]}` : "";
    const lines    = [];

    for (let i = 0; i < max; i++) {
      lines.push(filled[i] ? `✅ **${filled[i].ign}**` : "⬜ *vacío*");
    }

    embed.addFields({
      name:   `${emoji} ${label} (${filled.length}/${max})${build}`,
      value:  lines.join("\n"),
      inline: true,
    });
  }

  if (estrategia) {
    embed.addFields({ name: "📋 Estrategia", value: estrategia, inline: false });
  }

  embed.setFooter({ text: `🗺 ${tipo} · publicado por ${authorTag}` }).setTimestamp();

  return embed;
}

// ─────────────────────────────────────────────────────────────────
//  Botones de anotación
// ─────────────────────────────────────────────────────────────────
function buildCompoButtons(compo) {
  const { slots, signups } = compo;

  const isFull = (role) => (signups[role]?.length ?? 0) >= (slots[role] ?? 0);

  const buttons = [];

  if ((slots.tank ?? 0) > 0) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId("signup_tank")
        .setLabel(`🛡 Tank (${signups.tank.length}/${slots.tank})`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(isFull("tank"))
    );
  }

  if ((slots.healer ?? 0) > 0) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId("signup_heal")
        .setLabel(`💚 Healer (${signups.healer.length}/${slots.healer})`)
        .setStyle(ButtonStyle.Success)
        .setDisabled(isFull("healer"))
    );
  }

  if ((slots.dps ?? 0) > 0) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId("signup_dps")
        .setLabel(`⚔ DPS (${signups.dps.length}/${slots.dps})`)
        .setStyle(ButtonStyle.Danger)
        .setDisabled(isFull("dps"))
    );
  }

  if ((slots.support ?? 0) > 0) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId("signup_sup")
        .setLabel(`✨ Support (${signups.support.length}/${slots.support})`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(isFull("support"))
    );
  }

  buttons.push(
    new ButtonBuilder()
      .setCustomId("signup_out")
      .setLabel("✗ Desanotarme")
      .setStyle(ButtonStyle.Secondary)
  );

  // Discord permite máx 5 botones por fila
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }

  return rows;
}

module.exports = { buildPTEmbed, buildCompoEmbed, buildCompoButtons };
