#!/usr/bin/env node
/* ============================================================
 * 从游戏数据生成文档，保证文档与游戏一致
 *   node tools/gen-docs.mjs
 * 输出：
 *   docs/05-地图剧情与结局总览.md
 *   docs/06-情绪卡全表.md
 *   docs/07-道具全表.md
 *   docs/08-规则守则全收录.md
 * ============================================================ */
import fs from "node:fs";
import path from "node:path";
import { loadGame } from "./load-game.mjs";

const { HY } = loadGame();
const root = process.cwd();
const docs = path.join(root, "docs");
if (!fs.existsSync(docs)) fs.mkdirSync(docs, { recursive: true });

const world = HY.world;
const maps = HY.mapOrder.map((id) => HY.maps[id]);
const catOrder = world.fearCategories || [];

function esc(s) {
  return String(s == null ? "" : s).replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}
function write(name, content) {
  fs.writeFileSync(path.join(docs, name), content, "utf8");
  console.log("已生成 docs/" + name);
}

function typeLabel(t) {
  return { death: "死亡", fail: "溃败", become: "异化", escape: "逃离", true: "真相", hidden: "隐藏" }[t] || t;
}

/* ============================================================
 * 05 地图剧情与结局总览
 * ============================================================ */
function gen05() {
  const lines = [];
  lines.push("# 《恒仰市·规则怪谈》地图剧情与结局总览");
  lines.push("");
  lines.push("> 本文档由 `node tools/gen-docs.mjs` 从游戏数据自动生成，与游戏内容保持一致。");
  lines.push("> 每张地图对应一部原视频文字稿；「剧情解说」段落与结局解析均内置于游戏中。");
  lines.push("");
  const totalNodes = maps.reduce((a, m) => a + Object.keys(m.nodes).length, 0);
  const totalRules = maps.reduce((a, m) => a + m.rules.length, 0);
  const totalEmotions = maps.reduce((a, m) => a + m.emotions.length, 0);
  const totalEndings = maps.reduce((a, m) => {
    let n = 0;
    Object.keys(m.nodes).forEach((nid) => {
      const node = m.nodes[nid];
      if (node.ending) n++;
      (node.choices || []).forEach((c) => { if (c.dead) n++; });
    });
    return a + n;
  }, 0);
  lines.push("| 总览 | 数量 |");
  lines.push("|---|---|");
  lines.push(`| 地图 | ${maps.length} |`);
  lines.push(`| 节点 | ${totalNodes} |`);
  lines.push(`| 规则条目 | ${totalRules} |`);
  lines.push(`| 情绪卡 | ${totalEmotions} |`);
  lines.push(`| 结局定义 | ${totalEndings} |`);
  lines.push("");

  for (const m of maps) {
    const endings = [];
    Object.keys(m.nodes).forEach((nid) => {
      const node = m.nodes[nid];
      if (node.ending) endings.push({ id: nid, ...node.ending });
      (node.choices || []).forEach((c, idx) => {
        if (c.dead) endings.push({ id: nid + "#" + idx, type: "death", title: c.dead.title, subtitle: "即死", lines: c.dead.lines });
      });
    });
    const insights = [];
    Object.keys(m.nodes).forEach((nid) => {
      const node = m.nodes[nid];
      if (node.insight) insights.push({ node: nid, chapter: node.chapter || "", title: node.insight.title });
    });
    const groups = {};
    m.rules.forEach((r) => { groups[r.group] = (groups[r.group] || 0) + 1; });

    lines.push(`---`);
    lines.push("");
    lines.push(`## 第 ${m.no} 图 · ${m.title}`);
    lines.push("");
    lines.push(`**副标题**：${m.subtitle}`);
    lines.push("");
    lines.push(`**路线**：${m.route}　**难度**：${"★".repeat(m.difficulty)}${"☆".repeat(5 - m.difficulty)}　**恐惧标签**：${(m.fearTags || []).join(" / ")}`);
    lines.push("");
    lines.push(`**来源视频**：${m.source.title}（${m.source.bv}）`);
    lines.push("");
    lines.push(`**进图简介**：${m.summary}`);
    lines.push("");
    lines.push(`**初始数值**：感染 ${m.initial.infection} / 精神 ${m.initial.sanity} / 体力 ${m.initial.stamina}`);
    lines.push("");
    lines.push(`**数据**：节点 ${Object.keys(m.nodes).length} 个 · 规则 ${m.rules.length} 条 · 情绪卡 ${m.emotions.length} 张 · 结局 ${endings.length} 个 · 剧情解说 ${insights.length} 段`);
    lines.push("");
    lines.push(`**规则分组**：${Object.keys(groups).map((g) => `${g}（${groups[g]}）`).join("、")}`);
    lines.push("");
    lines.push("### 剧情解说目录");
    lines.push("");
    insights.forEach((i) => lines.push(`- \`${i.node}\`　${i.chapter}　**${i.title}**`));
    lines.push("");
    lines.push("### 结局列表");
    lines.push("");
    lines.push("| 类型 | 结局标题 | 副标题 | 定义节点 |");
    lines.push("|---|---|---|---|");
    endings.forEach((e) => {
      lines.push(`| ${typeLabel(e.type)} | ${esc(e.title || "")} | ${esc(e.subtitle || "")} | \`${e.id}\` |`);
    });
    lines.push("");
    lines.push("### 情绪卡");
    lines.push("");
    m.emotions.forEach((em) => lines.push(`- **${em.name}**（${em.fear}）`));
    lines.push("");
    if (m.finalNote) {
      lines.push("### 制作附注");
      lines.push("");
      lines.push(m.finalNote);
      lines.push("");
    }
  }
  write("05-地图剧情与结局总览.md", lines.join("\n"));
}

