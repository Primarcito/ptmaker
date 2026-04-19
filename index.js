require("dotenv").config();
const {
  Client, GatewayIntentBits, REST, Routes,
  SlashCommandBuilder, EmbedBuilder,
  ButtonBuilder, ButtonStyle, ActionRowBuilder,
  StringSelectMenuBuilder, ModalBuilder, RoleSelectMenuBuilder, ChannelSelectMenuBuilder,
  UserSelectMenuBuilder,
  TextInputBuilder, TextInputStyle, ChannelType,
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
const CONFIG_FILE = path.join(DATA_DIR, "config.json");
let appConfig = {
  adminRoles: process.env.ADMIN_ROLES ? process.env.ADMIN_ROLES.split(",") : ["852823068475785217", "983987481961717782"],
  zvzRoles: process.env.ZVZ_ROLE ? process.env.ZVZ_ROLE.split(",") : ["1468028696148312189"],
  pvpveRoles: process.env.PVPPVE_ROLE ? process.env.PVPPVE_ROLE.split(",") : ["1493273036369952860"],
  allowedChannels: process.env.ALLOWED_CHANNELS ? process.env.ALLOWED_CHANNELS.split(",") : ["1402080321150652426", "1423098812938981449", "1471843096018026669"]
};

try {
  if (fs.existsSync(CONFIG_FILE)) {
    appConfig = { ...appConfig, ...JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) };
  } else {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(appConfig, null, 2));
  }
} catch (err) {
  console.error("Error cargando config.json", err);
}

const saveConfig = () => fsPromises.writeFile(CONFIG_FILE, JSON.stringify(appConfig, null, 2)).catch(console.error);

const checkAdmin = (member) => appConfig.adminRoles.length === 0 ? member.permissions.has("Administrator") : member.roles.cache.some(r => appConfig.adminRoles.includes(r.id));
const checkZvZ = (member) => member.roles.cache.some(r => appConfig.zvzRoles.includes(r.id)) || checkAdmin(member);
const checkPvP = (member) => member.roles.cache.some(r => appConfig.pvpveRoles.includes(r.id)) || checkAdmin(member);
const checkChannel = (chId) => appConfig.allowedChannels.length === 0 || appConfig.allowedChannels.includes(chId);

