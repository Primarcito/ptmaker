require("dotenv").config();
const {
  Client, GatewayIntentBits, Collection, REST, Routes,
  SlashCommandBuilder, EmbedBuilder,
  ButtonBuilder, ButtonStyle, ActionRowBuilder,
  StringSelectMenuBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle,
} = require("discord.js");
const fs   = require("fs");
const path = require("path");

// ════════════════════════════════════════════════════════════
//  PERSISTENCIA
// ════════════════════════════════════════════════════════════
const DATA_DIR       = path.join(process.cwd(), "data");
const TEMPLATES_FILE = path.join(DATA_DIR, "templates.json");
const COMPOS_FILE    = path.join(DATA_DIR, "compos.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let templates = {};
let compos    = {};

try { templates = JSON.parse(fs.readFileSync(TEMPLATES_FILE, "utf8")); } catch {}
try { compos    = JSON.parse(fs.readFileSync(COMPOS_FILE, "utf8"));    } catch {}

const saveTemplates = () => fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(templates, null, 2));
const saveCompos    = () => fs.writeFileSync(COMPOS_FILE,    JSON.stringify(compos,    null, 2));

// ════════════════════════════════════════════════════════════
//  CONFIG
// ════════════════════════════════════════════════════════════
const ADMIN_ROLES     = ["852823068475785217", "983987481961717782"];
const ZVZ_ROLE        = "1468028696148312189";
const PVPPVE_ROLE     = "1493273036369952860";
const ALLOWED_CHANNELS = ["1402080321150652426", "1423098812938981449", "1471843096018026669"];

// ════════════════════════════════════════════════════════════
//  PARSER DE COMPOSICIÓN
// ════════════════════════════════════════════════════════════
function parseComposition(input) {
  const slots  = { tank: 0, healer: 0, dps: 0, support: 0 };
  const builds = { tank: [], healer: [], dps: [], support: [] };
  if (!input) return { slots, builds };

  let cur = null;
  for (const line of input.split("\n").map(l => l.trim()).filter(Boolean)) {
    const lo = line.toLowerCase();
    let isHeader = false;

    if      (lo.startsWith("tank") || lo === "tanque") { cur = "tank";    isHeader = true; }
    else if (lo.startsWith("heal"))                     { cur = "healer";  isHeader = true; }
    else if (lo.startsWith("dps")  || lo.startsWith("dam")) { cur = "dps"; isHeader = true; }
    else if (lo.startsWith("sup")  || lo.startsWith("sor")) { cur = "support"; isHeader = true; }

    if (isHeader) { if (slots[cur] === 0) slots[cur] = 1; continue; }
    if (cur) {
      if (slots[cur] === 1 && builds[cur].length === 0) slots[cur] = 0;
      builds[cur].push(line);
      slots[cur]++;
    }
  }
  return { slots, builds };
}

// ════════════════════════════════════════════════════════════
//  BUILDERS DE EMBED Y BOTONES
// ════════════════════════════════════════════════════════════
function buildCompoEmbed(compo) {
  const { nombre, tipo, estrategia, slots, builds, signups, authorTag } = compo;
  const totalSlots  = Object.values(slots).reduce((a, b) => a + b, 0);
  const totalFilled = Object.values(signups).reduce(
    (acc, arr) => acc + (Array.isArray(arr) ? arr.filter(Boolean).length : 0), 0
  );
  const isFull = totalFilled >= totalSlots;

  const embed = new EmbedBuilder()
    .setColor(isFull ? 0x57C457 : 0xE05B5B)
    .setTitle(`${isFull ? "✅" : "🗺️"} ${nombre}`)
    .addFields(
      { name: "📌 Tipo",  value: tipo,                            inline: true },
      { name: "👥 Slots", value: `${totalFilled}/${totalSlots}`,  inline: true },
    );

  const roleConfig = [
    { key: "tank",    emoji: "🛡️", label: "Tank"    },
    { key: "healer",  emoji: "🚑", label: "Healer"  },
    { key: "dps",     emoji: "🔥", label: "DPS"     },
    { key: "support", emoji: "✨", label: "Support" },
  ];

  for (const { key, emoji, label } of roleConfig) {
    const max = slots[key] || 0;
    if (max === 0) continue;
    const arr        = signups[key] || [];
    const roleBuilds = builds?.[key] || [];
    let   filled     = 0;
    const lines      = [];

    for (let i = 0; i < max; i++) {
      const u = arr[i];
      if (u) filled++;
      const userStr  = u ? `✅ <@${u.userId}>` : "⬜ *vacío*";
      const buildStr = roleBuilds[i] ? ` · *${roleBuilds[i]}*` : "";
      lines.push(`${userStr}${buildStr}`);
    }
    embed.addFields({ name: `${emoji} ${label} (${filled}/${max})`, value: lines.join("\n"), inline: true });
  }

  if (estrategia) embed.addFields({ name: "📋 Estrategia", value: estrategia, inline: false });
  embed.setFooter({ text: `🌍 ${tipo} · publicado por ${authorTag}` }).setTimestamp();
  return embed;
}

