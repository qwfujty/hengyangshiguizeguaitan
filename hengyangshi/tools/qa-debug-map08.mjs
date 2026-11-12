#!/usr/bin/env node
/* QA 临时调试：搜索 map08 真相结局路径（排查“仅 hidden 可达”警告） */
import { loadGame } from "./load-game.mjs";
const { HY } = loadGame();
const CLAMP = (v) => Math.max(0, Math.min(100, Math.round(v)));
const clone = (o) => JSON.parse(JSON.stringify(o));
const itemUses = (id) => (HY.items[id] ? HY.items[id].uses || 1 : 1);
function checkReq(choice, st) {
  const req = choice.req; if (!req) return true;
  for (const id of req.items || []) if (!(st.inventory[id] > 0)) return false;
  if (typeof req.infectionMin === "number" && st.stats.infection < req.infectionMin) return false;
  if (typeof req.infectionMax === "number" && st.stats.infection > req.infectionMax) return false;
  if (typeof req.sanityMin === "number" && st.stats.sanity < req.sanityMin) return false;
  if (typeof req.sanityMax === "number" && st.stats.sanity > req.sanityMax) return false;
  if (typeof req.staminaMin === "number" && st.stats.stamina < req.staminaMin) return false;
  if (typeof req.evidenceMin === "number" || typeof req.evidenceMax === "number") {
    let ev = 0; for (const id of Object.keys(st.inventory)) if (st.inventory[id] > 0 && HY.items[id] && HY.items[id].category === "证物") ev++;
    if (typeof req.evidenceMin === "number" && ev < req.evidenceMin) return false;
    if (typeof req.evidenceMax === "number" && ev > req.evidenceMax) return false;
  }
  for (const f of req.flags || []) if (!st.flags[f]) return false;
  for (const f of req.notFlags || []) if (st.flags[f]) return false;
  return true;
}
function applyFx(st, fx) {
  if (!fx) return;
  if (typeof fx.infection === "number") st.stats.infection += fx.infection;
  if (typeof fx.sanity === "number") st.stats.sanity += fx.sanity;
  if (typeof fx.stamina === "number" && fx.stamina < 0) st.stats.stamina += fx.stamina;
  st.stats.infection = CLAMP(st.stats.infection); st.stats.sanity = CLAMP(st.stats.sanity); st.stats.stamina = CLAMP(st.stats.stamina);
}
function applyNode(st, n) {
  applyFx(st, n.fx);
  for (const f of n.setFlags || []) st.flags[f] = true;
  for (const f of n.clearFlags || []) delete st.flags[f];
  if (n.items) { for (const id of n.items.add || []) st.inventory[id] = (st.inventory[id] || 0) + itemUses(id); for (const id of n.items.remove || []) { st.inventory[id] = (st.inventory[id] || 0) - 1; if (st.inventory[id] <= 0) delete st.inventory[id]; } }
}
function applyChoice(st, c) {
  applyFx(st, c.fx);
  if (c.items) { for (const id of c.items.add || []) st.inventory[id] = (st.inventory[id] || 0) + itemUses(id); for (const id of c.items.remove || []) { st.inventory[id] = (st.inventory[id] || 0) - 1; if (st.inventory[id] <= 0) delete st.inventory[id]; } }
  for (const f of c.setFlags || []) st.flags[f] = true;
  for (const f of c.clearFlags || []) delete st.flags[f];
}
const dead = (st) => st.stats.stamina <= 0 || st.stats.sanity <= 0 || st.stats.infection >= 100;

const mapId = process.argv[2] || "map08";
const m = HY.maps[mapId];
const extra = {};
for (const id of Object.keys(HY.items)) if (HY.items[id].shop) extra[id] = itemUses(id);
const start = { nodeId: m.start, stats: { ...m.initial }, inventory: { ...extra }, flags: {} };
for (const id of m.startItems || []) start.inventory[id] = (start.inventory[id] || 0) + itemUses(id);
applyNode(start, m.nodes[m.start]);
console.log("start stats", start.stats);
const visited = new Set();
let states = 0, maxStates = 2000000, cutoff = false;
const sig = (st) => st.nodeId + "|" + Object.values(st.stats).join(",") + "|" + Object.keys(st.flags).sort().join(",") + "|" + Object.keys(st.inventory).sort().map((k) => k + ":" + st.inventory[k]).join(",");
function rec(st, path) {
  if (states++ > maxStates) { cutoff = true; return null; }
  const node = m.nodes[st.nodeId];
  if (!node) return null;
  if (node.ending) {
    if (node.ending.type === "true") return { path, ending: node.ending, stats: { ...st.stats }, inv: { ...st.inventory }, flags: { ...st.flags } };
    return null;
  }
  const key = sig(st);
  if (visited.has(key)) return null;
  visited.add(key);
  for (let i = 0; i < (node.choices || []).length; i++) {
    const c = node.choices[i];
    if (!checkReq(c, st)) continue;
    const ns = { nodeId: st.nodeId, stats: clone(st.stats), inventory: clone(st.inventory), flags: clone(st.flags) };
    applyChoice(ns, c);
    if (dead(ns) || c.dead) continue;
    const next = c.next || c.end;
    if (!next || !m.nodes[next]) continue;
    ns.nodeId = next; applyNode(ns, m.nodes[next]);
    if (dead(ns)) continue;
    const got = rec(ns, path.concat([{ nodeId: st.nodeId, ci: i, text: c.text }]));
    if (got) return got;
    if (cutoff) return null;
  }
  return null;
}
const res = rec(start, []);
console.log("states=" + states, "cutoff=" + cutoff, "found=" + !!res);
if (res) {
  console.log("ending:", res.ending.title, "stats:", res.stats);
  console.log("flags relevant:", Object.keys(res.flags).filter((f) => /patient|note|tab|chenxi/.test(f)));
  console.log("loot:", Object.keys(res.inv).filter((i) => /map08/.test(i)));
  console.log("path:");
  res.path.forEach((p, i) => console.log(`  ${i + 1}. ${p.nodeId} → ${p.text}`));
} else {
  // 检查关键 req 可达性
  for (const nid of ["n039"]) {
    console.log("\nnode", nid, "choices:");
    (m.nodes[nid].choices || []).forEach((c) => console.log("  ", c.tag, c.text.slice(0, 30), JSON.stringify(c.req || {})));
  }
}
process.exit(0);
