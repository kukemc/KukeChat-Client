// 生成聊天积木用的扩展快照：src/vendor/gandi-dsl/extension-schemas.json + extension-blocks.json
//
//   node scripts/gandi-dsl/generate-extension-schemas.mjs           # 重新生成
//   node scripts/gandi-dsl/generate-extension-schemas.mjs --check   # 只比对，不一致时退出码 1
//
// gandi3 仓库的位置：环境变量 GANDI3_ROOT，默认 E:/scratch/gandi3。只读，不改它。
//
// 做法照 gandi-gui-3.0/scripts/generate-dsl-schema.mjs（jsdom + gandi-blocks + schema.ts 的 exportSchema），
// 另外在 Node 里起一个 scratch-vm，把 Gandi 当成「内置」的扩展都装上：
//
//   - VM 自带的（extension-manager.js 的 defaultBuiltinExtensions，gandi-gui 扩展库 catalogue.ts 的 BUILTIN 列的就是这些）：
//     pen music videoSensing text2speech translate makeymakey microbit ev3 boost wedo2 gdxfor gandiScene gandiTilemap tw
//   - 引擎三件套（catalogue.ts 的 ENGINE_EXTENSIONS）：gandi-engine/dist 下的 gandi-lighting / gandi-particles / gandi-physics，
//     是「tempExt」格式的扩展脚本，在 jsdom 的全局里执行一遍拿到扩展类，再交给 VM 注册。
//
// 每个扩展取两样东西：
//   (a) DSL schema（exportSchema 的格式，英文 text + 中文 text.zh）—— 编译器用；
//   (b) VM 交给积木库的积木定义（runtime._blockInfo 里每块的 json、菜单的 json）—— 画图时 defineBlocksWithJsonArray 用。
//       中文界面的那一份（vm.setLocale('zh-cn', scratch-l10n 的扩展译文)）。
// 图标（data URL）每个扩展只存一份，积木 JSON 里用 "$icon" / "$menuIcon" 代替；积木上和分类一样的配色也省掉，加载时补回去。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const G = path.resolve(process.env.GANDI3_ROOT || 'E:/scratch/gandi3');
const GUI = path.join(G, 'gandi-gui-3.0');
const VM_DIR = path.join(G, 'scratch-vm');
const ENGINE_DIST = path.join(G, 'gandi-engine', 'dist');
const OUT_DIR = path.join(repo, 'src/vendor/gandi-dsl');
const check = process.argv.includes('--check');

for (const dir of [GUI, VM_DIR, ENGINE_DIST]) {
  if (!fs.existsSync(dir)) {
    console.error(`找不到 ${dir}（GANDI3_ROOT=${G}）`);
    process.exit(2);
  }
}

const guiRequire = createRequire(path.join(GUI, 'package.json'));
const { JSDOM } = guiRequire('jsdom');

/* --- 积木库（jsdom 里的 gandi-blocks，和 gandi-gui 的生成脚本一样） ------------------------------- */

const browser = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only', url: 'http://localhost/', pretendToBeVisual: true });
const blocksRoot = path.join(repo, 'vendor/gandi-blocks');
for (const file of ['blockly_compressed_vertical.js', 'msg/messages.js', 'msg/scratch_msgs.js', 'blocks_compressed.js', 'blocks_compressed_vertical.js']) {
  browser.window.eval(fs.readFileSync(path.join(blocksRoot, file), 'utf8'));
}
const library = browser.window.Blockly;
library.ScratchMsgs.setLocale('en');

