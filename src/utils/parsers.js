/**
 * Parsea el campo de slots del modal.
 * Input: "Tank:2 Healer:3 DPS:5 Support:2"
 * Output: { tank: 2, healer: 3, dps: 5, support: 2 }
 */
function parseSlots(input) {
  const slots = { tank: 0, healer: 0, dps: 0, support: 0 };
  const regex = /(\w+)\s*:\s*(\d+)/gi;
  let match;

  while ((match = regex.exec(input)) !== null) {
    const key = match[1].toLowerCase();
    const val = parseInt(match[2], 10);

    if (key.startsWith("tank") || key === "tanque")         slots.tank    = val;
    else if (key.startsWith("heal") || key === "healer")     slots.healer  = val;
    else if (key.startsWith("dps") || key.startsWith("dam")) slots.dps     = val;
    else if (key.startsWith("sup") || key.startsWith("sor")) slots.support = val;
  }

  return slots;
}

/**
 * Parsea el campo de builds del modal.
 * Input:
 *   "Tank: Heavy Mace
 *    Healer: Hallowfall
 *    DPS: Halberd
 *    Support: Locus Staff"
 * Output: { tank: "Heavy Mace", healer: "Hallowfall", ... }
 */
function parseBuilds(input) {
  const builds = { tank: "", healer: "", dps: "", support: "" };
  if (!input) return builds;

  for (const line of input.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key   = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (key.startsWith("tank") || key === "tanque")          builds.tank    = value;
    else if (key.startsWith("heal"))                          builds.healer  = value;
    else if (key.startsWith("dps") || key.startsWith("dam")) builds.dps     = value;
    else if (key.startsWith("sup") || key.startsWith("sor")) builds.support = value;
  }

  return builds;
}

/**
 * Normaliza el rol ingresado por el usuario.
 * "tank", "TANK", "Tanque" → "Tank"
 */
function normalizeRol(input) {
  const lower = input.trim().toLowerCase();
  if (lower.startsWith("tank") || lower === "tanque")          return "Tank";
  if (lower.startsWith("heal"))                                 return "Healer";
  if (lower.startsWith("dps") || lower.startsWith("dam"))      return "DPS";
  if (lower.startsWith("sup") || lower.startsWith("sor"))      return "Support";
  return input.trim(); // devolver tal cual si no coincide
}

/**
 * Normaliza el contenido ingresado.
 */
function normalizeContenido(input) {
  return input.trim()
    .split(/[\s·,\/]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .join(" · ");
}

module.exports = { parseSlots, parseBuilds, normalizeRol, normalizeContenido };
