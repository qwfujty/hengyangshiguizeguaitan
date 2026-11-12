#!/usr/bin/env node
/* ============================================================
 * 引擎集成测试（无 UI）：
 * - 用“已知正确路线”打通 map01 → 真相结局，验证证物永久写入
 * - 验证跨图证物带入 map02、map11 的 evidenceMin 门槛
 * - 验证商店购买/存档导出/导入
 *   node tools/core-test.mjs
 * ============================================================ */
import { loadGame } from "./load-game.mjs";

const { HY } = loadGame();
const Core = HY.Core;
const errors = [];
function check(cond, msg) { if (!cond) errors.push("断言失败：" + msg); }
function norm(s) {
  return String(s || "").replace(/[「」『』：:，,。.！!？?、；;"'“”‘’\s]/g, "");
}
function chooseByText(mapId, fragment, opts = {}) {
  const view = Core.getView();
  if (!view) { errors.push(`map ${mapId} 没有进行中的 run`); return false; }
  const key = norm(fragment);
  const c = view.choices.find((x) => x.enabled && norm(x.text).includes(key));
  if (!c) {
    const avail = view.choices.filter((x) => x.enabled).map((x) => x.text.slice(0, 22));
    errors.push(`map ${mapId} 节点 ${view.node.id} 找不到可选选项「${fragment}」；可用：${avail.join(" | ")}`);
    return false;
  }
  const r = Core.choose(c.index);
  if (!r.ok) { errors.push("choose 失败：" + r.error); return false; }
  return true;
}

/* ---------------------------- 1. map01 真相路线 ---------------------------- */
const saveBefore = Core.getCp();
Core.resetSave();
let r = Core.newRun("map01");
check(r.ok, "进入 map01");

/* 1b. 选项随机顺序 / 剧情解说消耗 / 守则批注本 */
let v0 = Core.getView();
const orderA = v0.choices.map((c) => c.text).join("|");
const orderB = Core.getView().choices.map((c) => c.text).join("|");
check(orderA === orderB, "同一节点重复渲染时选项顺序应保持稳定（随机只发生一次）");
check(v0.choices.every((c, i) => c.displayNo === i + 1), "选项显示序号应从 1 连续递增");
const sanityBefore = v0.run.stats.sanity;
const staminaBefore = v0.run.stats.stamina;
const ir = Core.readInsight();
check(ir.ok, "readInsight 应成功");
let v1 = Core.getView();
check(v1.run.stats.sanity === sanityBefore - 1 && v1.run.stats.stamina === staminaBefore - 1,
  "阅读剧情解说应扣除 1 精神与 1 体力（实际 " + v1.run.stats.sanity + "/" + v1.run.stats.stamina + "）");
check(Core.hasChoiceHints() === false, "未购买「守则批注本」时不应显示选项提示");
Core.getSave().cp += 200;
check(Core.buyItem("it_hints").ok, "应能购买「守则批注本」");
check(Core.hasChoiceHints() === true, "购买「守则批注本」后应解锁选项提示");

const path01 = [
  "先走到墙边", "点点头", "安静吃完", "按规则办", "捂住耳朵", "强行清空思绪", "低头，不看镜子",
  "听话，等妈妈端来热牛奶", "陪着妈妈", "冲过去按住妈妈的手", "用旧手机偷偷录下爸爸走路的样子",
  "「我明天要早起", "保持绝对安静", "把手机里录下的东西给妈妈看", "点头。把便条和手机都收进背包",
  "把证据给妈妈看", "不管台阶数", "不理会那条门缝", "把旧手机里录下的东西递给他看",
  "上车", "亮出编号牌"
];
for (const frag of path01) {
  if (!Core.hasActiveRun()) break;
  chooseByText("map01", frag);
}
check(!Core.hasActiveRun(), "map01 应当在一局内结束");
let ending = Core.getEnding();
check(!!ending, "map01 结尾应有结局数据");
if (ending) {
  check(ending.ending.type === "true", "map01 应走成真相结局（实际：" + ending.ending.type + " / " + ending.ending.title + "）");
  check(Core.getSave().owned.it_badge_tsp === true, "真相结局应永久获得 it_badge_tsp（特警的编号牌）");
  console.log("map01 结局：" + ending.ending.title + "（" + ending.ending.type + "，+" + ending.cpGained + " 选择次数点）");
}
Core.clearEnding();

/* ---------------------------- 2. 商店购买与永久道具 ---------------------------- */
const cp = Core.getCp();
const buy = Core.buyItem("it_water");
check(buy.ok, "购买 it_water 应成功（cp=" + cp + "）");
const cp2 = Core.getCp();
check(cp2 === cp - HY.items.it_water.price, "购买后 CP 应扣除价格");
check(Core.getShopItems().find((i) => i.id === "it_water").owned, "商店应显示已拥有");

/* ---------------------------- 3. map02：编号牌带入 + 隐藏路线门槛 ---------------------------- */
r = Core.newRun("map02");
check(r.ok, "进入 map02");
let v = Core.getView();
check(v && v.run.inventory.it_badge_tsp > 0, "map02 应自动携带跨图证物编号牌");
/* 走 5 步到乘警处，用编号牌 */
const path02 = ["先核对车票", "起身换到车厢里一个标示着「爱心座位」", "悄悄把自己的行李", "按守则站出来", "立刻移开视线", "紧紧攥住手", "立刻盖好饭盒", "以「我自己带水了」为由拒绝", "保持沉默", "立刻假装睡着", "拉下窗帘", "前往3号或8号车厢的连接处", "出示特警给的编号牌", "保持耐心，留在座位上", "移开视线，不买、不问", "下车。去机场", "走向出口指示牌", "摇头拒绝，走向人多的地方", "后退一步，抓紧背包", "跟着他走", "收好副券"];
for (const frag of path02) {
  if (!Core.hasActiveRun()) break;
  chooseByText("map02", frag);
}
check(!Core.hasActiveRun(), "map02 应当在一局内结束");
ending = Core.getEnding();
check(!!ending && ending.ending.type === "true", "map02 用编号牌路线应达成真相（实际：" + (ending && ending.ending.type) + " " + (ending && ending.ending.title) + "）");
check(Core.getSave().owned.it_ticket_half === true, "map02 真相应获得车票副券");
if (ending) console.log("map02 结局：" + ending.ending.title + "（+" + ending.cpGained + "）");
Core.clearEnding();

/* ---------------------------- 4. 存档导出 / 导入 ---------------------------- */
const exported = Core.exportSave();
check(exported.length > 100, "导出存档应有内容");
const ownedBefore = JSON.stringify(Core.getSave().owned);
const imported = Core.importSave(exported);
check(imported.ok, "导入存档应成功");
check(JSON.stringify(Core.getSave().owned) === ownedBefore, "导入后永久道具应一致");

/* ---------------------------- 5. map11 evidenceMin 门槛（直接给存档塞证物后验证） ---------------------------- */
Core.resetSave();
/* 模拟打过其它地图：直接写入 owned，再进入终章 */
["it_badge_tsp", "it_ticket_half", "it_pass_outside", "it_stabilizer", "it_raft_cord", "it_chisel"].forEach((id) => {
  Core.getSave().owned[id] = true;
});
Core.getSave().cp = 100;
r = Core.newRun("map11");
check(r.ok, "进入 map11");
v = Core.getView();
const evCount = Object.keys(v.run.inventory).filter((id) => HY.items[id] && HY.items[id].category === "证物").length;
check(evCount >= 7, "终章背包应至少有 6 件跨图证物（实际 " + evCount + "）");
/* 沿一条安全路线走到最终节点，验证隐藏选项出现 */
const path11 = ["把节目单折好", "只沿着走廊走", "不签，先看那份节目单原件", "否认：「我不是七七先生」", "低头看节目单", "摇头：「我只是后台工作人员」", "低头看节目单，退出镜头范围", "握紧证物，只沿着自己走过的路走", "关掉电视", "关上门，不进去", "用节目单上的铅笔", "推开灰色铁门，上天台", "闭上眼睛，不看天光"];
for (const frag of path11) {
  if (!Core.hasActiveRun()) break;
  chooseByText("map11", frag);
}
if (Core.hasActiveRun()) {
  v = Core.getView();
  const hiddenChoice = v.choices.find((c) => c.text.includes("走过每一段路的证物摆到镜头前"));
  check(!!hiddenChoice && hiddenChoice.enabled, "持有 6+ 证物时，终章隐藏选项应可点击");
  if (hiddenChoice && hiddenChoice.enabled) {
    Core.choose(hiddenChoice.index);
    const e = Core.getEnding();
    check(!!e && e.ending.type === "hidden", "终章隐藏结局应达成（实际：" + (e && e.ending.type) + "）");
    if (e) console.log("map11 隐藏结局：" + e.ending.title + "（+" + e.cpGained + "）");
    Core.clearEnding();
  }
} else {
  errors.push("map11 安全路线提前结束：" + (Core.getEnding() && Core.getEnding().ending.title));
}

/* ---------------------------- 结果 ---------------------------- */
if (errors.length) {
  console.error("✖ 引擎集成测试失败：" + errors.length + " 条");
  errors.forEach((e) => console.error("  " + e));
  process.exit(1);
}
console.log("✔ 引擎集成测试通过：真相结局奖励、跨图证物携带、商店、存档导入导出、终章 evidenceMin 门槛均正常");