/* ============================================================
 * 06 情绪卡全表
 * ============================================================ */
function gen06() {
  const byCat = {};
  catOrder.forEach((c) => { byCat[c] = []; });
  let total = 0;
  maps.forEach((m) => {
    (m.emotions || []).forEach((e) => {
      if (!byCat[e.fear]) byCat[e.fear] = [];
      byCat[e.fear].push({ ...e, mapTitle: m.title, mapNo: m.no });
      total++;
    });
  });
  const lines = [];
  lines.push("# 《恒仰市》情绪卡全表（恐惧与复杂情绪收集）");
  lines.push("");
  lines.push("> 本文档由 `node tools/gen-docs.mjs` 自动生成，收录游戏内全部情绪卡。");
  lines.push(`> 共 **${total}** 张，分属 **${catOrder.length}** 类恐惧；在游戏内「恐惧图鉴」中逐张解锁。`);
  lines.push("");
  lines.push("| 分类 | 数量 |");
  lines.push("|---|---|");
  catOrder.forEach((c) => {
    if (byCat[c].length) lines.push(`| ${c} | ${byCat[c].length} |`);
  });
  lines.push("");
  catOrder.forEach((cat) => {
    const arr = byCat[cat] || [];
    if (!arr.length) return;
    lines.push(`---`);
    lines.push("");
    lines.push(`## ${cat}（${arr.length} 张）`);
    lines.push("");
    arr.forEach((e) => {
      lines.push(`### ${e.name}`);
      lines.push("");
      lines.push(`- **来源**：第 ${e.mapNo} 图《${e.mapTitle}》　**编号**：\`${e.id}\``);
      lines.push("");
      lines.push(`> ${e.quote}`);
      lines.push("");
      lines.push(e.desc);
      lines.push("");
    });
  });
  write("06-情绪卡全表.md", lines.join("\n"));
}

/* ============================================================
 * 07 道具全表
 * ============================================================ */