const { outputFiles } = await build({
  entryPoints: [path.join(GUI, 'src/dsl/schema.ts')], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent'
});
const { exportSchema } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`);
const coreSchema = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'core-schema.json'), 'utf8'));

/* --- VM ------------------------------------------------------------------------------------------ */

// 引擎扩展的脚本、个别内置扩展在加载时会碰 window / document（只是探测，不画东西）
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLCanvasElement', 'Image', 'location',
  'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'localStorage']) {
  if (!(key in globalThis)) {
    try {
      globalThis[key] = browser.window[key];
    } catch {
      // 只读的全局（navigator 在新版 Node 里有）
    }
  }
}
const quiet = console.warn;
const origLog = console.log;
console.warn = () => {};
const VirtualMachine = createRequire(path.join(VM_DIR, 'package.json'))('./src/virtual-machine');
const vm = new VirtualMachine();
vm.runtime.setMaxListeners?.(0);
console.warn = quiet;

const BUILTIN_IDS = ['pen', 'music', 'videoSensing', 'text2speech', 'translate', 'makeymakey', 'microbit', 'ev3', 'boost',
  'wedo2', 'gdxfor', 'gandiScene', 'gandiTilemap', 'tw'];
const ENGINE_FILES = ['gandi-lighting.js', 'gandi-particles.js', 'gandi-physics.js'];
const skipped = [];

for (const id of BUILTIN_IDS) {
  try {
    vm.extensionManager.loadExtensionIdSync(id);
  } catch (error) {
    skipped.push({ id, why: String(error?.message ?? error) });
  }
}
for (const file of ENGINE_FILES) {
  let id = file;
  try {
    delete globalThis.tempExt;
    (0, eval)(fs.readFileSync(path.join(ENGINE_DIST, file), 'utf8'));
    const temp = globalThis.tempExt;
    if (!temp?.Extension || !temp.info?.extensionId) throw new Error('脚本没有留下 tempExt');
    id = temp.info.extensionId;
    // 不传 url：带 url 时 VM 会去查作品素材（要 storage），这里用不着
    vm.extensionManager.addCustomExtensionInfo(temp);
    vm.extensionManager.injectExtension(id, temp.Extension);
    vm.extensionManager.loadExtensionIdSync(id);
  } catch (error) {
    skipped.push({ id, why: String(error?.message ?? error) });
  }
}
console.log = origLog;
// 有的扩展在 getInfo 之前要等一拍
await new Promise((resolve) => setTimeout(resolve, 300));

const extensionsMsgsUrl = new URL(`file:///${path.join(GUI, 'node_modules/scratch-l10n/locales/extensions-msgs.js').replace(/\\/g, '/')}`);
const zhMessages = (await import(extensionsMsgsUrl.href)).default['zh-cn'] ?? {};

/**
 * 动态菜单（随作品变的：场景、角色、灯……）在 VM 给的 JSON 里 options 是个函数，存成 JSON 就没了，积木库建这种下拉会出错。
 * 在没有作品的 VM 里调一次，拿到它的默认选项（「我自己」「任意」这些固定项也在里面）；调不了就放一个空选项 ——
 * 画图时下拉框显示的是 XML 里的值（scratch-blocks 找不到对应选项时直接显示值本身）。
 */
const freezeOptions = (json) => {
  if (!json || typeof json !== 'object') return json;
  for (let i = 0; Array.isArray(json[`args${i}`]); i += 1) {
    for (const arg of json[`args${i}`]) {
      if (arg?.type !== 'field_dropdown' || Array.isArray(arg.options)) continue;
      let options = null;
      if (typeof arg.options === 'function') {
        try {
          const value = arg.options();
          if (Array.isArray(value) && value.length && value.every((item) => Array.isArray(item) && item.length >= 2)) {
            options = value.map(([text, id]) => [typeof text === 'string' ? text : String(id), String(id)]);
          }
        } catch {
          options = null;
        }
      }
      arg.options = options ?? [['', '']];
    }
  }
  return json;
};

