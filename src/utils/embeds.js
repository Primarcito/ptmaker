const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const GOLD   = 0xE8A838;
const RED    = 0xE05B5B;
const GREEN  = 0x57C457;

// ─────────────────────────────────────────────────────────────────
//  PT embed (perfil del jugador)
// ─────────────────────────────────────────────────────────────────
function buildPTEmbed(pt, user) {
  const rolEmoji = { tank: "🛡️", healer: "🚑", dps: "🔥", support: "✨" };
  const emoji = rolEmoji[pt.rol?.toLowerCase()] ?? "⚔️";

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
  const totalFilled = Object.values(signups).reduce((acc, arr) => acc + arr.filter(s => s !== null).length, 0);
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
    { key: "tank",    emoji: "🛡️", label: "Tank"    },
    { key: "healer",  emoji: "🚑", label: "Healer"  },
    { key: "dps",     emoji: "🔥", label: "DPS"     },
    { key: "support", emoji: "✨", label: "Support" },
  ];

  for (const { key, emoji, label } of roleConfig) {
    const max = slots[key] || 0;
    if (max === 0) continue;

    const arrFixed   = signups[key] || [];
    const roleBuilds = builds?.[key] || [];
    const lines      = [];
    let filledCount  = 0;

    for (let i = 0; i < max; i++) {
      const userObj = arrFixed[i];
      if (userObj) filledCount++;
      const userStr = userObj ? `✅ <@${userObj.userId}>` : "⬜ *vacío*";
      const buildStr = roleBuilds[i] ? ` · *${roleBuilds[i]}*` : "";
      lines.push(`${userStr}${buildStr}`);
    }

    embed.addFields({
      name:   `${emoji} ${label} (${filledCount}/${max})`,
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

  const countFilled = (role) => (signups[role] || []).filter(s => s !== null).length;
  const isFull = (role) => countFilled(role) >= (slots[role] ?? 0);

  const buttons = [];

  if ((slots.tank ?? 0) > 0) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId("signup_tank")
        .setLabel(`🛡️ Tank (${countFilled("tank")}/${slots.tank})`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(isFull("tank"))
    );
  }

  if ((slots.healer ?? 0) > 0) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId("signup_heal")
        .setLabel(`🚑 Healer (${countFilled("healer")}/${slots.healer})`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(isFull("healer"))
    );
  }

  if ((slots.dps ?? 0) > 0) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId("signup_dps")
        .setLabel(`🔥 DPS (${countFilled("dps")}/${slots.dps})`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(isFull("dps"))
    );
  }

  if ((slots.support ?? 0) > 0) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId("signup_sup")
        .setLabel(`✨ Support (${countFilled("support")}/${slots.support})`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(isFull("support"))
    );
  }

  buttons.push(
    new ButtonBuilder()
      .setCustomId("signup_out")
      .setLabel("✗ Desanotarme")
      .setStyle(ButtonStyle.Danger)
  );

  // Discord permite máx 5 botones por fila
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }

  return rows;
}

module.exports = { buildPTEmbed, buildCompoEmbed, buildCompoButtons };
