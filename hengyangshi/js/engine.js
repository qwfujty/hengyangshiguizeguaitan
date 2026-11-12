/* ============================================================
 * 恒仰市 · 规则怪谈  —  游戏引擎
 * 纯前端、无依赖、可 file:// 直接运行。
 * 负责：注册表、存档、数值、道具、门槛、分支、结局、图鉴。
 * 本文件必须在所有 data/*.js 之前加载；ui.js 在其后调用 HY.Core.boot()。
 * ============================================================ */
(function () {
  "use strict";

  var HY = (window.HY = window.HY || {});
  var SAVE_KEY = "hengyang_rule_horror_save_v1";
  var SAVE_VERSION = 1;

  /* ---------------------------- 注册表 ---------------------------- */
  HY.maps = {};
  HY.mapOrder = [];
  HY.items = {};
  HY.lore = {};
  HY.loreOrder = [];
  HY.emotionRegistry = {};
  HY.ruleRegistry = {};
  HY.world = {};

  HY.registerWorld = function (w) {
    if (!w || typeof w !== "object") return;
    for (var k in w) if (Object.prototype.hasOwnProperty.call(w, k)) HY.world[k] = w[k];
  };

  HY.registerLore = function (list) {
    (list || []).forEach(function (e) {
      if (!e || !e.id) return;
      if (!HY.lore[e.id]) HY.loreOrder.push(e.id);
      HY.lore[e.id] = e;
    });
  };

  function normalizeItem(id, def, mapId) {
    def = def || {};
    return {
      id: id,
      name: def.name || id,
      category: def.category || "剧情",
      shop: !!def.shop,
      price: typeof def.price === "number" ? def.price : 0,
      uses: typeof def.uses === "number" && def.uses > 0 ? def.uses : 1,
      effect: def.effect || {},
      decay: def.decay || null,
      desc: def.desc || "",
      mapId: mapId || null
    };
  }

  HY.registerItems = function (items) {
    if (!items || typeof items !== "object") return;
    Object.keys(items).forEach(function (id) {
      HY.items[id] = normalizeItem(id, items[id]);
    });
  };

  HY.registerMap = function (m) {
    if (!m || !m.id) throw new Error("registerMap: 缺少 id");
    m.nodes = m.nodes || {};
    m.rules = m.rules || [];
    m.emotions = m.emotions || [];
    m.startItems = m.startItems || [];
    m.finalNote = m.finalNote || "";
    m.initial = m.initial || {};
    m.initial.infection = typeof m.initial.infection === "number" ? m.initial.infection : 0;
    m.initial.sanity = typeof m.initial.sanity === "number" ? m.initial.sanity : 80;
    m.initial.stamina = typeof m.initial.stamina === "number" ? m.initial.stamina : 100;

    /* 本图剧情道具并入全局道具表（若 id 已存在则保留全局定义） */
    if (m.localItems && typeof m.localItems === "object") {
      Object.keys(m.localItems).forEach(function (id) {
        if (!HY.items[id]) HY.items[id] = normalizeItem(id, m.localItems[id], m.id);
      });
    }
    m.localItems = m.localItems || {};

    /* 全局唯一注册 */
    if (HY.maps[m.id]) throw new Error("registerMap: 重复的地图 id " + m.id);
    HY.maps[m.id] = m;
    HY.mapOrder.push(m.id);

    (m.emotions || []).forEach(function (e) {
      if (!e || !e.id) return;
      if (!HY.emotionRegistry[e.id]) {
        e.mapId = m.id;
        HY.emotionRegistry[e.id] = e;
      }
    });
    (m.rules || []).forEach(function (r) {
      if (!r || !r.id) return;
      if (!HY.ruleRegistry[r.id]) {
        r.mapId = m.id;
        HY.ruleRegistry[r.id] = r;
      }
    });
  };

  /* ---------------------------- 工具 ---------------------------- */
  var CP_BASE = { death: 2, fail: 4, become: 10, escape: 14, true: 26, hidden: 40 };
  var FIRST_CLEAR_BONUS = 10;
  var TYPE_BONUS = { true: 12, hidden: 20 };
  var EMOTION_CP = 2;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function mapName(id) { return (HY.maps[id] && HY.maps[id].title) || id; }
  function itemDef(id) { return HY.items[id] || normalizeItem(id, { name: id }, null); }

  function defaultSave() {
    return {
      v: SAVE_VERSION,
      cp: 18,
      owned: {},
      archives: {},
      emotions: {},
      insights: {},
      lore: {},
      endings: {},
      clears: {},
      counters: { runs: 0, deaths: 0, trueEndings: 0, hiddenEndings: 0 },
      settings: {
        typewriter: false,
        sound: false,
        expandInsight: false
      },
      lastMap: "map01",
      run: null
    };
  }

  var save = defaultSave();
  var run = null;
  var lastDeltas = null;
  var lastEnding = null;
  var booted = false;
  var storageOK = true;

  /* ---------------------------- 存档 ---------------------------- */
  function loadSave() {
    try {
      var raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (!data || typeof data !== "object") return false;
      var fresh = defaultSave();
      /* 逐字段合并，保证旧存档兼容 */
      save = {
        v: SAVE_VERSION,
        cp: typeof data.cp === "number" ? data.cp : fresh.cp,
        owned: data.owned || {},
        archives: data.archives || {},
        emotions: data.emotions || {},
        insights: data.insights || {},
        lore: data.lore || {},
        endings: data.endings || {},
        clears: data.clears || {},
        counters: data.counters || fresh.counters,
        settings: Object.assign({}, fresh.settings, data.settings || {}),
        lastMap: data.lastMap || "map01",
        run: data.run || null
      };
      return true;
    } catch (e) {
      storageOK = false;
      return false;
    }
  }

  function persist() {
    save.run = run;
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch (e) {
      storageOK = false;
    }
  }

  function refreshLoreUnlocks() {
    HY.loreOrder.forEach(function (id) {
      var e = HY.lore[id];
      if (!e || save.lore[id]) return;
      var unlock = e.unlock || {};
      var ok = false;
      (unlock.maps || []).forEach(function (mid) {
        if (save.clears[mid] && save.clears[mid].cleared) ok = true;
      });
      (unlock.endings || []).forEach(function (key) {
        var parts = String(key).split(":");
        if (parts.length === 2 && save.endings[parts[0]] && save.endings[parts[0]][parts[1]]) ok = true;
      });
      if (unlock.always) ok = true;
      if (ok) save.lore[id] = true;
    });
  }

  /* ---------------------------- 条件检查 ---------------------------- */
  function checkReq(choice, r) {
    var req = choice.req;
    if (!req) return { ok: true, reasons: [] };
    var reasons = [];
    (req.items || []).forEach(function (id) {
      if (!r.inventory[id] || r.inventory[id] <= 0) reasons.push("「" + itemDef(id).name + "」");
    });
    if (typeof req.infectionMin === "number" && r.stats.infection < req.infectionMin) reasons.push("感染值 ≥ " + req.infectionMin);
    if (typeof req.infectionMax === "number" && r.stats.infection > req.infectionMax) reasons.push("感染值 ≤ " + req.infectionMax);
    if (typeof req.sanityMin === "number" && r.stats.sanity < req.sanityMin) reasons.push("精神值 ≥ " + req.sanityMin);
    if (typeof req.sanityMax === "number" && r.stats.sanity > req.sanityMax) reasons.push("精神值 ≤ " + req.sanityMax);
    if (typeof req.staminaMin === "number" && r.stats.stamina < req.staminaMin) reasons.push("体力值 ≥ " + req.staminaMin);
    if (typeof req.evidenceMin === "number" || typeof req.evidenceMax === "number") {
      var evCount = 0;
      Object.keys(r.inventory).forEach(function (id) {
        if (r.inventory[id] > 0 && itemDef(id).category === "证物") evCount++;
      });
      if (typeof req.evidenceMin === "number" && evCount < req.evidenceMin) reasons.push("跨图证物 ≥ " + req.evidenceMin + " 件");
      if (typeof req.evidenceMax === "number" && evCount > req.evidenceMax) reasons.push("跨图证物 ≤ " + req.evidenceMax + " 件");
    }
    (req.flags || []).forEach(function (f) {
      if (!r.flags[f]) reasons.push("尚未满足某个前提");
    });
    (req.notFlags || []).forEach(function (f) {
      if (r.flags[f]) reasons.push("已经无法回头");
    });
    return { ok: reasons.length === 0, reasons: reasons };
  }

  /* ---------------------------- 数值 ---------------------------- */
  function applyFx(fx, r, source) {
    var deltas = { infection: 0, sanity: 0, stamina: 0 };
    if (!fx) return deltas;
    var before = { infection: r.stats.infection, sanity: r.stats.sanity, stamina: r.stats.stamina };

    if (typeof fx.infection === "number") r.stats.infection += fx.infection;
    if (typeof fx.sanity === "number") r.stats.sanity += fx.sanity;
    if (typeof fx.stamina === "number") {
      /* 体力只能下降：正数被忽略（数据错误也不允许回血） */
      if (fx.stamina < 0) r.stats.stamina += fx.stamina;
    }
    r.stats.infection = clamp(Math.round(r.stats.infection), 0, 100);
    r.stats.sanity = clamp(Math.round(r.stats.sanity), 0, 100);
    r.stats.stamina = clamp(Math.round(r.stats.stamina), 0, 100);

    deltas.infection = r.stats.infection - before.infection;
    deltas.sanity = r.stats.sanity - before.sanity;
    deltas.stamina = r.stats.stamina - before.stamina;
    return deltas;
  }

  function mergeDeltas(a, b) {
    return {
      infection: (a.infection || 0) + (b.infection || 0),
      sanity: (a.sanity || 0) + (b.sanity || 0),
      stamina: (a.stamina || 0) + (b.stamina || 0)
    };
  }

  function addItemToRun(r, id, count) {
    count = count || 1;
    var def = itemDef(id);
    if (!r.inventory[id]) r.inventory[id] = 0;
    r.inventory[id] += count * (def.uses || 1);
  }

  /* 消耗：无论道具定义多少次使用，选项里的 remove 都只消耗“一次使用” */
  function removeItemFromRun(r, id, count) {
    count = count || 1;
    if (!r.inventory[id]) return;
    r.inventory[id] -= count;
    if (r.inventory[id] <= 0) delete r.inventory[id];
  }

  function grantItemPermanent(id) {
    if (!save.owned[id]) save.owned[id] = true;
  }

  /* 获得情绪卡（首次获得时由调用方发放 CP，避免重复计数） */
  function awardEmotions(list, r) {
    var gained = [];
    (list || []).forEach(function (id) {
      if (!HY.emotionRegistry[id]) return;
      if (save.emotions[id]) return;
      save.emotions[id] = true;
      gained.push(id);
    });
    return gained;
  }

  function unlockRules(list) {
    var gained = [];
    (list || []).forEach(function (id) {
      if (!HY.ruleRegistry[id]) return;
      if (save.archives[id]) return;
      save.archives[id] = true;
      gained.push(id);
    });
    return gained;
  }

  /* ---------------------------- 动作结算 ---------------------------- */
  function applyNodeEnterSideEffects(node, r) {
    var gained = { emotions: [], rules: [], items: [] };
    if (node.fx) {
      var d = applyFx(node.fx, r, "node");
      lastDeltas = mergeDeltas(lastDeltas || { infection: 0, sanity: 0, stamina: 0 }, d);
      r.lastDeltas = lastDeltas;
    }
    if (node.setFlags) node.setFlags.forEach(function (f) { r.flags[f] = true; });
    if (node.clearFlags) node.clearFlags.forEach(function (f) { delete r.flags[f]; });
    if (node.unlockRules) gained.rules = gained.rules.concat(unlockRules(node.unlockRules));
    if (node.awardEmotions) {
      var em = awardEmotions(node.awardEmotions, r);
      if (em.length) save.cp += em.length * EMOTION_CP;
      gained.emotions = gained.emotions.concat(em);
    }
    if (node.items) {
      (node.items.add || []).forEach(function (id) { addItemToRun(r, id); gained.items.push(id); });
      (node.items.remove || []).forEach(function (id) { removeItemFromRun(r, id); });
    }
    if (node.cp) { save.cp += node.cp; }
    return gained;
  }

  function findNode(mapId, nodeId) {
    var m = HY.maps[mapId];
    return m && m.nodes ? m.nodes[nodeId] : null;
  }

  function enterNode(nodeId, r) {
    var m = HY.maps[r.mapId];
    var node = m.nodes[nodeId];
    if (!node) throw new Error("节点不存在：" + r.mapId + "/" + nodeId);
    r.nodeId = nodeId;
    r.visited[nodeId] = true;
    r.choiceOrder = null;
    r.insightReadAt = null;
    /* 剧情解说收录 */
    if (node.insight) {
      if (!save.insights[r.mapId]) save.insights[r.mapId] = {};
      save.insights[r.mapId][nodeId] = true;
    }
    r.gained = applyNodeEnterSideEffects(node, r);
    r.viewSerial = (r.viewSerial || 0) + 1;
    persist();

    /* 进入节点后的数值死亡判定 */
    var statDeath = checkStatDeath(r);
    if (statDeath) {
      finishRun(statDeath, null, true);
      return { ok: true, statDeath: true };
    }
    if (node.ending) {
      finishRun(node.ending, node);
      return { ok: true, ended: true };
    }
    return { ok: true };
  }

  function statDeathEnding(r) {
    var m = HY.maps[r.mapId];
    var d = m.death || {};
    if (r.stats.stamina <= 0) {
      var e1 = d.stamina || {};
      return {
        id: "stat_stamina",
        type: "death",
        stamp: "即死",
        title: e1.title || "即死 · 体力归零",
        subtitle: "身体先于规则倒下",
        lines: e1.lines || [
          "你的膝盖先落地，然后才是身体。",
          "在恒仰市，体力值没有恢复的办法——它只是提醒你，离开需要多少条腿。"
        ],
        analysis: e1.analysis || [
          { title: "解析 · 体力值", lines: ["体力值只能下降，且没有任何回复手段。每一次奔跑、攀爬、熬夜，都在这座城市的地图上划掉你的一部分。"] }
        ],
        isStatDeath: true
      };
    }
    if (r.stats.sanity <= 0) {
      var e2 = d.sanity || {};
      return {
        id: "stat_sanity",
        type: "death",
        stamp: "崩溃",
        title: e2.title || "崩溃 · 精神归零",
        subtitle: "你再也分不清哪一个声音是你自己的",
        lines: e2.lines || ["你听见很多人在说话。", "你仔细听，发现他们都在用你的声音，说同一句话：别怕。"],
        analysis: e2.analysis || [
          { title: "解析 · 精神值", lines: ["精神值是你之所以还是“你”的锚点。规则、幻觉、亲人的异状都在磨损它；归零时，城市会替你决定你是谁。"] }
        ],
        isStatDeath: true
      };
    }
    var e3 = d.infection || {};
    return {
      id: "stat_infection",
      type: "become",
      stamp: "异变",
      title: e3.title || "异变 · 感染值达到极限",
      subtitle: "你被校准完成了",
      lines: e3.lines || ["你感觉很好。", "你不再口渴，不再想跑，也不再觉得这个城市有什么不对。", "你回家了。"],
      analysis: e3.analysis || [
        { title: "解析 · 感染值", lines: ["感染值满 100 时，你不再是“被污染的人”，而是“城市的一部分”。异化结局不写死亡，因为死亡至少还是一种离开。"] }
      ],
      isStatDeath: true
    };
  }

  function checkStatDeath(r) {
    if (r.stats.stamina <= 0 || r.stats.sanity <= 0 || r.stats.infection >= 100) {
      return statDeathEnding(r);
    }
    return null;
  }

  /* ---------------------------- 结局结算 ---------------------------- */
  function endingDefId(mapId, ending, nodeId) {
    if (ending.id) return ending.id;
    return "end:" + mapId + ":" + (nodeId || ending.title || "unknown");
  }

  var CLEAR_TYPES = { escape: 1, true: 1, hidden: 1, become: 1 };

  function finishRun(ending, node, isStatDeath) {
    var m = HY.maps[run.mapId];
    var e = ending || {};
    var type = e.type || "death";
    if (!CP_BASE[type]) type = "death";
    var id = endingDefId(run.mapId, e, run.nodeId);
    var typeLabel = (HY.world.endingTypes && HY.world.endingTypes[type] && HY.world.endingTypes[type].stamp) || type;
    var cpBreakdown = [];
    var cpGained = 0;

    /* 结局本身的奖励 */
    var base = typeof e.cp === "number" ? e.cp : CP_BASE[type];
    cpGained += base;
    cpBreakdown.push({ label: "结局奖励（" + typeLabel + "）", value: base });

    /* 首次通关（仅 escape / true / hidden / become 计入） */
    var prevClear = save.clears[run.mapId] || null;
    var firstClear = false;
    if (CLEAR_TYPES[type] && !(prevClear && prevClear.cleared)) {
      firstClear = true;
      cpGained += FIRST_CLEAR_BONUS;
      cpBreakdown.push({ label: "首次通关本图", value: FIRST_CLEAR_BONUS });
    }
    if (TYPE_BONUS[type]) {
      var alreadyType = prevClear && prevClear.typeBonus && prevClear.typeBonus[type];
      if (!alreadyType) {
        cpGained += TYPE_BONUS[type];
        cpBreakdown.push({ label: "首次达成「" + typeLabel + "」结局", value: TYPE_BONUS[type] });
      }
    }

    /* 情绪/规则补发与永久道具 */
    var newEmotions = awardEmotions((e.awards && e.awards.emotions) || [], run);
    if (newEmotions.length) {
      cpGained += newEmotions.length * EMOTION_CP;
      cpBreakdown.push({ label: "新情绪卡 ×" + newEmotions.length, value: newEmotions.length * EMOTION_CP });
    }
    var newRules = unlockRules((e.awards && e.awards.rules) || []);
    var newItems = [];
    ((e.awards && e.awards.items) || []).forEach(function (itemId) {
      var wasOwned = !!save.owned[itemId];
      grantItemPermanent(itemId);
      if (!wasOwned) newItems.push(itemId);
    });

    /* 记录结局（数值型死亡只计次数，不进入结局收集） */
    if (!isStatDeath) {
      if (!save.endings[run.mapId]) save.endings[run.mapId] = {};
      var rec = save.endings[run.mapId][id];
      if (rec) rec.count++;
      else save.endings[run.mapId][id] = { id: id, type: type, title: e.title || typeLabel, count: 1, at: Date.now() };
      if (!save.clears[run.mapId]) save.clears[run.mapId] = { cleared: false, endings: 0, typeBonus: {} };
      if (CLEAR_TYPES[type]) save.clears[run.mapId].cleared = true;
      if (TYPE_BONUS[type] && !alreadyType) {
        save.clears[run.mapId].typeBonus = save.clears[run.mapId].typeBonus || {};
        save.clears[run.mapId].typeBonus[type] = true;
      }
      save.clears[run.mapId].endings = Object.keys(save.endings[run.mapId]).length;
    }

    save.counters.runs++;
    if (type === "death") save.counters.deaths++;
    if (type === "true") save.counters.trueEndings++;
    if (type === "hidden") save.counters.hiddenEndings++;
    /* 即死/死亡表现：体力值瞬间归零（结局页显示） */
    if (type === "death") run.stats.stamina = 0;
    save.cp += cpGained;
    save.lastMap = run.mapId;

    lastEnding = {
      mapId: run.mapId,
      mapTitle: m.title,
      ending: {
        id: id,
        type: type,
        stamp: e.stamp || typeLabel,
        title: e.title || "结局",
        subtitle: e.subtitle || "",
        lines: e.lines || [],
        analysis: e.analysis || [],
        awards: e.awards || {}
      },
      stats: clone(run.stats),
      choices: run.choices.slice(),
      cpGained: cpGained,
      cpBreakdown: cpBreakdown,
      newEmotions: newEmotions,
      newRules: newRules,
      newItems: newItems,
      firstClear: firstClear,
      isStatDeath: !!isStatDeath,
      playedAt: Date.now()
    };

    save.run = null;
    run = null;
    refreshLoreUnlocks();
    persist();
  }

  /* ---------------------------- 视图 ---------------------------- */
  function shuffledIndexes(n) {
    var arr = [];
    for (var i = 0; i < n; i++) arr.push(i);
    for (var j = arr.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var tmp = arr[j]; arr[j] = arr[k]; arr[k] = tmp;
    }
    return arr;
  }

  /* 每次进入新节点时随机打乱一次选项顺序；同一节点内重复渲染保持顺序 */
  function choiceOrderFor(node, r) {
    var count = (node.choices || []).length;
    if (!r.choiceOrder || r.choiceOrder.nodeId !== r.nodeId || !r.choiceOrder.order || r.choiceOrder.order.length !== count) {
      r.choiceOrder = { nodeId: r.nodeId, order: shuffledIndexes(count) };
      if (r.choiceOrder && r.choiceOrder.order) persist();
    }
    return r.choiceOrder.order;
  }

  function buildChoiceView(node, r) {
    var list = [];
    var hiddenCount = 0;
    var order = choiceOrderFor(node, r);
    var displayNo = 0;
    order.forEach(function (idx) {
      var choice = (node.choices || [])[idx];
      if (!choice) return;
      var res = checkReq(choice, r);
      if (!res.ok && choice.hidden) { hiddenCount++; return; }
      var lockText = "";
      if (!res.ok) {
        lockText = choice.lockText || ("缺少条件：" + res.reasons.join("、"));
      }
      displayNo++;
      list.push({
        index: idx,
        displayNo: displayNo,
        text: choice.text,
        tag: choice.tag || "异常",
        hint: choice.hint || "",
        enabled: res.ok,
        lockText: lockText,
        req: choice.req || null
      });
    });
    return { choices: list, hiddenCount: hiddenCount };
  }

  function currentNode() {
    if (!run) return null;
    return findNode(run.mapId, run.nodeId);
  }

  function getView() {
    if (!run) return null;
    var m = HY.maps[run.mapId];
    var node = currentNode();
    if (!node) return null;
    var cv = buildChoiceView(node, run);
    var view = {
      map: m,
      run: {
        mapId: run.mapId,
        nodeId: run.nodeId,
        stats: clone(run.stats),
        inventory: clone(run.inventory),
        flags: clone(run.flags),
        choicesMade: run.choices.length
      },
      node: {
        id: run.nodeId,
        chapter: node.chapter || "",
        bg: node.bg || (m.nodes[m.start] && m.nodes[m.start].bg) || "home",
        lines: node.lines || [],
        insight: node.insight || null,
        whisper: node.whisper || [],
        drift: node.drift || [],
        ending: node.ending || null
      },
      choices: cv.choices,
      hiddenCount: cv.hiddenCount,
      resultLines: run.resultLines || [],
      deltas: run.lastDeltas || null,
      inventoryView: getInventoryView(),
      lowSanity: run.stats.sanity <= 40,
      highInfection: run.stats.infection >= 60
    };
    return view;
  }

  function getInventoryView() {
    if (!run) return [];
    return Object.keys(run.inventory).map(function (id) {
      var def = itemDef(id);
      return {
        id: id,
        name: def.name,
        category: def.category,
        desc: def.desc,
        uses: run.inventory[id],
        usable: !!(def.effect && Object.keys(def.effect).length),
        effect: def.effect || null
      };
    }).sort(function (a, b) {
      var order = { "回复": 1, "稳定": 2, "护身": 3, "事件": 4, "证物": 5, "剧情": 6 };
      return (order[a.category] || 9) - (order[b.category] || 9) || a.name.localeCompare(b.name, "zh");
    });
  }

  /* ---------------------------- 核心 API ---------------------------- */
  var Core = (HY.Core = {});

  Core.boot = function () {
    loadSave();
    /* 合并所有已注册地图的道具（部分地图 localItems 在 registerMap 中已合并） */
    refreshLoreUnlocks();
    booted = true;
    /* 若存档里有未完成的 run，恢复内存对象 */
    if (save.run && save.run.mapId && HY.maps[save.run.mapId]) {
      run = save.run;
      run.resultLines = [];
      run.lastDeltas = null;
      /* 修正可能的字段缺失 */
      run.inventory = run.inventory || {};
      run.flags = run.flags || {};
      run.visited = run.visited || {};
      run.choices = run.choices || [];
    } else {
      save.run = null;
      run = null;
    }
    persist();
    return true;
  };

  Core.isBooted = function () { return booted; };
  Core.storageOK = function () { return storageOK; };
  Core.getStorageKey = function () { return SAVE_KEY; };
  Core.getSave = function () { return save; };
  Core.getCp = function () { return save.cp; };
  Core.getWorld = function () { return HY.world; };

  Core.getMap = function (id) { return HY.maps[id] || null; };
  Core.getInventoryView = getInventoryView;

  Core.getMapList = function () {
    return HY.mapOrder.map(function (id) {
      var m = HY.maps[id];
      var clear = save.clears[id];
      var endings = save.endings[id] || {};
      var total = Core.getMapEndingDefinitions(id).length;
      return {
        id: id,
        no: m.no,
        title: m.title,
        subtitle: m.subtitle,
        route: m.route,
        difficulty: m.difficulty,
        fearTags: m.fearTags || [],
        summary: m.summary,
        source: m.source,
        cleared: !!(clear && clear.cleared),
        endingsFound: Object.keys(endings).filter(function (eid) {
          return total === 0 || Core.getMapEndingDefinitions(id).some(function (d) { return d.id === eid; });
        }).length,
        endingsTotal: total,
        types: Object.keys(endings).map(function (k) { return endings[k].type; })
      };
    });
  };

  Core.getMapEndingDefinitions = function (mapId) {
    var m = HY.maps[mapId];
    if (!m) return [];
    var list = [];
    Object.keys(m.nodes).forEach(function (nid) {
      var node = m.nodes[nid];
      if (node.ending) {
        list.push({
          id: endingDefId(mapId, node.ending, nid),
          type: node.ending.type || "death",
          title: node.ending.title || "结局",
          nodeId: nid
        });
      }
      (node.choices || []).forEach(function (c, idx) {
        if (c.dead) {
          list.push({
            id: c.dead.id || ("dead:" + mapId + ":" + nid + ":" + idx),
            type: "death",
            title: c.dead.title || "即死",
            nodeId: nid
          });
        }
      });
    });
    return list;
  };

  Core.getMapDetail = function (id) {
    var m = HY.maps[id];
    if (!m) return null;
    var list = Core.getMapList().filter(function (x) { return x.id === id; })[0];
    list.rulesCount = m.rules.length;
    list.emotionsCount = m.emotions.length;
    list.nodesCount = Object.keys(m.nodes).length;
    list.insightsCount = Object.keys(m.nodes).filter(function (nid) { return !!m.nodes[nid].insight; }).length;
    list.finalNote = m.finalNote;
    list.initial = m.initial;
    list.startItems = m.startItems || [];
    return list;
  };

  Core.hasActiveRun = function () { return !!run; };
  Core.getActiveRunInfo = function () {
    if (!run) return null;
    var m = HY.maps[run.mapId];
    var node = currentNode();
    return {
      mapId: run.mapId,
      mapTitle: m ? m.title : run.mapId,
      chapter: (node && node.chapter) || "",
      stats: clone(run.stats),
      choicesMade: run.choices.length
    };
  };

  Core.newRun = function (mapId) {
    var m = HY.maps[mapId];
    if (!m) return { ok: false, error: "地图不存在" };
    if (run) return { ok: false, error: "已有一局进行中的探索，请先结束或放弃当前探索。" };
    lastEnding = null;
    lastDeltas = null;
    run = {
      mapId: mapId,
      nodeId: m.start,
      stats: {
        infection: m.initial.infection,
        sanity: m.initial.sanity,
        stamina: m.initial.stamina
      },
      inventory: {},
      flags: {},
      visited: {},
      choices: [],
      resultLines: [],
      startedAt: Date.now(),
      viewSerial: 0
    };
    /* 永久道具全部带入（次数按道具定义重置） */
    Object.keys(save.owned).forEach(function (id) {
      if (!save.owned[id]) return;
      var def = itemDef(id);
      run.inventory[id] = def.uses || 1;
    });
    /* 地图初始剧情道具 */
    m.startItems.forEach(function (id) {
      if (!run.inventory[id]) run.inventory[id] = itemDef(id).uses || 1;
    });
    save.lastMap = mapId;
    var res = enterNode(m.start, run);
    return { ok: true, ended: !!res.ended, statDeath: !!res.statDeath };
  };

  Core.resumeRun = function () {
    if (!run) return { ok: false, error: "没有可继续的探索" };
    return { ok: true };
  };

  Core.abandonRun = function () {
    run = null;
    lastDeltas = null;
    persist();
    return { ok: true };
  };

  Core.getView = getView;

  Core.choose = function (index) {
    if (!run) return { ok: false, error: "没有进行中的探索" };
    var node = currentNode();
    if (!node || !node.choices) return { ok: false, error: "当前节点无法选择" };
    var choice = node.choices[index];
    if (!choice) return { ok: false, error: "选项不存在" };
    var reqRes = checkReq(choice, run);
    if (!reqRes.ok) return { ok: false, error: "条件不足：" + reqRes.reasons.join("、") };

    lastDeltas = null;
    var gained = { emotions: [], rules: [], items: [] };
    if (choice.fx) {
      var d = applyFx(choice.fx, run, "choice");
      lastDeltas = d;
      run.lastDeltas = d;
    }
    if (choice.items) {
      (choice.items.add || []).forEach(function (id) { addItemToRun(run, id); gained.items.push(id); });
      (choice.items.remove || []).forEach(function (id) { removeItemFromRun(run, id); });
    }
    if (choice.setFlags) choice.setFlags.forEach(function (f) { run.flags[f] = true; });
    if (choice.clearFlags) choice.clearFlags.forEach(function (f) { delete run.flags[f]; });
    if (choice.cp) save.cp += choice.cp;
    if (choice.awardEmotions) {
      var em2 = awardEmotions(choice.awardEmotions, run);
      if (em2.length) save.cp += em2.length * EMOTION_CP;
      gained.emotions = gained.emotions.concat(em2);
    }
    if (choice.unlockRules) gained.rules = gained.rules.concat(unlockRules(choice.unlockRules));

    run.choices.push({
      nodeId: run.nodeId,
      nodeTitle: node.chapter || "",
      text: choice.text,
      tag: choice.tag || "",
      index: index
    });
    run.resultLines = (choice.result || []).slice();

    /* 结算后的数值死亡 */
    var statDeath = checkStatDeath(run);
    if (statDeath) {
      finishRun(statDeath, null, true);
      return { ok: true, ended: true };
    }

    /* 即死 */
    if (choice.dead) {
      finishRun(
        {
          id: choice.dead.id || ("dead:" + run.mapId + ":" + run.nodeId + ":" + index),
          type: "death",
          stamp: "即死",
          title: choice.dead.title || "即死",
          subtitle: "体力值瞬间归零",
          lines: (run.resultLines || []).concat(choice.dead.lines || []),
          analysis: choice.dead.analysis || [
            { title: "解析", lines: ["这是一次即死。在原视频的守则里，这一步往往只有一句话，却是整段故事里最致命的错误点。"] }
          ]
        },
        null,
        false
      );
      return { ok: true, ended: true };
    }

    var next = choice.next || choice.end;
    if (!next) {
      return { ok: false, error: "数据错误：选项没有 next / dead / end" };
    }
    var res = enterNode(next, run);
    return { ok: true, ended: !!res.ended, statDeath: !!res.statDeath, gained: gained };
  };

  Core.useItem = function (id) {
    if (!run) return { ok: false, error: "没有进行中的探索" };
    if (!run.inventory[id]) return { ok: false, error: "没有这个道具" };
    var def = itemDef(id);
    if (!def.effect || !Object.keys(def.effect).length) {
      return { ok: false, error: "「" + def.name + "」不能在此时使用，它只在特定选择里生效。" };
    }
    lastDeltas = null;
    var d = applyFx(def.effect, run, "item");
    lastDeltas = d;
    run.lastDeltas = d;
    run.inventory[id]--;
    var decayText = "";
    if (run.inventory[id] <= 0) delete run.inventory[id];

    /* 道具变异（如蓝色充电宝使用两次后变红） */
    if (def.decay && def.decay.after) {
      run.usage = run.usage || {};
      run.usage[id] = (run.usage[id] || 0) + 1;
      if (run.usage[id] >= def.decay.after && !run.flags[def.decay.flag]) {
        run.flags[def.decay.flag] = true;
        decayText = def.decay.text || "";
      }
    }
    persist();

    var statDeath = checkStatDeath(run);
    if (statDeath) {
      finishRun(statDeath, null, true);
      return { ok: true, ended: true, deltas: d };
    }
    return { ok: true, deltas: d, decayText: decayText };
  };

  Core.getLastDeltas = function () { return lastDeltas; };
  Core.clearDeltas = function () { lastDeltas = null; if (run) run.lastDeltas = null; };
  Core.clearResultLines = function () { if (run) run.resultLines = []; };

  /* 是否拥有「守则批注本」：购买后才显示选项的标签与小字提示 */
  Core.hasChoiceHints = function () { return !!(save.owned && save.owned.it_hints); };

  /* 展开剧情解说：每次打开消耗 1 精神 + 1 体力 */
  Core.readInsight = function () {
    if (!run) return { ok: false, error: "没有进行中的探索" };
    var node = currentNode();
    if (!node || !node.insight) return { ok: false, error: "当前节点没有剧情解说" };
    lastDeltas = null;
    var d = applyFx({ sanity: -1, stamina: -1 }, run, "insight");
    lastDeltas = d;
    run.lastDeltas = d;
    run.insightReadAt = run.nodeId;
    persist();
    var statDeath = checkStatDeath(run);
    if (statDeath) {
      finishRun(statDeath, null, true);
      return { ok: true, ended: true, deltas: d };
    }
    return { ok: true, deltas: d };
  };

  Core.getEnding = function () { return lastEnding; };
  Core.clearEnding = function () { lastEnding = null; };

  /* ---------------------------- 商店 / 图鉴 ---------------------------- */
  Core.getShopItems = function () {
    var cats = ["回复", "稳定", "护身", "事件"];
    return Object.keys(HY.items)
      .map(function (id) { return HY.items[id]; })
      .filter(function (it) { return it.shop && it.price > 0; })
      .sort(function (a, b) {
        return cats.indexOf(a.category) - cats.indexOf(b.category) || a.price - b.price;
      })
      .map(function (it) {
        return {
          id: it.id,
          name: it.name,
          category: it.category,
          price: it.price,
          uses: it.uses,
          desc: it.desc,
          effect: it.effect,
          decay: it.decay,
          owned: !!save.owned[it.id]
        };
      });
  };

  Core.buyItem = function (id) {
    var def = HY.items[id];
    if (!def || !def.shop) return { ok: false, error: "商店不出售该道具" };
    if (save.owned[id]) return { ok: false, error: "已经拥有该道具" };
    if (save.cp < def.price) return { ok: false, error: "选择次数点不足（需要 " + def.price + "，当前 " + save.cp + "）" };
    save.cp -= def.price;
    save.owned[id] = true;
    persist();
    return { ok: true, cp: save.cp };
  };

  Core.getArchive = function () {
    var groups = [];
    HY.mapOrder.forEach(function (mid) {
      var m = HY.maps[mid];
      var rules = (m.rules || []).map(function (r) {
        return {
          id: r.id,
          group: r.group || "其他",
          title: r.title,
          text: r.text,
          unlocked: !!save.archives[r.id]
        };
      });
      groups.push({
        mapId: mid,
        mapTitle: m.title,
        route: m.route,
        total: rules.length,
        unlocked: rules.filter(function (r) { return r.unlocked; }).length,
        rules: rules
      });
    });
    return groups;
  };

  Core.getEmotionGallery = function () {
    var cats = (HY.world.fearCategories || []).slice();
    var byCat = {};
    cats.forEach(function (c) { byCat[c] = []; });
    Object.keys(HY.emotionRegistry).forEach(function (id) {
      var e = HY.emotionRegistry[id];
      if (!byCat[e.fear]) byCat[e.fear] = [];
      byCat[e.fear].push({
        id: id,
        name: e.name,
        fear: e.fear,
        quote: e.quote,
        desc: e.desc,
        mapId: e.mapId,
        mapTitle: mapName(e.mapId),
        unlocked: !!save.emotions[id]
      });
    });
    var total = Object.keys(HY.emotionRegistry).length;
    var unlocked = Object.keys(save.emotions).filter(function (id) { return HY.emotionRegistry[id]; }).length;
    return {
      total: total,
      unlocked: unlocked,
      groups: cats.map(function (c) {
        return {
          fear: c,
          items: byCat[c] || [],
          unlocked: (byCat[c] || []).filter(function (x) { return x.unlocked; }).length,
          total: (byCat[c] || []).length
        };
      }).filter(function (g) { return g.total > 0; })
    };
  };

  Core.getLore = function () {
    return HY.loreOrder.map(function (id) {
      var e = HY.lore[id];
      return {
        id: id,
        title: e.title,
        category: e.category,
        lines: e.lines,
        unlocked: !!save.lore[id]
      };
    });
  };

  /* 剧情解说档案：进入带 insight 的节点即收录 */
  Core.getInsightArchive = function () {
    var total = 0, found = 0;
    var groups = [];
    HY.mapOrder.forEach(function (mid) {
      var m = HY.maps[mid];
      var items = [];
      Object.keys(m.nodes).forEach(function (nid) {
        var node = m.nodes[nid];
        if (!node.insight) return;
        total++;
        var unlocked = !!(save.insights[mid] && save.insights[mid][nid]);
        if (unlocked) found++;
        items.push({
          nodeId: nid,
          chapter: node.chapter || "",
          title: node.insight.title,
          lines: node.insight.lines,
          unlocked: unlocked
        });
      });
      if (items.length) {
        groups.push({
          mapId: mid,
          mapTitle: m.title,
          route: m.route,
          total: items.length,
          unlocked: items.filter(function (x) { return x.unlocked; }).length,
          items: items
        });
      }
    });
    return { total: total, found: found, groups: groups };
  };

  Core.getProgress = function () {
    var totalEndings = 0;
    var foundEndings = 0;
    HY.mapOrder.forEach(function (mid) {
      totalEndings += Core.getMapEndingDefinitions(mid).length;
      foundEndings += Object.keys(save.endings[mid] || {}).length;
    });
    var totalEmotions = Object.keys(HY.emotionRegistry).length;
    var foundEmotions = Object.keys(save.emotions).filter(function (id) { return HY.emotionRegistry[id]; }).length;
    var totalRules = Object.keys(HY.ruleRegistry).length;
    var foundRules = Object.keys(save.archives).filter(function (id) { return HY.ruleRegistry[id]; }).length;
    var totalLore = HY.loreOrder.length;
    var foundLore = HY.loreOrder.filter(function (id) { return save.lore[id]; }).length;
    var insightArchive = Core.getInsightArchive();
    var clearedMaps = HY.mapOrder.filter(function (mid) { return save.clears[mid] && save.clears[mid].cleared; }).length;
    return {
      cp: save.cp,
      maps: HY.mapOrder.length,
      clearedMaps: clearedMaps,
      endings: foundEndings,
      endingsTotal: totalEndings,
      emotions: foundEmotions,
      emotionsTotal: totalEmotions,
      rules: foundRules,
      rulesTotal: totalRules,
      insights: insightArchive.found,
      insightsTotal: insightArchive.total,
      lore: foundLore,
      loreTotal: totalLore,
      runs: save.counters.runs,
      deaths: save.counters.deaths,
      trueEndings: save.counters.trueEndings,
      hiddenEndings: save.counters.hiddenEndings
    };
  };

  /* ---------------------------- 设置 / 存档管理 ---------------------------- */
  Core.getSettings = function () { return save.settings; };
  Core.setSetting = function (key, value) {
    save.settings[key] = value;
    persist();
  };

  Core.resetSave = function () {
    save = defaultSave();
    run = null;
    lastEnding = null;
    lastDeltas = null;
    persist();
    return { ok: true };
  };

  Core.exportSave = function () {
    try {
      var data = clone(save);
      data.run = null;
      return JSON.stringify(data);
    } catch (e) {
      return "";
    }
  };

  Core.importSave = function (text) {
    try {
      var data = JSON.parse(text);
      if (!data || typeof data !== "object" || typeof data.cp !== "number") return { ok: false, error: "存档格式不正确" };
      var fresh = defaultSave();
      save = {
        v: SAVE_VERSION,
        cp: data.cp,
        owned: data.owned || {},
        archives: data.archives || {},
        emotions: data.emotions || {},
        insights: data.insights || {},
        lore: data.lore || {},
        endings: data.endings || {},
        clears: data.clears || {},
        counters: data.counters || fresh.counters,
        settings: Object.assign({}, fresh.settings, data.settings || {}),
        lastMap: data.lastMap || "map01",
        run: null
      };
      run = null;
      refreshLoreUnlocks();
      persist();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: "存档解析失败" };
    }
  };

  Core.getLastDeltasSnapshot = function () { return lastDeltas; };
})();
