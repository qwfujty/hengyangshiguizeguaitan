#!/usr/bin/env node
/* QA 临时：map08 真相结局见证路径（安全偏好随机漫游） */
import { loadGame } from "./load-game.mjs";
const { HY } = loadGame();
const CLAMP = (v) => Math.max(0, Math.min(100, Math.round(v)));
const clone = (o) => JSON.parse(JSON.stringify(o));
const itemUses = (id) => (HY.items[id] ? HY.items[id].uses || 1 : 1);
const mapId = process.argv[2] || "map08";
const m = HY.maps[mapId];
const wantType = process.argv[3] || "true";
function checkReq(c, st) {
  const req = c.req; if (!req) return true;
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
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const extra = {};
for (const id of Object.keys(HY.items)) if (HY.items[id].shop) extra[id] = itemUses(id);
const weight = (c) => c.tag === "安全" ? 14 : c.tag === "道具" ? 10 : c.tag === "真相" ? 8 : c.tag === "情感" ? 6 : c.tag === "代价" ? 4 : c.tag === "危险" ? 0.7 : c.tag === "即死" ? 0.01 : 2;
for (let seed = 1; seed <= 200000; seed++) {
  const rand = mulberry32(seed * 2654435761);
  const st = { nodeId: m.start, stats: { ...m.initial }, inventory: { ...extra }, flags: {} };
  for (const id of m.startItems || []) st.inventory[id] = (st.inventory[id] || 0) + itemUses(id);
  applyNode(st, m.nodes[m.start]);
  const path = [];
  for (let step = 0; step < 400; step++) {
    const node = m.nodes[st.nodeId];
    if (!node) break;
    if (node.ending) {
      if (node.ending.type === wantType) {
        console.log(`找到 ${wantType} 结局：《${node.ending.title}》 seed=${seed} 步数=${step} 剩余体力=${st.stats.stamina}`);
        console.log("关键物品：" + Object.keys(st.inventory).filter((i) => /map08_note|map08_tab|it_ink/.test(i)).join(","));
        console.log("关键 flag：" + Object.keys(st.flags).filter((f) => /patient|note|tab|wenzhang|archive/.test(f)).join(","));
        path.forEach((p, i) => console.log(`  ${i + 1}. ${p.node}  [${p.tag}] ${p.text}`));
        process.exit(0);
      }
      break;
    }
    const avail = (node.choices || []).filter((c) => checkReq(c, st));
    if (!avail.length) break;
    const ws = avail.map(weight);
    const total = ws.reduce((a, b) => a + b, 0);
    let r = rand() * total, pick = avail[avail.length - 1];
    for (let i = 0; i < avail.length; i++) { r -= ws[i]; if (r <= 0) { pick = avail[i]; break; } }
    const ns = { nodeId: st.nodeId, stats: clone(st.stats), inventory: clone(st.inventory), flags: clone(st.flags) };
    applyChoice(ns, pick);
    if (dead(ns) || pick.dead) break;
    const next = pick.next || pick.end;
    if (!next || !m.nodes[next]) break;
    path.push({ node: st.nodeId, tag: pick.tag, text: pick.text.slice(0, 30) });
    ns.nodeId = next; applyNode(ns, m.nodes[next]);
    if (dead(ns)) break;
    Object.assign(st, ns);
  }
}
console.log("未找到 " + wantType + " 见证路径");
process.exit(1);
