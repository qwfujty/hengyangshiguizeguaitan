#!/usr/bin/env node
/* ============================================================
 * 剧本数据校验器
 *   node tools/validate.mjs                 # 校验全部已加载地图
 *   node tools/validate.mjs --map map05     # 只校验一张地图
 *   node tools/validate.mjs --strict        # 交付模式：11 张图必须齐全
 * ============================================================ */
import {
  loadGame, EXPECTED_MAPS, VALID_TAGS, VALID_BG, VALID_ENDING_TYPES,
  VALID_ITEM_CATEGORIES, VALID_FX_KEYS, REQUIRED_TRUE_ITEMS
} from "./load-game.mjs";

const args = process.argv.slice(2);
const mapFilter = (() => {
  const i = args.indexOf("--map");
  return i >= 0 ? args[i + 1] : null;
})();
const strict = args.includes("--strict");
const quiet = args.includes("--quiet");

const { HY, loadedFiles, loadErrors } = loadGame();
const errors = [];
const warnings = [];
const E = (where, msg) => errors.push(`${where}: ${msg}`);
const W = (where, msg) => warnings.push(`${where}: ${msg}`);

const MIN_NODES = { map11: 16 };
const MIN_INSIGHTS = { map11: 4 };
const MIN_CHOICE_NODES = { map11: 14 };
const MIN_RULES = { map11: 8 };
const MIN_EMOTIONS = { map11: 4 };

function num(v) { return typeof v === "number" && Number.isFinite(v); }
function isArr(v) { return Array.isArray(v); }
function isStr(v) { return typeof v === "string" && v.trim().length > 0; }
function hasTextLines(v) { return isArr(v) && v.length > 0 && v.every((s) => typeof s === "string" && s.trim().length > 0); }

/* ------------------------------ 载入错误 ------------------------------ */
if (loadErrors.length) {
  loadErrors.forEach((e) => E(`载入 ${e.file}`, e.message));
}

/* ------------------------------ 全局检查 ------------------------------ */
const world = HY.world || {};
if (!isStr(world.title)) E("data/world.js", "缺少 world.title");
if (!isStr(world.subtitle)) E("data/world.js", "缺少 world.subtitle");
if (!isArr(world.fearCategories) || world.fearCategories.length < 18) {
  E("data/world.js", "fearCategories 至少需要 18 个分类");
}
if (!isArr(world.routes) || world.routes.length < 4) E("data/world.js", "routes 至少需要 4 条路线（或未加载 world.js）");

/* 全局道具表 */
const globalItems = {};
Object.keys(HY.items || {}).forEach((id) => {
  const it = HY.items[id];
  if (!it.mapId) globalItems[id] = it;
});
["it_badge_tsp", "it_ticket_half", "it_pass_outside", "it_stabilizer", "it_raft_cord",
  "it_chisel", "it_redfruit", "it_geology", "it_diary_zhou", "it_black_envelope", "it_program"]
  .forEach((id) => {
    if (!HY.items[id]) E("data/items.js", `缺少跨图证物 ${id}`);
  });
Object.keys(HY.items || {}).forEach((id) => {
  const it = HY.items[id];
  const w = `道具 ${id}`;
  if (!isStr(it.name)) E(w, "缺少 name");
  if (!isStr(it.desc)) E(w, "缺少 desc");
  if (!VALID_ITEM_CATEGORIES.includes(it.category)) E(w, `category 非法：${it.category}`);
  if (!num(it.uses) || it.uses < 1) E(w, "uses 必须是 >=1 的数字");
  if (it.effect) {
    Object.keys(it.effect).forEach((k) => {
      if (!VALID_FX_KEYS.includes(k)) E(w, `effect 非法字段 ${k}`);
      if (!num(it.effect[k])) E(w, `effect.${k} 必须是数字`);
      if (k === "stamina" && it.effect[k] > 0) E(w, "体力只能下降（effect.stamina 不能为正）");
    });
  }
});

/* 地图存在性 */
const presentMaps = (HY.mapOrder || []).slice();
EXPECTED_MAPS.forEach((id) => {
  if (!presentMaps.includes(id)) {
    const msg = `缺少地图 ${id}.js（尚未创建或未注册）`;
    if (strict) E("地图清单", msg); else W("地图清单", msg);
  }
});
if (!strict && !mapFilter) {
  W("地图清单", `当前已加载 ${presentMaps.length}/11 张地图；交付前请用 --strict 检查。`);
}