function buildCompoButtons(compo) {
  const { slots, signups } = compo;
  const filled = (r) => (signups[r] || []).filter(Boolean).length;
  const full   = (r) => filled(r) >= (slots[r] ?? 0);
  const btns   = [];

  if ((slots.tank    ?? 0) > 0) btns.push(new ButtonBuilder().setCustomId("signup_tank").setLabel(`🛡️ Tank (${filled("tank")}/${slots.tank})`).setStyle(ButtonStyle.Primary).setDisabled(full("tank")));
  if ((slots.healer  ?? 0) > 0) btns.push(new ButtonBuilder().setCustomId("signup_heal").setLabel(`🚑 Healer (${filled("healer")}/${slots.healer})`).setStyle(ButtonStyle.Primary).setDisabled(full("healer")));
  if ((slots.dps     ?? 0) > 0) btns.push(new ButtonBuilder().setCustomId("signup_dps").setLabel(`🔥 DPS (${filled("dps")}/${slots.dps})`).setStyle(ButtonStyle.Primary).setDisabled(full("dps")));
  if ((slots.support ?? 0) > 0) btns.push(new ButtonBuilder().setCustomId("signup_sup").setLabel(`✨ Support (${filled("support")}/${slots.support})`).setStyle(ButtonStyle.Primary).setDisabled(full("support")));
  btns.push(new ButtonBuilder().setCustomId("signup_out").setLabel("✗ Desanotarme").setStyle(ButtonStyle.Danger));

  const rows = [];
  for (let i = 0; i < btns.length; i += 5)
    rows.push(new ActionRowBuilder().addComponents(btns.slice(i, i + 5)));
  return rows;
}

// ════════════════════════════════════════════════════════════
//  CLIENTE
// ════════════════════════════════════════════════════════════
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

// ════════════════════════════════════════════════════════════
//  READY — Registro de comandos
// ════════════════════════════════════════════════════════════
client.once("ready", async () => {
  console.log(`✅ Bot online: ${client.user.tag}`);

  const cmds = [
    new SlashCommandBuilder().setName("pt-compo").setDescription("Crea una plantilla de composición"),
    new SlashCommandBuilder().setName("pt-lanzar").setDescription("Lanza una composición al canal")
      .addStringOption(o => o.setName("plantilla").setDescription("Nombre de la plantilla").setRequired(true).setAutocomplete(true)),
    new SlashCommandBuilder().setName("pt-dashboard").setDescription("Panel administrativo de plantillas"),
  ];

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: cmds.map(c => c.toJSON()) });
  console.log("✅ Comandos registrados");
});

// ════════════════════════════════════════════════════════════
//  INTERACTION CREATE
// ════════════════════════════════════════════════════════════
client.on("interactionCreate", async (interaction) => {
  try {
    await handle(interaction);
  } catch (err) {
    console.error("Error en interacción:", err);
    const msg = { content: "❌ Ocurrió un error inesperado.", ephemeral: true };
    try {
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
      else await interaction.reply(msg);
    } catch {}
  }
});

