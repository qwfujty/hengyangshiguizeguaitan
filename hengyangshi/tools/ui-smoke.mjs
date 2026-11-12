/* ============================================================
 * UI 冒烟测试（无浏览器）：用最小 DOM 桩加载真实 ui.js，模拟点击走完全部界面。
 *   node tools/ui-smoke.mjs
 * 退出码 0 = 全部界面渲染与关键交互无运行时错误。
 * ============================================================ */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(process.cwd());
const mem = new Map();
const localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear()
};

function makeEl(id) {
  const el = {
    id: id || "",
    innerHTML: "",
    textContent: "",
    value: "",
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {},
    appendChild() {},
    removeChild() {},
    querySelectorAll() { return []; },
    querySelector() { return null; },
    closest() { return null; },
    getAttribute() { return null; },
    select() {}
  };
  return el;
}

const appEl = makeEl("app");
const byId = { app: appEl };
const docListeners = {};
const appListeners = [];
appEl.addEventListener = (type, fn) => { if (type === "click") appListeners.push(fn); };

const documentStub = {
  readyState: "complete",
  getElementById: (id) => {
    if (!byId[id]) byId[id] = makeEl(id);
    return byId[id];
  },
  createElement: () => makeEl("created"),
  addEventListener: (type, fn) => { docListeners[type] = fn; },
  querySelectorAll: () => [],
  execCommand: () => true
};

globalThis.window = globalThis;
globalThis.document = documentStub;
globalThis.localStorage = localStorage;
globalThis.scrollTo = () => {};

const files = [
  "js/engine.js",
  "data/world.js",
  "data/items.js",
  ...(fs.existsSync(path.join(root, "data/maps"))
    ? fs.readdirSync(path.join(root, "data/maps")).filter((f) => f.endsWith(".js")).sort().map((f) => "data/maps/" + f)
    : []),
  "js/ui.js"
];

const errors = [];
for (const f of files) {
  try {
    vm.runInThisContext(fs.readFileSync(path.join(root, f), "utf8"), { filename: f });
  } catch (e) {
    errors.push(`载入 ${f} 失败：${e.message}`);
  }
}
if (errors.length) {
  console.error("✖ 载入失败：");
  errors.forEach((e) => console.error("  " + e));
  process.exit(1);
}

const HY = globalThis.HY;
const Core = HY.Core;

function click(act, data = {}) {
  const el = {
    getAttribute: (name) => (name === "data-act" ? act : null),
    dataset: data,
    closest: (sel) => (sel === "[data-act]" ? el : null)
  };
  const ev = { target: { closest: (sel) => (sel === "[data-act]" ? el : null) } };
  try {
    appListeners.forEach((fn) => fn(ev));
    return true;
  } catch (e) {
    errors.push(`点击 ${act} ${JSON.stringify(data)} 时异常：${e.stack || e.message}`);
    return false;
  }
}

function check(cond, msg) {
  if (!cond) errors.push("断言失败：" + msg);
}

/* ---------------------------- 流程 ---------------------------- */
click("nav", { to: "home" });
check(appEl.innerHTML.includes("安全屋"), "首页应渲染安全屋");
click("nav", { to: "maps" });
check(appEl.innerHTML.includes("选择地图"), "地图选择页应渲染");
click("brief", { map: "map01" });
check(appEl.innerHTML.includes("居家日记"), "进图简报应包含地图名");
click("run:start", { map: "map01" });
check(appEl.innerHTML.includes("你要怎么做"), "进入地图后应出现选项");

/* 走完一整局：每次取第一个可用选项 */
let guard = 0;
while (guard++ < 120) {
  if (fieldsEnded()) break;
  const view = Core.getView();
  if (!view || !view.choices) break;
  const first = view.choices.filter((c) => c.enabled)[0];
  if (!first) break;
  click("play:choose", { index: first.index });
  /* 检查是否进入结局 */
  if (appEl.innerHTML.includes("剧情解说与复盘") || appEl.innerHTML.includes("选择次数点结算")) break;
}
function fieldsEnded() {
  return !Core.hasActiveRun();
}
check(!Core.hasActiveRun() || guard < 120, "应当在一场探索内结束或仍在进行");

/* 若已结束：测试结局页按钮 */
if (appEl.innerHTML.includes("选择次数点结算")) {
  check(appEl.innerHTML.includes("返回安全屋"), "结局页应有返回按钮");
  click("ending:home");
  check(appEl.innerHTML.includes("安全屋"), "结局后返回安全屋");
} else {
  click("exit");
  check(appEl.innerHTML.includes("安全屋"), "离开游戏后回到安全屋");
}

/* 商店 */
click("nav", { to: "shop" });
check(appEl.innerHTML.includes("补给商店"), "商店页面应渲染");
const shopItems = Core.getShopItems();
const affordable = shopItems.filter((i) => !i.owned && i.price <= Core.getCp())[0];
if (affordable) {
  click("shop:buy", { id: affordable.id });
  check(Core.getSave().owned[affordable.id], "购买后应永久拥有道具：" + affordable.id);
} else {
  appEl.innerHTML.includes("补给商店");
}
/* 图鉴/档案/市志/设置/说明 */
for (const [to, kw] of [["archive", "规则档案"], ["insights", "剧情解说档案"], ["emotions", "恐惧图鉴"], ["lore", "恒仰市志"], ["settings", "设置与存档"], ["help", "玩法说明"]]) {
  click("nav", { to });
  check(appEl.innerHTML.includes(kw), `页面 ${to} 应包含关键字 ${kw}`);
}
/* 设置切换 */
click("setting:toggle", { key: "typewriter" });
check(Core.getSettings().typewriter === true, "设置开关应生效");
click("setting:toggle", { key: "typewriter" });
/* 导出/导入弹窗 */
click("save:export");
check(appEl.innerHTML.includes("导出存档"), "导出弹窗应渲染");
click("modal:close");
click("save:import");
check(appEl.innerHTML.includes("导入存档"), "导入弹窗应渲染");
click("modal:close");
/* 逐字显示模式下的游戏渲染 */
Core.setSetting("typewriter", true);
const firstMap = Core.getMapList()[0].id;
click("brief", { map: firstMap });
click("run:start", { map: firstMap });
check(appEl.innerHTML.includes("你要怎么做"), "逐字模式下仍应渲染选项");
click("items");
check(appEl.innerHTML.includes("随身道具"), "道具弹窗应渲染");
click("modal:close");
click("log");
check(appEl.innerHTML.includes("选择记录"), "记录弹窗应渲染");
click("modal:close");
click("exit");
Core.setSetting("typewriter", false);

/* 商店/图鉴等页面渲染不应崩溃（已在上面检查） */

if (errors.length) {
  console.error(`✖ UI 冒烟测试失败：${errors.length} 条`);
  errors.forEach((e) => console.error("  " + e));
  process.exit(1);
}
console.log("✔ UI 冒烟测试通过：全部界面渲染、进图、选择、结局、商店、图鉴、设置、弹窗均无运行时错误");
console.log(`  当前进度：地图 ${Core.getProgress().maps} 张 / 已加载地图 ${HY.mapOrder.length} 张`);
process.exit(0);

