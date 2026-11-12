#!/usr/bin/env node
/* ============================================================
 * QA 验收脚本 B：内容质量扫描（占位符 / 重复 / 解说质量 / 结局解析 / 元数据 / 标志性台词）
 * 只读数据，不修改任何游戏文件。
 *   node tools/qa-content.mjs            # 全部地图：问题清单 + 统计摘要
 *   node tools/qa-content.mjs --map map05 # 单图内容摘要（供人工审读）
 * ============================================================ */
import { loadGame } from "./load-game.mjs";

const { HY } = loadGame();
const args = process.argv.slice(2);
const mapFilter = (() => { const i = args.indexOf("--map"); return i >= 0 ? args[i + 1] : null; })();
const full = args.includes("--full");
const endingsOnly = args.includes("--endings");
const insightsOnly = args.includes("--insights");
const deathEndings = args.includes("--death");
const titlesOnly = args.includes("--titles");
const nodesOnly = args.includes("--nodes");
const world = HY.world;

const EXPECTED = {
  map01: { bv: "BV1yZWmzHEk5", route: "逃离线" }, map02: { bv: "BV12SCABZEwB", route: "逃离线" },
  map03: { bv: "BV1TpHTzTEVF", route: "逃离线" }, map04: { bv: "BV1XTxuzfESF", route: "逃离线" },
  map05: { bv: "BV1CccBzFEcb", route: "山村线" }, map06: { bv: "BV1cmc7zMEWs", route: "山村线" },
  map07: { bv: "BV1awHWzREtQ", route: "山村线" }, map08: { bv: "BV1zox9zPEp5", route: "校园线" },
  map09: { bv: "BV1Gh6ZBUEAZ", route: "校园线" }, map10: { bv: "BV1kpvYBJEoo", route: "家族线" },
  map11: { bv: "BV1XPvWB6EDS", route: "家族线" }
};
const SIGNATURES = {
  map01: ["便条", "天空", "窗帘", "生水", "停电", "融合", "特警", "妈妈"],
  map02: ["永不晚点", "G1564", "红色润喉糖", "熊孩子", "隧道", "融会中心", "副券", "乘警"],
  map03: ["清洁工", "七秒", "时钟", "登机牌", "红色候车区", "几何", "腕带"],
  map04: ["几何", "稳定仪", "安抚员", "净化", "名字", "红区", "红色充电宝"],
  map05: ["一元一袋", "香灰", "船头", "红灯笼", "白灯笼", "乌鹏船", "成了气的", "李婆婆", "阿音", "李深"],
  map06: ["阿音", "阿申", "凿", "金火球", "李深", "李婆婆", "槐林", "开发商", "香"],
  map07: ["红果", "第四人", "鱼竿", "桥", "李德", "回头", "赤脚", "数人数"],
  map08: ["绿网", "地质水文考", "陈希", "太平湖", "视力表", "档案", "台阶", "蓝墨水"],
  map09: ["翅膀", "尾巴", "优秀毕业生", "周宇", "林晓", "羽化", "天台", "劣质品"],
  map10: ["压岁钱", "香灰", "黑布", "风弹", "舞龙", "庙会", "香炉", "大扫除", "团圆饭"],
  map11: ["七七先生", "星云", "倒计时", "节目单", "天光", "春晚", "主持人"]
};
const PLACEHOLDER = [
  /TODO/i, /TBD/i, /FIXME/i, /待补/, /待续/, /待定/, /前文提到/, /如你所见/, /此处省略/,
  /占位/, /placeholder/i, /\bXXX\b/, /\?\?\?/, /（略）/, /\(略\)/, /注：/, /作者说/,
  /这里暗示/, /这里其实/, /旁白/
];
const NAME_VARIANTS = [
  ["阿申", /\b阿生\b|\b阿声\b/g], ["李深", /李森/g], ["陈希", /陈曦/g],
  ["林晓", /林小(?!径)/g], ["周宇", /周雨/g], ["星云", /星芸/g]
];
const ANALYSIS_GROUPS = {
  plot: /原视频|原作|视频里|原片|原故事|原文|原剧情|原解析/,
  identity: /身份|动机|真实|其实|他是|她是|他的|她的|为了|想留|想走|真正/,
  metaphor: /世界观|隐喻|象征|城市|恒仰|规则|校准|意味着|代表|其实是/,
  review: /复盘|选择|如果|路线|需要|走法|结局|下一次|再走/
};

