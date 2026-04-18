require("dotenv").config();
const { Client, GatewayIntentBits, Collection } = require("discord.js");
const { loadCommands, loadEvents } = require("./src/loaders");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

client.commands = new Collection();

(async () => {
  await loadCommands(client);
  await loadEvents(client);
  await client.login(process.env.DISCORD_TOKEN);
})();