const targets = mapFilter ? [mapFilter] : presentMaps;
if (mapFilter && !HY.maps[mapFilter]) {
  E("命令行", `找不到地图 ${mapFilter}`);
}

/* ------------------------------ 单图检查 ------------------------------ */
function checkMap(mapId) {
  const m = HY.maps[mapId];
  const w = mapId;
  const isFinal = mapId === "map11";

  /* 头部 */
  if (!num(m.no) || m.no < 1 || m.no > 11) E(w, "no 必须是 1-11");
  if (!["逃离线", "山村线", "校园线", "家族线"].includes(m.route)) E(w, `route 非法：${m.route}`);
  if (!isStr(m.title)) E(w, "缺少 title");
  if (!isStr(m.subtitle)) E(w, "缺少 subtitle");
  if (!m.source || !isStr(m.source.bv) || !isStr(m.source.title)) E(w, "source 需要 {bv, title}");
  if (!num(m.difficulty) || m.difficulty < 1 || m.difficulty > 5) E(w, "difficulty 必须是 1-5");
  if (!isArr(m.fearTags) || m.fearTags.length < 2 || m.fearTags.length > 4) E(w, "fearTags 需要 2-4 个");
  if (!isStr(m.summary) || m.summary.length < 40) E(w, "summary 至少 40 字");
  if (!m.initial || !num(m.initial.infection) || !num(m.initial.sanity) || !num(m.initial.stamina)) {
    E(w, "initial 需要 infection / sanity / stamina 数字");
  }

  const nodeIds = Object.keys(m.nodes || {});
  if (!m.nodes[m.start]) E(w, `start 节点 ${m.start} 不存在`);

  /* 规则 */
  const ruleIds = new Set();
  if (!isArr(m.rules) || m.rules.length < (MIN_RULES[mapId] || 10)) {
    E(w, `rules 至少 ${MIN_RULES[mapId] || 10} 条（当前 ${isArr(m.rules) ? m.rules.length : 0}）`);
  }
  (m.rules || []).forEach((r, i) => {
    const rw = `${w}.rules[${i}] ${r.id || "?"}`;
    if (!isStr(r.id) || !/^[a-z0-9_]+$/i.test(r.id)) E(rw, "id 非法（建议 mapXX_rN）");
    if (ruleIds.has(r.id)) E(rw, "规则 id 重复");
    ruleIds.add(r.id);
    if (!isStr(r.group)) E(rw, "缺少 group");
    if (!isStr(r.title)) E(rw, "缺少 title");
    if (!isStr(r.text) || r.text.length < 10) E(rw, "text 至少 10 字");
    if (!m.nodes[r.unlockAt]) E(rw, `unlockAt 节点 ${r.unlockAt} 不存在`);
    const reg = HY.ruleRegistry[r.id];
    if (reg && reg.mapId && reg.mapId !== mapId) E(rw, `规则 id 与地图 ${reg.mapId} 重复`);
  });

  /* 情绪卡 */
  const emIds = new Set();
  if (!isArr(m.emotions) || m.emotions.length < (MIN_EMOTIONS[mapId] || 5)) {
    E(w, `emotions 至少 ${MIN_EMOTIONS[mapId] || 5} 张（当前 ${isArr(m.emotions) ? m.emotions.length : 0}）`);
  }
  (m.emotions || []).forEach((e, i) => {
    const ew = `${w}.emotions[${i}] ${e.id || "?"}`;
    if (!isStr(e.id) || !/^[a-z0-9_]+$/i.test(e.id)) E(ew, "id 非法（建议 emXX_xxx）");
    if (emIds.has(e.id)) E(ew, "情绪卡 id 重复");
    emIds.add(e.id);
    if (!isStr(e.name)) E(ew, "缺少 name");
    if (!world.fearCategories.includes(e.fear)) E(ew, `fear 必须是分类表中之一：${e.fear}`);
    if (!isStr(e.quote)) E(ew, "缺少 quote");
    if (!isStr(e.desc) || e.desc.length < 40) E(ew, "desc 至少 40 字");
    const reg = HY.emotionRegistry[e.id];
    if (reg && reg.mapId && reg.mapId !== mapId) E(ew, `情绪卡 id 与地图 ${reg.mapId} 重复`);
  });

  /* 本图剧情道具 */
  Object.keys(m.localItems || {}).forEach((id) => {
    const def = m.localItems[id];
    const iw = `${w}.localItems.${id}`;
    if (HY.items[id] && HY.items[id].mapId !== mapId) E(iw, "道具 id 与全局或其他地图重复（跨图证物请直接用全局 id）");
    if (!isStr(def.name)) E(iw, "缺少 name");
    if (!VALID_ITEM_CATEGORIES.includes(def.category || "剧情")) E(iw, "category 非法");
    if (def.effect) {
      Object.keys(def.effect).forEach((k) => {
        if (!VALID_FX_KEYS.includes(k)) E(iw, `effect 非法字段 ${k}`);
        if (k === "stamina" && def.effect[k] > 0) E(iw, "体力只能下降");
      });
    }
  });

  /* 节点结构 */
  const stats = {
    nodes: nodeIds.length,
    choiceNodes: 0,
    insights: 0,
    choiceTotal: 0,
    deadChoices: 0,
    immediateDeaths: 0,
    gatedChoices: 0,
    endings: 0,
    deathEndings: 0,
    trueHidden: 0,
    escapeBecome: 0,
    maxStaminaLoss: 0,
    maxInfectionGain: 0
  };
  const allSetFlags = new Set();
  const allReqFlags = new Map();
  const allAddItems = new Set(m.startItems || []);
  const referencedItems = new Set();

  function checkFx(fx, where) {
    if (!fx) return;
    Object.keys(fx).forEach((k) => {
      if (!VALID_FX_KEYS.includes(k)) E(where, `fx 非法字段 ${k}`);
      if (!num(fx[k])) E(where, `fx.${k} 必须是数字`);
      if (k === "stamina") {
        if (fx[k] > 0) E(where, "体力值只能下降（fx.stamina 不能为正）");
        if (fx[k] < -25) W(where, `单次体力损失 ${fx[k]} 偏大（规范：≤25）`);
        stats.maxStaminaLoss = Math.max(stats.maxStaminaLoss, Math.abs(fx[k] || 0));
      }
      if (k === "infection") {
        if (fx[k] > 30) W(where, `单次感染增加 +${fx[k]} 偏大`);
        stats.maxInfectionGain = Math.max(stats.maxInfectionGain, fx[k] || 0);
      }
      if (k === "sanity" && Math.abs(fx[k]) > 40) W(where, `单次精神变化 ${fx[k]} 偏大`);
    });
  }

  function checkItemsRef(list, where) {
    (list || []).forEach((id) => {
      if (!HY.items[id]) E(where, `道具 ${id} 未定义（全局或本图 localItems）`);
      referencedItems.add(id);
    });
  }

  function checkEnding(ending, where) {
    if (!ending) return;
    if (!VALID_ENDING_TYPES.includes(ending.type)) E(where, `ending.type 非法：${ending.type}`);
    if (!isStr(ending.title)) E(where, "ending 缺少 title");
    if (!isArr(ending.lines) || ending.lines.length < 2) E(where, "ending.lines 至少 2 段");
    stats.endings++;
    if (ending.type === "death") stats.deathEndings++;
    if (ending.type === "true" || ending.type === "hidden") stats.trueHidden++;
    if (ending.type === "escape" || ending.type === "become") stats.escapeBecome++;
    const needAnalysis = ending.type === "death" ? 1 : 3;
    if (!isArr(ending.analysis) || ending.analysis.length < needAnalysis) {
      E(where, `ending.analysis 至少 ${needAnalysis} 段（当前 ${isArr(ending.analysis) ? ending.analysis.length : 0}）`);
    }
    (ending.analysis || []).forEach((a, i) => {
      if (!a || !isStr(a.title) || !isArr(a.lines) || a.lines.length < 1) {
        E(where, `analysis[${i}] 需要 {title, lines[]}`);
      }
    });
    if (ending.cp !== undefined && (!num(ending.cp) || ending.cp < 0)) E(where, "ending.cp 非法");
    const awards = ending.awards || {};
    (awards.items || []).forEach((id) => {
      if (!globalItems[id]) E(where, `awards.items ${id} 不是全局道具（跨图证物请放 data/items.js）`);
    });
    (awards.emotions || []).forEach((id) => {
      if (!HY.emotionRegistry[id]) E(where, `awards.emotions ${id} 不存在`);
    });
    (awards.rules || []).forEach((id) => {
      if (!HY.ruleRegistry[id]) E(where, `awards.rules ${id} 不存在`);
    });
  }

  nodeIds.forEach((nid) => {
    const node = m.nodes[nid];
    const nw = `${w}.nodes.${nid}`;
    if (!isStr(node.chapter) && !node.ending) W(nw, "缺少 chapter（建议有章节名）");
    if (node.bg && !VALID_BG.includes(node.bg)) W(nw, `bg 未知：${node.bg}`);
    if (node.lines !== undefined && !hasTextLines(node.lines)) E(nw, "lines 必须是字符串数组");
    if (node.insight) {
      if (!isStr(node.insight.title) || !isArr(node.insight.lines) || node.insight.lines.length < 2) {
        E(nw, "insight 需要 {title, lines[] (>=2)}");
      } else {
        stats.insights++;
      }
    }
    if (node.whisper !== undefined && !hasTextLines(node.whisper)) E(nw, "whisper 必须是字符串数组");
    if (node.drift !== undefined && !hasTextLines(node.drift)) E(nw, "drift 必须是字符串数组");
    if (node.fx) checkFx(node.fx, nw + ".fx");
    (node.setFlags || []).forEach((f) => allSetFlags.add(f));
    (node.clearFlags || []).forEach((f) => allSetFlags.add(f));
    (node.unlockRules || []).forEach((id) => {
      if (!HY.ruleRegistry[id]) E(nw, `unlockRules ${id} 不存在`);
    });
    (node.awardEmotions || []).forEach((id) => {
      if (!HY.emotionRegistry[id]) E(nw, `awardEmotions ${id} 不存在`);
    });
    if (node.items) {
      checkItemsRef(node.items.add, nw + ".items.add");
      checkItemsRef(node.items.remove, nw + ".items.remove");
      (node.items.add || []).forEach((id) => allAddItems.add(id));
    }
    if (node.cp !== undefined && (!num(node.cp) || node.cp < 0 || node.cp > 30)) E(nw, "cp 非法（0-30）");
    if (node.death !== undefined) {
      ["infection", "sanity", "stamina"].forEach((k) => {
        if (node.death[k]) {
          if (!isStr(node.death[k].title)) E(nw, `death.${k} 缺少 title`);
          if (!isArr(node.death[k].lines) || node.death[k].lines.length < 2) E(nw, `death.${k}.lines 至少 2 段`);
        }
      });
    }
    if (m.death !== undefined) {
      ["infection", "sanity", "stamina"].forEach((k) => {
        if (m.death[k] && (!isStr(m.death[k].title) || !isArr(m.death[k].lines))) {
          E(w, `map.death.${k} 需要 {title, lines}`);
        }
      });
    }

    const hasChoices = isArr(node.choices) && node.choices.length > 0;
    const hasEnding = !!node.ending;
    if (hasChoices && hasEnding) E(nw, "不能同时拥有 choices 与 ending");
    if (!hasChoices && !hasEnding) E(nw, "既没有 choices 也没有 ending（死胡同）");
    if (hasEnding) {
      if (node.lines !== undefined && node.lines.length > 0) W(nw, "结局节点通常不需要 lines（请放进 ending.lines）");
      checkEnding(node.ending, nw + ".ending");
    }
    if (hasChoices) {
      stats.choiceNodes++;
      if (node.choices.length < 2) E(nw, "选项少于 2 个（玩家没有选择空间）");
      if (node.choices.length > 5) W(nw, `选项 ${node.choices.length} 个，建议 2-5 个`);
      if (!node.lines || node.lines.length < 1) E(nw, "有选项的节点必须有正文 lines");
      const texts = new Set();
      node.choices.forEach((c, idx) => {
        const cw = `${nw}.choices[${idx}]`;
        stats.choiceTotal++;
        if (!isStr(c.text)) E(cw, "缺少 text");
        if (texts.has(c.text)) E(cw, "同一节点内选项文字重复");
        texts.add(c.text);
        if (!VALID_TAGS.includes(c.tag)) E(cw, `tag 非法：${c.tag}`);
        if (c.fx) checkFx(c.fx, cw + ".fx");
        if (c.req) {
          stats.gatedChoices++;
          checkItemsRef(c.req.items, cw + ".req.items");
          ["infectionMin", "infectionMax", "sanityMin", "sanityMax", "staminaMin", "evidenceMin", "evidenceMax"].forEach((k) => {
            if (c.req[k] !== undefined && !num(c.req[k])) E(cw, `req.${k} 必须是数字`);
          });
          (c.req.flags || []).forEach((f) => allReqFlags.set(f, (allReqFlags.get(f) || 0) + 1));
          (c.req.notFlags || []).forEach((f) => allReqFlags.set(f, (allReqFlags.get(f) || 0) + 1));
          if (c.req.items && c.req.items.length && !c.lockText) W(cw, "有道具门槛但缺少 lockText");
        }
        (c.setFlags || []).forEach((f) => allSetFlags.add(f));
        (c.items?.add || []).forEach((id) => allAddItems.add(id));
        if (c.items) {
          checkItemsRef(c.items.add, cw + ".items.add");
          checkItemsRef(c.items.remove, cw + ".items.remove");
        }
        if (c.awardEmotions) {
          c.awardEmotions.forEach((id) => {
            if (!HY.emotionRegistry[id]) E(cw, `awardEmotions ${id} 不存在`);
          });
        }
        if (c.unlockRules) {
          c.unlockRules.forEach((id) => {
            if (!HY.ruleRegistry[id]) E(cw, `unlockRules ${id} 不存在`);
          });
        }
        const routes = [c.next, c.end, c.dead].filter(Boolean);
        if (routes.length === 0) E(cw, "必须有 next / end / dead 之一");
        if (routes.length > 1) E(cw, "next / end / dead 只能有一个");
        if (c.next && !m.nodes[c.next]) E(cw, `next 节点 ${c.next} 不存在`);
        if (c.end && !m.nodes[c.end]) E(cw, `end 节点 ${c.end} 不存在`);
        if (c.next === nid) W(cw, "next 指向自身（死循环风险）");
        if (c.dead) {
          stats.deadChoices++;
          stats.immediateDeaths++;
          if (!isStr(c.dead.title)) E(cw, "dead 缺少 title");
          if (!isArr(c.dead.lines) || c.dead.lines.length < 2) E(cw, "dead.lines 至少 2 段");
          if (c.dead.analysis && !isArr(c.dead.analysis)) E(cw, "dead.analysis 必须是数组");
          stats.endings++;
          stats.deathEndings++;
        }
        if (c.result !== undefined && !hasTextLines(c.result)) E(cw, "result 必须是字符串数组");
        if (c.cp !== undefined && (!num(c.cp) || c.cp < 0 || c.cp > 20)) E(cw, "cp 非法（0-20）");
      });
    }
  });

  /* 即死路线：内联 dead 选项 + 直接导向 death 结局节点的选项 */
  nodeIds.forEach((nid) => {
    (m.nodes[nid].choices || []).forEach((c) => {
      const target = c.next || c.end;
      if (target && m.nodes[target] && m.nodes[target].ending && m.nodes[target].ending.type === "death") {
        stats.immediateDeaths++;
      }
    });
  });

  /* 可达性 */
  const reachable = new Set();
  const queue = [m.start];
  while (queue.length) {
    const nid = queue.pop();
    if (!m.nodes[nid] || reachable.has(nid)) continue;
    reachable.add(nid);
    (m.nodes[nid].choices || []).forEach((c) => {
      [c.next, c.end].forEach((t) => { if (t) queue.push(t); });
    });
  }
  nodeIds.forEach((nid) => {
    if (!reachable.has(nid)) E(w, `节点 ${nid} 从起点不可达`);
  });

  /* 门槛 flag 可获得性 */
  allReqFlags.forEach((count, f) => {
    if (!allSetFlags.has(f)) W(w, `门槛引用了 flag「${f}」，但没有任何节点/选项设置它（该选项永远无法解锁）`);
  });
  /* 门槛道具可获得性（跨图证物视为可获得，其余需本图获得或商店出售） */
  const shopItemIds = new Set(Object.keys(globalItems).filter((id) => globalItems[id].shop));
  referencedItems.forEach((id) => {
    const g = globalItems[id];
    const isCrossMapEvidence = g && g.category === "证物";
    if (!allAddItems.has(id) && !shopItemIds.has(id) && !isCrossMapEvidence) {
      W(w, `门槛引用了道具 ${id}，但它既不在商店出售、也未在本图获得（可能永远无法解锁）`);
    }
  });

  /* 硬性指标 */
  const needNodes = MIN_NODES[mapId] || 26;
  if (stats.nodes < needNodes) E(w, `节点数 ${stats.nodes} < ${needNodes}`);
  if (stats.choiceNodes < (MIN_CHOICE_NODES[mapId] || 22)) E(w, `有选项的节点 ${stats.choiceNodes} < ${MIN_CHOICE_NODES[mapId] || 22}`);
  if (stats.insights < (MIN_INSIGHTS[mapId] || 6)) E(w, `剧情解说 insight 只有 ${stats.insights} 段，至少 ${MIN_INSIGHTS[mapId] || 6} 段`);
  if (stats.endings < 4) E(w, `结局数 ${stats.endings} < 4`);
  if (stats.deathEndings < 2) E(w, `死亡结局 ${stats.deathEndings} < 2`);
  if (stats.trueHidden < 1) E(w, "缺少 true / hidden 结局");
  if (stats.escapeBecome < 1) E(w, "缺少 escape / become 结局");
  if (stats.immediateDeaths < 3) E(w, `即死路线 ${stats.immediateDeaths} < 3（内联 dead 或直接导向 death 结局的选项）`);
  if (stats.gatedChoices < 5) W(w, `门槛选择 ${stats.gatedChoices} < 5`);
  if (stats.maxStaminaLoss > 25) W(w, `最大单次体力损失 ${stats.maxStaminaLoss}（建议 ≤25，即死除外）`);

  /* 跨图证物 */
  const needItem = REQUIRED_TRUE_ITEMS[mapId];
  if (needItem) {
    const awarded = (m.nodes && Object.keys(m.nodes).some((nid) => {
      const node = m.nodes[nid];
      const e = node.ending;
      return e && (e.type === "true" || e.type === "hidden") &&
        e.awards && (e.awards.items || []).includes(needItem);
    }));
    if (!awarded) E(w, `true/hidden 结局没有授予跨图证物 ${needItem}`);
  }
  if (m.id !== mapId) E(w, "地图 id 与注册 id 不一致");
  return stats;
}

