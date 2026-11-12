#!/usr/bin/env node
/* ============================================================
 * 自动试玩器：随机 / 稳妥 / 冒险 三种策略模拟分支与数值
 *   node tools/playtest.mjs --map map05 --runs 600
 *   node tools/playtest.mjs                # 全部地图
 * 退出码：0 = 无阻塞问题（可以有警告）；1 = 存在硬性问题
 * ============================================================ */
import { loadGame } from "./load-game.mjs";

const args = process.argv.slice(2);
const mapFilter = (() => { const i = args.indexOf("--map"); return i >= 0 ? args[i + 1] : null; })();
const runsArg = (() => { const i = args.indexOf("--runs"); return i >= 0 ? parseInt(args[i + 1], 10) : 400; })();
const RUNS = Number.isFinite(runsArg) ? Math.max(50, runsArg) : 400;
const quiet = args.includes("--quiet");

const { HY } = loadGame();
const warnings = [];
const errors = [];
const W = (w, m) => warnings.push(`${w}: ${m}`);
const E = (w, m) => errors.push(`${w}: ${m}`);
const targets = mapFilter ? [mapFilter] : (HY.mapOrder || []).slice();
if (mapFilter && !HY.maps[mapFilter]) { console.error(`找不到地图 ${mapFilter}`); process.exit(1); }

const ALL_GLOBAL_ITEMS = Object.keys(HY.items || {}).filter((id) => !HY.items[id].mapId);
const SHOP_ITEMS = ALL_GLOBAL_ITEMS.filter((id) => HY.items[id].shop);
const CLAMP = (v) => Math.max(0, Math.min(100, Math.round(v)));

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rand = Math.random;
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }

