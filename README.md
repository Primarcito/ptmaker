# ⚔ Albion PT Bot

Bot de Discord para gestionar PTs (plantillas de personaje) y composiciones de grupo para guilds de **Albion Online**.

## Comandos

| Comando      | Descripción |
|--------------|-------------|
| `/pt`        | Abre el modal para registrar tu IGN, rol, IP y build |
| `/pt-ver`    | Muestra el PT de cualquier usuario del servidor |
| `/pt-compo`  | Publica una composición con botones para anotarse |

## Flujo de composición

1. Un líder usa `/pt-compo` y llena el formulario:
   - Nombre, tipo (ZvZ / GvG / PvE…)
   - Slots: `Tank:2 Healer:3 DPS:5 Support:2`
   - Builds: `Tank: Heavy Mace` (una por línea)
   - Estrategia (opcional)
2. El bot publica el embed con botones de rol
3. Cada jugador hace click en su rol — el embed se actualiza en tiempo real
4. Al completarse todos los slots el embed cambia a verde ✅

## Instalación

```bash
# 1. Clona o descarga el proyecto
npm install

# 2. Crea el archivo .env
cp .env.example .env
# Edita .env con tu TOKEN, CLIENT_ID y GUILD_ID

# 3. Inicia el bot
npm start
```

## Obtener credenciales

- **DISCORD_TOKEN** y **CLIENT_ID** → https://discord.com/developers/applications → tu aplicación → Bot
- **GUILD_ID** → Click derecho sobre tu servidor en Discord → "Copiar ID del servidor"

## Estructura del proyecto

```
albion-pt-bot/
├── index.js
├── package.json
├── .env.example
└── src/
    ├── loaders/index.js          # Carga comandos y eventos
    ├── commands/
    │   ├── pt.js                 # /pt → modal de registro
    │   ├── pt-ver.js             # /pt-ver → ver PT de un jugador
    │   └── pt-compo.js           # /pt-compo → publicar composición
    ├── events/
    │   ├── ready.js
    │   └── interactionCreate.js  # Maneja slash, modales y botones
    └── utils/
        ├── embeds.js             # Builders de embeds y botones
        ├── parsers.js            # Parseo de slots y builds
        ├── ptStore.js            # Persistencia de PTs (JSON)
        └── compoStore.js         # Persistencia de compos (JSON)
```

## Requisitos

- Node.js 18 o superior
- Discord.js v14