// ════════════════════════════════════════════════════════════
//  PARSER
// ════════════════════════════════════════════════════════════
function parseComposition(input) {
  const slots = { tank: 0, healer: 0, dps: 0, support: 0, mount: 0 };
  const builds = { tank: [], healer: [], dps: [], support: [], mount: [] };
  const partyAssignments = { tank: [], healer: [], dps: [], support: [], mount: [] };
  if (!input) return { slots, builds, partyAssignments };

  let cur = null;
  let currentParty = 1;
  for (const line of input.split("\n").map(l => l.trim()).filter(Boolean)) {
    const lo = line.toLowerCase();
    
    const partyMatch = lo.match(/^(pt|party)\s*(\d+)$/i);
    if (partyMatch) {
         currentParty = parseInt(partyMatch[2], 10);
         continue;
    }

    let isHeader = false;
    if (lo.startsWith("tank") || lo === "tanque") { cur = "tank"; isHeader = true; }
    else if (lo.startsWith("heal")) { cur = "healer"; isHeader = true; }
    else if (lo.startsWith("dps") || lo.startsWith("dam")) { cur = "dps"; isHeader = true; }
    else if (lo.startsWith("sup") || lo.startsWith("sor")) { cur = "support"; isHeader = true; }
    else if (lo.startsWith("mon") || lo.startsWith("mou") || lo.startsWith("bm") || lo === "battle mount") { cur = "mount"; isHeader = true; }

    if (isHeader) { if (slots[cur] === 0) slots[cur] = 1; continue; }
    if (cur) {
      if (slots[cur] === 1 && builds[cur].length === 0) {
          slots[cur] = 0;
          partyAssignments[cur] = [];
      }
      builds[cur].push(line);
      partyAssignments[cur].push(currentParty);
      slots[cur]++;
    }
  }
  return { slots, builds, partyAssignments };
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

  let baseColor = 0xE05B5B; // Rojo para PvP y Default
  const tLoStr = tipo.toLowerCase();
  if (tLoStr.includes("pve")) baseColor = 0x3498DB; // Azul
  if (tLoStr.includes("zvz")) baseColor = 0x9B59B6; // Morado

  const embed = new EmbedBuilder()
    .setColor(isFull ? 0x57C457 : baseColor)
    .setTitle(`${isFull ? "✅" : "🗺️"} ${nombre}`)
    .addFields(
      { name: "📌 Tipo", value: tipo, inline: true },
      { name: "👥 Slots totales", value: `${totalFilled}/${totalSlots}`, inline: true }
    );

  let rosterDesc = "";

  // 💡 Para usar emojis personalizados, cambia el valor de "color"
  // por el ID de tu emoji de Discord, por ejemplo: color: "<:tanque:1234567890>"
  const rolesConfig = [
    { key: "tank", emoji: "🛡️", color: "🔵", label: "Tanks" },
    { key: "healer", emoji: "🌿", color: "🟢", label: "Healers" },
    { key: "dps", emoji: "⚔️", color: "🔴", label: "DPS" },
    { key: "support", emoji: "🔮", color: "🟡", label: "Support" },
    { key: "mount", emoji: "🐎", color: "🟤", label: "Monturas" }
  ];

  if (tLoStr.includes("zvz")) {
    const hasAssignments = compo.partyAssignments && Object.values(compo.partyAssignments).some(arr => arr && arr.length > 0);

    if (hasAssignments) {
        let parties = {}; 
        for (const { key, emoji, color, label } of rolesConfig) {
          const max = slots[key] || 0;
          if (max === 0) continue;
          const arr = signups[key] || [];
          const roleBuilds = builds?.[key] || [];
          const roleParties = compo.partyAssignments[key] || [];

          const partyGroups = {};
          for (let i = 0; i < max; i++) {
             const pt = roleParties[i] || 1;
             if (!partyGroups[pt]) partyGroups[pt] = [];
             partyGroups[pt].push(i);
          }

          for (const [ptStr, indices] of Object.entries(partyGroups)) {
             const pt = parseInt(ptStr, 10);
             if (!parties[pt]) parties[pt] = { players: [], filled: 0, total: 0 };
             
             for (const i of indices) {
                 const u = arr[i];
                 const buildText = u && u.build ? u.build : roleBuilds[i];
                 if (u) {
                     parties[pt].players.push(`${color} **<@${u.userId}>** - *${buildText || label}*`);
                     parties[pt].filled++;
                 } else {
                     parties[pt].players.push(`${color} ${buildText || label}: *[ Vacío ]*`);
                 }
                 parties[pt].total++;
             }
          }
        }
        
        const ptKeys = Object.keys(parties).map(Number).sort((a,b) => a-b);
        for (const pt of ptKeys) {
            const pObj = parties[pt];
            rosterDesc += `### ⚔️ Party ${pt} [${pObj.filled}/${pObj.total}]\n${pObj.players.join("\n")}\n\n`;
        }
    } else {
        let parties = [];
        let currentPartyIdx = 0;

        for (const { key, emoji, color, label } of rolesConfig) {
          const max = slots[key] || 0;
          if (max === 0) continue;

          const arr = signups[key] || [];
          const roleBuilds = builds?.[key] || [];

          const renderPlayer = (i) => {
            const u = arr[i];
            const buildText = u && u.build ? u.build : roleBuilds[i];
            return u ? `${color} **<@${u.userId}>** - *${buildText || label}*` : `${color} ${buildText || label}: *[ Vacío ]*`;
          };

          let roleSlotsAllocated = 0;
          while (roleSlotsAllocated < max) {
             let party = parties[currentPartyIdx];
             if (!party) {
                party = { currentSlots: 0, blocks: [], filled: 0 };
                parties.push(party);
             }
             
             const availableInParty = 20 - party.currentSlots;
             if (availableInParty <= 0) {
                currentPartyIdx++;
                continue;
             }
             
             const slotsToAllocate = Math.min(availableInParty, max - roleSlotsAllocated);
             
             for (let i = roleSlotsAllocated; i < roleSlotsAllocated + slotsToAllocate; i++) {
                 party.blocks.push(renderPlayer(i));
                 if (arr[i]) party.filled++;
             }
             
             party.currentSlots += slotsToAllocate;
             roleSlotsAllocated += slotsToAllocate;
          }
        }

        parties.forEach((p, idx) => {
           if (p.currentSlots > 0) {
               rosterDesc += `### ⚔️ Party ${idx + 1} [${p.filled}/${p.currentSlots}]\n${p.blocks.join("\n")}\n\n`;
           }
        });
    }
  } else {
    for (const { key, emoji, color, label } of rolesConfig) {
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
        lines.push(`${u ? `✅ **<@${u.userId}>**` : `${color} *[ Vacío ]*`}${buildText ? ` · *${buildText}*` : ""}`);
      }
      const singularLabel = label.endsWith('s') ? label.slice(0, -1) : label;
      rosterDesc += `\n**${emoji} ${singularLabel} (${filled}/${max})**\n${lines.join("\n")}\n`;
    }
  }

  embed.setDescription(rosterDesc || "No hay roles definidos.");

  if (estrategia) embed.addFields({ name: "📋 Notas", value: estrategia, inline: false });
  embed.setFooter({ text: `🌍 ${tipo} · publicado por ${authorTag}` }).setTimestamp();
  return embed;
}

function buildCompoButtons(compo) {
  const { slots, signups } = compo;
  const filled = (r) => (signups[r] || []).filter(Boolean).length;
  const full = (r) => filled(r) >= (slots[r] ?? 0);
  const btns = [];

  if ((slots.tank ?? 0) > 0) btns.push(new ButtonBuilder().setCustomId("signup_tank").setLabel(`🛡️ Tank (${filled("tank")}/${slots.tank})`).setStyle(ButtonStyle.Primary).setDisabled(full("tank")));
  if ((slots.healer ?? 0) > 0) btns.push(new ButtonBuilder().setCustomId("signup_heal").setLabel(`🌿 Healer (${filled("healer")}/${slots.healer})`).setStyle(ButtonStyle.Primary).setDisabled(full("healer")));
  if ((slots.dps ?? 0) > 0) btns.push(new ButtonBuilder().setCustomId("signup_dps").setLabel(`⚔️ DPS (${filled("dps")}/${slots.dps})`).setStyle(ButtonStyle.Primary).setDisabled(full("dps")));
  if ((slots.support ?? 0) > 0) btns.push(new ButtonBuilder().setCustomId("signup_sup").setLabel(`🔮 Support (${filled("support")}/${slots.support})`).setStyle(ButtonStyle.Primary).setDisabled(full("support")));
  if ((slots.mount ?? 0) > 0) btns.push(new ButtonBuilder().setCustomId("signup_mount").setLabel(`🐎 Montura (${filled("mount")}/${slots.mount})`).setStyle(ButtonStyle.Primary).setDisabled(full("mount")));
  
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
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates],
});

