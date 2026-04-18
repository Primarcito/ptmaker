require("dotenv").config();
const {
  Client, GatewayIntentBits, REST, Routes,
  SlashCommandBuilder, EmbedBuilder,
  ButtonBuilder, ButtonStyle, ActionRowBuilder,
  StringSelectMenuBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle,
} = require("discord.js");
const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");

// ════════════════════════════════════════════════════════════
//  PERSISTENCIA
// ════════════════════════════════════════════════════════════
const DATA_DIR = path.join(process.cwd(), "data");
const TEMPLATES_FILE = path.join(DATA_DIR, "templates.json");
const COMPOS_FILE = path.join(DATA_DIR, "compos.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let templates = {};
let compos = {};

try {
  templates = JSON.parse(fs.readFileSync(TEMPLATES_FILE, "utf8"));
} catch (err) {
  if (err.code !== "ENOENT") {
    console.error("FATAL: Error al leer templates.json. Verifica si el archivo está corrupto:", err);
    process.exit(1);
  }
}

try {
  compos = JSON.parse(fs.readFileSync(COMPOS_FILE, "utf8"));
} catch (err) {
  if (err.code !== "ENOENT") {
    console.error("FATAL: Error al leer compos.json. Verifica si el archivo está corrupto:", err);
    process.exit(1);
  }
}

const saveTemplates = () => fsPromises.writeFile(TEMPLATES_FILE, JSON.stringify(templates, null, 2)).catch(console.error);
const saveCompos = () => fsPromises.writeFile(COMPOS_FILE, JSON.stringify(compos, null, 2)).catch(console.error);

// ════════════════════════════════════════════════════════════
//  MAP: Dropdown pendiente
//  Clave: userId → { origInteraction, msgId }
//  Guardamos la interacción del botón (deferUpdate) para poder
//  editar el cartel público luego desde el select ephemeral.
// ════════════════════════════════════════════════════════════
const pendingDropdowns = new Map();

// ════════════════════════════════════════════════════════════
//  CONFIG
// ════════════════════════════════════════════════════════════
const ADMIN_ROLES = process.env.ADMIN_ROLES ? process.env.ADMIN_ROLES.split(",") : ["852823068475785217", "983987481961717782"];
const ZVZ_ROLE = process.env.ZVZ_ROLE || "1468028696148312189";
const PVPPVE_ROLE = process.env.PVPPVE_ROLE || "1493273036369952860";
const ALLOWED_CHANNELS = process.env.ALLOWED_CHANNELS ? process.env.ALLOWED_CHANNELS.split(",") : ["1402080321150652426", "1423098812938981449", "1471843096018026669"];

// ════════════════════════════════════════════════════════════
//  PARSER
// ════════════════════════════════════════════════════════════
function parseComposition(input) {
  const slots = { tank: 0, healer: 0, dps: 0, support: 0 };
  const builds = { tank: [], healer: [], dps: [], support: [] };
  if (!input) return { slots, builds };

  let cur = null;
  for (const line of input.split("\n").map(l => l.trim()).filter(Boolean)) {
    const lo = line.toLowerCase();
    let isHeader = false;
    if (lo.startsWith("tank") || lo === "tanque") { cur = "tank"; isHeader = true; }
    else if (lo.startsWith("heal")) { cur = "healer"; isHeader = true; }
    else if (lo.startsWith("dps") || lo.startsWith("dam")) { cur = "dps"; isHeader = true; }
    else if (lo.startsWith("sup") || lo.startsWith("sor")) { cur = "support"; isHeader = true; }

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
//  BUILDERS
// ════════════════════════════════════════════════════════════
function buildCompoEmbed(compo) {
  const { nombre, tipo, estrategia, slots, builds, signups, authorTag } = compo;
  const totalSlots = Object.values(slots).reduce((a, b) => a + b, 0);
  const totalFilled = Object.values(signups).reduce(
    (acc, arr) => acc + (Array.isArray(arr) ? arr.filter(Boolean).length : 0), 0
  );
  const isFull = totalFilled >= totalSlots;

  const embed = new EmbedBuilder()
    .setColor(isFull ? 0x57C457 : 0xE05B5B)
    .setTitle(`${isFull ? "✅" : "🗺️"} ${nombre}`)
    .addFields(
      { name: "📌 Tipo", value: tipo, inline: true },
      { name: "👥 Slots totales", value: `${totalFilled}/${totalSlots}`, inline: true }
    );

  let rosterDesc = "";

  for (const { key, emoji, label } of [
    { key: "tank", emoji: "🛡️", label: "Tank" },
    { key: "healer", emoji: "🚑", label: "Healer" },
    { key: "dps", emoji: "🔥", label: "DPS" },
    { key: "support", emoji: "✨", label: "Support" },
  ]) {
    const max = slots[key] || 0;
    if (max === 0) continue;
    const arr = signups[key] || [];
    const roleBuilds = builds?.[key] || [];
    let filled = 0;
    const lines = [];
    for (let i = 0; i < max; i++) {
      const u = arr[i];
      if (u) filled++;
      const buildText = u && u.build ? u.build : roleBuilds[i];
      lines.push(`${u ? `✅ **<@${u.userId}>**` : "⬜ *vacío*"}${buildText ? ` · *${buildText}*` : ""}`);
    }
    rosterDesc += `\n**${emoji} ${label} (${filled}/${max})**\n${lines.join("\n")}\n`;
  }

  embed.setDescription(rosterDesc || "No hay roles definidos.");

  if (estrategia) embed.addFields({ name: "📋 Estrategia", value: estrategia, inline: false });
  embed.setFooter({ text: `🌍 ${tipo} · publicado por ${authorTag}` }).setTimestamp();
  return embed;
}

function buildCompoButtons(compo) {
  const { slots, signups } = compo;
  const filled = (r) => (signups[r] || []).filter(Boolean).length;
  const full = (r) => filled(r) >= (slots[r] ?? 0);
  const btns = [];

  if ((slots.tank ?? 0) > 0) btns.push(new ButtonBuilder().setCustomId("signup_tank").setLabel(`🛡️ Tank (${filled("tank")}/${slots.tank})`).setStyle(ButtonStyle.Primary).setDisabled(full("tank")));
  if ((slots.healer ?? 0) > 0) btns.push(new ButtonBuilder().setCustomId("signup_heal").setLabel(`🚑 Healer (${filled("healer")}/${slots.healer})`).setStyle(ButtonStyle.Primary).setDisabled(full("healer")));
  if ((slots.dps ?? 0) > 0) btns.push(new ButtonBuilder().setCustomId("signup_dps").setLabel(`🔥 DPS (${filled("dps")}/${slots.dps})`).setStyle(ButtonStyle.Primary).setDisabled(full("dps")));
  if ((slots.support ?? 0) > 0) btns.push(new ButtonBuilder().setCustomId("signup_sup").setLabel(`✨ Support (${filled("support")}/${slots.support})`).setStyle(ButtonStyle.Primary).setDisabled(full("support")));
  btns.push(new ButtonBuilder().setCustomId("signup_out").setLabel("✗ Desanotarme").setStyle(ButtonStyle.Danger));

  const rows = [];
  for (let i = 0; i < btns.length; i += 5)
    rows.push(new ActionRowBuilder().addComponents(btns.slice(i, i + 5)));
  return rows;
}

async function updateParentEmbed(client, compo) {
  if (!compo.parentMsgId || !compo.channelId) return;
  try {
    const channel = client.channels.cache.get(compo.channelId) || await client.channels.fetch(compo.channelId);
    if (!channel) return;
    const parentMsg = await channel.messages.fetch(compo.parentMsgId);
    if (parentMsg) await parentMsg.edit({ embeds: [buildCompoEmbed(compo)] });
  } catch (err) {
    console.error("Error actualizando cartel principal:", err);
  }
}

// ════════════════════════════════════════════════════════════
//  CLIENTE
// ════════════════════════════════════════════════════════════
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.once("clientReady", async () => {
  console.log(`✅ Online: ${client.user.tag}`);
  const cmds = [
    new SlashCommandBuilder()
      .setName("pt-compo")
      .setDescription("Crea una plantilla de composición"),
    new SlashCommandBuilder()
      .setName("pt-lanzar")
      .setDescription("Lanza una composición al canal")
      .addStringOption(o => o.setName("plantilla").setDescription("Nombre de la plantilla").setRequired(true).setAutocomplete(true)),
    new SlashCommandBuilder()
      .setName("pt-dashboard")
      .setDescription("Panel admin de plantillas"),
  ];
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: cmds.map(c => c.toJSON()) });
  console.log("✅ Comandos registrados");
});

// ════════════════════════════════════════════════════════════
//  INTERACTION CREATE
// ════════════════════════════════════════════════════════════
client.on("interactionCreate", async (interaction) => {
  try { await handle(interaction); }
  catch (err) {
    console.error("Error en interacción:", err);
    const msg = { content: "❌ Error inesperado.", ephemeral: true };
    try {
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
      else await interaction.reply(msg);
    } catch { }
  }
});

// ════════════════════════════════════════════════════════════
//  HANDLER
// ════════════════════════════════════════════════════════════
async function handle(interaction) {

  // ── AUTOCOMPLETE ──────────────────────────────────────────
  if (interaction.isAutocomplete()) {
    const focused = interaction.options.getFocused().toLowerCase();
    return interaction.respond(
      Object.keys(templates)
        .filter(k => k.toLowerCase().includes(focused))
        .slice(0, 25)
        .map(k => ({ name: k, value: k }))
    );
  }

  // ── SLASH COMMANDS ────────────────────────────────────────
  if (interaction.isChatInputCommand()) {
    if (!ALLOWED_CHANNELS.includes(interaction.channelId))
      return interaction.reply({ content: "❌ Canal no permitido.", ephemeral: true });

    const hasAdmin = interaction.member.roles.cache.some(r => ADMIN_ROLES.includes(r.id));

    // /pt-compo
    if (interaction.commandName === "pt-compo") {
      const modal = new ModalBuilder().setCustomId("modal_compo").setTitle("📋 Nueva Plantilla");
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("nombre").setLabel("Nombre").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("tipo").setLabel("Tipo (PvE, PvP, ZvZ)").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("composicion").setLabel("Roles y Armas (una por línea)").setStyle(TextInputStyle.Paragraph).setRequired(true).setPlaceholder("Tank\nIncubo\nHealer\nSantificador\nDPS\nDaga 1H")),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("estrategia").setLabel("Estrategia / Notas").setStyle(TextInputStyle.Paragraph).setRequired(false)),
      );
      return interaction.showModal(modal);
    }

    // /pt-lanzar
    if (interaction.commandName === "pt-lanzar") {
      const tName = interaction.options.getString("plantilla");
      const t = templates[tName];
      if (!t) return interaction.reply({ content: `❌ Plantilla **${tName}** no encontrada.`, ephemeral: true });

      const tLo = t.tipo.toLowerCase();
      if (tLo.includes("zvz") && !interaction.member.roles.cache.has(ZVZ_ROLE) && !hasAdmin)
        return interaction.reply({ content: "❌ Sin rol para lanzar ZvZ.", ephemeral: true });
      if ((tLo.includes("pvp") || tLo.includes("pve")) && !interaction.member.roles.cache.has(PVPPVE_ROLE) && !hasAdmin)
        return interaction.reply({ content: "❌ Sin rol para lanzar PvP/PvE.", ephemeral: true });

      const compoData = {
        nombre: t.nombre, tipo: t.tipo,
        slots: { ...t.slots }, builds: { ...t.builds },
        estrategia: t.estrategia,
        signups: {
          tank: Array(t.slots.tank || 0).fill(null),
          healer: Array(t.slots.healer || 0).fill(null),
          dps: Array(t.slots.dps || 0).fill(null),
          support: Array(t.slots.support || 0).fill(null),
        },
        authorId: interaction.user.id, authorTag: interaction.user.username,
        createdAt: Date.now(),
      };

      const msg = await interaction.reply({
        content: `📋 **${interaction.user.username}** publicó **${t.nombre}**.\n🔗 ¡Anotate en el hilo inferior! 👇`,
        embeds: [buildCompoEmbed(compoData)],
        fetchReply: true,
      });

      let targetId = msg.id;

      try {
        const thread = await msg.startThread({
          name: `Anotarse: ${t.nombre}`.slice(0, 100),
          autoArchiveDuration: 1440
        });

        const threadMsg = await thread.send({
          content: "👇 **Elige tu rol usando estos botones:**",
          components: buildCompoButtons(compoData)
        });

        compoData.threadMsgId = threadMsg.id;
        targetId = threadMsg.id;
      } catch (err) {
        console.error("No se pudo crear el hilo, aplicando fallback a botones en parent.", err.message);
        await msg.edit({
          content: `📋 **${interaction.user.username}** publicó **${t.nombre}**. ¡Anotate usando los botones de abajo!`,
          components: buildCompoButtons(compoData)
        });
      }

      compoData.parentMsgId = msg.id;
      compoData.channelId = interaction.channelId;

      compos[targetId] = compoData;
      saveCompos();
      return;
    }

    // /pt-dashboard
    if (interaction.commandName === "pt-dashboard") {
      if (!hasAdmin) return interaction.reply({ content: "❌ Sin permiso.", ephemeral: true });
      const keys = Object.keys(templates);
      if (keys.length === 0) return interaction.reply({ content: "📂 Sin plantillas guardadas.", ephemeral: true });

      const select = new StringSelectMenuBuilder()
        .setCustomId("dash_select_template")
        .setPlaceholder("Selecciona una plantilla...")
        .addOptions(keys.slice(0, 25).map(n => ({
          label: n.slice(0, 100), description: `Tipo: ${templates[n].tipo}`, value: n, emoji: "📁",
        })));

      return interaction.reply({
        content: "## 🎛️ Dashboard · Plantillas\nElige cuál administrar:",
        components: [new ActionRowBuilder().addComponents(select)],
        ephemeral: true,
      });
    }
    return;
  }

  // ── MODAL: Crear plantilla ────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId === "modal_compo") {
    const nombre = interaction.fields.getTextInputValue("nombre").trim();
    const tipo = interaction.fields.getTextInputValue("tipo").trim();
    const composRaw = interaction.fields.getTextInputValue("composicion").trim();
    const estrategia = interaction.fields.getTextInputValue("estrategia").trim();
    const hasAdmin = interaction.member.roles.cache.some(r => ADMIN_ROLES.includes(r.id));
    const tLo = tipo.toLowerCase();

    if (tLo.includes("zvz") && !interaction.member.roles.cache.has(ZVZ_ROLE) && !hasAdmin)
      return interaction.reply({ content: "❌ Sin rol para crear ZvZ.", ephemeral: true });
    if ((tLo.includes("pvp") || tLo.includes("pve")) && !interaction.member.roles.cache.has(PVPPVE_ROLE) && !hasAdmin)
      return interaction.reply({ content: "❌ Sin rol para crear PvP/PvE.", ephemeral: true });

    const { slots, builds } = parseComposition(composRaw);
    if (Object.values(slots).reduce((a, b) => a + b, 0) === 0)
      return interaction.reply({ content: "❌ Formato inválido. Encabezados: `Tank`, `Healer`, `DPS`, `Support`.", ephemeral: true });

    templates[nombre] = {
      nombre, tipo, slots, builds, estrategia,
      rawComposicion: composRaw,
      authorId: interaction.user.id, authorTag: interaction.user.username,
      createdAt: Date.now(),
    };
    saveTemplates();
    return interaction.reply({ content: `✅ **${nombre}** guardada · Usa \`/pt-lanzar\` para publicarla.`, ephemeral: true });
  }

  // ── MODAL: Editar plantilla ───────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId.startsWith("dash_modal_edit_")) {
    const tName = interaction.customId.replace("dash_modal_edit_", "");
    const tipo = interaction.fields.getTextInputValue("tipo").trim();
    const composRaw = interaction.fields.getTextInputValue("composicion").trim();
    const estrategia = interaction.fields.getTextInputValue("estrategia").trim();
    const { slots, builds } = parseComposition(composRaw);

    if (Object.values(slots).reduce((a, b) => a + b, 0) === 0)
      return interaction.reply({ content: "❌ Formato inválido.", ephemeral: true });

    templates[tName] = { ...(templates[tName] || {}), tipo, slots, builds, estrategia, rawComposicion: composRaw };
    saveTemplates();
    return interaction.update({ content: `✅ **${tName}** actualizada.`, embeds: [], components: [] });
  }

  // ── SELECT: Dashboard ─────────────────────────────────────
  if (interaction.isStringSelectMenu() && interaction.customId === "dash_select_template") {
    const tName = interaction.values[0];
    const t = templates[tName];
    if (!t) return interaction.update({ content: "❌ No encontrada.", components: [] });

    const totalSlots = Object.values(t.slots).reduce((a, b) => a + b, 0);
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📁 ${t.nombre}`)
      .addFields(
        { name: "📌 Tipo", value: t.tipo, inline: true },
        { name: "👥 Slots", value: String(totalSlots), inline: true },
        { name: "📋 Estrategia", value: t.estrategia || "*Sin estrategia*", inline: false },
        { name: "📝 Composición", value: `\`\`\`\n${(t.rawComposicion || "").slice(0, 900)}\n\`\`\``, inline: false },
      )
      .setFooter({ text: `Creada por ${t.authorTag}` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`dash_edit_${tName}`).setLabel("✏️ Editar").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`dash_askdel_${tName}`).setLabel("🗑️ Borrar").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("dash_back").setLabel("⬅️ Volver").setStyle(ButtonStyle.Secondary),
    );
    return interaction.update({ content: "", embeds: [embed], components: [row] });
  }

  // ── BUTTONS: Dashboard ────────────────────────────────────
  if (interaction.isButton() && interaction.customId.startsWith("dash_")) {
    const id = interaction.customId;

    if (id === "dash_back") {
      const keys = Object.keys(templates);
      if (keys.length === 0)
        return interaction.update({ content: "📂 Sin plantillas.", embeds: [], components: [] });
      const select = new StringSelectMenuBuilder()
        .setCustomId("dash_select_template")
        .setPlaceholder("Selecciona una plantilla...")
        .addOptions(keys.slice(0, 25).map(n => ({
          label: n.slice(0, 100), description: `Tipo: ${templates[n].tipo}`, value: n, emoji: "📁",
        })));
      return interaction.update({
        content: "## 🎛️ Dashboard · Plantillas\nElige cuál administrar:",
        embeds: [], components: [new ActionRowBuilder().addComponents(select)],
      });
    }

    if (id.startsWith("dash_edit_")) {
      const tName = id.replace("dash_edit_", "");
      const t = templates[tName];
      if (!t) return interaction.reply({ content: "❌ No encontrada.", ephemeral: true });
      const modal = new ModalBuilder()
        .setCustomId(`dash_modal_edit_${tName}`)
        .setTitle(`✏️ Editar: ${tName}`.slice(0, 45));
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("tipo").setLabel("Tipo").setStyle(TextInputStyle.Short).setValue(t.tipo).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("composicion").setLabel("Composición").setStyle(TextInputStyle.Paragraph).setValue((t.rawComposicion || "").slice(0, 4000)).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("estrategia").setLabel("Estrategia").setStyle(TextInputStyle.Paragraph).setValue(t.estrategia || "").setRequired(false)),
      );
      return interaction.showModal(modal);
    }

    if (id.startsWith("dash_askdel_")) {
      const tName = id.replace("dash_askdel_", "");
      return interaction.update({
        content: `### 🛑 ¿Seguro?\nEsto eliminará **${tName}** permanentemente.`,
        embeds: [],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`dash_confdel_${tName}`).setLabel("⚠️ Confirmar borrado").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("dash_back").setLabel("Cancelar").setStyle(ButtonStyle.Secondary),
        )],
      });
    }

    if (id.startsWith("dash_confdel_")) {
      const tName = id.replace("dash_confdel_", "");
      delete templates[tName];
      saveTemplates();
      return interaction.update({ content: `🗑️ **${tName}** eliminada.`, embeds: [], components: [] });
    }
    return;
  }

  // ── BUTTONS: Anotarse / Desanotarse ──────────────────────
  if (interaction.isButton()) {
    const { customId, message, user } = interaction;
    const VALID = ["signup_tank", "signup_heal", "signup_dps", "signup_sup", "signup_out"];
    if (!VALID.includes(customId)) return;

    const compo = compos[message.id];
    if (!compo)
      return interaction.reply({ content: "❌ Composición no disponible.", ephemeral: true });

    // Desanotarse
    if (customId === "signup_out") {
      let removed = false;
      for (const arr of Object.values(compo.signups)) {
        const i = arr.findIndex(s => s?.userId === user.id);
        if (i !== -1) { arr[i] = null; removed = true; }
      }
      if (!removed)
        return interaction.reply({ content: "⚠️ No estás en ningún slot.", ephemeral: true });
      saveCompos();
      if (compo.threadMsgId) {
        await interaction.update({ components: buildCompoButtons(compo) });
        await updateParentEmbed(interaction.client, compo);
      } else {
        await interaction.update({ embeds: [buildCompoEmbed(compo)], components: buildCompoButtons(compo) });
      }
      await interaction.followUp({ content: "↩️ Desanotado correctamente.", ephemeral: true });
      return;
    }

    // Anotarse
    const roleMap = { signup_tank: "tank", signup_heal: "healer", signup_dps: "dps", signup_sup: "support" };
    const role = roleMap[customId];

    const availableIdxs = compo.signups[role].reduce((acc, s, i) => {
      if (!s || s.userId === user.id) acc.push(i);
      return acc;
    }, []);

    if (availableIdxs.length === 0)
      return interaction.reply({ content: "❌ Sin slots disponibles.", ephemeral: true });

    const roleBuilds = compo.builds?.[role] || [];
    const options = [];

    availableIdxs.forEach(idx => {
      const buildDef = roleBuilds[idx];
      if (buildDef) {
        if (buildDef.includes("/")) {
          buildDef.split("/").forEach(b => {
            options.push({ label: b.trim().slice(0, 100), value: `${idx}|${b.trim()}`.slice(0, 100), emoji: "🎯" });
          });
        } else {
          options.push({ label: buildDef.slice(0, 100), value: `${idx}|${buildDef}`.slice(0, 100), emoji: "🎯" });
        }
      } else {
        const label = `Asiento ${idx + 1}`;
        options.push({ label: label, value: `${idx}|`, emoji: "🎯" });
      }
    });

    const isCurrentlyInRole = compo.signups[role].some(s => s?.userId === user.id);

    // Múltiples armas libres o especialidades → Mostrar dropdown ephemeral
    if (options.length > 1) {
      const select = new StringSelectMenuBuilder()
        .setCustomId(`pick_${message.id}_${role}`)
        .setPlaceholder("Elige tu especialidad...")
        .addOptions(options.slice(0, 25));

      // deferUpdate() aplaza la edición del cartel y mantiene el token vivo 15 min.
      // Guardamos la interacción para editar el cartel cuando el select responda.
      await interaction.deferUpdate();
      pendingDropdowns.set(user.id, { origInteraction: interaction, msgId: message.id });

      // Limpiar automáticamente después de 14 minutos para evitar memory leak
      setTimeout(() => {
        pendingDropdowns.delete(user.id);
      }, 14 * 60 * 1000);

      await interaction.followUp({
        content: `⚔️ Elige tu especialidad de **${role.toUpperCase()}**:`,
        components: [new ActionRowBuilder().addComponents(select)],
        ephemeral: true,
      });
      return;
    }

    if (isCurrentlyInRole) {
      return interaction.reply({ content: "⚠️ Ya estás anotado y no hay otras especialidades disponibles.", ephemeral: true });
    }

    // Un solo slot libre → Asignar directo via update()
    const [strIdx, ...restBuild] = options[0].value.split("|");
    const targetIdx = parseInt(strIdx, 10);
    const targetBuild = restBuild.join("|") || undefined;

    // Limpiar de otros roles Y del rol actual
    for (const arr of Object.values(compo.signups)) {
      const i = arr.findIndex(s => s?.userId === user.id);
      if (i !== -1) arr[i] = null;
    }
    compo.signups[role][targetIdx] = { userId: user.id, ign: user.username, build: targetBuild };
    saveCompos();
    if (compo.threadMsgId) {
      await interaction.update({ components: buildCompoButtons(compo) });
      await updateParentEmbed(interaction.client, compo);
    } else {
      await interaction.update({ embeds: [buildCompoEmbed(compo)], components: buildCompoButtons(compo) });
    }
    await interaction.followUp({ content: `✅ Anotado como **${role.toUpperCase()}**.`, ephemeral: true });
    return;
  }

  // ── SELECT: Elegir especialidad ───────────────────────────
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("pick_")) {
    // customId: pick_MSGID_role  (snowflakes son solo números, sin _)
    const withoutPrefix = interaction.customId.slice("pick_".length); // "MSGID_role"
    const firstUnder = withoutPrefix.indexOf("_");
    const msgId = withoutPrefix.slice(0, firstUnder);
    const role = withoutPrefix.slice(firstUnder + 1);
    const [strIdx, ...restBuild] = interaction.values[0].split("|");
    const selectedIndex = parseInt(strIdx, 10);
    const exactBuild = restBuild.join("|") || undefined;

    const compo = compos[msgId];
    if (!compo)
      return interaction.update({ content: "❌ Composición expirada.", components: [] });

    const roleBuilds = compo.builds?.[role] || [];
    const occupant = compo.signups[role][selectedIndex];
    if (occupant !== null && occupant.userId !== interaction.user.id)
      return interaction.update({ content: "❌ Ese asiento ya fue tomado. Inténtalo de nuevo.", components: [] });

    // Limpiar de otros roles
    for (const arr of Object.values(compo.signups)) {
      const i = arr.findIndex(s => s?.userId === interaction.user.id);
      if (i !== -1) arr[i] = null;
    }
    compo.signups[role][selectedIndex] = { userId: interaction.user.id, ign: interaction.user.username, build: exactBuild };
    saveCompos();

    const buildName = exactBuild || roleBuilds[selectedIndex] || role.toUpperCase();

    // 1. Cerrar el menú ephemeral
    await interaction.update({ content: `✅ Anotado · **${buildName}**`, components: [] });

    // 2. Editar el cartel vía la interacción del botón original (deferUpdate → editReply)
    const pending = pendingDropdowns.get(interaction.user.id);
    if (pending && pending.msgId === msgId) {
      pendingDropdowns.delete(interaction.user.id);
      try {
        if (compo.threadMsgId) {
          await pending.origInteraction.editReply({ components: buildCompoButtons(compo) });
          await updateParentEmbed(interaction.client, compo);
        } else {
          await pending.origInteraction.editReply({
            embeds: [buildCompoEmbed(compo)],
            components: buildCompoButtons(compo),
          });
        }
      } catch (e) {
        console.error("[pick] Error editando cartel:", e.message);
      }
    }
    return;
  }
}

client.login(process.env.DISCORD_TOKEN);
