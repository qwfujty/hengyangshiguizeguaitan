#!/usr/bin/env node
/* QA 临时统计：结局标题重复 / insight 密度 / 文本长度 / 汇总数字 */
import { loadGame } from "./load-game.mjs";
const { HY } = loadGame();
const norm = (s) => String(s || "").replace(/\s+/g, "");
let totals = { nodes: 0, endings: 0, nonDeath: 0, death: 0, insights: 0, rules: 0, emotions: 0, choices: 0 };
const dupTitles = [];
const gapNodes = [];
for (const mapId of HY.mapOrder) {
  const m = HY.maps[mapId];
  const titles = new Map();
  for (const nid of Object.keys(m.nodes)) {
    const n = m.nodes[nid];
    if (n.ending) titles.set(n.ending.title, (titles.get(n.ending.title) || []).concat(nid));
    (n.choices || []).forEach((c, ci) => { if (c.dead) titles.set(c.dead.title, (titles.get(c.dead.title) || []).concat(nid + ".c" + ci)); });
  }
  for (const [t, ids] of titles) if (ids.length > 1) dupTitles.push(`${mapId} 结局标题「${t}」重复 ${ids.length} 次：${ids.join(",")}`);
  // insight 密度：非结局节点中连续无 insight 的最大间隔
  let run = 0, maxRun = 0, noInsight = [];
  for (const nid of Object.keys(m.nodes)) {
    const n = m.nodes[nid];
    if (n.ending) continue;
    if (n.insight) { run = 0; } else { run++; noInsight.push(nid); maxRun = Math.max(maxRun, run); }
  }
  if (maxRun > 2) gapNodes.push(`${mapId} 连续 ${maxRun} 个非结局节点无 insight；无 insight 节点：${noInsight.join(",")}`);
  const st = { nodes: Object.keys(m.nodes).length, insights: 0, rules: m.rules.length, emotions: m.emotions.length, choices: 0, endings: 0, nonDeath: 0, death: 0 };
  for (const nid of Object.keys(m.nodes)) {
    const n = m.nodes[nid];
    if (n.insight) st.insights++;
    if (n.ending) { st.endings++; if (n.ending.type === "death") st.death++; else st.nonDeath++; }
    (n.choices || []).forEach((c) => { st.choices++; if (c.dead) { st.endings++; st.death++; } });
  }
  console.log(`${mapId}《${m.title}》 节点${st.nodes} 选项${st.choices} 结局${st.endings}(非死${st.nonDeath}/死${st.death}) insight${st.insights} 规则${st.rules} 情绪${st.emotions} | summary ${norm(m.summary).length}字 title ${norm(m.title).length}字`);
  for (const k of Object.keys(totals)) totals[k] += st[k] || 0;
}
console.log("\n合计：", JSON.stringify(totals));
console.log("\n结局标题重复：", dupTitles.length ? "\n  " + dupTitles.join("\n  ") : "无");
console.log("\ninsight 间隔告警：", gapNodes.length ? "\n  " + gapNodes.join("\n  ") : "无");
/* 商店道具体力 & 证物 category */
const shopStamina = Object.keys(HY.items).filter((id) => HY.items[id].shop && (HY.items[id].effect || {}).stamina > 0);
console.log("\n商店提供体力回复的道具：", shopStamina.length ? shopStamina.join(",") : "无");
const badEvidence = Object.keys(HY.items).filter((id) => /^it_(badge_tsp|ticket_half|pass_outside|stabilizer|raft_cord|chisel|redfruit|geology|diary_zhou|black_envelope|program)$/.test(id) && HY.items[id].category !== "证物");
console.log("跨图证物 category 非「证物」：", badEvidence.length ? badEvidence.join(",") : "无");
process.exit(0);
