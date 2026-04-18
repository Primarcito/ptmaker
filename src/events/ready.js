module.exports = {
  name: "ready",
  once: true,
  execute(client) {
    console.log(`⚔ Bot conectado como ${client.user.tag}`);
    client.user.setActivity("⚔ Albion Online | /pt /pt-compo", { type: 3 });
  },
};
