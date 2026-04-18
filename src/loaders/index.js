const fs   = require("fs");
const path = require("path");
const { REST, Routes } = require("discord.js");

/**
 * Carga todos los comandos de src/commands/ y los registra en client.commands
 */
async function loadCommands(client) {
  const commandsPath = path.join(__dirname, "../commands");
  const files = fs.readdirSync(commandsPath).filter((f) => f.endsWith(".js"));

  const commandsArray = [];

  for (const file of files) {
    const cmd = require(path.join(commandsPath, file));
    if (cmd.data && cmd.execute) {
      client.commands.set(cmd.data.name, cmd);
      commandsArray.push(cmd.data.toJSON());
      console.log(`  ✅ Comando cargado: /${cmd.data.name}`);
    } else {
      console.warn(`  ⚠️  ${file} no tiene 'data' o 'execute', se omite.`);
    }
  }

  // Registrar comandos en la API de Discord
  if (process.env.DISCORD_TOKEN && process.env.CLIENT_ID) {
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    try {
      console.log(`  ⏳ Registrando ${commandsArray.length} comandos slash en la API de Discord...`);
      if (process.env.GUILD_ID) {
        // Registrar localmente en el servidor (instantáneo)
        await rest.put(
          Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
          { body: commandsArray }
        );
        console.log(`  🌐 Comandos slash listos y registrados en tu servidor.`);
      } else {
        // Registrar globalmente
        await rest.put(
          Routes.applicationCommands(process.env.CLIENT_ID),
          { body: commandsArray }
        );
        console.log(`  🌐 Comandos slash registrados globalmente.`);
      }
    } catch (error) {
      console.error(`  ❌ Error al registrar comandos slash:`, error);
    }
  }
}

/**
 * Carga todos los eventos de src/events/ y los registra en el client
 */
async function loadEvents(client) {
  const eventsPath = path.join(__dirname, "../events");
  const files = fs.readdirSync(eventsPath).filter((f) => f.endsWith(".js"));

  for (const file of files) {
    const event = require(path.join(eventsPath, file));
    if (!event.name) {
      console.warn(`  ⚠️  ${file} no tiene 'name', se omite.`);
      continue;
    }

    const handler = (...args) => event.execute(...args, client);

    if (event.once) {
      client.once(event.name, handler);
    } else {
      client.on(event.name, handler);
    }

    console.log(`  🎧 Evento registrado: ${event.name}${event.once ? " (once)" : ""}`);
  }
}

module.exports = { loadCommands, loadEvents };
