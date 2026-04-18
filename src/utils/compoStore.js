const fs   = require("fs");
const path = require("path");

const DB = path.join(__dirname, "../../data/compos.json");

let store = {};
try {
  if (fs.existsSync(DB)) store = JSON.parse(fs.readFileSync(DB, "utf-8"));
} catch { store = {}; }

const save   = (msgId, data) => { store[msgId] = data; persist(); };
const get    = (msgId)       => store[msgId] ?? null;
const remove = (msgId)       => { delete store[msgId]; persist(); };
const all    = ()            => ({ ...store });

function persist() {
  try {
    fs.mkdirSync(path.dirname(DB), { recursive: true });
    fs.writeFileSync(DB, JSON.stringify(store, null, 2));
  } catch (e) { console.error("compoStore error:", e); }
}

module.exports = { save, get, remove, all };
