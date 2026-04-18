const fs   = require("fs");
const path = require("path");

const DB = path.join(__dirname, "../../data/pts.json");

let store = {};
try {
  if (fs.existsSync(DB)) store = JSON.parse(fs.readFileSync(DB, "utf-8"));
} catch { store = {}; }

const save   = (id, data) => { store[id] = data; persist(); };
const get    = (id)       => store[id] ?? null;
const remove = (id)       => { delete store[id]; persist(); };

function persist() {
  try {
    fs.mkdirSync(path.dirname(DB), { recursive: true });
    fs.writeFileSync(DB, JSON.stringify(store, null, 2));
  } catch (e) { console.error("ptStore error:", e); }
}

module.exports = { save, get, remove };