/* ------------------------------ 输出 ------------------------------ */
const summary = [];
targets.forEach((mapId) => {
  if (!HY.maps[mapId]) return;
  const s = checkMap(mapId);
  summary.push({ mapId, ...s });
});

if (!quiet) {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  恒仰市 · 规则怪谈 — 剧本数据校验                         ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`已加载文件：${loadedFiles.length} 个`);
  console.log("");
  console.log("地图                   节点  选项  即死  结局  解说  规则  情绪  门槛");
  console.log("─────────────────────────────────────────────────────────────────────");
  summary.forEach((s) => {
    const m = HY.maps[s.mapId];
    console.log(
      `${s.mapId} ${String(m.title).padEnd(8, "　")}  ${String(s.nodes).padStart(3)}  ${String(s.choiceTotal).padStart(4)}  ${String(s.immediateDeaths).padStart(4)}  ${String(s.endings).padStart(4)}  ${String(s.insights).padStart(4)}  ${String(m.rules.length).padStart(4)}  ${String(m.emotions.length).padStart(4)}  ${String(s.gatedChoices).padStart(4)}`
    );
  });
  console.log("─────────────────────────────────────────────────────────────────────");
}

if (errors.length) {
  console.log("");
  console.log(`✖ 错误 ${errors.length} 条：`);
  errors.forEach((e) => console.log("  ✖ " + e));
}
if (warnings.length) {
  console.log("");
  console.log(`△ 警告 ${warnings.length} 条：`);
  warnings.forEach((w) => console.log("  △ " + w));
}
if (!errors.length) {
  console.log("");
  console.log(`✔ 校验通过（${targets.length} 张地图${warnings.length ? `，${warnings.length} 条警告` : ""}）`);
  process.exit(0);
} else {
  console.log("");
  console.log(`✖ 校验失败：${errors.length} 条错误`);
  process.exit(1);
}
