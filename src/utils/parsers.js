/**
 * Parsea el campo de composición libre.
 * Input:
 *   "Tank\nIncubo\nMaza\nHealer\nCaido"
 * Output:
 *   { slots: { tank: 2, healer: 1, ... }, builds: { tank: ["Incubo", "Maza"], healer: ["Caido"], ... } }
 */
function parseComposition(input) {
  const slots = { tank: 0, healer: 0, dps: 0, support: 0 };
  const builds = { tank: [], healer: [], dps: [], support: [] };
  
  if (!input) return { slots, builds };

  let currentRole = null;
  const lines = input.split("\n").map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    const lower = line.toLowerCase();
    let isHeader = false;

    if (lower.startsWith("tank") || lower === "tanque") { currentRole = "tank"; isHeader = true; }
    else if (lower.startsWith("heal")) { currentRole = "healer"; isHeader = true; }
    else if (lower.startsWith("dps") || lower.startsWith("dam")) { currentRole = "dps"; isHeader = true; }
    else if (lower.startsWith("sup") || lower.startsWith("sor")) { currentRole = "support"; isHeader = true; }

    if (isHeader) {
      // Si el rol ya tenía 0 slots al poner solo el header, le garantizamos al menos 1 slot abierto genérico
      if (slots[currentRole] === 0) slots[currentRole] = 1; 
      continue;
    }

    if (currentRole) {
      // Si el slot actual era genérico (el header de arriba puso 1 sin builds aún), lo reseteamos al añadir el primer build
      if (slots[currentRole] === 1 && builds[currentRole].length === 0) {
        slots[currentRole] = 0; 
      }
      builds[currentRole].push(line);
      slots[currentRole]++;
    }
  }

  return { slots, builds };
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

module.exports = { parseComposition, normalizeRol, normalizeContenido };
