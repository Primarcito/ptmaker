const fs   = require("fs");
const path = require("path");

/**
 * Carga todos los comandos de src/commands/ y los registra en client.commands
 */
async function loadCommands(client) {
  const commandsPath = path.join(__dirname, "../commands");
  const files = fs.readdirSync(commandsPath).filter((f) => f.endsWith(".js"));

  for (const file of files) {
    const cmd = require(path.join(commandsPath, file));
    if (cmd.data && cmd.execute) {
      client.commands.set(cmd.data.name, cmd);
      console.log(`  ✅ Comando cargado: /${cmd.data.name}`);
    } else {
      console.warn(`  ⚠️  ${file} no tiene 'data' o 'execute', se omite.`);
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
