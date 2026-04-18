const fs   = require("fs");
const path = require("path");

const DB = path.join(__dirname, "../../data/templates.json");

let store = {};
try {
  if (fs.existsSync(DB)) store = JSON.parse(fs.readFileSync(DB, "utf-8"));
} catch { store = {}; }

const save   = (name, data)  => { store[name] = data; persist(); };
const get    = (name)        => store[name] ?? null;
const remove = (name)        => { delete store[name]; persist(); };
const all    = ()            => ({ ...store });

function persist() {
  try {
    fs.mkdirSync(path.dirname(DB), { recursive: true });
    fs.writeFileSync(DB, JSON.stringify(store, null, 2));
  } catch (e) { console.error("templateStore error:", e); }
}

module.exports = { save, get, remove, all };
