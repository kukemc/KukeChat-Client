// Run with: npm run test:gandi-dsl  （node --test src/gandiDsl/gandiDsl.test.mjs）
//
// 编译器是 TS + JSON import + 无扩展名相对路径，node 直接跑不了，先用 esbuild（vite 自带）打成一个临时文件再测。
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const here = fileURLToPath(new URL('.', import.meta.url));
let dir;
let dsl;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'kuke-gandi-dsl-'));
  const outfile = join(dir, 'bundle.mjs');
  await build({
    stdin: {
      contents: "export * from './detect'; export { compileSnippet, detectDsl } from './engine';",
      resolveDir: here,
      loader: 'ts'
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    alias: { '@': resolve(here, '..') },
    logLevel: 'silent'
  });
  dsl = await import(pathToFileURL(outfile).href);
});

after(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

test('fences: gandi-dsl / gandi / dsl are split out, other languages stay as text', () => {
  const segments = dsl.splitDslFences('看这个：\n```gandi-dsl\nlooks.say("hi");\n```\n好用吧');
  assert.deepEqual(segments, [
    { kind: 'text', text: '看这个：' },
    { kind: 'dsl', code: 'looks.say("hi");', lang: 'gandi-dsl' },
    { kind: 'text', text: '好用吧' }
  ]);
  assert.equal(dsl.splitDslFences('```GANDI\nx\n```')?.[0].kind, 'dsl');
  assert.equal(dsl.splitDslFences('```dsl\nx\n```')?.[0].lang, 'dsl');
  assert.equal(dsl.splitDslFences('```js\nlooks.say(1)\n```'), null);
  assert.equal(dsl.splitDslFences('普通消息'), null);
  // 没闭合的围栏一直算到结尾
  assert.deepEqual(dsl.splitDslFences('```gandi-dsl\nlooks.say(1)'), [{ kind: 'dsl', code: 'looks.say(1)', lang: 'gandi-dsl' }]);
  // ```js 里面出现 ```dsl 字样也不当积木
  assert.equal(dsl.splitDslFences('```js\n```dsl\n```'), null);
});

test('wrapDslFence round-trips through splitDslFences', () => {
  const code = 'when.flagclicked(() => {\n  looks.say("你好");\n});';
  const segments = dsl.splitDslFences(dsl.wrapDslFence(`${code}\n\n`));
  assert.deepEqual(segments, [{ kind: 'dsl', code, lang: 'gandi-dsl' }]);
});

test('auto-detect: whole-DSL messages with real blocks are detected', () => {
  for (const text of [
    'when.flagclicked(() => { looks.say("你好"); motion.movesteps(10); });',
    'looks.say("hi")',
    'define("跳 %n 下", (n) => { motion.changeyby(n); }); when.thisspriteclicked(() => { call["跳 %n 下"](3); });',
    'when.flagclicked(() => { for (let i = 1; i <= 10; i++) { looks.say(i); } });',
    'when.broadcastreceived(go, () => { looks.say(1); })'
  ]) {
    assert.equal(dsl.detectDsl(text), true, text);
  }
});

test('auto-detect: ordinary chat and generic JS are not detected', () => {
  for (const text of [
    '你好呀，今天吃什么',
    'hello world looks.say( hi',
    'x = 1',
    'if (a) { b = 1 }',
    'const a = 1; console.log(a)',
    // 只有不认识的扩展积木（编成占位积木）不算「真积木」
    'foo.bar(1); baz.qux("a");',
    'console.log("hi")',
    'while (true) { x += 1; }',
    'document.getElementById("app").remove()',
    '我觉得 looks.say("hi") 这个积木挺好用的'
  ]) {
    assert.equal(dsl.detectDsl(text), false, text);
  }
});

test('undeclared variables, lists and broadcasts are auto-declared', () => {
  const out = dsl.compileSnippet('when.flagclicked(() => { x = 1; L.push(x); L.clear(); looks.say(L[1]); event.broadcast(go); });');
  assert.equal(out.ok, true, JSON.stringify(out.diagnostics));
  assert.deepEqual(out.autoDeclared.variables, ['x']);
  assert.deepEqual(out.autoDeclared.lists, ['L']);
  assert.deepEqual(out.autoDeclared.broadcasts, ['go']);
  // 整个被赋值的名字是变量：s[1] 是取字符，不是列表
  const text = dsl.compileSnippet('when.flagclicked(() => { s = "abc"; looks.say(s[1]); });');
  assert.equal(text.ok, true, JSON.stringify(text.diagnostics));
  assert.deepEqual(text.autoDeclared.lists, []);
  // 写了声明的照声明来，不自动补
  const declared = dsl.compileSnippet('const score = stage.variable("score", 0);\nwhen.flagclicked(() => { score = 1; });');
  assert.equal(declared.ok, true);
  assert.deepEqual(declared.autoDeclared.variables, []);
});

test('compile errors keep line / column / fix and produce no XML', () => {
  const out = dsl.compileSnippet('when.flagclicked(() => {\n  looks.say("a");\n  looks.sayy(1);\n});');
  assert.equal(out.ok, false);
  assert.equal(out.blocks, null);
  assert.equal(out.embedXml, '');
  assert.equal(out.diagnostics[0].code, 'E_UNKNOWN_BLOCK');
  assert.equal(out.diagnostics[0].line, 3);
  assert.ok(out.diagnostics[0].column > 0);
  // 自动补广播声明时拼在第一行前面，列号要减回去
  const shifted = dsl.compileSnippet('event.broadcast(go); looks.sayy(1);');
  assert.equal(shifted.diagnostics[0].line, 1);
  assert.equal(shifted.diagnostics[0].column, 22);
});

test('embed XML is concatenated <block> stacks with positions, variable fields typed', () => {
  const out = dsl.compileSnippet('when.flagclicked(() => { x = 1; L.push(x); });\nwhen.thisspriteclicked(() => { looks.say("<&>"); });');
  assert.equal(out.ok, true);
  assert.equal(out.roots.length, 2);
  assert.equal(out.scriptXml.length, 2);
  assert.ok(out.embedXml.startsWith('<block '));
  assert.ok(!out.embedXml.includes('<xml'));
  assert.match(out.embedXml, /type="event_whenflagclicked" x="\d+" y="\d+"/);
  assert.match(out.embedXml, /<field name="VARIABLE" id="[^"]+" variabletype="">x<\/field>/);
  assert.match(out.embedXml, /<field name="LIST" id="[^"]+" variabletype="list">L<\/field>/);
  assert.ok(out.embedXml.includes('&lt;&amp;&gt;'));
  // 画图用的不带坐标
  assert.ok(!/ x="\d+"/.test(out.scriptXml[0]));
});

test('extension namespaces are not guessed as lists; previews replace fences', () => {
  const pen = dsl.compileSnippet('when.flagclicked(() => { pen.clear(); });');
  assert.equal(pen.ok, true, JSON.stringify(pen.diagnostics));
  assert.deepEqual(pen.autoDeclared.lists, []);
  assert.equal(dsl.dslPreviewText('看这个\n```gandi-dsl\nlooks.say(1)\n```'), '看这个 [积木]');
  assert.equal(dsl.dslPreviewText('普通消息'), '普通消息');
});

/* --- 扩展积木 ------------------------------------------------------------------------------------ */

test('snapshot extension ids in detect.ts match the generated snapshot', () => {
  const file = JSON.parse(readFileSync(resolve(here, '../vendor/gandi-dsl/extension-schemas.json'), 'utf8'));
  const ids = new Set(Object.values(file.schema).map((spec) => spec.extension?.id).filter(Boolean));
  assert.deepEqual([...dsl.SNAPSHOT_EXTENSION_IDS].sort(), [...ids].sort());
  const blocks = JSON.parse(readFileSync(resolve(here, '../vendor/gandi-dsl/extension-blocks.json'), 'utf8'));
  assert.deepEqual(Object.keys(blocks.extensions).sort(), [...ids].sort());
});

test('official / Gandi extension blocks compile and are detected', () => {
  const cases = [
    ['pen.penDown(); pen.setPenColorToColor("#ff0000"); pen.changePenSizeBy(1);', ['pen_penDown', 'pen_setPenColorToColor', 'pen_changePenSizeBy']],
    ['when.flagclicked(() => { music.playNoteForBeats(60, 0.25); music.setTempo(120); });', ['music_playNoteForBeats', 'note', 'music_setTempo']],
    ['gandiScene.switchTo("main");', ['gandiScene_switchTo', 'gandiScene_menu_scenes']],
    ['when.flagclicked(() => { pen.clear(); for (let i = 1; i <= 4; i++) { motion.movesteps(50); pen.stamp(); } });', ['pen_clear', 'pen_stamp']]
  ];
  for (const [code, types] of cases) {
    const out = dsl.compileSnippet(code);
    assert.equal(out.ok, true, `${code}: ${JSON.stringify(out.diagnostics)}`);
    assert.deepEqual(out.unknownExtensions, [], code);
    for (const type of types) assert.ok(out.scriptXml.join('').includes(`type="${type}"`), `${code} → ${type}`);
    assert.equal(dsl.detectDsl(code), true, code);
  }
  assert.equal(dsl.looksLikeDsl('pen.penDown()'), true);
  assert.equal(dsl.looksLikeDsl('gandiPhysics.push(1, 2)'), true);
  // 拼错的核心积木、认识的扩展里没有的积木：仍然是错误，不当成占位积木
  for (const code of ['looks.sayy("hi")', 'pen.penDwn()']) {
    const out = dsl.compileSnippet(code);
    assert.equal(out.ok, false, code);
    assert.equal(out.diagnostics[0].code, 'E_UNKNOWN_BLOCK', code);
  }
});

test('unknown extension blocks become placeholders shaped by where they are written', () => {
  const code = [
    'when.flagclicked(() => {',
    '  myExt.doThing(1, "a");',
    '  if (myExt.isReady()) { looks.say(myExt.value()); }',
    '  myExt.loop(3, () => { motion.movesteps(10); });',
    '  control.wait_until(myExt.done());',
    '});',
    'myExt.whenHappens(() => { looks.say("x"); });',
    'other.go({TEXT: "hi"});'
  ].join('\n');
  const out = dsl.compileSnippet(code);
  assert.equal(out.ok, true, JSON.stringify(out.diagnostics));
  assert.deepEqual([...out.unknownExtensions].sort(), ['myExt', 'other']);
  const shapes = Object.fromEntries(Object.values(out.placeholders).map((spec) => [spec.opcode, spec.shape]));
  assert.deepEqual(shapes, {
    myExt_doThing: 'command', myExt_isReady: 'boolean', myExt_value: 'reporter', myExt_loop: 'command',
    myExt_done: 'boolean', myExt_whenHappens: 'hat', other_go: 'command'
  });
  assert.deepEqual(out.placeholders.myExt_doThing.inputs, [{ name: 'ARG1', kind: 'number' }, { name: 'ARG2', kind: 'string' }]);
  assert.deepEqual(out.placeholders.myExt_loop.inputs.map((input) => input.kind), ['number', 'stack']);
  assert.deepEqual(out.placeholders.other_go.inputs, [{ name: 'TEXT', kind: 'string' }]);
  assert.equal(out.placeholders.myExt_doThing.label, 'myExt.doThing');
  // 拖进 Gandi 的 XML 里还是真操作码；命名参数写法的输入名原样保留
  assert.match(out.embedXml, /type="myExt_doThing"/);
  assert.match(out.embedXml, /type="other_go"[^>]*>(?:<comment[^]*?<\/comment>)?<value name="TEXT">/);
  assert.equal(out.roots.length, 3);
  // 语法错误不受影响
  const broken = dsl.compileSnippet('myExt.doThing(1,');
  assert.equal(broken.ok, false);
  assert.equal(broken.diagnostics[0].code, 'E_PARSE');
  // 有真积木的整条消息仍会被识别
  assert.equal(dsl.detectDsl('when.flagclicked(() => { looks.say("hi"); myExt.doThing(1); });'), true);
});