function gen07() {
  const all = Object.keys(HY.items).map((id) => HY.items[id]);
  const shop = all.filter((i) => i.shop && i.price > 0).sort((a, b) => a.price - b.price);
  const story = all.filter((i) => !(i.shop && i.price > 0));
  function effectText(e) {
    if (!e || !Object.keys(e).length) return "无直接数值效果";
    const parts = [];
    if (e.infection) parts.push("感染 " + (e.infection > 0 ? "+" : "") + e.infection);
    if (e.sanity) parts.push("精神 " + (e.sanity > 0 ? "+" : "") + e.sanity);
    if (e.stamina) parts.push("体力 " + e.stamina);
    return parts.join(" / ");
  }
  const lines = [];
  lines.push("# 《恒仰市》道具全表");
  lines.push("");
  lines.push("> 由 `node tools/gen-docs.mjs` 自动生成。");
  lines.push("> `体力值永远无法通过任何道具回复`；道具效果中的体力值只会是负数。");
  lines.push("");
  lines.push(`## 一、补给商店（永久购买，每局次数重置）：${shop.length} 件`);
  lines.push("");
  lines.push("| 名称 | 分类 | 价格 | 每局次数 | 使用效果 | 说明 |");
  lines.push("|---|---|---|---|---|---|");
  shop.forEach((i) => {
    lines.push(`| ${i.name} | ${i.category} | ${i.price} | ${i.uses} | ${effectText(i.effect)} | ${esc(i.desc)} |`);
  });
  lines.push("");
  lines.push(`## 二、剧情 / 证物道具（地图获得，不可购买）：${story.length} 件`);
  lines.push("");
  lines.push("| 名称 | 分类 | 次数 | 使用效果 | 说明 |");
  lines.push("|---|---|---|---|---|");
  story.forEach((i) => {
    lines.push(`| ${i.name} | ${i.category} | ${i.uses} | ${effectText(i.effect)} | ${esc(i.desc)} |`);
  });
  lines.push("");
  lines.push("### 跨图证物说明");
  lines.push("");
  lines.push("标为「证物」的道具由各图真相/隐藏结局授予，会永久保留并在每次入图时自动携带。");
  lines.push("终章《春晚倒计时》的隐藏结局需要至少 6 件证物。");
  write("07-道具全表.md", lines.join("\n"));
}

/* ============================================================
 * 08 规则守则全收录
 * ============================================================ */
function gen08() {
  const lines = [];
  lines.push("# 《恒仰市》规则守则全收录");
  lines.push("");
  lines.push("> 由 `node tools/gen-docs.mjs` 自动生成。收录 11 张地图的全部守则原文，");
  lines.push("> 也是本作对 11 部原视频规则的完整整理。游戏内可在「规则档案」逐条解锁。");
  lines.push("");
  let total = 0;
  maps.forEach((m) => {
    lines.push(`## 第 ${m.no} 图《${m.title}》—— ${m.rules.length} 条`);
    lines.push("");
    const groups = {};
    m.rules.forEach((r) => {
      if (!groups[r.group]) groups[r.group] = [];
      groups[r.group].push(r);
    });
    Object.keys(groups).forEach((g) => {
      lines.push(`### ${g}`);
      lines.push("");
      groups[g].forEach((r) => {
        total++;
        lines.push(`**${r.title}**`);
        lines.push("");
        lines.push(r.text);
        lines.push("");
      });
    });
  });
  const head = [
    "# 《恒仰市》规则守则全收录",
    "",
    "> 由 `node tools/gen-docs.mjs` 自动生成。收录 11 张地图的全部守则原文，",
    "> 也是本作对 11 部原视频规则的完整整理。游戏内可在「规则档案」逐条解锁。",
    "",
    `**合计 ${total} 条守则。**`,
    "",
    ""
  ];
  lines.splice(0, 6, ...head);
  write("08-规则守则全收录.md", lines.join("\n"));
}

gen05();
gen06();
gen07();
gen08();
console.log("文档生成完成。");
