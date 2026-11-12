/* ============================================================
 * 工具库：在 Node.js 中加载真实的游戏引擎与全部数据文件。
 * 与浏览器共用同一份 js/engine.js，保证校验结果与运行时一致。
 * ============================================================ */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function memoryStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
}

export function projectRoot() {
  return path.resolve(process.cwd());
}

export function loadGame(root = projectRoot()) {
  globalThis.window = globalThis;
  if (!globalThis.localStorage) globalThis.localStorage = memoryStorage();

  const enginePath = path.join(root, "js", "engine.js");
  if (!fs.existsSync(enginePath)) throw new Error("找不到 js/engine.js");
  vm.runInThisContext(fs.readFileSync(enginePath, "utf8"), { filename: "js/engine.js" });

  const HY = globalThis.HY;
  if (!HY || typeof HY.registerMap !== "function") throw new Error("engine.js 没有初始化 HY");

  const worldPath = path.join(root, "data", "world.js");
  const itemsPath = path.join(root, "data", "items.js");
  const mapDir = path.join(root, "data", "maps");

  const files = [];
  if (fs.existsSync(worldPath)) files.push(worldPath);
  if (fs.existsSync(itemsPath)) files.push(itemsPath);
  if (fs.existsSync(mapDir)) {
    fs.readdirSync(mapDir)
      .filter((f) => f.endsWith(".js"))
      .sort()
      .forEach((f) => files.push(path.join(mapDir, f)));
  }

  const loadedFiles = [];
  const errors = [];
  for (const file of files) {
    const rel = path.relative(root, file).replace(/\\/g, "/");
    try {
      vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: rel });
      loadedFiles.push(rel);
    } catch (e) {
      errors.push({ file: rel, message: e && e.message ? e.message : String(e) });
    }
  }

  if (typeof HY.Core?.boot === "function") {
    try { HY.Core.boot(); } catch (e) { errors.push({ file: "js/engine.js", message: "Core.boot() 失败: " + e.message }); }
  }

  return { HY, loadedFiles, loadErrors: errors, root };
}

export const EXPECTED_MAPS = [
  "map01", "map02", "map03", "map04", "map05", "map06",
  "map07", "map08", "map09", "map10", "map11"
];

export const VALID_TAGS = ["安全", "危险", "代价", "道具", "异常", "情感", "即死", "真相"];
export const VALID_BG = ["home", "train", "airport", "redzone", "village", "mountain",
  "school", "academy", "newyear", "stage", "city", "void"];
export const VALID_ENDING_TYPES = ["death", "fail", "become", "escape", "true", "hidden"];
export const VALID_ITEM_CATEGORIES = ["回复", "稳定", "护身", "事件", "证物", "剧情"];
export const VALID_FX_KEYS = ["infection", "sanity", "stamina"];

export const REQUIRED_TRUE_ITEMS = {
  map01: "it_badge_tsp",
  map02: "it_ticket_half",
  map03: "it_pass_outside",
  map04: "it_stabilizer",
  map05: "it_raft_cord",
  map06: "it_chisel",
  map07: "it_redfruit",
  map08: "it_geology",
  map09: "it_diary_zhou",
  map10: "it_black_envelope",
  map11: "it_program"
};