// ════════════════════════════════════════════════════════════
//  HANDLER PRINCIPAL
// ════════════════════════════════════════════════════════════
async function handle(interaction) {

  // ── AUTOCOMPLETE ────────────────────────────────────────
  if (interaction.isAutocomplete()) {
    const focused  = interaction.options.getFocused().toLowerCase();
    const choices  = Object.keys(templates)
      .filter(k => k.toLowerCase().includes(focused))
      .slice(0, 25)
      .map(k => ({ name: k, value: k }));
    return interaction.respond(choices);
  }

  // ── SLASH COMMANDS ───────────────────────────────────────
  if (interaction.isChatInputCommand()) {
    if (!ALLOWED_CHANNELS.includes(interaction.channelId))
      return interaction.reply({ content: "❌ No puedes usar comandos en este canal.", ephemeral: true });

    const hasAdmin = interaction.member.roles.cache.some(r => ADMIN_ROLES.includes(r.id));

    // /pt-compo
    if (interaction.commandName === "pt-compo") {
      const modal = new ModalBuilder().setCustomId("modal_compo").setTitle("📋 Nueva Plantilla de Composición");
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("nombre").setLabel("Nombre de la Composición").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("tipo").setLabel("Tipo (PvE, PvP, ZvZ)").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("composicion").setLabel("Roles y Armas (un arma por línea)").setStyle(TextInputStyle.Paragraph).setRequired(true).setPlaceholder("Tank\nIncubo\nHealer\nSantificador\nDPS\nDaga 1H")),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("estrategia").setLabel("Estrategia / Notas").setStyle(TextInputStyle.Paragraph).setRequired(false)),
      );
      return interaction.showModal(modal);
    }

    // /pt-lanzar
    if (interaction.commandName === "pt-lanzar") {
      const tName = interaction.options.getString("plantilla");
      const t     = templates[tName];
      if (!t) return interaction.reply({ content: `❌ Plantilla **${tName}** no encontrada.`, ephemeral: true });

      const tLo = t.tipo.toLowerCase();
      if (tLo.includes("zvz")  && !interaction.member.roles.cache.has(ZVZ_ROLE)   && !hasAdmin)
        return interaction.reply({ content: "❌ No tienes rol para lanzar ZvZ.", ephemeral: true });
      if ((tLo.includes("pvp") || tLo.includes("pve")) && !interaction.member.roles.cache.has(PVPPVE_ROLE) && !hasAdmin)
        return interaction.reply({ content: "❌ No tienes rol para lanzar PvP/PvE.", ephemeral: true });

      const compoData = {
        nombre: t.nombre, tipo: t.tipo,
        slots: { ...t.slots }, builds: { ...t.builds },
        estrategia: t.estrategia,
        signups: {
          tank:    Array(t.slots.tank    || 0).fill(null),
          healer:  Array(t.slots.healer  || 0).fill(null),
          dps:     Array(t.slots.dps     || 0).fill(null),
          support: Array(t.slots.support || 0).fill(null),
        },
        authorId: interaction.user.id, authorTag: interaction.user.username,
        createdAt: Date.now(),
      };

      const msg = await interaction.reply({
        content: `📋 **${interaction.user.username}** publicó la composición **${t.nombre}**. ¡Anotate!`,
        embeds: [buildCompoEmbed(compoData)],
        components: buildCompoButtons(compoData),
        fetchReply: true,
      });

      compos[msg.id] = compoData;
      saveCompos();
      return;
    }

    // /pt-dashboard
    if (interaction.commandName === "pt-dashboard") {
      if (!hasAdmin) return interaction.reply({ content: "❌ Solo administradores.", ephemeral: true });

      const keys = Object.keys(templates);
      if (keys.length === 0) return interaction.reply({ content: "📂 No hay plantillas aún.", ephemeral: true });

      const select = new StringSelectMenuBuilder()
        .setCustomId("dash_select_template")
        .setPlaceholder("Selecciona una plantilla...")
        .addOptions(keys.slice(0, 25).map(name => ({
          label: name.slice(0, 100),
          description: `Tipo: ${templates[name].tipo}`,
          value: name, emoji: "📁",
        })));

      return interaction.reply({
        content: "## 🎛️ Dashboard de Plantillas\nElige cuál deseas administrar:",
        components: [new ActionRowBuilder().addComponents(select)],
        ephemeral: true,
      });
    }
    return;
  }

  // ── MODAL: Crear plantilla ───────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId === "modal_compo") {
    const nombre       = interaction.fields.getTextInputValue("nombre").trim();
    const tipo         = interaction.fields.getTextInputValue("tipo").trim();
    const composRaw    = interaction.fields.getTextInputValue("composicion").trim();
    const estrategia   = interaction.fields.getTextInputValue("estrategia").trim();
    const hasAdmin     = interaction.member.roles.cache.some(r => ADMIN_ROLES.includes(r.id));
    const tLo          = tipo.toLowerCase();

    if (tLo.includes("zvz") && !interaction.member.roles.cache.has(ZVZ_ROLE) && !hasAdmin)
      return interaction.reply({ content: "❌ Sin rol para crear ZvZ.", ephemeral: true });
    if ((tLo.includes("pvp") || tLo.includes("pve")) && !interaction.member.roles.cache.has(PVPPVE_ROLE) && !hasAdmin)
      return interaction.reply({ content: "❌ Sin rol para crear PvP/PvE.", ephemeral: true });

    const { slots, builds } = parseComposition(composRaw);
    if (Object.values(slots).reduce((a, b) => a + b, 0) === 0)
      return interaction.reply({ content: "❌ Formato inválido. Usa: Tank, Healer, DPS, Support como encabezados.", ephemeral: true });

    templates[nombre] = { nombre, tipo, slots, builds, estrategia, rawComposicion: composRaw, authorId: interaction.user.id, authorTag: interaction.user.username, createdAt: Date.now() };
    saveTemplates();
    return interaction.reply({ content: `✅ Plantilla **${nombre}** guardada. Usa \`/pt-lanzar\` para publicarla.`, ephemeral: true });
  }

  // ── MODAL: Editar plantilla (Dashboard) ─────────────────
  if (interaction.isModalSubmit() && interaction.customId.startsWith("dash_modal_edit_")) {
    const tName      = interaction.customId.replace("dash_modal_edit_", "");
    const tipo       = interaction.fields.getTextInputValue("tipo").trim();
    const composRaw  = interaction.fields.getTextInputValue("composicion").trim();
    const estrategia = interaction.fields.getTextInputValue("estrategia").trim();
    const { slots, builds } = parseComposition(composRaw);

    if (Object.values(slots).reduce((a, b) => a + b, 0) === 0)
      return interaction.reply({ content: "❌ Formato inválido.", ephemeral: true });

    templates[tName] = { ...(templates[tName] || {}), tipo, slots, builds, estrategia, rawComposicion: composRaw };
    saveTemplates();
    return interaction.update({ content: `✅ Plantilla **${tName}** actualizada.`, embeds: [], components: [] });
  }

  // ── SELECT: Dashboard ────────────────────────────────────
  if (interaction.isStringSelectMenu() && interaction.customId === "dash_select_template") {
    const tName = interaction.values[0];
    const t     = templates[tName];
    if (!t) return interaction.update({ content: "❌ Plantilla no encontrada.", components: [] });

    const totalSlots = Object.values(t.slots).reduce((a, b) => a + b, 0);
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📁 ${t.nombre}`)
      .addFields(
        { name: "📌 Tipo",       value: t.tipo,                                              inline: true },
        { name: "👥 Slots",      value: String(totalSlots),                                   inline: true },
        { name: "📋 Estrategia", value: t.estrategia || "*Sin estrategia*",                   inline: false },
        { name: "📝 Composición", value: `\`\`\`\n${(t.rawComposicion||"").slice(0,900)}\n\`\`\``, inline: false },
      )
      .setFooter({ text: `Creada por ${t.authorTag}` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`dash_edit_${tName}`).setLabel("✏️ Editar").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`dash_askdel_${tName}`).setLabel("🗑️ Borrar").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("dash_back").setLabel("⬅️ Volver").setStyle(ButtonStyle.Secondary),
    );
    return interaction.update({ content: "", embeds: [embed], components: [row] });
  }

  // ── BUTTONS: Dashboard ───────────────────────────────────
  if (interaction.isButton() && (
    interaction.customId.startsWith("dash_") ||
    interaction.customId === "dash_back"
  )) {
    const id = interaction.customId;

    if (id === "dash_back") {
      const keys = Object.keys(templates);
      if (keys.length === 0) return interaction.update({ content: "📂 No hay plantillas.", embeds: [], components: [] });
      const select = new StringSelectMenuBuilder()
        .setCustomId("dash_select_template")
        .setPlaceholder("Selecciona una plantilla...")
        .addOptions(keys.slice(0, 25).map(n => ({ label: n.slice(0, 100), description: `Tipo: ${templates[n].tipo}`, value: n, emoji: "📁" })));
      return interaction.update({ content: "## 🎛️ Dashboard de Plantillas\nElige cuál deseas administrar:", embeds: [], components: [new ActionRowBuilder().addComponents(select)] });
    }

    if (id.startsWith("dash_edit_")) {
      const tName = id.replace("dash_edit_", "");
      const t = templates[tName];
      if (!t) return interaction.reply({ content: "❌ No encontrada.", ephemeral: true });
      const modal = new ModalBuilder().setCustomId(`dash_modal_edit_${tName}`).setTitle(`✏️ Editar: ${tName}`.slice(0, 45));
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("tipo").setLabel("Tipo").setStyle(TextInputStyle.Short).setValue(t.tipo).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("composicion").setLabel("Composición").setStyle(TextInputStyle.Paragraph).setValue((t.rawComposicion||"").slice(0, 4000)).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("estrategia").setLabel("Estrategia").setStyle(TextInputStyle.Paragraph).setValue(t.estrategia||"").setRequired(false)),
      );
      return interaction.showModal(modal);
    }

    if (id.startsWith("dash_askdel_")) {
      const tName = id.replace("dash_askdel_", "");
      return interaction.update({
        content: `### 🛑 ¿Estás seguro?\nVas a eliminar permanentemente **${tName}**. Esta acción no se puede deshacer.`,
        embeds: [], components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`dash_confdel_${tName}`).setLabel("⚠️ SÍ, BORRAR").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("dash_back").setLabel("Cancelar").setStyle(ButtonStyle.Secondary),
        )],
      });
    }

    if (id.startsWith("dash_confdel_")) {
      const tName = id.replace("dash_confdel_", "");
      delete templates[tName];
      saveTemplates();
      return interaction.update({ content: `✅ Plantilla **${tName}** borrada.`, embeds: [], components: [] });
    }

    return;
  }

  // ── BUTTONS: Anotarse / Desanotarse ──────────────────────
  if (interaction.isButton()) {
    const { customId, message, user } = interaction;
    const VALID = ["signup_tank", "signup_heal", "signup_dps", "signup_sup", "signup_out"];
    if (!VALID.includes(customId)) return;

    const compo = compos[message.id];
    if (!compo) return interaction.reply({ content: "❌ Composición no disponible.", ephemeral: true });

    // Desanotarse
    if (customId === "signup_out") {
      let removed = false;
      for (const arr of Object.values(compo.signups)) {
        const i = arr.findIndex(s => s?.userId === user.id);
        if (i !== -1) { arr[i] = null; removed = true; }
      }
      if (!removed) return interaction.reply({ content: "❌ No estás anotado.", ephemeral: true });
      saveCompos();
      // update() edita directamente el mensaje del botón (el cartel público)
      await interaction.update({ embeds: [buildCompoEmbed(compo)], components: buildCompoButtons(compo) });
      await interaction.followUp({ content: "✅ Te has desanotado.", ephemeral: true });
      return;
    }

    // Anotarse
    const roleMap = { signup_tank: "tank", signup_heal: "healer", signup_dps: "dps", signup_sup: "support" };
    const role = roleMap[customId];

    if (compo.signups[role].some(s => s?.userId === user.id))
      return interaction.reply({ content: "❌ Ya estás anotado en ese rol.", ephemeral: true });

    const freeIdxs = compo.signups[role].reduce((acc, s, i) => { if (!s) acc.push(i); return acc; }, []);
    if (freeIdxs.length === 0)
      return interaction.reply({ content: "❌ No hay slots libres para ese rol.", ephemeral: true });

    const roleBuilds = compo.builds?.[role] || [];

    // Múltiples armas → mostrar menú ephemeral para elegir
    if (roleBuilds.length > 0 && freeIdxs.length > 1) {
      const options = freeIdxs.map(idx => ({
        label: (roleBuilds[idx] || `Asiento ${idx + 1}`).slice(0, 100),
        value: String(idx),
        emoji: "🎯",
      }));

      const select = new StringSelectMenuBuilder()
        // Guardamos: msgId del cartel y role. channelId lo recuperamos de interaction.channelId al seleccionar.
        .setCustomId(`pick_${message.id}_${role}`)
        .setPlaceholder("Selecciona tu especialidad...")
        .addOptions(options.slice(0, 25));

      // Respuesta efímera: solo tú ves el menú, el cartel no se toca aún
      return interaction.reply({
        content: "👇 Selecciona tu especialidad:",
        components: [new ActionRowBuilder().addComponents(select)],
        ephemeral: true,
      });
    }

    // Un solo slot libre (o sin armas específicas) → asignar directo
    for (const arr of Object.values(compo.signups)) {
      const i = arr.findIndex(s => s?.userId === user.id);
      if (i !== -1) arr[i] = null;
    }
    compo.signups[role][freeIdxs[0]] = { userId: user.id, ign: user.username };
    saveCompos();

    // update() edita el cartel público directamente
    await interaction.update({ embeds: [buildCompoEmbed(compo)], components: buildCompoButtons(compo) });
    await interaction.followUp({ content: `✅ <@${user.id}>, te has anotado como **${role.toUpperCase()}**.`, ephemeral: true });
    return;
  }

  // ── SELECT: Elegir especialidad ──────────────────────────
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("pick_")) {
    // customId: pick_MSGID_role   (el msgId es un snowflake solo-números, sin _)
    const withoutPrefix = interaction.customId.slice("pick_".length);   // "MSGID_role"
    const underscorePos = withoutPrefix.indexOf("_");
    const msgId         = withoutPrefix.slice(0, underscorePos);
    const role          = withoutPrefix.slice(underscorePos + 1);
    const selectedIndex = parseInt(interaction.values[0], 10);

    const compo = compos[msgId];
    if (!compo) return interaction.update({ content: "❌ Composición expirada.", components: [] });

    const roleBuilds = compo.builds?.[role] || [];
    if (compo.signups[role][selectedIndex] !== null)
      return interaction.update({ content: "❌ Ese asiento ya fue tomado. Vuelve a intentar.", components: [] });

    // Limpiar de otros roles
    for (const arr of Object.values(compo.signups)) {
      const i = arr.findIndex(s => s?.userId === interaction.user.id);
      if (i !== -1) arr[i] = null;
    }
    compo.signups[role][selectedIndex] = { userId: interaction.user.id, ign: interaction.user.username };
    saveCompos();

    // 1. Cerrar el menú ephemeral
    await interaction.update({ content: `✅ <@${interaction.user.id}>, reclamaste **${roleBuilds[selectedIndex] || role.toUpperCase()}**.`, components: [] });

    // 2. Editar el cartel público (fetch robusto vía guild)
    try {
      const ch    = interaction.guild.channels.cache.get(interaction.channelId)
                 ?? await interaction.guild.channels.fetch(interaction.channelId);
      const cartel = await ch.messages.fetch(msgId);
      await cartel.edit({ embeds: [buildCompoEmbed(compo)], components: buildCompoButtons(compo) });
    } catch (e) {
      console.error("[pick] Error actualizando cartel:", e.message);
    }
    return;
  }
}

client.login(process.env.DISCORD_TOKEN);
