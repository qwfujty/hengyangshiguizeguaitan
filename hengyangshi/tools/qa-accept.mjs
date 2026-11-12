#!/usr/bin/env node
/* ============================================================
 * QA 验收脚本 A：跨图证物授予 / 可达路径 / 体力预算 / 终章门槛 / 商店体力
 * 只读数据（经 js/engine.js 加载），不修改任何游戏文件。
 *   node tools/qa-accept.mjs
 * 「!」= P0 阻塞，「△」= 需人工判断
 * ============================================================ */
import { loadGame } from "./load-game.mjs";

const { HY } = loadGame();
const Core = HY.Core;
const CLAMP = (v) => Math.max(0, Math.min(100, Math.round(v)));
const clone = (o) => JSON.parse(JSON.stringify(o));
const itemUses = (id) => (HY.items[id] ? HY.items[id].uses || 1 : 1);

const REQUIRED = {
  map01: "it_badge_tsp", map02: "it_ticket_half", map03: "it_pass_outside",
  map04: "it_stabilizer", map05: "it_raft_cord", map06: "it_chisel",
  map07: "it_redfruit", map08: "it_geology", map09: "it_diary_zhou",
  map10: "it_black_envelope", map11: "it_program"
};

const errors = [];
const notes = [];
const E = (m) => errors.push(m);
const N = (m) => notes.push(m);