function satisfies(choice, st) {
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

function applyFx(fx, st) {
  if (!fx) return;
  if (typeof fx.infection === "number") st.stats.infection += fx.infection;
  if (typeof fx.sanity === "number") st.stats.sanity += fx.sanity;
  if (typeof fx.stamina === "number" && fx.stamina < 0) st.stats.stamina += fx.stamina;
  st.stats.infection = CLAMP(st.stats.infection);
  st.stats.sanity = CLAMP(st.stats.sanity);
  st.stats.stamina = CLAMP(st.stats.stamina);
}

function addItems(st, list, count) {
  for (const id of list || []) {
    const def = HY.items[id];
    st.inventory[id] = (st.inventory[id] || 0) + (count || (def ? def.uses || 1 : 1));
  }
}
function removeItems(st, list, count) {
  for (const id of list || []) {
    st.inventory[id] = (st.inventory[id] || 0) - (count || 1);
    if (st.inventory[id] <= 0) delete st.inventory[id];
  }
}

function strategyChoice(choices, policy) {
  if (!choices.length) return null;
  const weights = choices.map((c) => {
    let w = 1;
    if (policy === "safe") {
      if (c.tag === "安全") w = 12;
      else if (c.tag === "道具") w = 8;
      else if (c.tag === "情感") w = 5;
      else if (c.tag === "真相") w = 7;
      else if (c.tag === "代价") w = 3;
      else if (c.tag === "危险") w = 0.8;
      else if (c.tag === "即死") w = 0.02;
      else w = 1.5;
    } else if (policy === "risky") {
      if (c.tag === "即死") w = 10;
      else if (c.tag === "危险") w = 10;
      else if (c.tag === "异常") w = 6;
      else if (c.tag === "安全") w = 0.8;
      else w = 2;
    } else {
      if (c.tag === "即死") w = 1.5;
    }
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return pick(choices);
  let r = rand() * total;
  for (let i = 0; i < choices.length; i++) {
    r -= weights[i];
    if (r <= 0) return choices[i];
  }
  return choices[choices.length - 1];
}

function simulate(map, mode, policy, seed) {
  rand = mulberry32(seed);
  const m = HY.maps[map];
  const st = {
    nodeId: m.start,
    stats: {
      infection: m.initial.infection,
      sanity: m.initial.sanity,
      stamina: m.initial.stamina
    },
    inventory: {},
    flags: {},
    steps: 0,
    path: [],
    everSatisfiable: new Map()
  };
  /* 背包：bare = 只有本图初始道具；full = 全部商店道具 + 本图初始道具 */
  if (mode === "full") for (const id of SHOP_ITEMS) st.inventory[id] = HY.items[id].uses || 1;
  for (const id of m.startItems || []) st.inventory[id] = (st.inventory[id] || 0) + (HY.items[id] ? HY.items[id].uses || 1 : 1);

  let softlockAt = null;
  let deathCause = null;
  let result = null;

  const guard = 400;
  while (st.steps < guard) {
    st.steps++;
    const node = m.nodes[st.nodeId];
    if (!node) { result = { type: "broken", title: "节点不存在" }; break; }
    st.path.push(st.nodeId);
    /* 节点效果 */
    applyFx(node.fx, st);
    for (const f of node.setFlags || []) st.flags[f] = true;
    for (const f of node.clearFlags || []) delete st.flags[f];
    addItems(st, node.items && node.items.add);
    removeItems(st, node.items && node.items.remove);
    if (st.stats.stamina <= 0) { deathCause = "体力"; break; }
    if (st.stats.sanity <= 0) { deathCause = "精神"; break; }
    if (st.stats.infection >= 100) { deathCause = "感染"; break; }

    if (node.ending) { result = { type: node.ending.type, title: node.ending.title }; break; }

    const available = (node.choices || []).filter((c) => satisfies(c, st));
    const totalChoices = (node.choices || []).length;
    for (let i = 0; i < totalChoices; i++) {
      if (satisfies(node.choices[i], st)) {
        const key = st.nodeId + "#" + i;
        st.everSatisfiable.set(key, true);
      }
    }
    if (!available.length) {
      softlockAt = st.nodeId;
      result = { type: "softlock", title: "无可用选项" };
      break;
    }
    const choice = strategyChoice(available, policy);
    applyFx(choice.fx, st);
    addItems(st, choice.items && choice.items.add);
    removeItems(st, choice.items && choice.items.remove);
    for (const f of choice.setFlags || []) st.flags[f] = true;
    for (const f of choice.clearFlags || []) delete st.flags[f];
    if (st.stats.stamina <= 0) { deathCause = "体力"; break; }
    if (st.stats.sanity <= 0) { deathCause = "精神"; break; }
    if (st.stats.infection >= 100) { deathCause = "感染"; break; }
    if (choice.dead) { result = { type: "death", title: choice.dead.title }; break; }
    const next = choice.next || choice.end;
    if (!next) { result = { type: "broken", title: "选项无去向" }; break; }
    st.nodeId = next;
  }
  if (!result) result = { type: "timeout", title: "超过 400 步" };
  if (!result.type || result.type === "dead") result.type = "death";
  return {
    result,
    deathCause: result.type === "death" ? (deathCause || "即死") : null,
    softlockAt,
    steps: st.steps,
    stats: st.stats,
    path: st.path
  };
}

/* ------------------------------ 主流程 ------------------------------ */
const report = [];
const profiles = [
  { name: "无道具·随机", mode: "bare", policy: "random" },
  { name: "全道具·随机", mode: "full", policy: "random" },
  { name: "全道具·稳妥", mode: "full", policy: "safe" },
  { name: "无道具·稳妥", mode: "bare", policy: "safe" }
];

for (const mapId of targets) {
  if (!HY.maps[mapId]) continue;
  const m = HY.maps[mapId];
  const rows = [];
  let seed = 1000 + (m.no || 1) * 7919;
  const allEndings = new Set();
  const visitedNodes = new Set();
  const softlocks = new Set();
  for (const prof of profiles) {
    const counters = { death: 0, nonDeath: 0, softlock: 0, broken: 0, timeout: 0 };
    const endings = new Map();
    let staminaSum = 0, stepsSum = 0, deathBy = { 体力: 0, 精神: 0, 感染: 0, 即死: 0 };
    for (let i = 0; i < RUNS; i++) {
      const r = simulate(mapId, prof.mode, prof.policy, seed++);
      stepsSum += r.steps;
      staminaSum += r.stats.stamina;
      r.path.forEach((n) => visitedNodes.add(n));
      if (r.result.type === "softlock") { counters.softlock++; softlocks.add(r.softlockAt); }
      else if (r.result.type === "broken") counters.broken++;
      else if (r.result.type === "timeout") counters.timeout++;
      else if (r.result.type === "death") {
        counters.death++;
        deathBy[r.deathCause || "即死"]++;
        if (r.result.title) allEndings.add(r.result.title);
      }
      else {
        counters.nonDeath++;
        endings.set(r.result.title, (endings.get(r.result.title) || 0) + 1);
        allEndings.add(r.result.title);
      }
      if (prof.mode === "full" && prof.policy === "safe" && r.softlockAt) {
        E(mapId, `稳妥策略在节点 ${r.softlockAt} 无可用选项（可能存在数值/道具死锁）`);
        break;
      }
    }
    rows.push({
      profile: prof.name,
      ...counters,
      avgSteps: (stepsSum / RUNS).toFixed(1),
      avgStamina: (staminaSum / RUNS).toFixed(1),
      deathBy,
      endings: [...endings.entries()].sort((a, b) => b[1] - a[1])
    });
    if (prof.mode === "full" && prof.policy === "safe" && counters.nonDeath === 0) {
      E(mapId, "「全道具·稳妥」策略 0 次非死亡结局：数值或门槛可能过严");
    }
    if (counters.broken > 0) E(mapId, `${prof.name} 出现 ${counters.broken} 次数据断裂（节点/去向缺失）`);
    if (prof.mode === "bare" && counters.softlock > 0) {
      W(mapId, `「无道具」策略有 ${counters.softlock} 次在 ${[...softlocks].join(", ")} 卡死（注意为每个节点保留至少一条无道具出路）`);
    }
  }
  /* 结局覆盖 */
  const defs = (HY.mapOrder.includes(mapId) ? null : null);
  const mapEndingDefs = [];
  Object.keys(m.nodes).forEach((nid) => {
    const node = m.nodes[nid];
    if (node.ending) mapEndingDefs.push(node.ending.title);
    (node.choices || []).forEach((c) => { if (c.dead) mapEndingDefs.push(c.dead.title); });
  });
  const unreached = mapEndingDefs.filter((t) => !allEndings.has(t));
  if (unreached.length) W(mapId, `随机/稳妥策略从未到达的结局：${unreached.join(" / ")}`);
  const unvisited = Object.keys(m.nodes).filter((n) => !visitedNodes.has(n));
  if (unvisited.length) W(mapId, `试玩未走过的节点：${unvisited.join(", ")}`);
  report.push({ mapId, title: m.title, rows, allEndings: [...allEndings], unvisited, unreached });
}

/* ------------------------------ 输出 ------------------------------ */
if (!quiet) {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  恒仰市 · 规则怪谈 — 自动试玩报告                        ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  for (const rep of report) {
    console.log("");
    console.log(`■ ${rep.mapId}《${rep.title}》  每档 ${RUNS} 次`);
    for (const row of rep.rows) {
      const endings = row.endings.map(([t, n]) => `${t}×${n}`).join("；") || "（无）";
      console.log(
        `  ${row.profile.padEnd(8)} 非死亡 ${String(row.nonDeath).padStart(3)} | 死亡 ${String(row.death).padStart(3)} | 卡死 ${row.softlock} | 平均步数 ${row.avgSteps} | 平均剩余体力 ${row.avgStamina}`
      );
      console.log(`      死亡原因：体力 ${row.deathBy.体力} / 精神 ${row.deathBy.精神} / 感染 ${row.deathBy.感染} / 即死 ${row.deathBy.即死}`);
      console.log(`      结局：${endings}`);
    }
  }
  console.log("");
}
if (warnings.length) {
  console.log(`△ 警告 ${warnings.length} 条：`);
  warnings.forEach((w) => console.log("  △ " + w));
}
if (errors.length) {
  console.log(`✖ 阻塞问题 ${errors.length} 条：`);
  errors.forEach((e) => console.log("  ✖ " + e));
  process.exit(1);
}
console.log("✔ 自动试玩通过（无阻塞问题）");
process.exit(0);