client.once("clientReady", async () => {
  console.log(`✅ Online: ${client.user.tag}`);
  const cmds = [
    new SlashCommandBuilder()
      .setName("pt-compo")
      .setDescription("Crea una plantilla de composición")
      .addStringOption(o => o.setName("tipo")
        .setDescription("Elige el tipo de composición")
        .setRequired(true)
        .addChoices(
          { name: "🏰 ZvZ", value: "ZvZ" },
          { name: "⚔️ PvP", value: "PvP" },
          { name: "🌿 PvE", value: "PvE" }
        )
      ),
    new SlashCommandBuilder()
      .setName("pt-lanzar")
      .setDescription("Lanza una composición al canal")
      .addStringOption(o => o.setName("plantilla").setDescription("Nombre de la plantilla").setRequired(true).setAutocomplete(true))
      .addRoleOption(o => o.setName("rol").setDescription("Rol para etiquetar").setRequired(false)),
    new SlashCommandBuilder()
      .setName("pt-dashboard")
      .setDescription("Panel admin de plantillas"),
    new SlashCommandBuilder()
      .setName("pt-config")
      .setDescription("Panel de configuración de permisos globales"),
    new SlashCommandBuilder()
      .setName("pt-events")
      .setDescription("Dashboard de eventos activos"),
  ];
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  // Registrar como Comandos Globales
  await rest.put(Routes.applicationCommands(client.user.id), { body: cmds.map(c => c.toJSON()) });
  
  // Limpiar comandos residuales locales (Guild-specific) que causan duplicados
  for (const guild of client.guilds.cache.values()) {
    try {
      await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: [] });
    } catch (e) {
      // Ignorar si no hay permisos
    }
  }

  console.log("✅ Comandos registrados y duplicados locales limpiados");
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
    if (!checkChannel(interaction.channelId))
      return interaction.reply({ content: "❌ Canal no permitido.", ephemeral: true });

    const hasAdmin = checkAdmin(interaction.member);

    // /pt-compo
    if (interaction.commandName === "pt-compo") {
      const tipo = interaction.options.getString("tipo");
      const modal = new ModalBuilder().setCustomId(`modal_compo_${tipo}`).setTitle(`📋 Nueva: ${tipo}`);
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("nombre").setLabel("Nombre").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("composicion").setLabel("Roles y Armas (una por línea)").setStyle(TextInputStyle.Paragraph).setRequired(true).setPlaceholder("Tank\nIncubo\nHealer\nSantificador\nDPS\nDaga 1H")),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("estrategia").setLabel("Notas Adicionales").setStyle(TextInputStyle.Paragraph).setRequired(false)),
      );
      return interaction.showModal(modal);
    }

    // /pt-lanzar
    if (interaction.commandName === "pt-lanzar") {
      const tName = interaction.options.getString("plantilla");
      const t = templates[tName];
      if (!t) return interaction.reply({ content: `❌ Plantilla **${tName}** no encontrada.`, ephemeral: true });

      const tLo = t.tipo.toLowerCase();
      if (tLo.includes("zvz") && !checkZvZ(interaction.member))
        return interaction.reply({ content: "❌ Sin rol para lanzar ZvZ.", ephemeral: true });
      if ((tLo.includes("pvp") || tLo.includes("pve")) && !checkPvP(interaction.member))
        return interaction.reply({ content: "❌ Sin rol para lanzar PvP/PvE.", ephemeral: true });

      // Verificar que no exista una composición activa con el mismo nombre
      const duplicada = Object.values(compos).find(c => c.nombre === t.nombre);
      if (duplicada) {
        return interaction.reply({
          content: `⚠️ Ya existe una composición activa de **${t.nombre}** (publicada por ${duplicada.authorTag}). Ciérrala desde el botón 🔧 Admin antes de lanzar otra.`,
          ephemeral: true
        });
      }

      const compoData = {
        nombre: t.nombre, tipo: t.tipo,
        slots: { ...t.slots }, builds: { ...t.builds }, partyAssignments: t.partyAssignments ? { ...t.partyAssignments } : null,
        estrategia: t.estrategia,
        signups: {
          tank: Array(t.slots.tank || 0).fill(null),
          healer: Array(t.slots.healer || 0).fill(null),
          dps: Array(t.slots.dps || 0).fill(null),
          support: Array(t.slots.support || 0).fill(null),
          mount: Array(t.slots.mount || 0).fill(null),
        },
        authorId: interaction.user.id, authorTag: interaction.user.username,
        createdAt: Date.now(),
      };

      const rolOpt = interaction.options.getRole("rol");
      const tagStr = rolOpt ? `${rolOpt} ` : "";

      const msg = await interaction.reply({
        content: `${tagStr}📋 **${interaction.user.username}** publicó **${t.nombre}**.\n🔗 ¡Anotate en el hilo inferior! 👇`,
        embeds: [buildCompoEmbed(compoData)],
        fetchReply: true,
      });

      let targetId = msg.id;

      try {
        const thread = await msg.startThread({
          name: `[${t.tipo}] ${t.nombre}`.slice(0, 100),
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
          content: `${tagStr}📋 **${interaction.user.username}** publicó **${t.nombre}**. ¡Anotate usando los botones de abajo!`,
          components: buildCompoButtons(compoData)
        });
      }

      compoData.parentMsgId = msg.id;
      compoData.channelId = interaction.channelId;

      compos[targetId] = compoData;
      saveCompos();
      return;
    }

    // Helper de UI para sincronizar el cartel
    async function syncCompoUI(c) {
      if (c.threadMsgId) {
        await updateParentEmbed(client, c);
        try {
          const thread = client.channels.cache.get(c.parentMsgId) || await client.channels.fetch(c.parentMsgId).catch(()=>null);
          if (thread) {
            const msg = await thread.messages.fetch(c.threadMsgId).catch(()=>null);
            if (msg) await msg.edit({ components: buildCompoButtons(c) });
          }
        } catch(e) {}
      } else if (c.parentMsgId) {
        try {
          const ch = client.channels.cache.get(c.channelId) || await client.channels.fetch(c.channelId).catch(()=>null);
          if (ch) {
            const msg = await ch.messages.fetch(c.parentMsgId).catch(()=>null);
            if (msg) await msg.edit({ embeds: [buildCompoEmbed(c)], components: buildCompoButtons(c) });
          }
        } catch(e) {}
      }
    }

    // /pt-events
    if (interaction.commandName === "pt-events") {
      if (!hasAdmin) return interaction.reply({ content: "❌ Sin permiso.", ephemeral: true });
      const activeCompos = Object.entries(compos);
      if (activeCompos.length === 0) return interaction.reply({ content: "📂 No hay composiciones activas.", ephemeral: true });

      const options = activeCompos.slice(0, 25).map(([msgId, c]) => {
        const totalInscritos = Object.values(c.signups).reduce((sum, arr) => sum + arr.filter(s => s !== null).length, 0);
        const totalSlots = Object.values(c.slots).reduce((a, b) => a + b, 0);
        return {
          label: `${c.nombre}`.slice(0, 100),
          description: `${c.tipo} · ${totalInscritos}/${totalSlots} · por ${c.authorTag}`.slice(0, 100),
          value: msgId,
          emoji: c.tipo.toLowerCase().includes("zvz") ? "🏰" : c.tipo.toLowerCase().includes("pvp") ? "⚔️" : "🌿"
        };
      });

      const select = new StringSelectMenuBuilder()
        .setCustomId("events_select")
        .setPlaceholder("Selecciona un evento activo...")
        .addOptions(options);

      const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("events_deleteall").setLabel("🗑️ Borrar Todos").setStyle(ButtonStyle.Danger)
      );

      return interaction.reply({
        content: `## 🎛️ Eventos Activos (${activeCompos.length})\nSelecciona uno para administrarlo:`,
        components: [new ActionRowBuilder().addComponents(select), btnRow],
        ephemeral: true
      });
    }

    // /pt-config
    if (interaction.commandName === "pt-config") {
      if (!hasAdmin) return interaction.reply({ content: "❌ Sin permiso.", ephemeral: true });

      const embed = new EmbedBuilder()
        .setColor(0x2B2D31)
        .setTitle("⚙️ Panel de Configuración de Permisos")
        .setDescription("Ajusta quién puede usar el bot.")
        .addFields(
          { name: "🟢 Administradores Globales", value: appConfig.adminRoles.length ? appConfig.adminRoles.map(r => `<@&${r}>`).join(" ") : "*Solo roles admin nativos*", inline: false },
          { name: "🏰 Creadores ZvZ", value: appConfig.zvzRoles.length ? appConfig.zvzRoles.map(r => `<@&${r}>`).join(" ") : "*Nadie*", inline: false },
          { name: "⚔️ Creadores PvP/PvE", value: appConfig.pvpveRoles.length ? appConfig.pvpveRoles.map(r => `<@&${r}>`).join(" ") : "*Nadie*", inline: false },
          { name: "💬 Canales Permitidos", value: appConfig.allowedChannels.length ? appConfig.allowedChannels.map(c => `<#${c}>`).join(" ") : "*Todos*", inline: false }
        );

      const row1 = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder().setCustomId("config_admin").setPlaceholder("Seleccionar Administradores").setMinValues(0).setMaxValues(10)
      );
      const row2 = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder().setCustomId("config_zvz").setPlaceholder("Seleccionar Creadores ZvZ").setMinValues(0).setMaxValues(10)
      );
      const row3 = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder().setCustomId("config_pvpve").setPlaceholder("Seleccionar Creadores PvP/PvE").setMinValues(0).setMaxValues(10)
      );
      const row4 = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder().setCustomId("config_channels").setPlaceholder("Canales Permitidos").setChannelTypes(ChannelType.GuildText).setMinValues(0).setMaxValues(10)
      );

      return interaction.reply({ embeds: [embed], components: [row1, row2, row3, row4], ephemeral: true });
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
  if (interaction.isModalSubmit() && interaction.customId.startsWith("modal_compo_")) {
    const nombre = interaction.fields.getTextInputValue("nombre").trim();
    const tipo = interaction.customId.replace("modal_compo_", "");
    const composRaw = interaction.fields.getTextInputValue("composicion").trim();
    const estrategia = interaction.fields.getTextInputValue("estrategia").trim();
    const hasAdmin = checkAdmin(interaction.member);
    const tLo = tipo.toLowerCase();

    if (tLo.includes("zvz") && !checkZvZ(interaction.member))
      return interaction.reply({ content: "❌ Sin rol para crear ZvZ.", ephemeral: true });
    if ((tLo.includes("pvp") || tLo.includes("pve")) && !checkPvP(interaction.member))
      return interaction.reply({ content: "❌ Sin rol para crear PvP/PvE.", ephemeral: true });

    const { slots, builds, partyAssignments } = parseComposition(composRaw);
    if (Object.values(slots).reduce((a, b) => a + b, 0) === 0)
      return interaction.reply({ content: "❌ Formato inválido. Encabezados: `Tank`, `Healer`, `DPS`, `Support`.", ephemeral: true });

    templates[nombre] = {
      nombre, tipo, slots, builds, partyAssignments, estrategia,
      rawComposicion: composRaw,
      authorId: interaction.user.id, authorTag: interaction.user.username,
      createdAt: Date.now(),
    };
    saveTemplates();
    return interaction.reply({ content: `✅ **${nombre}** guardada · Usa \`/pt-lanzar\` para publicarla.`, ephemeral: true });
  }

  // ── MODAL: Renombrar plantilla ──────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId.startsWith("dash_modal_ren_")) {
    const origName = interaction.customId.replace("dash_modal_ren_", "");
    const nombre = interaction.fields.getTextInputValue("nombre").trim();
    if (!templates[origName]) return interaction.reply({ content: "❌ No encontrada.", ephemeral: true });
    
    if (origName !== nombre) {
      templates[nombre] = templates[origName];
      templates[nombre].nombre = nombre;
      delete templates[origName];
      saveTemplates();
    }
    return interaction.update({ content: `✅ Renombrada a **${nombre}**.`, embeds: [], components: [] });
  }

  // ── MODAL: Editar plantilla ───────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId.startsWith("dash_modal_edit_")) {
    const tName = interaction.customId.replace("dash_modal_edit_", "");
    const tipo = interaction.fields.getTextInputValue("tipo").trim();
    const composRaw = interaction.fields.getTextInputValue("composicion").trim();
    const estrategia = interaction.fields.getTextInputValue("estrategia").trim();
    const { slots, builds, partyAssignments } = parseComposition(composRaw);

    if (Object.values(slots).reduce((a, b) => a + b, 0) === 0)
      return interaction.reply({ content: "❌ Formato inválido.", ephemeral: true });
    
    templates[tName] = { ...(templates[tName] || {}), tipo, slots, builds, partyAssignments, estrategia, rawComposicion: composRaw };
    saveTemplates();
    return interaction.update({ content: `✅ **${tName}** actualizada.`, embeds: [], components: [] });
  }

  // ── CONFIG SELECT MENUS ──────────────────────────────────
  if (interaction.isRoleSelectMenu() && interaction.customId.startsWith("config_")) {
    if (!checkAdmin(interaction.member)) return interaction.reply({ content: "❌ Sin permiso.", ephemeral: true });

    if (interaction.customId === "config_admin") appConfig.adminRoles = interaction.values;
    if (interaction.customId === "config_zvz") appConfig.zvzRoles = interaction.values;
    if (interaction.customId === "config_pvpve") appConfig.pvpveRoles = interaction.values;
    
    saveConfig();

    const embed = new EmbedBuilder()
      .setColor(0x2B2D31)
      .setTitle("⚙️ Panel de Configuración de Permisos")
      .addFields(
        { name: "🟢 Administradores Globales", value: appConfig.adminRoles.length ? appConfig.adminRoles.map(r => `<@&${r}>`).join(" ") : "*Solo roles admin nativos*", inline: false },
        { name: "🏰 Creadores ZvZ", value: appConfig.zvzRoles.length ? appConfig.zvzRoles.map(r => `<@&${r}>`).join(" ") : "*Nadie*", inline: false },
        { name: "⚔️ Creadores PvP/PvE", value: appConfig.pvpveRoles.length ? appConfig.pvpveRoles.map(r => `<@&${r}>`).join(" ") : "*Nadie*", inline: false },
        { name: "💬 Canales Permitidos", value: appConfig.allowedChannels.length ? appConfig.allowedChannels.map(c => `<#${c}>`).join(" ") : "*Todos*", inline: false }
      );
    return interaction.update({ embeds: [embed] });
  }

  if (interaction.isChannelSelectMenu() && interaction.customId === "config_channels") {
    if (!checkAdmin(interaction.member)) return interaction.reply({ content: "❌ Sin permiso.", ephemeral: true });
    
    appConfig.allowedChannels = interaction.values;
    saveConfig();
    
    const embed = new EmbedBuilder()
      .setColor(0x2B2D31)
      .setTitle("⚙️ Panel de Configuración de Permisos")
      .addFields(
        { name: "🟢 Administradores Globales", value: appConfig.adminRoles.length ? appConfig.adminRoles.map(r => `<@&${r}>`).join(" ") : "*Solo roles admin nativos*", inline: false },
        { name: "🏰 Creadores ZvZ", value: appConfig.zvzRoles.length ? appConfig.zvzRoles.map(r => `<@&${r}>`).join(" ") : "*Nadie*", inline: false },
        { name: "⚔️ Creadores PvP/PvE", value: appConfig.pvpveRoles.length ? appConfig.pvpveRoles.map(r => `<@&${r}>`).join(" ") : "*Nadie*", inline: false },
        { name: "💬 Canales Permitidos", value: appConfig.allowedChannels.length ? appConfig.allowedChannels.map(c => `<#${c}>`).join(" ") : "*Todos*", inline: false }
      );
    return interaction.update({ embeds: [embed] });
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
        { name: "📋 Notas", value: t.estrategia || "*Sin notas*", inline: false },
        { name: "📝 Composición", value: `\`\`\`\n${(t.rawComposicion || "").slice(0, 900)}\n\`\`\``, inline: false },
      )
      .setFooter({ text: `Creada por ${t.authorTag}` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`dash_rename_${tName}`).setLabel("🏷️ Renombrar").setStyle(ButtonStyle.Success),
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

    if (id.startsWith("dash_rename_")) {
      const tName = id.replace("dash_rename_", "");
      if (!templates[tName]) return interaction.reply({ content: "❌ No encontrada.", ephemeral: true });
      const modal = new ModalBuilder()
        .setCustomId(`dash_modal_ren_${tName}`)
        .setTitle(`🏷️ Renombrar`.slice(0, 45));
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("nombre").setLabel("Nuevo Nombre").setStyle(TextInputStyle.Short).setValue(tName).setRequired(true))
      );
      return interaction.showModal(modal);
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
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("estrategia").setLabel("Notas").setStyle(TextInputStyle.Paragraph).setValue(t.estrategia || "").setRequired(false)),
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

  // ── BUTTONS: Borrar todos los eventos ────────────────────
  if (interaction.isButton() && interaction.customId === "events_deleteall") {
    if (!checkAdmin(interaction.member)) return interaction.reply({ content: "❌ Sin permiso.", ephemeral: true });
    const count = Object.keys(compos).length;
    if (count === 0) return interaction.update({ content: "📂 No hay eventos activos.", components: [] });
    return interaction.update({
      content: `### 🛑 ¿Seguro?\nEsto eliminará **${count} evento(s) activo(s)** permanentemente.`,
      embeds: [], components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("events_confirmdelall").setLabel(`⚠️ Confirmar borrado (${count})`).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("events_canceldelall").setLabel("Cancelar").setStyle(ButtonStyle.Secondary),
      )]
    });
  }

  if (interaction.isButton() && interaction.customId === "events_confirmdelall") {
    if (!checkAdmin(interaction.member)) return interaction.reply({ content: "❌ Sin permiso.", ephemeral: true });
    const count = Object.keys(compos).length;
    compos = {};
    saveCompos();
    return interaction.update({ content: `🗑️ **${count} evento(s)** eliminados.`, embeds: [], components: [] });
  }

  if (interaction.isButton() && interaction.customId === "events_canceldelall") {
    return interaction.update({ content: "✅ Operación cancelada.", embeds: [], components: [] });
  }

  // ── ADMIN PANEL: Botones (ping, movevc, close) ───────────
  if (interaction.isButton() && interaction.customId.startsWith("adm_")) {
    const id = interaction.customId;
    // Extraer msgId (ID del mensaje de botones en el hilo)
    const parts = id.split("_");
    const action = parts[1]; // ping, movevc, close, confirmclose
    const msgId = parts.slice(2).join("_");

    const compo = compos[msgId];
    if (!compo) return interaction.reply({ content: "❌ Composición no disponible.", ephemeral: true });

    const isCreator = compo.authorId === interaction.user.id;
    const isAdmin = checkAdmin(interaction.member);
    if (!isCreator && !isAdmin)
      return interaction.reply({ content: "❌ Sin permiso.", ephemeral: true });

    // Helper para sincronizar UI (fuera del scope de slash commands)
    async function syncAdminUI(c) {
      if (c.threadMsgId) {
        await updateParentEmbed(client, c);
        try {
          const thread = client.channels.cache.get(c.parentMsgId) || await client.channels.fetch(c.parentMsgId).catch(()=>null);
          if (thread) {
            const msg = await thread.messages.fetch(c.threadMsgId).catch(()=>null);
            if (msg) await msg.edit({ components: buildCompoButtons(c) });
          }
        } catch(e) {}
      } else if (c.parentMsgId) {
        try {
          const ch = client.channels.cache.get(c.channelId) || await client.channels.fetch(c.channelId).catch(()=>null);
          if (ch) {
            const msg = await ch.messages.fetch(c.parentMsgId).catch(()=>null);
            if (msg) await msg.edit({ embeds: [buildCompoEmbed(c)], components: buildCompoButtons(c) });
          }
        } catch(e) {}
      }
    }

    // 📢 Pingear Todos
    if (action === "ping") {
      let users = [];
      for (const arr of Object.values(compo.signups)) for (const s of arr) if (s && s.userId) users.push(`<@${s.userId}>`);
      if (!users.length) return interaction.reply({ content: "⚠️ No hay inscritos.", ephemeral: true });
      // Responder al panel ephemeral y luego mandar el ping público
      await interaction.update({ content: "✅ Ping enviado.", embeds: [], components: [] });
      const ch = client.channels.cache.get(compo.channelId) || await client.channels.fetch(compo.channelId).catch(()=>null);
      if (ch) await ch.send({ content: `🔔 **Aviso de ${compo.nombre}:** ${users.join(" ")}`, allowedMentions: { parse: ['users'] } });
      return;
    }

    // 🔊 Mover a Voz — mostrar selector de canal de voz
    if (action === "movevc") {
      const vcSelect = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(`adm_vcpick_${msgId}`)
          .setPlaceholder("Selecciona canal de voz...")
          .setChannelTypes(ChannelType.GuildVoice)
      );
      return interaction.update({
        content: "🔊 **Selecciona el canal de voz destino:**",
        embeds: [], components: [vcSelect]
      });
    }

    // 🗑️ Cerrar Compo — pedir confirmación
    if (action === "close") {
      return interaction.update({
        content: `### 🛑 ¿Seguro?\nEsto cerrará la composición **${compo.nombre}** y eliminará los datos.`,
        embeds: [],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`adm_confirmclose_${msgId}`).setLabel("⚠️ Confirmar cierre").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`adm_cancelclose_${msgId}`).setLabel("Cancelar").setStyle(ButtonStyle.Secondary),
        )]
      });
    }

    // Confirmar cierre
    if (action === "confirmclose") {
      // Intentar borrar mensajes
      try {
        const ch = client.channels.cache.get(compo.channelId) || await client.channels.fetch(compo.channelId).catch(()=>null);
        if (ch && compo.parentMsgId) {
          const parentMsg = await ch.messages.fetch(compo.parentMsgId).catch(()=>null);
          if (parentMsg) {
            // Si tiene hilo, archivarlo
            if (parentMsg.thread) await parentMsg.thread.setArchived(true).catch(()=>{});
          }
        }
      } catch(e) {}
      delete compos[msgId];
      saveCompos();
      return interaction.update({ content: `🗑️ Composición **${compo.nombre}** cerrada.`, embeds: [], components: [] });
    }

    // Cancelar cierre
    if (action === "cancelclose") {
      return interaction.update({ content: "✅ Cierre cancelado.", embeds: [], components: [] });
    }

    return;
  }

  // ── ADMIN PANEL: Select Menus (kick, setrol, vcpick) ─────
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("adm_")) {
    const id = interaction.customId;
    const parts = id.split("_");
    const action = parts[1]; // kick, setrol
    const msgId = parts.slice(2).join("_");

    const compo = compos[msgId];
    if (!compo) return interaction.update({ content: "❌ Composición no disponible.", components: [] });

    const isCreator = compo.authorId === interaction.user.id;
    const isAdmin = checkAdmin(interaction.member);
    if (!isCreator && !isAdmin) return interaction.reply({ content: "❌ Sin permiso.", ephemeral: true });

    async function syncAdminUI(c) {
      if (c.threadMsgId) {
        await updateParentEmbed(client, c);
        try {
          const thread = client.channels.cache.get(c.parentMsgId) || await client.channels.fetch(c.parentMsgId).catch(()=>null);
          if (thread) {
            const msg = await thread.messages.fetch(c.threadMsgId).catch(()=>null);
            if (msg) await msg.edit({ components: buildCompoButtons(c) });
          }
        } catch(e) {}
      } else if (c.parentMsgId) {
        try {
          const ch = client.channels.cache.get(c.channelId) || await client.channels.fetch(c.channelId).catch(()=>null);
          if (ch) {
            const msg = await ch.messages.fetch(c.parentMsgId).catch(()=>null);
            if (msg) await msg.edit({ embeds: [buildCompoEmbed(c)], components: buildCompoButtons(c) });
          }
        } catch(e) {}
      }
    }

    // 👟 Kickear usuario
    if (action === "kick") {
      const targetUserId = interaction.values[0];
      let removedName = null;
      for (const roleKey of Object.keys(compo.signups)) {
        const arr = compo.signups[roleKey];
        const idx = arr.findIndex(s => s && s.userId === targetUserId);
        if (idx !== -1) { removedName = arr[idx].ign; arr[idx] = null; }
      }
      if (!removedName) return interaction.update({ content: "⚠️ Usuario no encontrado.", components: [] });
      saveCompos();
      await syncAdminUI(compo);
      return interaction.update({ content: `👟 **${removedName}** fue expulsado de la composición.`, embeds: [], components: [] });
    }

    // 🔄 Mover rol/arma — paso 1: seleccionar usuario, paso 2: elegir nuevo rol
    if (action === "setrol") {
      const targetUserId = interaction.values[0];
      // Buscar datos actuales del usuario
      let currentData = null;
      let currentRole = null;
      for (const [roleKey, arr] of Object.entries(compo.signups)) {
        const s = arr.find(s => s && s.userId === targetUserId);
        if (s) { currentData = s; currentRole = roleKey; break; }
      }
      if (!currentData) return interaction.update({ content: "⚠️ Usuario no encontrado.", components: [] });

      // Mostrar selector de nuevo rol + input de arma mediante una modal
      const modal = new ModalBuilder()
        .setCustomId(`adm_modal_setrol_${msgId}_${targetUserId}`)
        .setTitle(`🔄 Mover: ${currentData.ign}`.slice(0, 45));
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("nuevo_rol")
            .setLabel("Nuevo rol (tank/healer/dps/support/mount)")
            .setStyle(TextInputStyle.Short)
            .setValue(currentRole)
            .setRequired(true)
            .setMaxLength(10)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("nueva_arma")
            .setLabel("Arma/clase (dejar igual si no cambia)")
            .setStyle(TextInputStyle.Short)
            .setValue(currentData.build || "")
            .setRequired(false)
            .setMaxLength(50)
        )
      );
      return interaction.showModal(modal);
    }

    return;
  }

  // ── ADMIN PANEL: Channel Select (mover a voz) ────────────
  if (interaction.isChannelSelectMenu() && interaction.customId.startsWith("adm_vcpick_")) {
    const msgId = interaction.customId.replace("adm_vcpick_", "");
    const compo = compos[msgId];
    if (!compo) return interaction.update({ content: "❌ Composición no disponible.", components: [] });

    const channelId = interaction.values[0];
    const channel = interaction.guild.channels.cache.get(channelId);
    if (!channel || !channel.isVoiceBased())
      return interaction.update({ content: "❌ Canal de voz inválido.", components: [] });

    await interaction.update({ content: "⏳ Moviendo usuarios...", components: [] });

    let userIds = [];
    for (const arr of Object.values(compo.signups)) for (const s of arr) if (s && s.userId) userIds.push(s.userId);
    if (!userIds.length) return interaction.editReply("⚠️ Nadie anotado.");

    let moved = 0, off = 0, errs = 0;
    await Promise.all(userIds.map(async (uId) => {
      try {
        const member = interaction.guild.members.cache.get(uId) || await interaction.guild.members.fetch(uId).catch(()=>null);
        if (!member || !member.voice.channelId) { off++; return; }
        await member.voice.setChannel(channel.id); moved++;
      } catch { errs++; }
    }));
    return interaction.editReply(`✅ **Movidos:** ${moved} | 📴 **Sin voz:** ${off} | ⚠️ **Errores:** ${errs}`);
  }

  // ── ADMIN PANEL: Modal setrol ────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId.startsWith("adm_modal_setrol_")) {
    const withoutPrefix = interaction.customId.replace("adm_modal_setrol_", "");
    const lastUnderscore = withoutPrefix.lastIndexOf("_");
    const msgId = withoutPrefix.slice(0, lastUnderscore);
    const targetUserId = withoutPrefix.slice(lastUnderscore + 1);

    const compo = compos[msgId];
    if (!compo) return interaction.reply({ content: "❌ Composición no disponible.", ephemeral: true });

    const newRoleRaw = interaction.fields.getTextInputValue("nuevo_rol").trim().toLowerCase();
    const newArma = interaction.fields.getTextInputValue("nueva_arma").trim() || undefined;

    const roleAliases = { tank: "tank", tanque: "tank", healer: "healer", heal: "healer", dps: "dps", support: "support", sup: "support", mount: "mount", montura: "mount", bm: "mount" };
    const newRole = roleAliases[newRoleRaw];
    if (!newRole) return interaction.reply({ content: `❌ Rol inválido: **${newRoleRaw}**. Usa: tank, healer, dps, support, mount.`, ephemeral: true });

    let currentRole = null, currentIndex = -1, userData = null;
    for (const [roleKey, arr] of Object.entries(compo.signups)) {
      const idx = arr.findIndex(s => s && s.userId === targetUserId);
      if (idx !== -1) { currentRole = roleKey; currentIndex = idx; userData = { ...arr[idx] }; break; }
    }
    if (!userData) return interaction.reply({ content: "⚠️ Usuario ya no está anotado.", ephemeral: true });

    const finalBuild = newArma || userData.build;

    if (newRole !== currentRole) {
      const emptyIdx = compo.signups[newRole]?.findIndex(s => s === null);
      if (emptyIdx === undefined || emptyIdx === -1)
        return interaction.reply({ content: `❌ Sin espacio en **${newRole.toUpperCase()}**.`, ephemeral: true });
      compo.signups[currentRole][currentIndex] = null;
      compo.signups[newRole][emptyIdx] = { userId: userData.userId, ign: userData.ign, build: finalBuild };
    } else {
      compo.signups[currentRole][currentIndex] = { userId: userData.userId, ign: userData.ign, build: finalBuild };
    }

    saveCompos();

    // Sync UI
    if (compo.threadMsgId) {
      await updateParentEmbed(client, compo);
      try {
        const thread = client.channels.cache.get(compo.parentMsgId) || await client.channels.fetch(compo.parentMsgId).catch(()=>null);
        if (thread) {
          const msg = await thread.messages.fetch(compo.threadMsgId).catch(()=>null);
          if (msg) await msg.edit({ components: buildCompoButtons(compo) });
        }
      } catch(e) {}
    }

    let replyMsg = `🔄 **${userData.ign}** movido a **${newRole.toUpperCase()}**`;
    if (newArma) replyMsg += ` con arma **${newArma}**`;
    return interaction.reply({ content: replyMsg + ".", ephemeral: true });
  }

  // ── SELECT: Eventos activos ───────────────────────────────
  if (interaction.isStringSelectMenu() && interaction.customId === "events_select") {
    const msgId = interaction.values[0];
    const compo = compos[msgId];
    if (!compo) return interaction.update({ content: "❌ Composición ya no existe.", components: [] });

    let inscritos = [];
    let totalInscritos = 0;
    const totalSlots = Object.values(compo.slots).reduce((a, b) => a + b, 0);
    for (const [roleKey, arr] of Object.entries(compo.signups)) {
      for (const s of arr) {
        if (s && s.userId) {
          inscritos.push(`• **${s.ign}** — ${roleKey.toUpperCase()}${s.build ? ` (${s.build})` : ""}`);
          totalInscritos++;
        }
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0x2B2D31)
      .setTitle(`🔧 Panel Admin — ${compo.nombre}`)
      .setDescription(inscritos.length ? inscritos.join("\n") : "*Sin inscritos*")
      .addFields({ name: "👥 Inscritos", value: `${totalInscritos}/${totalSlots}`, inline: true })
      .setFooter({ text: `Composición de ${compo.authorTag}` });

    const btnRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`adm_ping_${msgId}`).setLabel("📢 Pingear Todos").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`adm_movevc_${msgId}`).setLabel("🔊 Mover a Voz").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`adm_close_${msgId}`).setLabel("🗑️ Cerrar Compo").setStyle(ButtonStyle.Danger)
    );

    const kickOptions = [];
    for (const [roleKey, arr] of Object.entries(compo.signups)) {
      arr.forEach((s) => {
        if (s && s.userId) {
          kickOptions.push({ label: `${s.ign} (${roleKey.toUpperCase()})`.slice(0, 100), value: `${s.userId}`, emoji: "👟" });
        }
      });
    }

    const components = [btnRow];

    if (kickOptions.length > 0) {
      components.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId(`adm_kick_${msgId}`).setPlaceholder("👟 Kickear usuario...").addOptions(kickOptions.slice(0, 25))
      ));
      const moveOptions = kickOptions.map(o => ({ ...o, emoji: "🔄" }));
      components.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId(`adm_setrol_${msgId}`).setPlaceholder("🔄 Mover rol/arma de usuario...").addOptions(moveOptions.slice(0, 25))
      ));
    }

    return interaction.update({ embeds: [embed], components });
  }

  // ── BUTTONS: Anotarse / Desanotarse ──────────────────────
  if (interaction.isButton()) {
    const { customId, message, user } = interaction;
    const VALID = ["signup_tank", "signup_heal", "signup_dps", "signup_sup", "signup_mount", "signup_out"];
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
    const roleMap = { signup_tank: "tank", signup_heal: "healer", signup_dps: "dps", signup_sup: "support", signup_mount: "mount" };
    const role = roleMap[customId];

    const availableIdxs = compo.signups[role].reduce((acc, s, i) => {
      if (!s || s.userId === user.id) acc.push(i);
      return acc;
    }, []);

    if (availableIdxs.length === 0)
      return interaction.reply({ content: "❌ Sin slots disponibles.", ephemeral: true });

    const roleBuilds = compo.builds?.[role] || [];
    const optionsMap = new Map();

    availableIdxs.forEach(idx => {
      const buildDef = roleBuilds[idx];
      if (buildDef) {
        if (buildDef.includes("/")) {
          buildDef.split("/").forEach(b => {
            const clean = b.trim().slice(0, 100);
            if (!optionsMap.has(clean)) {
              optionsMap.set(clean, { label: clean, value: `${idx}|${clean}`, emoji: "🎯" });
            }
          });
        } else {
          const clean = buildDef.slice(0, 100);
          if (!optionsMap.has(clean)) {
            optionsMap.set(clean, { label: clean, value: `${idx}|${clean}`, emoji: "🎯" });
          }
        }
      } else {
        const label = `Asiento libre`;
        if (!optionsMap.has(label)) {
          optionsMap.set(label, { label: label, value: `${idx}|`, emoji: "🎯" });
        }
      }
    });
    
    const options = Array.from(optionsMap.values());

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