/** runtime._blockInfo 的一份深拷贝（setLocale 会就地重建这些对象）。 */
const snapshot = () => JSON.parse(JSON.stringify(vm.runtime._blockInfo.map((category) => ({
  id: category.id,
  name: category.name,
  color1: category.color1,
  color2: category.color2,
  color3: category.color3,
  colorGradient: category.colorGradient ?? null,
  blockIconURI: category.blockIconURI ?? '',
  menuIconURI: category.menuIconURI ?? '',
  blocks: (category.blocks ?? []).map((block) => ({ info: block.info ?? null, json: freezeOptions(block.json ?? null) })),
  menus: (category.menus ?? []).map((menu) => ({ json: freezeOptions(menu.json ?? null) })),
  menuInfo: category.menuInfo ?? {},
  customFieldTypes: Object.keys(category.customFieldTypes ?? {})
}))));

console.warn = () => {};
await vm.setLocale('en', {});
const english = snapshot();
await vm.setLocale('zh-cn', zhMessages);
const chinese = snapshot();
console.warn = quiet;

const loadedIds = english.map((category) => category.id);
for (const id of [...BUILTIN_IDS]) {
  if (!loadedIds.includes(id) && !skipped.some((item) => item.id === id)) skipped.push({ id, why: '加载后没有出现在 runtime._blockInfo 里' });
}

/* --- (a) schema ---------------------------------------------------------------------------------- */

const asExtensionInfo = (category) => ({
  id: category.id,
  blocks: category.blocks.map((block) => block.info).filter(Boolean),
  menus: category.menuInfo
});
const enSchema = exportSchema(library, english.map(asExtensionInfo), undefined, 'en');
library.ScratchMsgs.setLocale('zh-cn');
const zhSchema = exportSchema(library, chinese.map(asExtensionInfo), undefined, 'en');

const idSet = new Set(loadedIds);
/** 扩展积木引用、但核心 schema 里没有的影子（note、matrix……）。 */
const neededShadows = new Set();
for (const spec of Object.values(enSchema)) {
  if (!spec?.extension?.id || !idSet.has(spec.extension.id)) continue;
  for (const input of Object.values(spec.inputs ?? {})) if (input.shadowOpcode) neededShadows.add(input.shadowOpcode);
  for (const group of spec.variadic ?? []) for (const slot of group.slots ?? []) if (slot.shadowOpcode) neededShadows.add(slot.shadowOpcode);
}
const schema = {};
for (const [opcode, spec] of Object.entries(enSchema).sort(([a], [b]) => a.localeCompare(b))) {
  const ownedByExtension = spec?.extension?.id && idSet.has(spec.extension.id);
  // text 由编译器自己补（schema.text ??= …），不覆盖
  const shadowWeNeed = !ownedByExtension && neededShadows.has(opcode) && !coreSchema[opcode] && opcode !== 'text';
  if (!ownedByExtension && !shadowWeNeed) continue;
  const out = { ...spec };
  // 版本号 / 网址在聊天里没用，还会让快照每次重生成都变
  if (out.extension) out.extension = { id: out.extension.id };
  const zh = zhSchema[opcode]?.text?.en;
  if (zh && out.text?.en && zh !== out.text.en) out.text = { ...out.text, zh };
  if (out.text === undefined) delete out.text;
  schema[opcode] = out;
}

/* --- (b) 积木定义 -------------------------------------------------------------------------------- */