const errors = [];
const warns = [];
const E = (m) => errors.push(m);
const W = (m) => warns.push(m);
const norm = (s) => String(s || "").replace(/[「」『』：:，,。.！!？?、；;"'“”‘’\s…—·－\-]/g, "");
const chars = (s) => norm(s).length;
const nowrap = (s) => String(s || "").replace(/\s+/g, " ").trim();

function allTextOfMap(m) {
  const parts = [];
  for (const nid of Object.keys(m.nodes)) {
    const n = m.nodes[nid];
    (n.lines || []).forEach((l) => parts.push({ where: `${nid}.lines`, text: l }));
    if (n.insight) (n.insight.lines || []).forEach((l) => parts.push({ where: `${nid}.insight`, text: l }));
    (n.whisper || []).forEach((l) => parts.push({ where: `${nid}.whisper`, text: l }));
    (n.drift || []).forEach((l) => parts.push({ where: `${nid}.drift`, text: l }));
    (n.choices || []).forEach((c, ci) => {
      parts.push({ where: `${nid}.choice[${ci}].text`, text: c.text });
      if (c.hint && ci === -1) parts.push({ where: `${nid}.choice[${ci}].hint`, text: c.hint });
      (c.result || []).forEach((l) => parts.push({ where: `${nid}.choice[${ci}].result`, text: l }));
      if (c.dead) (c.dead.lines || []).forEach((l) => parts.push({ where: `${nid}.choice[${ci}].dead`, text: l }));
    });
    if (n.ending) {
      [n.ending.title, n.ending.subtitle, ...(n.ending.lines || [])].forEach((l) => parts.push({ where: `${nid}.ending`, text: l }));
      (n.ending.analysis || []).forEach((a) => {
        (a.lines || []).forEach((l) => parts.push({ where: `${nid}.analysis`, text: l }));
      });
    }
  }
  return parts;
}

/* ---------------- 单图扫描 ---------------- */
function scanMap(mapId) {
  const m = HY.maps[mapId];
  const exp = EXPECTED[mapId] || {};
  const out = { mapId, title: m.title, subtitle: m.subtitle };
  const head = `[${mapId}]《${m.title}》`;
  if (m.source.bv !== exp.bv) E(`${head} source.bv=${m.source.bv}，与《地图设计总纲》不符（应为 ${exp.bv}）`);
  if (m.route !== exp.route) E(`${head} route=${m.route}，应为 ${exp.route}`);
  if (!world.fearCategories.includes(m.fearTags ? m.fearTags[0] : "") && m.fearTags) {
    const bad = m.fearTags.filter((t) => !world.fearCategories.includes(t));
    if (bad.length) E(`${head} fearTags 含非法分类：${bad.join(",")}`);
  }
  if (typeof m.summary !== "string" || m.summary.length < 40) E(`${head} summary 少于 40 字`);
  if (m.summary && m.summary.length > 135) W(`${head} summary ${m.summary.length} 字，偏长（规范 60-120）`);
  if (chars(m.title) < 2 || chars(m.title) > 8) W(`${head} title「${m.title}」长度不在 2-8 字`);
  if (chars(m.subtitle) < 4) W(`${head} subtitle 过短`);

  /* 占位符 / 破坏沉浸（正文强校验；insight/analysis 属元叙事，仅查硬占位符） */
  const allText = allTextOfMap(m);
  const META_FIELDS = /\.(insight|analysis)(\.|$)/;
  const HARD_PLACEHOLDER = [/TODO/i, /TBD/i, /FIXME/i, /待补/, /待续/, /待定/, /占位/, /placeholder/i, /\bXXX\b/, /\?\?\?/];
  for (const seg of allText) {
    const isMeta = META_FIELDS.test(seg.where);
    for (const re of (isMeta ? HARD_PLACEHOLDER : PLACEHOLDER)) {
      if (re.test(seg.text)) E(`${head} ${seg.where} 命中占位/破坏沉浸文本 ${re}：「${nowrap(seg.text).slice(0, 60)}」`);
    }
  }
  /* 空行/超短正文行 */
  for (const nid of Object.keys(m.nodes)) {
    const n = m.nodes[nid];
    (n.lines || []).forEach((l, i) => { if (String(l).trim().length === 0) E(`${head} ${nid}.lines[${i}] 为空`); });
    if (!n.lines && !n.ending) E(`${head} ${nid} 没有 lines 也没有 ending`);
  }
  /* 重复段落（本图内完全重复的长句） */
  const seen = new Map();
  const dup = [];
  for (const seg of allText) {
    const k = norm(seg.text);
    if (k.length < 16) continue;
    if (seen.has(k)) dup.push({ a: seen.get(k), b: seg.where, text: nowrap(seg.text).slice(0, 40) });
    else seen.set(k, seg.where);
  }
  if (dup.length > 3) W(`${head} 本图内重复长句 ${dup.length} 处，例：${dup.slice(0, 3).map((d) => d.a + "=" + d.b).join(" / ")}`);

  /* insight 质量 */
  const insights = [];
  const insightTitles = new Map();
  for (const nid of Object.keys(m.nodes)) {
    const n = m.nodes[nid];
    if (!n.insight) continue;
    const text = (n.insight.lines || []).join("");
    insights.push({ nid, title: n.insight.title, chars: chars(text), lines: n.insight.lines || [] });
    insightTitles.set(n.insight.title, (insightTitles.get(n.insight.title) || 0) + 1);
    if (chars(text) < 80) W(`${head} ${nid}.insight 仅 ${chars(text)} 字，信息量偏低：「${n.insight.title}」`);
    /* 复述判定：insight 行是否大量照搬本节点正文 */
    const nodeNorm = norm((n.lines || []).join(""));
    const copied = (n.insight.lines || []).filter((l) => {
      const k = norm(l);
      return k.length >= 12 && nodeNorm.includes(k);
    });
    if (copied.length >= Math.max(2, Math.ceil((n.insight.lines || []).length * 0.5))) {
      W(`${head} ${nid}.insight 疑似复述正文（${copied.length}/${(n.insight.lines || []).length} 行与正文重复）`);
    }
    if (!/原|视频|规则|故事|村|城市|阿|李|陈|周|林|恒仰|开发者|开发商|真相|为什么|因为|其实/.test(text)) {
      W(`${head} ${nid}.insight 缺少“原视频/规则依据/前因后果”线索：「${n.insight.title}」`);
    }
  }
  for (const [t, c] of insightTitles) if (c > 1) W(`${head} insight 标题重复 ${c} 次：「${t}」`);

  /* 结局 analysis */
  const endingRows = [];
  for (const nid of Object.keys(m.nodes)) {
    const n = m.nodes[nid];
    if (n.ending) endingRows.push({ nid, e: n.ending, kind: "node" });
    (n.choices || []).forEach((c, ci) => {
      if (!c.dead) return;
      const rawAnalysis = c.dead.analysis || [];
      const analysis = rawAnalysis.map((x) => (typeof x === "string" ? { title: "", lines: [x] } : x));
      endingRows.push({
        nid: nid + ".choice" + ci,
        kind: "dead",
        e: { type: "death", title: c.dead.title, lines: c.dead.lines, analysis }
      });
    });
  }
  const nonDeath = endingRows.filter((r) => r.e.type !== "death");
  for (const r of nonDeath) {
    const e = r.e;
    const analysis = e.analysis || [];
    const total = analysis.reduce((s, a) => s + chars((a.lines || []).join("")), 0);
    const joined = analysis.map((a) => (a.lines || []).join("")).join("") + (e.lines || []).join("");
    const miss = [];
    if (!ANALYSIS_GROUPS.plot.test(joined)) miss.push("原视频剧情梗概");
    if (!ANALYSIS_GROUPS.identity.test(joined)) miss.push("角色身份/动机");
    if (!ANALYSIS_GROUPS.metaphor.test(joined)) miss.push("世界观/隐喻");
    if (!ANALYSIS_GROUPS.review.test(joined)) miss.push("选择复盘");
    if (miss.length) W(`${head} ${r.nid} 结局《${e.title}》analysis 疑缺：${miss.join("、")}`);
    if (analysis.length < 3) E(`${head} ${r.nid} 结局《${e.title}》analysis 只有 ${analysis.length} 段（非死亡结局需 ≥3）`);
    if (total < 260) W(`${head} ${r.nid} 结局《${e.title}》analysis 共 ${total} 字，偏薄`);
  }
  if (!nonDeath.some((r) => r.e.type === "true" || r.e.type === "hidden")) E(`${head} 没有 true/hidden 结局`);
  const deathRows = endingRows.filter((r) => r.e.type === "death");
  if (deathRows.length < 2) E(`${head} 死亡结局 ${deathRows.length} < 2`);
  const typeSet = [...new Set(endingRows.map((r) => r.e.type))];
  for (const t of ["escape", "become", "fail"]) { /* 仅统计 */ }

  /* 数值极端 */
  for (const nid of Object.keys(m.nodes)) {
    const n = m.nodes[nid];
    const checkFx = (fx, where) => {
      if (!fx) return;
      if ((fx.stamina || 0) <= -20) W(`${head} ${where} 单次体力 -${-fx.stamina}（偏重）`);
      if ((fx.infection || 0) >= 20) W(`${head} ${where} 单次感染 +${fx.infection}（偏重）`);
      if ((fx.sanity || 0) <= -25) W(`${head} ${where} 单次精神 ${fx.sanity}（偏重）`);
    };
    checkFx(n.fx, nid + ".fx");
    (n.choices || []).forEach((c, ci) => checkFx(c.fx, `${nid}.choice[${ci}].fx`));
  }

  /* 标志性台词/规则 */
  const mapAll = allText.map((s) => s.text).join("");
  const sigFound = (SIGNATURES[mapId] || []).map((k) => [k, mapAll.includes(k)]);
  const sigMiss = sigFound.filter(([, v]) => !v).map(([k]) => k);
  if (sigMiss.length) W(`${head} 未检出标志性关键词：${sigMiss.join("、")}`);

  /* NPC 名字变体 */
  for (const [correct, re] of NAME_VARIANTS) {
    const bad = mapAll.match(re);
    if (bad) W(`${head} 疑似人名错写：出现「${[...new Set(bad)].join("、")}」（应为「${correct}」）`);
  }

  out.stats = {
    nodes: Object.keys(m.nodes).length,
    rules: m.rules.length,
    emotions: m.emotions.length,
    insights: insights.length,
    endings: endingRows.length,
    nonDeath: nonDeath.length,
    death: deathRows.length,
    types: typeSet,
    dup: dup.length,
    sigMiss
  };
  out.insights = insights;
  out.endings = nonDeath.map((r) => ({ nid: r.nid, type: r.e.type, title: r.e.title, subtitle: r.e.subtitle, analysis: r.e.analysis }));
  out.nodeSample = Object.keys(m.nodes).slice(0, 10).map((nid) => ({
    nid, chapter: m.nodes[nid].chapter, lines: m.nodes[nid].lines || [],
    insightTitle: m.nodes[nid].insight ? m.nodes[nid].insight.title : null,
    choices: (m.nodes[nid].choices || []).map((c) => ({ text: c.text, tag: c.tag, req: c.req ? Object.keys(c.req).join("+") : null }))
  }));
  out.allEndingTitles = endingRows.map((r) => r.e.type + "：" + r.e.title);
  return out;
}

/* ---------------- 主流程 ---------------- */
const targets = mapFilter ? [mapFilter] : HY.mapOrder;
const results = targets.map((id) => (HY.maps[id] ? scanMap(id) : (E(`找不到地图 ${id}`), null))).filter(Boolean);

if (mapFilter && (full || endingsOnly || insightsOnly)) {
  const r = results[0];
  const m = HY.maps[r.mapId];
  console.log(`\n########## 内容摘要 ${r.mapId}《${r.title}》 ##########`);
  if (endingsOnly || full) {
    console.log(`route=${m.route} | difficulty=${m.difficulty} | fearTags=${m.fearTags.join("/")}`);
    console.log(`subtitle：${m.subtitle}`);
    console.log(`summary：${m.summary}`);
    console.log(`source：${m.source.bv} ${m.source.title}`);
    console.log(`\n—— 结局全览（${r.allEndingTitles.length}）——`);
    r.allEndingTitles.forEach((t) => console.log("  " + t));
    console.log(`\n—— 非死亡结局 analysis（共 ${r.endings.length}）——`);
    for (const e of r.endings) {
      console.log(`\n【${e.type}】${e.title}${e.subtitle ? " —— " + e.subtitle : ""}  (${e.nid})`);
      (e.analysis || []).forEach((a) => {
        console.log(`  ◆ ${a.title || "解析"}`);
        (a.lines || []).forEach((l) => console.log(`    ${l}`));
      });
    }
  }
  if (deathEndings || full) {
    console.log(`\n—— 死亡结局 analysis（标题 + 首行）——`);
    for (const nid of Object.keys(m.nodes)) {
      const n = m.nodes[nid];
      if (n.ending && n.ending.type === "death") {
        const as = (n.ending.analysis || []).map((a) => (a.title || "") + "：" + ((a.lines || [])[0] || "").slice(0, 60));
        console.log(`  ☠ ${nid}《${n.ending.title}》 ${as.length} 段 | ${as.join(" / ")}`);
      }
      (n.choices || []).forEach((c, ci) => {
        if (!c.dead) return;
        const raw = c.dead.analysis || [];
        const as = raw.map((a) => (typeof a === "string" ? a : (a.title || "") + "：" + ((a.lines || [])[0] || "")).slice(0, 60));
        console.log(`  ☠ ${nid}.choice${ci}《${c.dead.title}》 ${as.length} 段 | ${as.join(" / ")}`);
      });
    }
  }
  if (insightsOnly || full) {
    console.log(`\n—— insight 全览（${r.insights.length}）——`);
    for (const i of r.insights) {
      console.log(`\n◆ ${i.nid} [${i.chars}字] ${i.title}`);
      i.lines.forEach((l) => console.log(`    ${l}`));
    }
  }
  if (full) {
    console.log(`\n—— 开头节点抽查（10 个）——`);
    for (const n of r.nodeSample) {
      console.log(`\n◆ ${n.nid} ${n.chapter || ""}`);
      n.lines.forEach((l) => console.log(`    ${l}`));
      if (n.insightTitle) console.log(`    〔解说〕${n.insightTitle}`);
      n.choices.forEach((c) => console.log(`    → [${c.tag}] ${c.text}${c.req ? "  {req:" + c.req + "}" : ""}`));
    }
  }
}

if (nodesOnly && !mapFilter) {
  for (const r of results) {
    const m = HY.maps[r.mapId];
    console.log(`\n## ${r.mapId}《${m.title}》`);
    for (const n of r.nodeSample.slice(0, 6)) {
      console.log(`  ◆ ${n.nid} ${n.chapter || ""}`);
      for (const l of n.lines.slice(0, 5)) console.log(`      ${l.length > 90 ? l.slice(0, 90) + "…" : l}`);
      if (n.insightTitle) console.log(`      〔解说〕${n.insightTitle}`);
      n.choices.forEach((c) => console.log(`      → [${c.tag}] ${c.text.length > 46 ? c.text.slice(0, 46) + "…" : c.text}`));
    }
  }
  process.exit(errors.length ? 1 : 0);
}

if (titlesOnly && !mapFilter) {
  for (const r of results) {
    const m = HY.maps[r.mapId];
    console.log(`\n## ${r.mapId}《${m.title}》 route=${m.route} | fearTags=${m.fearTags.join("/")}`);
    console.log("  insight：" + r.insights.map((i) => `${i.nid}「${i.title}」`).join("；"));
    console.log("  endings：" + r.allEndingTitles.join("；"));
    for (const e of r.endings) {
      console.log(`  ▸ ${e.type}《${e.title}》analysis 段：${(e.analysis || []).map((a) => a.title || "?").join(" / ")}`);
    }
  }
  process.exit(errors.length ? 1 : 0);
}

if (!mapFilter) {
  console.log("════════ 内容质量扫描汇总（每图）════════");
  console.log("地图     节点 规则 情绪 解说 结局(非死/死) 类型                       重复句 标志词缺失");
  for (const r of results) {
    const s = r.stats;
    console.log(`${r.mapId} ${String(s.nodes).padStart(3)} ${String(s.rules).padStart(4)} ${String(s.emotions).padStart(4)} ${String(s.insights).padStart(4)}  ${String(s.nonDeath).padStart(2)}/${String(s.death).padStart(2)}        ${s.types.join(",").padEnd(24)} ${String(s.dup).padStart(3)}  ${s.sigMiss.join(",") || "-"}`);
  }
  console.log("\n════════ 元数据（title / subtitle / summary / fearTags）════════");
  for (const r of results) {
    const m = HY.maps[r.mapId];
    console.log(`\n[${r.mapId}]《${m.title}》 | ${m.subtitle}`);
    console.log(`  ${m.summary}`);
    console.log(`  fearTags: ${m.fearTags.join(" / ")}`);
  }
  console.log("\n════════ 问题清单 ════════");
  if (errors.length) { console.log(`! 疑似 P0/P1（${errors.length}）：`); errors.forEach((e) => console.log("  ! " + e)); }
  else console.log("✔ 无命中占位符/结局段数/证物缺失等硬性问题");
  if (warns.length) { console.log(`\n△ P1/P2 待人工确认（${warns.length}）：`); warns.forEach((w) => console.log("  △ " + w)); }
  console.log(`\n统计：地图 ${results.length} 张，结局 ${results.reduce((s, r) => s + r.stats.endings, 0)} 个（非死亡 ${results.reduce((s, r) => s + r.stats.nonDeath, 0)} / 死亡 ${results.reduce((s, r) => s + r.stats.death, 0)}），insight ${results.reduce((s, r) => s + r.stats.insights, 0)} 段`);
}
process.exit(errors.length ? 1 : 0);
