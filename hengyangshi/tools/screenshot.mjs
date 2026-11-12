#!/usr/bin/env node
/* ============================================================
 * 用 Chrome DevTools Protocol 实机截图 + 控制台错误检查
 *   先启动：chrome --headless=new --remote-debugging-port=9222 --user-data-dir=... about:blank
 *   再运行：node tools/screenshot.mjs
 * 输出：screenshots/*.png 与 控制台错误清单
 * ============================================================ */
import fs from "node:fs";
import path from "node:path";

const PORT = process.env.CDP_PORT || 9222;
const ROOT = process.cwd();
const OUT = path.join(ROOT, "screenshots");
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const GAME_URL = "file:///" + ROOT.replace(/\\/g, "/") + "/index.html";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getPageTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page;
    } catch (e) { /* retry */ }
    await sleep(250);
  }
  throw new Error("找不到 Chrome 调试目标，请先启动 Chrome（见文件头说明）");
}

const target = await getPageTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let msgId = 0;
const pending = new Map();
const consoleErrors = [];
const exceptions = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
    return;
  }
  if (msg.method === "Runtime.exceptionThrown") {
    exceptions.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || "unknown exception");
  }
  if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
  }
};

function send(method, params = {}) {
  return new Promise((res) => {
    const id = ++msgId;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function js(expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) exceptions.push(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
}
async function click(selector) {
  return js(`(function(){var el=document.querySelector(${JSON.stringify(selector)}); if(!el) return 'MISSING '+${JSON.stringify(selector)}; el.click(); return 'OK';})()`);
}
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, "base64"));
  console.log("截图：screenshots/" + name);
}
async function load() {
  await send("Page.navigate", { url: GAME_URL });
  await sleep(1600);
  await js("window.scrollTo(0,0)");
}

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");

/* 1. 标题 */
await load();
await sleep(3600);
await shot("01-title.png");

/* 2. 首页 */
await js("window.HY && window.HY.Core && window.HY.Core.resetSave()");
await load();
await click(".title-screen");
await sleep(700);
await shot("02-home.png");

/* 3. 地图选择 */
await click('[data-act="nav"][data-to="maps"]');
await sleep(600);
await shot("03-maps.png");

/* 4. 进图简报 */
await click('[data-act="brief"][data-map="map01"]');
await sleep(600);
await shot("04-brief-map01.png");

/* 5. 游戏正文 + 选项 */
await click('[data-act="run:start"]');
await sleep(800);
await shot("05-play-map01.png");

/* 6. 剧情解说展开 */
await click('[data-act="toggle-insight"]');
await sleep(300);
await shot("06-insight.png");

/* 7. 道具面板 */
await click('[data-act="items"]');
await sleep(400);
await shot("07-items.png");
await click('[data-act="modal:close"]');
await sleep(300);

/* 8. 商店 */
await click('[data-act="exit"]');
await sleep(600);
await click('[data-act="nav"][data-to="shop"]');
await sleep(600);
await shot("08-shop.png");

/* 9. 恐惧图鉴 */
await click('.logo'); await sleep(500);
await click('[data-act="nav"][data-to="emotions"]');
await sleep(600);
await shot("09-emotions.png");

/* 10. 恒仰市志 */
await click('.logo'); await sleep(500);
await click('[data-act="nav"][data-to="lore"]');
await sleep(600);
await shot("10-lore.png");

/* 11. 规则档案 */
await click('.logo'); await sleep(500);
await click('[data-act="nav"][data-to="archive"]');
await sleep(600);
await shot("11-archive.png");

/* 12. 剧情解说档案 */
await click('.logo'); await sleep(500);
await click('[data-act="nav"][data-to="insights"]');
await sleep(600);
await shot("12-insights.png");

/* 13. 自动玩到结局 */
await js("window.HY.Core.abandonRun()");
await load();
await click(".title-screen");
await sleep(600);
await click('[data-act="nav"][data-to="maps"]');
await sleep(600);
await click('[data-act="brief"][data-map="map01"]');
await sleep(600);
const entered = await js("(function(){var b=document.querySelector('[data-act=\"run:start\"][data-map=\"map01\"]'); if(b){b.click(); return 'start';} var r=document.querySelector('[data-act=\"resume\"]'); if(r){r.click(); return 'resume';} return 'none';})()");
console.log("进入地图：" + entered);
await sleep(900);
const endingReached = await js(`(async function(){
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  for (let i=0;i<300;i++){
    if (document.body.innerText.includes('选择次数点结算')) return true;
    const view = window.HY.Core.getView();
    if (!view) { await sleep(60); continue; }
    const avail = view.choices.filter(c=>c.enabled);
    if (!avail.length) return false;
    const pick = avail.find(c=>c.tag==='安全') || avail[0];
    const btn = document.querySelector('[data-act="play:choose"][data-index="'+pick.index+'"]');
    if (!btn) return false;
    btn.click();
    await sleep(45);
  }
  return false;
})()`);
await sleep(800);
await shot("13-ending.png");
console.log("结局页到达：" + endingReached);

/* 14. 设置页 */
await click('[data-act="nav"][data-to="home"]');
await sleep(500);
await click('[data-act="nav"][data-to="settings"]');
await sleep(600);
await shot("14-settings.png");

/* 14b. 购买守则批注本 → 带提示的选项 / 剧情解说消耗 */
await js("(function(){var s=window.HY.Core.getSave(); s.cp=300; return window.HY.Core.buyItem('it_hints').ok;})()");
await click('.logo'); await sleep(400);
await click('[data-act="nav"][data-to="maps"]'); await sleep(400);
await click('[data-act="brief"][data-map="map01"]'); await sleep(400);
await click('[data-act="run:start"]'); await sleep(800);
await shot("16-play-with-hints.png");
await click('[data-act="toggle-insight"]'); await sleep(500);
await shot("17-insight-cost.png");

/* 15. 手机窄屏（重设视口） */
await send("Emulation.setDeviceMetricsOverride", { width: 420, height: 900, deviceScaleFactor: 2, mobile: true });
await click('[data-act="nav"][data-to="home"]');
await sleep(600);
await shot("15-mobile-home.png");
await send("Emulation.clearDeviceMetricsOverride");

/* 报告 */
console.log("");
console.log("=== 控制台错误 ===");
if (!consoleErrors.length && !exceptions.length) console.log("无");
else {
  consoleErrors.forEach((e) => console.log("console.error: " + e));
  exceptions.forEach((e) => console.log("exception: " + e));
}
ws.close();
process.exit(consoleErrors.length || exceptions.length ? 1 : 0);