const blocksOut = {};
const notes = {};
const replaceIcons = (value, category) => {
  if (typeof value === 'string') {
    if (category.blockIconURI && value === category.blockIconURI) return '$icon';
    if (category.menuIconURI && value === category.menuIconURI) return '$menuIcon';
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => replaceIcons(item, category));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceIcons(item, category)]));
  return value;
};
/** 积木上和分类一样的那几个字段省掉（加载时按分类补回去）。 */
const COMMON = (category) => ({
  colour: category.color1, colourSecondary: category.color2, colourTertiary: category.color3,
  colourGradient: category.colorGradient ?? null, category: category.name
});
const slim = (json, category) => {
  const common = COMMON(category);
  const out = {};
  for (const [key, value] of Object.entries(json)) {
    if (key in common && JSON.stringify(common[key]) === JSON.stringify(value)) continue;
    out[key] = value;
  }
  return replaceIcons(out, category);
};
for (const category of chinese) {
  const dynamic = [];
  const expandable = [];
  const blocks = [];
  for (const block of category.blocks) {
    if (block.info?.isDynamic) {
      dynamic.push(block.info.opcode);
      continue;
    }
    if (!block.json) continue;
    if (block.info?.expandable) expandable.push(block.info.opcode);
    blocks.push(slim(block.json, category));
  }
  blocksOut[category.id] = {
    name: category.name,
    colours: [category.color1, category.color2, category.color3],
    ...(category.colorGradient ? { colorGradient: category.colorGradient } : {}),
    ...(category.blockIconURI ? { icon: category.blockIconURI } : {}),
    ...(category.menuIconURI && category.menuIconURI !== category.blockIconURI ? { menuIcon: category.menuIconURI } : {}),
    menus: category.menus.map((menu) => menu.json).filter(Boolean).map((json) => slim(json, category)),
    blocks
  };
  const note = [];
  if (dynamic.length) note.push(`dynamic (not rendered): ${dynamic.join(', ')}`);
  if (expandable.length) note.push(`expandable (rendered at start size): ${expandable.join(', ')}`);
  if (category.customFieldTypes.length) note.push(`custom fields (not rendered): ${category.customFieldTypes.join(', ')}`);
  if (note.length) notes[category.id] = note;
}

/* --- 写出 ---------------------------------------------------------------------------------------- */

const header = { source: 'scripts/gandi-dsl/generate-extension-schemas.mjs', gandi3: gitHead() };
const schemaText = `${JSON.stringify({ $meta: header, schema }, null, 1)}\n`;
const blocksText = `${JSON.stringify({ $meta: header, extensions: blocksOut }, null, 1)}\n`;
const targets = [
  [path.join(OUT_DIR, 'extension-schemas.json'), schemaText],
  [path.join(OUT_DIR, 'extension-blocks.json'), blocksText]
];
let differs = false;
for (const [file, text] of targets) {
  if (check) {
    const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (old !== text) {
      differs = true;
      console.error(`${path.relative(repo, file)} 和 gandi3 现在生成的不一样；跑一遍 node scripts/gandi-dsl/generate-extension-schemas.mjs`);
    }
  } else {
    fs.writeFileSync(file, text);
  }
}

const kb = (text) => `${(Buffer.byteLength(text) / 1024).toFixed(1)} KB`;
const iconBytes = Object.values(blocksOut).reduce((sum, item) => sum + (item.icon?.length ?? 0) + (item.menuIcon?.length ?? 0), 0);
console.log(`${check ? 'Checked' : 'Generated'}: ${Object.keys(blocksOut).length} extensions, ${Object.keys(schema).length} schema entries`);
for (const [id, item] of Object.entries(blocksOut)) {
  console.log(`  ${id.padEnd(16)} ${String(item.blocks.length).padStart(3)} blocks ${String(item.menus.length).padStart(3)} menus  ${item.name}${notes[id] ? `  (${notes[id].join('; ')})` : ''}`);
}
for (const item of skipped) console.log(`  SKIPPED ${item.id}: ${item.why}`);
console.log(`  extension-schemas.json ${kb(schemaText)}, extension-blocks.json ${kb(blocksText)} (icons ${(iconBytes / 1024).toFixed(1)} KB)`);
browser.window.close();
if (differs) process.exitCode = 1;
setTimeout(() => process.exit(process.exitCode ?? 0), 50);

function gitHead() {
  try {
    const head = fs.readFileSync(path.join(G, '.git', 'HEAD'), 'utf8').trim();
    const ref = head.startsWith('ref: ') ? fs.readFileSync(path.join(G, '.git', head.slice(5)), 'utf8').trim() : head;
    return ref.slice(0, 7);
  } catch {
    return 'unknown';
  }
}
