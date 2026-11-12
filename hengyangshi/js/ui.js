/* ============================================================
 * 恒仰市 · 规则怪谈  —  界面层
 * 依赖 js/engine.js 与 data/*.js；无外部资源，file:// 直接运行。
 * ============================================================ */
(function () {
  "use strict";

  var HY = window.HY;
  var Core = HY.Core;
  var app = document.getElementById("app");

  if (!Core) {
    app.innerHTML = '<div class="empty">引擎加载失败：请检查 js/engine.js 是否存在。</div>';
    return;
  }

  /* ---------------------------- 状态 ---------------------------- */
  var ui = {
    screen: "title",
    param: null,
    modal: null,
    ending: null,
    archiveTab: "all",
    openedLore: {},
    toastId: 0,
    typeTimer: null,
    openInsightFor: null,
    insightSighFor: null
  };

  var W = Core.getWorld();

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function lines(arr, cls) {
    return (arr || []).map(function (s) {
      return '<p class="' + (cls || "") + '">' + esc(s) + "</p>";
    }).join("");
  }
  function paras(arr) {
    return (arr || []).map(function (s) { return "<p>" + esc(s) + "</p>"; }).join("");
  }
  function fmtDelta(v) {
    return (v > 0 ? "+" : "") + v;
  }
  function deltaChips(d) {
    if (!d) return "";
    var out = [];
    if (d.infection) out.push('<span class="delta ' + (d.infection > 0 ? "bad" : "good") + '">感染 ' + fmtDelta(d.infection) + "</span>");
    if (d.sanity) out.push('<span class="delta ' + (d.sanity > 0 ? "good" : "bad") + '">精神 ' + fmtDelta(d.sanity) + "</span>");
    if (d.stamina) out.push('<span class="delta ' + (d.stamina > 0 ? "good" : "bad") + '">体力 ' + fmtDelta(d.stamina) + "</span>");
    return out.length ? '<div class="deltas">' + out.join("") + "</div>" : "";
  }
  function tagClass(tag) {
    var map = {
      "安全": "safe", "危险": "danger", "代价": "cost", "道具": "item",
      "异常": "weird", "情感": "emotion", "即死": "instant", "真相": "truth"
    };
    return map[tag] || "dim";
  }
  function statBar(key, val) {
    var def = W.statDefs[key];
    var low = false;
    if (key === "sanity") low = val <= 30;
    if (key === "stamina") low = val <= 30;
    if (key === "infection") low = val >= 70;
    return '<div class="statbar ' + key + (low ? " low" : "") + '">' +
      '<div class="sb-head"><span>' + def.icon + " · " + def.name + "</span><b>" + val + "</b></div>" +
      '<div class="track"><div class="fill" style="width:' + Math.max(0, Math.min(100, val)) + '%"></div></div>' +
      "</div>";
  }
  /* 不重绘整页、只同步顶部数值（用于阅读剧情解说后的即时扣减） */
  function syncHUD() {
    if (!document.querySelector) return;
    var view = Core.getView();
    if (!view) return;
    var stats = view.run.stats;
    [["infection", stats.infection], ["sanity", stats.sanity], ["stamina", stats.stamina]].forEach(function (pair) {
      var bar = document.querySelector(".statbar." + pair[0]);
      if (!bar) return;
      var num = bar.querySelector(".sb-head b");
      if (num) num.textContent = pair[1];
      var fill = bar.querySelector(".fill");
      if (fill) fill.style.width = Math.max(0, Math.min(100, pair[1])) + "%";
      var low = pair[0] === "infection" ? pair[1] >= 70 : pair[1] <= 30;
      bar.classList.toggle("low", low);
    });
    var head = document.querySelector(".play-chapter span[style*='margin-left:auto']");
    if (head) {
      head.textContent = "第 " + view.run.choicesMade + " 次选择 · 感染 " + stats.infection +
        " / 精神 " + stats.sanity + " / 体力 " + stats.stamina;
    }
  }
  function ownedCount() {
    var owned = Core.getSave().owned;
    return Object.keys(owned).filter(function (k) { return owned[k]; }).length;
  }
  function cpBadge() {
    return '<div class="cp" title="选择次数点：用于在补给商店永久购买道具"><span>选择次数点</span><b>' + Core.getCp() + "</b></div>";
  }
  function topbar(crumb) {
    return '<div class="topbar">' +
      '<div class="logo" data-act="nav" data-to="home">恒仰市（点我返回）</div>' +
      '<div class="crumb">' + esc(crumb || "") + "</div>" +
      cpBadge() +
      '<button class="icon-btn" data-act="nav" data-to="settings" title="设置">⚙</button>' +
      "</div>";
  }
  function page(inner, crumb, opts) {
    opts = opts || {};
    return (opts.noTop ? "" : topbar(crumb)) +
      '<div class="wrap ' + (opts.wrapClass || "") + '">' + inner + "</div>" +
      (opts.noFoot ? "" : footerNote());
  }
  function footerNote() {
    return '<div class="wrap"><div class="footer-note">' +
      "恒仰市 · 规则怪谈　|　纯文字多选恐怖冒险　|　存档保存在本机浏览器" +
      "<br>本作为基于 B 站《恒仰市》系列规则怪谈视频文字稿的二次创作同人游戏。所有地名、机构、人物均为虚构。" +
      "</div></div>";
  }

  /* ---------------------------- 标题 ---------------------------- */
  function renderTitle() {
    var tl = (W.titleLines || []).map(function (s) { return "<p>" + esc(s) + "</p>"; }).join("");
    return '<div class="title-screen" data-act="nav" data-to="home">' +
      '<div class="title-mark">' + esc(W.title || "恒仰市") + "</div>" +
      '<div class="title-sub">' + esc(W.subtitle || "规则怪谈 · 文字冒险") + "</div>" +
      '<div class="title-lines">' + tl + "</div>" +
      '<div class="title-enter">点 击 进 入</div>' +
      '<div class="title-warning">' + esc(W.warning || "") + "</div>" +
      "</div>";
  }

  /* ---------------------------- 首页 ---------------------------- */
  function renderHome() {
    var p = Core.getProgress();
    var resume = Core.getActiveRunInfo();
    var cells = [
      { k: "地图", v: p.clearedMaps + " <small>/ " + p.maps + " 已通关</small>" },
      { k: "结局", v: p.endings + " <small>/ " + p.endingsTotal + "</small>" },
      { k: "情绪卡", v: p.emotions + " <small>/ " + p.emotionsTotal + "</small>" },
      { k: "剧情解说", v: p.insights + " <small>/ " + p.insightsTotal + "</small>" },
      { k: "规则档案", v: p.rules + " <small>/ " + p.rulesTotal + "</small>" },
      { k: "恒仰市志", v: p.lore + " <small>/ " + p.loreTotal + "</small>" },
      { k: "选择次数点", v: p.cp + " <small>可购买道具</small>" }
    ].map(function (c) {
      return '<div class="progress-cell"><div class="k">' + c.k + '</div><div class="v">' + c.v + "</div></div>";
    }).join("");

    var resumeBar = resume ? '<div class="resume-bar">' +
      '<span class="dot"></span>' +
      '<div class="info"><b>进行中的探索 · 《' + esc(resume.mapTitle) + "》</b>" +
      "<span>" + esc(resume.chapter) + "　|　已做出 " + resume.choicesMade + " 次选择　|　感染 " +
      resume.stats.infection + " · 精神 " + resume.stats.sanity + " · 体力 " + resume.stats.stamina + "</span></div>" +
      '<button class="btn small gold" data-act="resume">继续探索</button>' +
      '<button class="btn small ghost" data-act="abandon">放弃</button>' +
      "</div>" : "";

    var menu = [
      { to: "maps", glyph: "图", t: "开始探索", d: "11 张地图，对应 11 份守则与视频剧情解说" },
      { to: "shop", glyph: "货", t: "补给商店", d: "用选择次数点永久购买道具；每次入图自动携带" },
      { to: "archive", glyph: "规", t: "规则档案", d: "收集每张地图的守则原文与补充条款" },
      { to: "insights", glyph: "解", t: "剧情解说", d: "逐段收录每张地图的剧情解说，读懂原视频故事" },
      { to: "emotions", glyph: "惧", t: "恐惧图鉴", d: "收集恐惧与复杂情绪，理解每个故事为什么可怕" },
      { to: "lore", glyph: "志", t: "恒仰市志", d: "通关后逐步解锁的世界观真相与人物档案" },
      { to: "help", glyph: "?", t: "玩法说明", d: "数值、门槛、道具、结局与推荐路线" },
      { to: "settings", glyph: "设", t: "设置与存档", d: "文字速度、导出/导入、清空存档" }
    ].map(function (m) {
      return '<div class="menu-card" data-act="nav" data-to="' + m.to + '">' +
        '<div class="glyph">' + m.glyph + "</div>" +
        '<div><div class="t">' + m.t + '</div><div class="d">' + m.d + "</div></div>" +
        '<div class="arrow">›</div></div>';
    }).join("");

    var inner = '<div class="home-hero">' +
      '<h1 class="home-title">' + esc(W.title || "恒仰市") + "</h1>" +
      '<div class="home-sub">' + esc(W.subtitle || "规则怪谈 · 文字冒险") + "</div>" +
      '<div class="home-tag">' + esc(W.tagline || "请仔细阅读并遵守以下规则。") + "</div>" +
      '<div class="progress-grid">' + cells + "</div>" +
      "</div>" + resumeBar +
      '<div class="section-title">安全屋 <small>在这里做出的决定，城市看不见</small></div>' +
      '<div class="menu-grid">' + menu + "</div>";

    if (!Core.storageOK()) {
      inner += '<div class="panel" style="margin-top:20px;border-color:#4a2621"><div class="tiny" style="color:#d98b80">⚠ 浏览器阻止了本地存档（localStorage）。本次进度将在关闭页面后丢失。请尝试用 Chrome / Edge 打开，或检查隐私设置。</div></div>';
    }
    if (Core.getCp() < 10 && p.runs === 0) {
      inner += '<div class="panel" style="margin-top:20px"><div class="tiny muted">第一次进入恒仰市，总部先预支了 <b style="color:var(--gold)">18</b> 选择次数点。补给商店里最便宜的「创可贴与纱布」只要 6 点——不过，建议你先看看地图。</div></div>';
    }
    return page(inner, "安全屋");
  }

  /* ---------------------------- 地图选择 ---------------------------- */
  function renderMaps() {
    var list = Core.getMapList();
    var byId = {};
    list.forEach(function (m) { byId[m.id] = m; });
    var routes = (W.routes || []);
    var blocks = routes.map(function (r) {
      var cards = (r.maps || []).filter(function (id) { return byId[id]; }).map(function (id) {
        return mapCard(byId[id]);
      }).join("");
      return '<div class="route-block"><div class="route-head"><span class="name">' + esc(r.name) + "</span>" +
        '<span class="desc">' + esc(r.desc) + "</span></div>" +
        '<div class="map-grid">' + cards + "</div></div>";
    }).join("");

    /* 未归入路线的地图（防御性） */
    var included = {};
    routes.forEach(function (r) { (r.maps || []).forEach(function (id) { included[id] = true; }); });
    var extra = list.filter(function (m) { return !included[m.id]; });
    if (extra.length) {
      blocks += '<div class="route-block"><div class="route-head"><span class="name">其他</span></div><div class="map-grid">' +
        extra.map(mapCard).join("") + "</div></div>";
    }

    var inner = '<div class="section-title">选择地图 <small>11 份守则，11 种死法</small></div>' +
      '<div class="panel tiny muted" style="margin-bottom:22px">每张地图对应一部原视频的文字剧情解说。地图之间共享同一座「恒仰市」的世界观，' +
      "但可以自由选择顺序；地图内的道具与证物会随存档保留。建议先走完一条路线，再回头收集其他结局。" +
      "终章《春晚倒计时》的隐藏结局需要其他地图的证物。</div>" +
      blocks;
    return page(inner, "地图选择");
  }

  function mapCard(m) {
    var diff = "";
    for (var i = 1; i <= 5; i++) diff += '<i class="' + (i <= (m.difficulty || 0) ? "on" : "") + '"></i>';
    var tags = (m.fearTags || []).map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("");
    var types = (m.types || []);
    var hasTrue = types.indexOf("true") >= 0 || types.indexOf("hidden") >= 0;
    return '<div class="map-card ' + (m.id === "map11" ? "final" : "") + '" data-act="brief" data-map="' + m.id + '">' +
      '<div class="no">' + String(m.no || "").padStart(2, "0") + "</div>" +
      '<div class="mc-top"><span class="mc-title">' + esc(m.title) + "</span>" +
      (m.cleared ? '<span class="cleared-badge">已通关</span>' : "") + "</div>" +
      '<div class="mc-sub">' + esc(m.subtitle) + "</div>" +
      '<div class="mc-meta">' + tags + "</div>" +
      '<div class="mc-foot"><span class="diff">' + diff + "</span>" +
      '<span class="progress">结局 ' + m.endingsFound + " / " + m.endingsTotal +
      (hasTrue ? '　<span style="color:var(--gold)">真相已解</span>' : "") + "</span></div>" +
      "</div>";
  }

  /* ---------------------------- 进图简报 ---------------------------- */
  function renderBrief(mapId) {
    var d = Core.getMapDetail(mapId);
    if (!d) return page('<div class="empty">地图不存在</div>', "地图");
    var m = Core.getMap(mapId);
    var diff = "";
    for (var i = 1; i <= 5; i++) diff += '<i class="' + (i <= d.difficulty ? "on" : "") + '"></i>';
    var fearTags = (d.fearTags || []).map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join(" ");

    /* 携带道具 */
    var save = Core.getSave();
    var carried = Object.keys(save.owned).filter(function (id) { return save.owned[id] && HY.items[id]; });
    (d.startItems || []).forEach(function (id) { if (HY.items[id] && carried.indexOf(id) < 0) carried.push(id); });
    var itemChips = carried.length ? carried.map(function (id) {
      var it = HY.items[id];
      return '<span class="item-chip">' + esc(it.name) + "<small>×" + (it.uses || 1) + "</small></span>";
    }).join("") : '<span class="muted tiny">没有携带任何道具（可以在补给商店购买）</span>';

    var activeRun = Core.hasActiveRun();
    var activeInfo = Core.getActiveRunInfo();
    var sameMap = activeRun && activeInfo.mapId === mapId;

    var warn = "";
    if (activeRun) {
      warn += '<div class="panel" style="border-color:#4a3d23;margin-bottom:16px"><div class="tiny" style="color:#c0a267">' +
        "⚠ 你还有一局进行中的探索：《" + esc(activeInfo.mapTitle) + "》 · " + esc(activeInfo.chapter) + "。" +
        "请先继续或放弃当前探索，再进入新地图。</div></div>";
    }
    if (mapId === "map11") {
      var evidence = ["it_badge_tsp", "it_ticket_half", "it_pass_outside", "it_stabilizer", "it_raft_cord",
        "it_chisel", "it_redfruit", "it_geology", "it_diary_zhou", "it_black_envelope"].filter(function (id) { return save.owned[id]; });
      warn += '<div class="panel" style="border-color:rgba(168,48,42,.4);margin-bottom:16px"><div class="tiny" style="color:#d98b80">' +
        "终章 · 这是所有路线的收束。你目前持有 <b>" + evidence.length + "</b> / 10 件跨图证物。" +
        (evidence.length < 6 ? " 隐藏结局需要至少 6 件证物——先去别的路线走一走，会看到不一样的节目。" : " 你已经有了改写节目单的资格。") +
        "</div></div>";
    }

    var startBtn = sameMap
      ? '<button class="btn gold" data-act="resume">继续当前探索</button>'
      : '<button class="btn primary" data-act="run:start" data-map="' + mapId + '"' + (activeRun ? " disabled" : "") + '>进入地图</button>';

    var inner = '<div class="brief-head">' +
      '<div class="bh-no">第 ' + d.no + " 图 · " + esc(d.route) + '</div>' +
      "<h1>" + esc(d.title) + "</h1>" +
      '<div class="bh-sub">' + esc(d.subtitle) + "</div>" +
      '<div class="bh-meta">来源视频：' + esc(d.source && d.source.title) + "（" + esc(d.source && d.source.bv) + "）" +
      "<br>难度 <span class=\"diff\" style=\"display:inline-flex;vertical-align:-1px;margin:0 4px\">" + diff + "</span>" +
      "　恐惧标签 " + fearTags + "</div>" +
      "</div>" +
      warn +
      '<div class="brief-summary">' + esc(d.summary) + "</div>" +
      '<div class="brief-cols">' +
      '<div class="panel"><div class="tiny" style="color:var(--gold);letter-spacing:2px;margin-bottom:6px">进入时的数值</div>' +
      '<ul class="brief-list">' +
      '<li><span class="k">感染值</span><span class="v">' + m.initial.infection + " / 100　满值即异变</span></li>" +
      '<li><span class="k">精神值</span><span class="v">' + m.initial.sanity + " / 100　归零即崩溃</span></li>" +
      '<li><span class="k">体力值</span><span class="v">' + m.initial.stamina + " / 100　只降不升，归零即死</span></li>" +
      '<li><span class="k">内容量</span><span class="v">' + d.nodesCount + " 个节点 · " + d.rulesCount + " 条规则 · " + d.emotionsCount + " 张情绪卡 · " + (d.insightsCount || 0) + " 段剧情解说 · " + d.endingsTotal + " 个结局</span></li>" +
      "</ul></div>" +
      '<div class="panel"><div class="tiny" style="color:var(--gold);letter-spacing:2px;margin-bottom:6px">携带的道具（每次入图全部带入）</div>' +
      '<div class="item-chips">' + itemChips + "</div>" +
      '<div class="tiny muted" style="margin-top:10px">道具的使用次数每次入图重置；没有道具也能通关，但有些门只有在正确的道具面前才打开。</div>' +
      "</div></div>" +
      '<div class="brief-start">' + startBtn +
      '<button class="btn ghost" data-act="nav" data-to="maps">返回地图选择</button>' +
      (activeRun && sameMap ? '<button class="btn ghost" data-act="abandon">放弃当前探索</button>' : "") +
      "</div>";
    return page(inner, "第 " + d.no + " 图 · " + d.title);
  }

  /* ---------------------------- 游戏中 ---------------------------- */
  function renderPlay() {
    var view = Core.getView();
    if (!view) { ui.screen = "home"; return renderHome(); }
    var deltas = view.deltas;
    Core.clearDeltas();
    var m = view.map;
    var node = view.node;
    var linesHtml = lines(node.lines, "scene-line");
    var whisperHtml = (view.lowSanity && node.whisper && node.whisper.length)
      ? '<div class="conditional whisper">' + paras(node.whisper) + "</div>" : "";
    var driftHtml = (view.highInfection && node.drift && node.drift.length)
      ? '<div class="conditional">' + paras(node.drift) + "</div>" : "";
    if (ui.openInsightFor && ui.openInsightFor !== node.id) { ui.openInsightFor = null; ui.insightSighFor = null; }
    var showHints = Core.hasChoiceHints();
    var insightHtml = "";
    if (node.insight) {
      var open = ui.openInsightFor === node.id;
      var sigh = open && ui.insightSighFor === node.id ? '<p class="insight-sigh">让我缓缓</p>' : "";
      insightHtml = '<div class="insight-box' + (open ? " open" : "") + '" data-insight data-node="' + esc(node.id) + '">' +
        '<div class="ib-head" data-act="toggle-insight"><span>▣ 剧情解说</span><span>' + esc(node.insight.title) + "</span>" +
        '<span class="arrow">▶</span></div>' +
        '<div class="ib-body">' + sigh + paras(node.insight.lines) + "</div></div>";
    }
    var resultHtml = (view.resultLines && view.resultLines.length)
      ? '<div class="result-box">' + paras(view.resultLines) + "</div>" : "";
    var choicesHtml = view.choices.map(function (c) {
      var tag = showHints ? '<span class="tag ' + tagClass(c.tag) + '">' + esc(c.tag) + "</span>" : "";
      if (!c.enabled) {
        return '<div class="choice locked">' +
          '<div class="c-top"><span class="c-num">—</span>' + tag + "</div>" +
          '<div class="c-text">' + esc(c.text) + "</div>" +
          '<div class="c-lock">✕ ' + (showHints ? esc(c.lockText || "条件不足") : "条件不明（购买「守则批注本」后可见）") + "</div></div>";
      }
      var hintHtml = showHints && c.hint ? '<span class="tiny muted" style="margin-left:auto">' + esc(c.hint) + "</span>" : "";
      return '<button class="choice ' + (showHints && (c.tag === "即死" || c.tag === "危险") ? "danger-choice" : "") + '" data-act="play:choose" data-index="' + c.index + '">' +
        '<div class="c-top"><span class="c-num">' + c.displayNo + "</span>" + tag + hintHtml + "</div>" +
        '<div class="c-text">' + esc(c.text) + "</div>" +
        "</button>";
    }).join("");

    var hiddenHint = showHints && view.hiddenCount > 0
      ? '<div class="hidden-hint">有些选择，你此刻还触碰不到。（' + view.hiddenCount + " 个选项因条件不足被跳过）</div>" : "";

    var stats = view.run.stats;
    var inner = '<div class="play-top">' +
      '<div class="play-chapter"><span class="map-name">《' + esc(m.title) + "》</span><span>" + esc(node.chapter || "") + "</span>" +
      '<span style="margin-left:auto">第 ' + view.run.choicesMade + " 次选择 · 感染 " + stats.infection + " / 精神 " + stats.sanity + " / 体力 " + stats.stamina + "</span></div>" +
      '<div class="play-hud">' + statBar("infection", stats.infection) + statBar("sanity", stats.sanity) + statBar("stamina", stats.stamina) +
      '<div class="play-actions">' +
      '<button class="mini-btn" data-act="items">道具</button>' +
      '<button class="mini-btn" data-act="log">记录</button>' +
      '<button class="mini-btn" data-act="exit">离开（保存）</button>' +
      "</div></div></div>" +
      '<div class="wrap play">' +
      '<div class="scene">' +
      '<div class="scene-chapter">' + esc(node.chapter || "") + "</div>" +
      resultHtml + deltaChips(deltas) +
      '<div class="scene-lines">' + linesHtml + "</div>" +
      whisperHtml + driftHtml + insightHtml +
      '<div class="choices"><div class="choices-head">你要怎么做？</div>' + choicesHtml + hiddenHint + "</div>" +
      "</div></div>" +
      '<div class="play-foot"><span>选择会立刻生效，无法撤销。</span><span class="spacer"></span><span>自动存档中 · 可随时离开再继续</span></div>';

    return inner;
  }

  function renderItemsModal() {
    if (!ui.modal || ui.modal.type !== "items") return "";
    var inv = Core.getInventoryView();
    var body = inv.length ? '<div class="inv-list">' + inv.map(function (it) {
      var effectText = "";
      if (it.effect) {
        var parts = [];
        if (it.effect.infection) parts.push("感染 " + fmtDelta(it.effect.infection));
        if (it.effect.sanity) parts.push("精神 " + fmtDelta(it.effect.sanity));
        if (it.effect.stamina) parts.push("体力 " + fmtDelta(it.effect.stamina));
        effectText = '<div class="ii-uses">使用效果：' + parts.join(" / ") + "　剩余 " + it.uses + " 次</div>";
      } else {
        effectText = '<div class="ii-uses" style="color:var(--dim)">本道具不能在此时直接使用，它会在特定选择里生效。剩余 ' + it.uses + " 次</div>";
      }
      return '<div class="inv-item"><div class="ii-main"><div class="ii-name">' + esc(it.name) +
        '<span class="tag">' + esc(it.category) + "</span></div>" +
        '<div class="ii-desc">' + esc(it.desc) + "</div>" + effectText + "</div>" +
        (it.usable ? '<button class="btn small gold ii-btn" data-act="item:use" data-id="' + it.id + '">使用</button>' : "") +
        "</div>";
    }).join("") + "</div>" : '<div class="empty">你什么也没有带。</div>';
    return modalShell("随身道具", body, '<button class="btn small ghost" data-act="modal:close">关闭</button>');
  }

  function renderLogModal() {
    if (!ui.modal || ui.modal.type !== "log") return "";
    var view = Core.getView();
    var made = view ? [] : [];
    var log = Core.getSave().run && Core.getSave().run.choices ? Core.getSave().run.choices : [];
    /* 使用引擎内存 run 的 choices（存档里的 run 与内存同步） */
    var body = log.length ? '<div class="log-list">' + log.map(function (c, i) {
      return '<div class="log-item"><span class="li-tag">#' + (i + 1) + "</span>" + esc(c.text) +
        '<span class="li-title">' + esc(c.nodeTitle || "") + "</span></div>";
    }).join("") + "</div>" : '<div class="empty">还没有做出任何选择。</div>';
    return modalShell("选择记录", body, '<button class="btn small ghost" data-act="modal:close">关闭</button>');
  }

  function modalShell(title, body, foot) {
    return '<div class="modal-mask" data-act="modal:mask"><div class="modal" data-stop="1">' +
      '<div class="modal-head"><span class="mh-title">' + esc(title) + "</span>" +
      '<button class="icon-btn mh-close" data-act="modal:close">✕</button></div>' +
      '<div class="modal-body">' + body + "</div>" +
      (foot ? '<div class="modal-foot">' + foot + "</div>" : "") +
      "</div></div>";
  }

  /* ---------------------------- 结局 ---------------------------- */
  function renderEnding() {
    var data = ui.ending;
    if (!data) { ui.screen = "home"; return renderHome(); }
    var e = data.ending;
    var stampMap = { death: "", fail: "ash", become: "green", escape: "blue", true: "gold", hidden: "violet" };
    var stampCls = stampMap[e.type] || "";
    var analysis = (e.analysis || []).map(function (a) {
      if (a && a.title) {
        return '<div class="analysis-block"><h4>' + esc(a.title) + "</h4>" + paras(a.lines) + "</div>";
      }
      return '<div class="analysis-block"><p>' + esc(a) + "</p></div>";
    }).join("");
    var emotionNames = (data.newEmotions || []).map(function (id) {
      var em = HY.emotionRegistry[id];
      return em ? '<span class="tag gold">' + esc(em.name) + "</span>" : "";
    }).join(" ");
    var itemNames = (data.newItems || []).map(function (id) {
      var it = HY.items[id];
      return it ? '<span class="tag gold">' + esc(it.name) + "</span>" : "";
    }).join(" ");
    var cpRows = (data.cpBreakdown || []).map(function (r) {
      return '<div class="row"><span>' + esc(r.label) + "</span><b>+" + r.value + "</b></div>";
    }).join("");
    var choiceLog = (data.choices || []).map(function (c, i) {
      return "<li><b>" + esc(c.text) + "</b><br><span>" + esc(c.nodeTitle || "") + "</span></li>";
    }).join("");
    var map = Core.getMap(data.mapId);
    var finalNote = map && map.finalNote ? '<div class="ending-final-note">' + esc(map.finalNote) + "</div>" : "";

    var inner = '<div class="ending-screen">' +
      '<span class="ending-stamp ' + stampCls + '">' + esc(e.stamp || "结局") + "</span>" +
      '<h1 class="ending-title">' + esc(e.title) + "</h1>" +
      (e.subtitle ? '<div class="ending-sub">' + esc(e.subtitle) + "</div>" : "") +
      '<div class="ending-lines">' + lines(e.lines) + "</div>" +
      '<div class="ending-stats">' +
      '<div class="es"><div class="k">感染值</div><div class="v">' + data.stats.infection + " / 100</div></div>" +
      '<div class="es"><div class="k">精神值</div><div class="v">' + data.stats.sanity + " / 100</div></div>" +
      '<div class="es"><div class="k">体力值</div><div class="v">' + data.stats.stamina + " / 100</div></div>" +
      '<div class="es"><div class="k">做出选择</div><div class="v">' + (data.choices || []).length + " 次</div></div>" +
      "</div>" +
      '<div class="reward-block"><h4>选择次数点结算</h4><div class="reward-list">' + cpRows +
      '<div class="row" style="border-top:1px dashed var(--line);padding-top:8px;margin-top:4px"><span>本次获得</span><b>+' + data.cpGained + "</b></div>" +
      '<div class="row"><span>当前持有</span><b>' + Core.getCp() + "</b></div>" +
      "</div>" +
      (emotionNames ? '<div style="margin-top:14px"><div class="tiny muted">解锁情绪卡</div><div style="margin-top:6px">' + emotionNames + "</div></div>" : "") +
      (itemNames ? '<div style="margin-top:14px"><div class="tiny muted">永久获得的证物（下次入图自动携带）</div><div style="margin-top:6px">' + itemNames + "</div></div>" : "") +
      "</div>" +
      (analysis ? '<div class="ending-analysis"><div class="section-title">剧情解说与复盘</div>' + analysis + "</div>" : "") +
      (choiceLog ? '<div class="ending-choice-log"><h4>你走过的路</h4><ol>' + choiceLog + "</ol></div>" : "") +
      finalNote +
      '<div class="brief-start">' +
      '<button class="btn primary" data-act="ending:home">返回安全屋</button>' +
      '<button class="btn" data-act="ending:retry" data-map="' + data.mapId + '">重新探索本图</button>' +
      '<button class="btn ghost" data-act="nav" data-to="maps">选择其他地图</button>' +
      "</div></div>";
    return page(inner, "结局 · " + e.title);
  }

  /* ---------------------------- 商店 ---------------------------- */
  function renderShop() {
    var items = Core.getShopItems();
    var cats = ["回复", "稳定", "护身", "事件"];
    var catDesc = {
      "回复": "恢复精神值。注意：体力值无法通过任何道具回复。",
      "稳定": "抑制感染值，或在异变中把自己拉回来。",
      "护身": "关键时刻替你挡下一次注视、一次污染或一次融合。",
      "事件": "不直接改变数值，但能打开原本不存在的选择。"
    };
    var blocks = cats.map(function (cat) {
      var list = items.filter(function (i) { return i.category === cat; });
      if (!list.length) return "";
      return '<div class="shop-cat"><div class="section-title">' + cat + " <small>" + catDesc[cat] + "</small></div>" +
        '<div class="shop-grid">' + list.map(shopCard).join("") + "</div></div>";
    }).join("");

    var inner = '<div class="shop-head"><div><h1>补给商店</h1>' +
      '<div class="tiny muted" style="margin-top:6px">营业时间：永远。店主：不记得自己是谁。</div></div>' +
      '<div class="shop-balance"><div class="k">选择次数点</div><div class="v">' + Core.getCp() + "</div></div></div>" +
      '<div class="shop-note">购买是<b style="color:var(--gold)">永久</b>的：只要买下，之后每次进入任意地图都会自动携带该道具，' +
      "每局的使用次数按道具说明重置。<br>选择次数点来自结局结算、首次通关与首次收集情绪卡。" +
      "<br><b style=\"color:var(--gold)\">「守则批注本」（100 点）</b>是本店最重要的一件商品：购买后，选项才会显示“安全 / 危险 / 情感 / 道具”等标签与小字提示。" +
      "<br><b style=\"color:#d98b80\">体力值不可恢复</b>——没有任何商品能让你多走一步，商品只能让你少走错一步。</div>" +
      blocks;
    return page(inner, "补给商店");
  }

  function shopCard(it) {
    var effectParts = [];
    if (it.effect) {
      if (it.effect.infection) effectParts.push("感染 " + fmtDelta(it.effect.infection));
      if (it.effect.sanity) effectParts.push("精神 " + fmtDelta(it.effect.sanity));
      if (it.effect.stamina) effectParts.push("体力 " + fmtDelta(it.effect.stamina));
    }
    var effectText = effectParts.length ? effectParts.join(" / ") : "无直接数值效果 · 用于触发特定选择";
    if (it.decay) effectText += "　（使用 " + it.decay.after + " 次后可能变异）";
    return '<div class="shop-item ' + (it.owned ? "owned" : "") + '">' +
      '<div class="si-top"><span class="si-name">' + esc(it.name) + "</span>" +
      '<span class="tag">' + esc(it.category) + "</span>" +
      '<span class="si-price">' + (it.owned ? "已拥有" : it.price + " 点") + "</span></div>" +
      '<div class="si-desc">' + esc(it.desc) + "</div>" +
      '<div class="si-effect">' + esc(effectText) + "</div>" +
      '<div class="si-foot"><span class="uses">每局 ' + it.uses + " 次</span>" +
      (it.owned
        ? '<button class="btn small ghost" disabled>永久拥有</button>'
        : '<button class="btn small ' + (Core.getCp() >= it.price ? "gold" : "ghost") + '" data-act="shop:buy" data-id="' + it.id + '"' +
        (Core.getCp() >= it.price ? "" : " disabled") + ">购买</button>") +
      "</div></div>";
  }

  /* ---------------------------- 剧情解说档案 ---------------------------- */
  function renderInsights() {
    var g = Core.getInsightArchive();
    var groups = g.groups.map(function (grp) {
      var items = grp.items.map(function (it) {
        if (!it.unlocked) {
          return '<div class="rule-entry locked"><div class="re-head"><span class="re-group">' + esc(it.chapter || "剧情解说") + "</span>" +
            '<span class="re-title">？？？ · 尚未收录</span></div>' +
            '<div class="re-text">在《' + esc(grp.mapTitle) + "》中走到对应节点即可收录这段解说。</div></div>";
        }
        return '<div class="rule-entry"><div class="re-head"><span class="re-group">' + esc(it.chapter || "剧情解说") + "</span>" +
          '<span class="re-title">' + esc(it.title) + "</span></div>" +
          '<div class="re-text">' + esc((it.lines || []).join("\n\n")) + "</div></div>";
      }).join("");
      return '<div class="archive-map"><div class="archive-map-head"><span class="am-title">《' + esc(grp.mapTitle) + "》</span>" +
        '<span class="tag">' + esc(grp.route) + "</span>" +
        '<span class="am-count">' + grp.unlocked + " / " + grp.total + "</span></div>" + items + "</div>";
    }).join("");
    var inner = '<div class="section-title">剧情解说档案 <small>已收录 ' + g.found + " / " + g.total + " 段</small></div>" +
      '<div class="panel tiny muted" style="margin-bottom:20px">游戏里的每一段「剧情解说」，都是把原视频这一段故事讲给没看过的人听：' +
      "规则为什么这样定、这个人真正在做什么、这一幕在整座城市里意味着什么。走到对应节点即可永久收录。" +
      "<br>注意：在游戏中展开解说会消耗 1 点精神与 1 点体力；收录之后，在本档案里回看不再消耗任何数值。</div>" + groups;
    return page(inner, "剧情解说档案");
  }

  /* ---------------------------- 规则档案 ---------------------------- */
  function renderArchive() {
    var all = Core.getArchive();
    var totalU = 0, totalT = 0;
    all.forEach(function (g) { totalU += g.unlocked; totalT += g.total; });
    var tabs = '<div class="tabs"><button class="tab ' + (ui.archiveTab === "all" ? "active" : "") + '" data-act="archive:tab" data-tab="all">全部</button>' +
      all.map(function (g) {
        return '<button class="tab ' + (ui.archiveTab === g.mapId ? "active" : "") + '" data-act="archive:tab" data-tab="' + g.mapId + '">' + esc(g.mapTitle) + "</button>";
      }).join("") + "</div>";

    var groups = all.filter(function (g) { return ui.archiveTab === "all" || g.mapId === ui.archiveTab; }).map(function (g) {
      var rules = g.rules.map(function (r) {
        if (!r.unlocked) {
          return '<div class="rule-entry locked"><div class="re-head"><span class="re-group">' + esc(r.group) + "</span>" +
            '<span class="re-title">？？？ · 尚未解锁</span></div>' +
            '<div class="re-text">在对应地图中走到特定节点即可解锁这条规则。</div></div>';
        }
        return '<div class="rule-entry"><div class="re-head"><span class="re-group">' + esc(r.group) + "</span>" +
          '<span class="re-title">' + esc(r.title) + "</span></div>" +
          '<div class="re-text">' + esc(r.text) + "</div></div>";
      }).join("");
      return '<div class="archive-map"><div class="archive-map-head"><span class="am-title">《' + esc(g.mapTitle) + "》</span>" +
        '<span class="tag">' + esc(g.route) + "</span>" +
        '<span class="am-count">' + g.unlocked + " / " + g.total + "</span></div>" + rules + "</div>";
    }).join("");

    var inner = '<div class="section-title">规则档案 <small>已收录 ' + totalU + " / " + totalT + " 条守则</small></div>" +
      '<div class="panel tiny muted" style="margin-bottom:20px">守则既是保护，也是流程。收集它们，你会看见同一份规则在不同地图里如何互相矛盾——' +
      "而矛盾本身就是恒仰市的破绽。</div>" + tabs + groups;
    return page(inner, "规则档案");
  }

  /* ---------------------------- 情绪图鉴 ---------------------------- */
  function renderEmotions() {
    var g = Core.getEmotionGallery();
    var groups = g.groups.map(function (group) {
      var cards = group.items.map(function (e) {
        if (!e.unlocked) {
          return '<div class="emotion-card locked"><div class="ec-quote">「……」</div>' +
            '<div class="ec-name">未记录的情绪</div>' +
            '<div class="ec-desc">在《' + esc(e.mapTitle) + "》中经历特定情节后解锁。</div>" +
            '<div class="ec-src">来源：' + esc(e.mapTitle) + "</div></div>";
        }
        return '<div class="emotion-card"><div class="seal">已收录</div>' +
          '<div class="ec-quote">' + esc(e.quote) + "</div>" +
          '<div class="ec-name">' + esc(e.name) + "</div>" +
          '<div class="ec-desc">' + esc(e.desc) + "</div>" +
          '<div class="ec-src">来源：' + esc(e.mapTitle) + "</div></div>";
      }).join("");
      return '<div class="emotion-group"><div class="emotion-group-head"><span class="eg-name">' + esc(group.fear) + "</span>" +
        '<span class="tag">' + group.unlocked + " / " + group.total + "</span></div>" +
        '<div class="emotion-grid">' + cards + "</div></div>";
    }).join("");
    var inner = '<div class="section-title">恐惧图鉴 <small>已收集 ' + g.unlocked + " / " + g.total + " 种情绪</small></div>" +
      '<div class="panel tiny muted" style="margin-bottom:22px">恐惧不是怪物，是关系。每一张情绪卡都来自原视频里一个具体的人、' +
      "一个具体的瞬间——被替代的亲人、慢半拍的倒影、笑着叫你回家的母亲。</div>" + groups;
    return page(inner, "恐惧图鉴");
  }

  /* ---------------------------- 恒仰市志 ---------------------------- */
  function renderLore() {
    var list = Core.getLore();
    var unlocked = list.filter(function (x) { return x.unlocked; }).length;
    var body = list.map(function (x) {
      if (!x.unlocked) {
        return '<div class="lore-entry locked"><div class="le-head"><span class="le-cat">未解锁</span>' +
          '<span class="le-title">？？？</span><span class="le-arrow">▾</span></div></div>';
      }
      var open = ui.openedLore[x.id];
      return '<div class="lore-entry' + (open ? " open" : "") + '"><div class="le-head" data-act="lore:toggle" data-id="' + x.id + '">' +
        '<span class="le-cat">' + esc(x.category) + "</span>" +
        '<span class="le-title">' + esc(x.title) + '</span><span class="le-arrow">' + (open ? "▴" : "▾") + "</span></div>" +
        '<div class="le-body">' + paras(x.lines) + "</div></div>";
    }).join("");
    var inner = '<div class="section-title">恒仰市志 <small>已解锁 ' + unlocked + " / " + list.length + "</small></div>" +
      '<div class="panel tiny muted" style="margin-bottom:22px">这是本作的统一世界观档案：把 11 个视频里散落的线索拼在一起，' +
      "你会得到一座城市的完整肖像——以及一个不太妙的结论。</div><div class=\"lore-list\">" + body + "</div>";
    return page(inner, "恒仰市志");
  }

  /* ---------------------------- 设置 ---------------------------- */
  function renderSettings() {
    var s = Core.getSettings();
    var hasHints = Core.hasChoiceHints();
    var inner = '<div class="section-title">设置与存档</div>' +
      '<div class="panel" style="padding:6px 20px">' +
      '<div class="setting-row"><div class="sr-info"><div class="sr-name">逐字显示正文</div>' +
      '<div class="sr-desc">像旧式文字冒险一样一个字一个字出现；点击正文可立即显示全部。默认关闭。</div></div>' +
      '<div class="switch ' + (s.typewriter ? "on" : "") + '" data-act="setting:toggle" data-key="typewriter"></div></div>' +
      '<div class="setting-row"><div class="sr-info"><div class="sr-name">选择提示</div>' +
      '<div class="sr-desc">选项的“安全 / 危险 / 情感 / 道具”标签与小字提示属于稀有信息，需要购买「守则批注本」后才会显示。当前：' +
      (hasHints ? '<b style="color:var(--gold)">已解锁</b>（守则批注本）' : '<b style="color:#d98b80">未解锁</b>（在补给商店购买，100 选择次数点）') +
      "</div></div>" +
      (hasHints ? '<span class="tag gold">已解锁</span>' : '<button class="btn small" data-act="nav" data-to="shop">前往商店</button>') +
      "</div>" +
      '<div class="section-title">存档</div>' +
      '<div class="panel" style="padding:6px 20px">' +
      '<div class="setting-row"><div class="sr-info"><div class="sr-name">导出存档</div>' +
      '<div class="sr-desc">把全部进度（选择次数点、道具、结局、图鉴）复制成一段文本，可以保存或换设备导入。</div></div>' +
      '<button class="btn small" data-act="save:export">导出</button></div>' +
      '<div class="setting-row"><div class="sr-info"><div class="sr-name">导入存档</div>' +
      '<div class="sr-desc">粘贴导出的存档文本。导入会覆盖当前进度。</div></div>' +
      '<button class="btn small" data-act="save:import">导入</button></div>' +
      '<div class="setting-row"><div class="sr-info"><div class="sr-name" style="color:#d98b80">清空存档</div>' +
      '<div class="sr-desc">删除全部进度、道具与图鉴记录，回到第一次进入恒仰市的状态。此操作不可撤销。</div></div>' +
      '<button class="btn small" data-act="save:reset" style="border-color:#4a2621;color:#d98b80">清空</button></div>' +
      "</div>" +
      '<div class="panel tiny muted" style="margin-top:20px">存档保存在浏览器本地（localStorage）。' +
      (Core.storageOK() ? "当前存档功能正常。" : "⚠ 当前浏览器阻止了本地存档，进度不会保存！") +
      "</div>";
    return page(inner, "设置");
  }

  /* ---------------------------- 说明 ---------------------------- */
  function renderHelp() {
    var stats = Object.keys(W.statDefs).map(function (k) {
      var d = W.statDefs[k];
      return '<li><b style="color:var(--paper)">' + d.name + "</b>：" + esc(d.desc) + "</li>";
    }).join("");
    var tags = Object.keys(W.tags || {}).map(function (t) {
      return '<span class="tag ' + tagClass(t) + '">' + t + "</span> " + esc(W.tags[t]);
    }).join("<br>");
    var inner = '<div class="section-title">玩法说明</div>' +
      '<div class="help-section"><h3>一、这是什么</h3>' +
      "<p>纯文字多选恐怖冒险。你会进入恒仰市的 11 个异常现场，阅读一份份互相矛盾的守则，" +
      "并做出选择。没有战斗、没有操作，只有「你决定怎么做」。</p></div>" +
      '<div class="help-section"><h3>二、三条数值</h3><ul>' + stats + "</ul></div>" +
      '<div class="help-section"><h3>三、选择与门槛</h3>' +
      "<p>每个节点的选项顺序<b>每次都会随机打乱</b>——规则记得越熟，越要靠自己判断，而不是背选项的位置。</p>" +
      "<p>选项的“安全 / 危险 / 代价 / 情感 / 道具 / 即死 / 真相”标签与小字提示，属于稀有信息：" +
      "只有在补给商店购买 <b style=\"color:var(--gold)\">「守则批注本」（100 选择次数点）</b>后才会显示。" +
      "没有它时，你只能凭选项文字和直觉做决定。</p>" + tags +
      "<p>有些选择需要特定道具、感染值、精神值或剧情伏笔才会出现。条件不足时，选项可能显示为灰色锁定，也可能被直接跳过。" +
      "在进入地图前，最好先确认商店里有没有能救你命的东西。</p></div>" +
      '<div class="help-section"><h3>四、剧情解说的代价</h3>' +
      "<p>每一个节点的「剧情解说」都会把原视频这一段故事讲给你听，但它<b>每次打开都会消耗 1 点精神和 1 点体力</b>。" +
      "展开时你会看到一句「让我缓缓」——这不是装饰，是你在恒仰市里仅剩的那点力气。</p>" +
      "<p>想省体力，可以等到安全屋再回看：「剧情解说档案」收录看过的解说，回看不耗数值。</p></div>" +
      '<div class="help-section"><h3>五、选择次数点与道具</h3>' +
      "<p>" + esc(W.cpLore || "") + "</p>" +
      "<p>道具是一次性消耗：每件道具有固定使用次数，每次进入地图都会重置。购买是永久的，之后每张地图都能带进去。" +
      "体力值没有回复手段，请把体力当成「你还能走多远」。</p></div>" +
      '<div class="help-section"><h3>六、结局</h3>' +
      "<p>每张地图有多个结局：死亡、溃败、异化、逃离、真相、隐藏。真结局与隐藏结局会给一件跨图证物，" +
      "在终章《春晚倒计时》里，证物决定你能看到什么样的节目。</p></div>" +
      '<div class="help-section"><h3>七、路线建议</h3>' +
      (W.routes || []).map(function (r) {
        return "<p><b style=\"color:var(--gold)\">" + esc(r.name) + "</b>：" + esc(r.desc) + "</p>";
      }).join("") +
      "<p>终章《春晚倒计时》建议最后游玩。所有地图都可以随意进出，失败不会抹掉已收集的图鉴。</p></div>" +
      '<div class="help-section"><h3>八、内容提示</h3><p>' + esc(W.warning || "") + "</p>" +
      "<p>本作无 Jump Scare、无血腥画面。恐怖来自文字与规则本身。随时可以点击「离开（保存）」回到安全屋。</p></div>" +
      '<div class="help-section"><h3>制作说明</h3><p>' + (W.credits || []).map(esc).join("<br>") + "</p></div>";
    return page(inner, "玩法说明");
  }

  /* ---------------------------- 渲染调度 ---------------------------- */
  function render() {
    if (ui.typeTimer) { clearInterval(ui.typeTimer); ui.typeTimer = null; }
    ui.finishType = null;

    if (!Core.isBooted()) {
      app.innerHTML = '<div class="empty">引擎未启动。</div>';
      return;
    }

    var html = "";
    switch (ui.screen) {
      case "title": html = renderTitle(); break;
      case "home": html = renderHome(); break;
      case "maps": html = renderMaps(); break;
      case "brief": html = renderBrief(ui.param); break;
      case "play": html = renderPlay(); break;
      case "ending": html = renderEnding(); break;
      case "shop": html = renderShop(); break;
      case "archive": html = renderArchive(); break;
      case "insights": html = renderInsights(); break;
      case "emotions": html = renderEmotions(); break;
      case "lore": html = renderLore(); break;
      case "settings": html = renderSettings(); break;
      case "help": html = renderHelp(); break;
      default: html = renderHome();
    }

    var modal = "";
    if (ui.modal) {
      if (ui.modal.type === "items") modal = renderItemsModal();
      else if (ui.modal.type === "log") modal = renderLogModal();
      else if (ui.modal.type === "confirm") modal = renderConfirmModal();
      else if (ui.modal.type === "export") modal = renderExportModal();
      else if (ui.modal.type === "import") modal = renderImportModal();
    }
    app.innerHTML = html + modal + '<div class="toast-wrap" id="toasts"></div>';

    if (ui.screen === "play") {
      window.scrollTo({ top: 0, behavior: "auto" });
      applyTypewriter();
      if (Core.getView() && Core.getView().run.stats.sanity <= 25) app.classList.add("glitch-on");
      else app.classList.remove("glitch-on");
    } else {
      app.classList.remove("glitch-on");
    }
  }

  function renderConfirmModal() {
    if (!ui.modal || ui.modal.type !== "confirm") return "";
    return modalShell(ui.modal.title || "确认", '<div style="color:var(--paper2);font-size:14px;line-height:2">' + esc(ui.modal.text || "") + "</div>" +
      '<div class="btn-row" style="margin-top:16px">' +
      '<button class="btn primary" data-act="confirm:yes">' + esc(ui.modal.yes || "确认") + "</button>" +
      '<button class="btn ghost" data-act="modal:close">取消</button></div>', "");
  }
  function renderExportModal() {
    var text = Core.exportSave();
    return modalShell("导出存档", '<div class="tiny muted" style="margin-bottom:8px">复制下面这段文本并妥善保存。它包含全部进度。</div>' +
      '<textarea id="save-text" style="width:100%;height:180px;background:#0d0b09;border:1px solid var(--line2);color:var(--paper2);font-family:monospace;font-size:11px;padding:10px;border-radius:3px" readonly>' + esc(text) + "</textarea>",
      '<button class="btn small gold" data-act="save:copy">复制</button><button class="btn small ghost" data-act="modal:close">关闭</button>');
  }
  function renderImportModal() {
    return modalShell("导入存档", '<div class="tiny muted" style="margin-bottom:8px">把导出的存档文本粘贴到这里。导入会覆盖当前进度。</div>' +
      '<textarea id="save-text" style="width:100%;height:180px;background:#0d0b09;border:1px solid var(--line2);color:var(--paper2);font-family:monospace;font-size:11px;padding:10px;border-radius:3px" placeholder="粘贴存档文本……"></textarea>',
      '<button class="btn small gold" data-act="save:import:yes">导入</button><button class="btn small ghost" data-act="modal:close">取消</button>');
  }

  /* ---------------------------- 逐字显示 ---------------------------- */
  function applyTypewriter() {
    if (!Core.getSettings().typewriter) return;
    var ps = app.querySelectorAll(".scene-lines p.scene-line");
    if (!ps.length) return;
    var queue = [];
    ps.forEach(function (p) {
      queue.push({ el: p, text: p.textContent });
      p.textContent = "";
    });
    var idx = 0, pos = 0, timer = null;
    function step() {
      if (idx >= queue.length) { clearInterval(timer); ui.typeTimer = null; return; }
      var cur = queue[idx];
      if (pos < cur.text.length) {
        pos++;
        cur.el.textContent = cur.text.slice(0, pos);
      } else {
        idx++; pos = 0;
      }
    }
    timer = setInterval(step, 26);
    ui.typeTimer = timer;
    ui.finishType = function () {
      clearInterval(timer); ui.typeTimer = null;
      queue.forEach(function (q) { q.el.textContent = q.text; });
      ui.finishType = null;
    };
  }

  /* ---------------------------- 提示 ---------------------------- */
  function toast(text, type) {
    var wrap = document.getElementById("toasts");
    if (!wrap) return;
    var div = document.createElement("div");
    div.className = "toast " + (type || "");
    div.textContent = text;
    wrap.appendChild(div);
    setTimeout(function () {
      div.style.transition = "opacity .3s";
      div.style.opacity = "0";
      setTimeout(function () { if (div.parentNode) div.parentNode.removeChild(div); }, 320);
    }, 2200);
  }

  /* ---------------------------- 导航 ---------------------------- */
  function go(screen, param) {
    ui.screen = screen;
    ui.param = param === undefined ? null : param;
    if (screen !== "play" && screen !== "ending") ui.modal = null;
    if (screen === "ending" && !ui.ending) {
      ui.ending = Core.getEnding();
      Core.clearEnding();
    }
    if (screen !== "play") {
      try { window.scrollTo({ top: 0, behavior: "auto" }); } catch (e) { window.scrollTo(0, 0); }
    }
    render();
  }

  /* ---------------------------- 事件 ---------------------------- */
  app.addEventListener("click", function (ev) {
    var el = ev.target.closest("[data-act]");
    if (!el) return;
    var act = el.getAttribute("data-act");
    var data = el.dataset;

    /* 弹窗遮罩点击关闭 */
    if (act === "modal:mask") {
      if (ev.target === el) { ui.modal = null; render(); }
      return;
    }

    switch (act) {
      case "nav": go(data.to); break;

      case "brief": go("brief", data.map); break;

      case "run:start": {
        if (Core.hasActiveRun()) { toast("请先结束或放弃当前探索", "bad"); return; }
        var res = Core.newRun(data.map);
        if (!res.ok) { toast(res.error || "无法进入地图", "bad"); return; }
        if (res.ended) { ui.ending = Core.getEnding(); Core.clearEnding(); go("ending"); return; }
        go("play");
        break;
      }

      case "resume": go("play"); break;

      case "abandon": {
        ui.modal = {
          type: "confirm", title: "放弃探索",
          text: "当前地图的进度将被清空，但已获得的结局、道具与图鉴会保留。确定放弃吗？",
          yes: "放弃本次探索", onYes: function () { Core.abandonRun(); ui.modal = null; toast("已放弃本次探索"); go("home"); }
        };
        render();
        break;
      }

      case "confirm:yes": {
        var cb = ui.modal && ui.modal.onYes;
        var keep = ui.modal;
        ui.modal = null;
        if (cb) cb();
        else render();
        break;
      }

      case "play:choose": {
        if (ui.finishType) { ui.finishType(); return; }
        var idx = parseInt(data.index, 10);
        var r = Core.choose(idx);
        if (!r.ok) { toast(r.error || "无法选择", "bad"); return; }
        if (r.ended) {
          ui.ending = Core.getEnding();
          Core.clearEnding();
          go("ending");
        } else {
          Core.clearResultLines();
          ui.modal = null;
          go("play");
        }
        break;
      }

      case "items": ui.modal = { type: "items" }; render(); break;
      case "log": ui.modal = { type: "log" }; render(); break;
      case "exit": go("home"); break;
      case "modal:close": ui.modal = null; render(); break;

      case "item:use": {
        var ur = Core.useItem(data.id);
        if (!ur.ok) { toast(ur.error || "无法使用", "bad"); return; }
        if (ur.ended) {
          ui.modal = null;
          ui.ending = Core.getEnding();
          Core.clearEnding();
          go("ending");
          return;
        }
        ui.modal = { type: "items" };
        toast("使用了道具" + (ur.decayText ? "。" + ur.decayText : ""), ur.decayText ? "bad" : "good");
        render();
        if (ur.deltas) {
          var parts = [];
          if (ur.deltas.infection) parts.push("感染 " + fmtDelta(ur.deltas.infection));
          if (ur.deltas.sanity) parts.push("精神 " + fmtDelta(ur.deltas.sanity));
          if (ur.deltas.stamina) parts.push("体力 " + fmtDelta(ur.deltas.stamina));
          if (parts.length) toast(parts.join(" / "), ur.deltas.sanity > 0 || ur.deltas.infection < 0 ? "good" : "bad");
        }
        break;
      }

      case "toggle-insight": {
        var box = el.closest(".insight-box");
        if (!box) break;
        if (box.classList.contains("open")) {
          box.classList.remove("open");
          ui.openInsightFor = null;
          ui.insightSighFor = null;
          break;
        }
        var ir = Core.readInsight();
        if (!ir.ok) { toast(ir.error || "无法阅读", "bad"); return; }
        if (ir.ended) {
          ui.modal = null;
          ui.ending = Core.getEnding();
          Core.clearEnding();
          go("ending");
          return;
        }
        ui.openInsightFor = box.getAttribute("data-node") || null;
        ui.insightSighFor = ui.openInsightFor;
        syncHUD();
        box.classList.add("open");
        var body = box.querySelector(".ib-body");
        if (body && !body.querySelector(".insight-sigh")) {
          var sighP = document.createElement("p");
          sighP.className = "insight-sigh";
          sighP.textContent = "让我缓缓";
          body.insertBefore(sighP, body.firstChild);
        }
        toast("让我缓缓（精神 -1 · 体力 -1）", "bad");
        break;
      }

      case "lore:toggle": {
        ui.openedLore[data.id] = !ui.openedLore[data.id];
        render();
        break;
      }

      case "archive:tab": ui.archiveTab = data.tab; render(); break;

      case "shop:buy": {
        var br = Core.buyItem(data.id);
        if (!br.ok) { toast(br.error, "bad"); return; }
        toast("购买成功：「" + HY.items[data.id].name + "」，已永久加入你的背包。", "good");
        render();
        break;
      }

      case "setting:toggle": {
        var s = Core.getSettings();
        Core.setSetting(data.key, !s[data.key]);
        render();
        break;
      }

      case "save:export": ui.modal = { type: "export" }; render(); break;
      case "save:import": ui.modal = { type: "import" }; render(); break;
      case "save:copy": {
        var ta = document.getElementById("save-text");
        if (ta) {
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(ta.value).then(function () { toast("已复制到剪贴板", "good"); }, function () { ta.select(); toast("请手动复制选中的文本"); });
            } else { ta.select(); document.execCommand("copy"); toast("已复制", "good"); }
          } catch (e) { ta.select(); toast("请手动复制选中的文本"); }
        }
        break;
      }
      case "save:import:yes": {
        var ta2 = document.getElementById("save-text");
        if (!ta2) return;
        var ir = Core.importSave(ta2.value);
        if (!ir.ok) { toast(ir.error || "导入失败", "bad"); return; }
        ui.modal = null;
        toast("存档已导入", "good");
        go("home");
        break;
      }

      case "save:reset": {
        ui.modal = {
          type: "confirm", title: "清空存档",
          text: "这将删除全部进度：选择次数点、已购买道具、结局、规则档案、情绪卡与恒仰市志。不可撤销。",
          yes: "确认清空全部存档", onYes: function () { Core.resetSave(); ui.modal = null; toast("存档已清空"); go("home"); }
        };
        render();
        break;
      }

      case "ending:home": {
        ui.ending = null;
        go("home");
        break;
      }
      case "ending:retry": {
        var mapId = data.map;
        ui.ending = null;
        var rr = Core.newRun(mapId);
        if (!rr.ok) { toast(rr.error || "无法进入地图", "bad"); go("home"); return; }
        if (rr.ended) { ui.ending = Core.getEnding(); Core.clearEnding(); go("ending"); }
        else go("play");
        break;
      }

      default: break;
    }
  });

  /* 点击正文立即完成逐字显示 */
  app.addEventListener("click", function (ev) {
    if (ui.finishType && ev.target.closest(".scene")) ui.finishType();
  });

  /* 键盘 */
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && ui.modal) { ui.modal = null; render(); return; }
    if (ui.screen !== "play" || ui.modal) return;
    if (ui.finishType) { ui.finishType(); return; }
    var n = parseInt(ev.key, 10);
    if (n >= 1 && n <= 9) {
      var view = Core.getView();
      if (!view) return;
      var match = view.choices.filter(function (c) { return c.enabled && c.displayNo === n; })[0];
      if (match) {
        var r = Core.choose(match.index);
        if (r.ok) {
          if (r.ended) { ui.ending = Core.getEnding(); Core.clearEnding(); go("ending"); }
          else { Core.clearResultLines(); go("play"); }
        }
      }
    }
  });

  /* ---------------------------- 启动 ---------------------------- */
  function boot() {
    Core.boot();
    app.innerHTML = "";
    go("title");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