/* ---------------- 引擎数据模型的最小复刻 ---------------- */
function checkReq(choice, st) {
  const req = choice.req;
  if (!req) return true;
  for (const id of req.items || []) if (!(st.inventory[id] > 0)) return false;
  if (typeof req.infectionMin === "number" && st.stats.infection < req.infectionMin) return false;
  if (typeof req.infectionMax === "number" && st.stats.infection > req.infectionMax) return false;
  if (typeof req.sanityMin === "number" && st.stats.sanity < req.sanityMin) return false;
  if (typeof req.sanityMax === "number" && st.stats.sanity > req.sanityMax) return false;
  if (typeof req.staminaMin === "number" && st.stats.stamina < req.staminaMin) return false;
  if (typeof req.evidenceMin === "number" || typeof req.evidenceMax === "number") {
    let ev = 0;
    for (const id of Object.keys(st.inventory)) {
      if (st.inventory[id] > 0 && HY.items[id] && HY.items[id].category === "证物") ev++;
    }
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
  st.stats.infection = CLAMP(st.stats.infection);
  st.stats.sanity = CLAMP(st.stats.sanity);
  st.stats.stamina = CLAMP(st.stats.stamina);
}
function addItems(st, list) { for (const id of list || []) st.inventory[id] = (st.inventory[id] || 0) + itemUses(id); }
function removeItems(st, list) {
  for (const id of list || []) { st.inventory[id] = (st.inventory[id] || 0) - 1; if (st.inventory[id] <= 0) delete st.inventory[id]; }
}
function applyNode(st, node) {
  applyFx(st, node.fx);
  for (const f of node.setFlags || []) st.flags[f] = true;
  for (const f of node.clearFlags || []) delete st.flags[f];
  if (node.items) { addItems(st, node.items.add); removeItems(st, node.items.remove); }
}
function applyChoice(st, choice) {
  applyFx(st, choice.fx);
  if (choice.items) { addItems(st, choice.items.add); removeItems(st, choice.items.remove); }
  for (const f of choice.setFlags || []) st.flags[f] = true;
  for (const f of choice.clearFlags || []) delete st.flags[f];
}
const isDead = (st) => st.stats.stamina <= 0 || st.stats.sanity <= 0 || st.stats.infection >= 100;

/* ---------------- DFS 搜索 ---------------- */
/* 无 sanityMax / infectionMin 门槛的地图可用 Pareto 支配剪枝：
   同一 (节点, flags, 背包) 下，体力/精神更高、感染更低的状态支配其它状态。 */
function dominanceEligible(m) {
  for (const nid of Object.keys(m.nodes)) {
    for (const c of m.nodes[nid].choices || []) {
      const r = c.req;
      if (!r) continue;
      if (typeof r.sanityMax === "number" || typeof r.infectionMin === "number") return false;
    }
  }
  return true;
}
function search(mapId, opts) {
  const m = HY.maps[mapId];
  if (!m) return { error: "地图不存在" };
  const { goal, goalNode = null, extraInv = {}, maxStates = 400000 } = opts;
  const maxStamina = m.initial.stamina;
  const pareto = opts.dominance !== undefined ? opts.dominance : dominanceEligible(m);
  const startState = {
    nodeId: m.start,
    stats: { infection: m.initial.infection, sanity: m.initial.sanity, stamina: m.initial.stamina },
    inventory: {},
    flags: {}
  };
  for (const id of m.startItems || []) startState.inventory[id] = (startState.inventory[id] || 0) + itemUses(id);
  for (const id of Object.keys(extraInv)) startState.inventory[id] = (startState.inventory[id] || 0) + extraInv[id];
  const startNode = m.nodes[m.start];
  applyNode(startState, startNode);
  if (isDead(startState)) return { error: "起始节点即死亡" + JSON.stringify(startState.stats) };
  const visited = new Set();            /* 精确去重（含数值） */
  const frontier = new Map();           /* Pareto 前沿 key -> [{sanity,stamina,infection}] */
  let states = 0;
  let cutoff = false;

  const sig = (st) => st.nodeId + "|" + st.stats.stamina + "|" + st.stats.sanity + "|" + st.stats.infection + "|" +
    Object.keys(st.flags).sort().join(",") + "|" + Object.keys(st.inventory).sort().map((id) => id + ":" + st.inventory[id]).join(",");
  const pk = (st) => st.nodeId + "|" + Object.keys(st.flags).sort().join(",") + "|" +
    Object.keys(st.inventory).sort().map((id) => id + ":" + st.inventory[id]).join(",");
  function dominated(st) {
    const list = frontier.get(pk(st));
    if (!list) return false;
    for (const t of list) {
      if (t.stamina >= st.stats.stamina && t.sanity >= st.stats.sanity && t.infection <= st.stats.infection) return true;
    }
    return false;
  }
  function insert(st) {
    const k = pk(st);
    let list = frontier.get(k);
    if (!list) { frontier.set(k, [{ stamina: st.stats.stamina, sanity: st.stats.sanity, infection: st.stats.infection }]); return; }
    list = list.filter((t) => !(t.stamina <= st.stats.stamina && t.sanity <= st.stats.sanity && t.infection >= st.stats.infection));
    list.push({ stamina: st.stats.stamina, sanity: st.stats.sanity, infection: st.stats.infection });
    frontier.set(k, list);
  }

  function rec(st, path) {
    if (states++ > maxStates) { cutoff = true; return null; }
    const node = m.nodes[st.nodeId];
    if (!node) return null;
    if (st.nodeId === goalNode) return { path, stats: st.stats };
    if (node.ending) {
      if (!goalNode && goal(node.ending, st.nodeId)) return { path, stats: st.stats, ending: node.ending, nodeId: st.nodeId };
      return null;
    }
    if (pareto) {
      if (dominated(st)) return null;
      insert(st);
    } else {
      const key = sig(st);
      if (visited.has(key)) return null;
      visited.add(key);
    }
    for (let i = 0; i < (node.choices || []).length; i++) {
      const c = node.choices[i];
      if (!checkReq(c, st)) continue;
      const nst = { nodeId: st.nodeId, stats: clone(st.stats), inventory: clone(st.inventory), flags: clone(st.flags) };
      applyChoice(nst, c);
      if (isDead(nst)) continue;
      if (c.dead) continue;
      const next = c.next || c.end;
      if (!next || !m.nodes[next]) continue;
      nst.nodeId = next;
      applyNode(nst, m.nodes[next]);
      if (isDead(nst)) continue;
      const p2 = path.concat([{ nodeId: st.nodeId, choiceIndex: i, choiceText: c.text.slice(0, 26), tag: c.tag }]);
      const got = rec(nst, p2);
      if (got) return got;
      if (cutoff) return null;
    }
    return null;
  }
  const res = rec(startState, []);
  return { result: res, states, cutoff, pareto };
}

/* 兜底见证搜索：状态空间过大时用“安全偏好”随机漫游找一个见证路径 */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randomWitness(mapId, opts) {
  const m = HY.maps[mapId];
  const { goal, extraInv = {}, attempts = 40000 } = opts;
  const init = () => {
    const st = {
      nodeId: m.start,
      stats: { infection: m.initial.infection, sanity: m.initial.sanity, stamina: m.initial.stamina },
      inventory: {}, flags: {}
    };
    for (const id of m.startItems || []) st.inventory[id] = (st.inventory[id] || 0) + itemUses(id);
    for (const id of Object.keys(extraInv)) st.inventory[id] = (st.inventory[id] || 0) + extraInv[id];
    applyNode(st, m.nodes[m.start]);
    return st;
  };
  const weights = (c) => {
    if (c.tag === "安全") return 14;
    if (c.tag === "道具") return 10;
    if (c.tag === "真相") return 8;
    if (c.tag === "情感") return 6;
    if (c.tag === "代价") return 4;
    if (c.tag === "危险") return 0.7;
    if (c.tag === "即死") return 0.01;
    return 2;
  };
  for (let seed = 1; seed <= attempts; seed++) {
    const rand = mulberry32(seed * 7919);
    const st = init();
    const path = [];
    for (let step = 0; step < 400; step++) {
      const node = m.nodes[st.nodeId];
      if (!node) break;
      if (node.ending) {
        if (goal(node.ending, st.nodeId)) return { path, stats: st.stats, ending: node.ending, seed };
        break;
      }
      const avail = (node.choices || []).filter((c) => checkReq(c, st));
      if (!avail.length) break;
      const ws = avail.map(weights);
      const total = ws.reduce((a, b) => a + b, 0);
      let r = rand() * total;
      let pick = avail[avail.length - 1];
      for (let i = 0; i < avail.length; i++) { r -= ws[i]; if (r <= 0) { pick = avail[i]; break; } }
      const idx = (node.choices || []).indexOf(pick);
      const ns = { nodeId: st.nodeId, stats: clone(st.stats), inventory: clone(st.inventory), flags: clone(st.flags) };
      applyChoice(ns, pick);
      if (isDead(ns) || pick.dead) break;
      const next = pick.next || pick.end;
      if (!next || !m.nodes[next]) break;
      ns.nodeId = next;
      applyNode(ns, m.nodes[next]);
      if (isDead(ns)) break;
      path.push({ nodeId: st.nodeId, choiceIndex: idx, choiceText: pick.text.slice(0, 26), tag: pick.tag });
      Object.assign(st, ns);
    }
  }
  return null;
}

function invFor(mode, mapId) {
  const inv = {};
  if (mode === "shop" || mode === "shop+evidence") {
    for (const id of Object.keys(HY.items)) {
      if (HY.items[id].shop) inv[id] = (inv[id] || 0) + itemUses(id);
    }
  }
  if (mode === "shop+evidence" || mode === "all-evidence") {
    for (const id of Object.values(REQUIRED)) {
      if (HY.items[id]) inv[id] = (inv[id] || 0) + itemUses(id);
    }
  }
  return inv;
}

/* ================= A. 跨图证物授予 ================= */
console.log("════════ A. 跨图证物（true / hidden 结局授予）════════");
for (const mapId of HY.mapOrder) {
  const m = HY.maps[mapId];
  const need = REQUIRED[mapId];
  const rows = [];
  for (const nid of Object.keys(m.nodes)) {
    const e = m.nodes[nid].ending;
    if (!e || (e.type !== "true" && e.type !== "hidden")) continue;
    const items = (e.awards && e.awards.items) || [];
    rows.push({ nid, type: e.type, title: e.title, items });
  }
  if (!rows.length) { E(`${mapId}: 没有任何 true/hidden 结局`); continue; }
  const granting = rows.filter((r) => r.items.includes(need));
  if (need !== "it_program") {
    if (!granting.length) E(`${mapId}: true/hidden 结局均未授予 ${need}（应授证据：${rows.map((r) => r.title + "[" + r.items.join(",") + "]").join("；")}）`);
    else if (!rows.some((r) => (r.type === "true" || r.type === "hidden") && r.items.includes(need) && r.type === "true") &&
             !rows.some((r) => r.type === "hidden" && r.items.includes(need))) {
      E(`${mapId}: ${need} 未由 true 结局授予（仅 hidden）`);
    }
  }
  const badAwards = rows.flatMap((r) => r.items).filter((id) => !HY.items[id]);
  if (badAwards.length) E(`${mapId}: awards.items 引用了未定义道具 ${badAwards.join(",")}`);
  if (need && need !== "it_program" && HY.items[need] && HY.items[need].category !== "证物") {
    E(`${mapId}: 跨图证物 ${need} 的 category 不是「证物」（实际 ${HY.items[need].category}）`);
  }
  console.log(`${mapId} ${m.title}: true/hidden=[${rows.map((r) => r.type + ":" + r.title + "→" + (r.items.join("/") || "无")).join(" | ")}] ` +
    (need === "it_program" ? "（初始携带，真/隐藏结局重复授予可接受）" : granting.length ? `✔ ${need}` : `! 缺 ${need}`));
}

/* ================= B. 可达性 / 体力预算 ================= */
console.log("\n════════ B. 可达路径（start → 非死亡结局，体力始终 >0）════════");
const reach = {};
for (const mapId of HY.mapOrder) {
  const m = HY.maps[mapId];
  const isNonDeath = (e) => e.type !== "death";
  let r = search(mapId, { goal: isNonDeath, extraInv: {} });
  let mode = "仅初始道具";
  if (!r.result) {
    const r2 = search(mapId, { goal: isNonDeath, extraInv: invFor("shop", mapId) });
    if (r2.result) { r = r2; mode = "初始道具+全部商店道具"; }
  }
  if (r.error) { E(`${mapId}: ${r.error}`); continue; }
  if (!r.result) { E(`${mapId}: 找不到从 start 到非死亡结局的存活路径（${mode}${r.cutoff ? "，搜索截断" : ""}）`); continue; }
  const end = r.result.ending;
  reach[mapId] = { ending: end.title, type: end.type, mode, stamina: r.result.stats.stamina, steps: r.result.path.length + 1 };
  console.log(`${mapId} ${m.title}: ✔ ${end.type}《${end.title}》 剩余体力 ${r.result.stats.stamina}/${m.initial.stamina}（${mode}，${r.result.path.length} 步）`);
}

/* ================= C. 真结局（授证物）路线可达 ================= */
console.log("\n════════ C. 授证 true/hidden 结局可达（证物可获得）════════");
const evReach = {};
for (const mapId of HY.mapOrder) {
  const m = HY.maps[mapId];
  const need = REQUIRED[mapId];
  const goalTrue = (e) => e.type === "true" && !!(e.awards && (e.awards.items || []).includes(need));
  const goalAny = (e) => (e.type === "true" || e.type === "hidden") &&
    !!(e.awards && (e.awards.items || []).includes(need));
  let r = search(mapId, { goal: goalTrue, extraInv: invFor("shop", mapId) });
  let mode = "商店道具";
  if (!r.result) { const r2 = search(mapId, { goal: goalTrue, extraInv: invFor("shop+evidence", mapId) }); if (r2.result) { r = r2; mode = "商店道具+全部跨图证物"; } }
  if (!r.result) {
    const r3 = search(mapId, { goal: goalAny, extraInv: invFor("shop", mapId) });
    if (r3.result) { r = r3; mode = "商店道具（仅 hidden 可达）"; }
    else { const r4 = search(mapId, { goal: goalAny, extraInv: invFor("shop+evidence", mapId) }); if (r4.result) { r = r4; mode = "商店道具+全部跨图证物（仅 hidden 可达）"; } }
  }
  /* 状态空间过大时用随机见证兜底（安全偏好漫游） */
  let witness = "DFS";
  if (!r.result || mode.includes("仅 hidden 可达")) {
    let w = randomWitness(mapId, { goal: goalTrue, extraInv: invFor("shop", mapId), attempts: 60000 });
    if (w) { r = { result: { ending: w.ending, stats: w.stats, path: w.path } }; mode = "商店道具"; witness = "随机见证"; }
    if (!w && !r.result) {
      w = randomWitness(mapId, { goal: goalAny, extraInv: invFor("shop", mapId) });
      if (w) { r = { result: { ending: w.ending, stats: w.stats, path: w.path } }; mode = "商店道具（仅 hidden 可达）"; witness = "随机见证"; }
    }
  }
  if (witness === "随机见证" && r.result) {
    evReach[mapId] = { type: r.result.ending.type, title: r.result.ending.title, mode, stamina: r.result.stats.stamina };
    console.log(`${mapId} ${m.title}: ✔ ${r.result.ending.type}《${r.result.ending.title}》→ ${need}（剩余体力 ${r.result.stats.stamina}，${mode}·${witness}）`);
    continue;
  }
  if (r.error) { E(`${mapId}: ${r.error}`); continue; }
  if (!r.result) { E(`${mapId}: 授予 ${need} 的 true/hidden 结局不可达（${mode}${r.cutoff ? "，搜索截断" : ""}，随机见证也未找到）`); continue; }
  evReach[mapId] = { type: r.result.ending.type, title: r.result.ending.title, mode, stamina: r.result.stats.stamina };
  console.log(`${mapId} ${m.title}: ✔ ${r.result.ending.type}《${r.result.ending.title}》→ ${need}（剩余体力 ${r.result.stats.stamina}，${mode}）`);
}

/* C2. 跨图门槛的 hidden 结局专项（playtest 因缺前置证据无法到达的） */
console.log("\n──────── C2. 跨图门槛 hidden 结局可达性 ────────");
for (const mapId of ["map02", "map03"]) {
  const m = HY.maps[mapId];
  const goalHidden = (e) => e.type === "hidden";
  let r = search(mapId, { goal: goalHidden, extraInv: invFor("shop+evidence", mapId) });
  let via = "DFS";
  if (!r.result) { const w = randomWitness(mapId, { goal: goalHidden, extraInv: invFor("shop+evidence", mapId) }); if (w) { r = { result: { ending: w.ending, stats: w.stats, path: w.path } }; via = "随机见证"; } }
  if (r.result) {
    console.log(`${mapId} ${m.title}: ✔ hidden《${r.result.ending.title}》可达（前置跨图证物齐全，剩余体力 ${r.result.stats.stamina}，${via}）`);
  } else {
    E(`${mapId}: 持有前置证物时 hidden 结局仍不可达`);
  }
}

/* ================= D. 终章门槛（map11 evidenceMin）================= */
console.log("\n════════ D. 终章 map11 隐藏选项门槛（Core 实跑）════════");
const m11 = HY.maps.map11;
const hiddenTextFrag = "十一段证物全部摆到镜头前";
function findPathTo(mapId, goalNode, extraInv) {
  const r = search(mapId, { goalNode, extraInv: extraInv || {} });
  return r;
}
function runPath(path) {
  for (const step of path) {
    const v = Core.getView();
    if (!v) return { error: "运行中断（无 view）" };
    const choice = v.choices.find((c) => c.index === step.choiceIndex);
    if (!choice || !choice.enabled) return { error: `节点 ${step.nodeId} 选项不可用：${step.choiceText}` };
    const res = Core.choose(choice.index);
    if (!res.ok) return { error: "choose 失败：" + res.error };
    if (!Core.hasActiveRun()) return { error: "提前结束：" + (Core.getEnding() && Core.getEnding().ending.title) };
  }
  return {};
}
function testGate(label, ownedIds) {
  Core.resetSave();
  for (const id of ownedIds) Core.getSave().owned[id] = true;
  const created = Core.newRun("map11");
  if (!created.ok) { E(`map11 进入失败（${label}）：${created.error}`); return; }
  const v0 = Core.getView();
  const evCount = Object.keys(v0.run.inventory).filter((id) => HY.items[id] && HY.items[id].category === "证物").length;
  const r = findPathTo("map11", "n015", {});
  if (!r.result) { E(`map11 无法在 ${label}（${evCount} 件证物）下走到 n015：${r.error || "无路径"}`); Core.abandonRun(); return; }
  const execErr = runPath(r.result.path);
  if (execErr.error) { E(`map11 ${label} 执行失败：${execErr.error}`); Core.abandonRun(); return; }
  const view = Core.getView();
  if (!view || view.node.id !== "n015") { E(`map11 ${label} 未抵达 n015`); Core.abandonRun(); return; }
  const hidden = view.choices.find((c) => c.text.includes(hiddenTextFrag));
  if (!hidden) { E(`map11 ${label}: 终节点找不到隐藏选项「${hiddenTextFrag}」`); Core.abandonRun(); return; }
  console.log(`  ${label}: 证物数=${evCount}，隐藏选项 enabled=${hidden.enabled}` + (hidden.enabled ? "" : `，lockText="${hidden.lockText}"`));
  return { evCount, enabled: hidden.enabled, lockText: hidden.lockText };
}
const gate0 = testGate("仅节目单(0 件跨图证物)", []);
Core.clearEnding(); Core.abandonRun();
const gate6 = testGate("5 件跨图证物+节目单(=6 件)", ["it_badge_tsp", "it_ticket_half", "it_pass_outside", "it_stabilizer", "it_raft_cord"]);
Core.clearEnding(); Core.abandonRun();
if (gate0 && gate0.enabled) E("map11: 0 件跨图证物时隐藏选项不应可选");
if (gate6 && !gate6.enabled) E("map11: 6 件证物时隐藏选项应可选");
// 边界：5 件证物 = 4 跨图 + 节目单，应锁定
const gate5 = testGate("4 件跨图证物+节目单(=5 件)", ["it_badge_tsp", "it_ticket_half", "it_pass_outside", "it_stabilizer"]);
Core.clearEnding(); Core.abandonRun();
if (gate5 && gate5.enabled) E("map11: 5 件证物时隐藏选项不应可选（门槛应为 6）");
Core.resetSave();

/* ================= E. 商店 / 全道具体力检查 ================= */
console.log("\n════════ E. 商店与道具体力检查（effect.stamina ≤ 0）════════");
let staminaViol = 0;
for (const id of Object.keys(HY.items)) {
  const it = HY.items[id];
  const eff = it.effect || {};
  if (typeof eff.stamina === "number" && eff.stamina > 0) {
    staminaViol++;
    E(`道具 ${id}（${it.name}）effect.stamina=${eff.stamina} > 0（体力不可回复）`);
  }
  if (it.shop && eff.stamina > 0) E(`商店道具 ${id} 提供体力回复`);
}
const shopRecovery = Object.keys(HY.items).filter((id) => HY.items[id].shop && (HY.items[id].effect || {}).stamina > 0);
console.log(`  商店道具 ${Object.keys(HY.items).filter((id) => HY.items[id].shop).length} 件；体力回复违规 ${staminaViol + shopRecovery.length} 件`);
// 本图 localItems / 节点 fx / 选项 fx 里的正体力
for (const mapId of HY.mapOrder) {
  const m = HY.maps[mapId];
  for (const nid of Object.keys(m.nodes)) {
    const n = m.nodes[nid];
    if (n.fx && n.fx.stamina > 0) E(`${mapId}.${nid}.fx.stamina=${n.fx.stamina} > 0`);
    for (const [ci, c] of (n.choices || []).entries()) {
      if (c.fx && c.fx.stamina > 0) E(`${mapId}.${nid}.choices[${ci}].fx.stamina=${c.fx.stamina} > 0`);
    }
  }
  for (const [iid, def] of Object.entries(m.localItems || {})) {
    if (def.effect && def.effect.stamina > 0) E(`${mapId}.localItems.${iid}.effect.stamina > 0`);
  }
}

/* ================= 汇总 ================= */
console.log("\n════════ 汇总 ════════");
if (errors.length) {
  console.log(`! P0 阻塞 ${errors.length} 条：`);
  errors.forEach((e) => console.log("  ! " + e));
} else {
  console.log("✔ 证物授予、可达路径、终章门槛、体力/商店检查全部通过；P0=0");
}
if (notes.length) { notes.forEach((n) => console.log("  △ " + n)); }

const out = { errors, notes, reach, evReach, gate0, gate6, gate5 };
console.log("\nJSON_SUMMARY " + JSON.stringify(out));
process.exit(errors.length ? 1 : 0);
