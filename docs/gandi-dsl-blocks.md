# 聊天里的积木（Gandi 3.0 DSL）

用户在聊天里发一段 Gandi 3.0 积木文本，消息里直接显示成真正的 Scratch / Gandi 积木；拖进 Gandi 编辑器就是能用的积木。

## 用户看到的

- **发**：直接在输入框里写（或粘贴）一段积木文本，不用写围栏。输入框里的内容看着像积木时，上方浮出预览（停手 300 ms 后重画），
  编得过显示积木、编不过逐条列出错误。发送时整条被编译器认作积木的，自动包成 ```` ```gandi-dsl ```` 围栏再发
  （对方认不全的扩展也一定显示成积木）；点预览上的 × 就按普通文字发。带图片、@ 了人的消息不包，包上围栏超过 2000 字时原样发。
  手写的 ```` ```gandi ```` 围栏照样认。
- **说明**：积木卡片底部固定一行「这是 Gandi 3.0 的 DSL 积木语法，可以直接粘贴进 Gandi 编辑器，也能在编辑器里把积木复制为 DSL」
  和「查看语法文档」（`DSL_DOCS_URL` = https://gandi.kuke.ink/docs/dsl-syntax，安卓 `DslText.DOCS_URL`），输入框预览右上角也有「语法文档」。
  也可以直接在输入框里手写围栏，或者直接贴一整段积木文本。
- **看**：消息里的积木卡片。默认显示积木图，可切到「代码」；「复制代码」「下载 SVG」；很长的脚本卡片限高 320 px，点「展开全部」。
  编译出错时不画半截图，显示带行号的代码（出错行标红）和每条报错的行号、原因、改法。
  没声明的变量会自动补上，卡片底部提示「变量 x 没有声明，当作作品里已有的」。
- **用**：
  - 拖积木图：拖动数据里带着那张 SVG（`Files` 里一个 `KukeChat 积木.svg`、`image/svg+xml` 文本、Chrome 的 `DownloadURL`），
    以及纯文本代码。拖进 Gandi 3 编辑器的代码区、或者把下载的 SVG 文件拖进去，就会长出原样的积木。
  - 在 CCW 的 Gandi 编辑器里（社区扩展），卡片上多一个「放进编辑器」，直接插进当前角色的代码区（可视区域左上角），整段一次撤销。

## 识别规则

实现：`src/gandiDsl/detect.ts`（同步部分）、`src/gandiDsl/engine.ts` 的 `detectDsl`。

1. **围栏**：语言名是 `gandi-dsl`、`gandi`、`dsl`（不分大小写）的围栏画成积木卡片，围栏外的文字照常显示（@、链接都在）。
   没闭合的积木围栏算到消息结尾；其他语言的围栏（```` ```js ````）原样当文字，里面的内容不会被当成积木围栏。
2. **没有围栏的整条消息**，同时满足才当成积木：
   - 预筛：长度 8–2000，且出现 `分类.积木名(`（`when.` `motion.` `looks.` `sound.` `event.` `control.` `sensing.` `operator.` `data.` …）、`define(` 或 `call[`；
   - 整段编译**零错误**（自动补声明之后）；
   - 至少编出一块积木；
   - 至少一块「真积木」：帽子（`when.flagclicked` 等）、自制积木定义，或者运动 / 外观 / 声音 / 侦测 / 事件这类 ——
     只有 `if` / `while` / 赋值 / 运算的不算（那就是普通 JS 的样子）。

   所以 `x = 1`、`if (a) { b = 1 }`、`console.log(a)`、`我觉得 looks.say("hi") 挺好用` 都不会被误认；
   `looks.say("hi")`、`when.flagclicked(() => { … })` 会。预筛不过的消息不会加载编译器。

## 没声明的变量怎么办

DSL 的规矩是「作品里已有的变量不用声明，没有的要声明」。聊天里没有作品，照搬的话 `x = 1;` 全是 `E_UNKNOWN_VAR`。
所以 `compileSnippet` 把**不认识的名字当成作品里已有的**再编（最多 40 轮，直到不再冒出新名字）：

| 写法 | 当成 |
|:--|:--|
| `x = 1`、`x += 1`、`looks.say(x)`、`for (let i = 1; …)` | 角色变量 |
| `L.push(v)`、`L.clear()`、`L.length`、`L[i]`（`L` 没被整体赋值过） | 角色列表 |
| `when.broadcastreceived("开始", …)`、`event.broadcast(go)` | 广播（标识符形式的会在第一行前面补一句 `const go = broadcast("go");`，报错列号已经减回去） |

文件里写了声明（`const x = stage.variable("x", 0);`）的照声明来。扩展的命名空间（`pen.` `music.`、快照和宿主作品里的扩展 id）
不会被猜成列表。拖进编辑器时，同名的变量会接到作品里已有的那个上，没有就新建。

## 扩展积木

三层，按顺序（实现：`src/gandiDsl/engine.ts` 的 `activeSchema` / `compileSnippet`，画图前的定义在 `extensionBlocks.ts`）：

1. **随包快照（官方 + Gandi 内置扩展）。** `src/vendor/gandi-dsl/extension-schemas.json`（编译用的 schema，和 Gandi 3.0 的
   `exportSchema` 同一格式，带英文和中文文字）+ `extension-blocks.json`（VM 交给积木库的积木定义，中文、带配色和图标）。
   写法和 DSL 文档一样：`pen.penDown()`、`music.playNoteForBeats(60, 0.25)`、`gandiScene.switchTo("main")`、`gandiPhysics.push(10, 0)`。
   包含的 17 个扩展：`pen music videoSensing text2speech translate makeymakey microbit ev3 boost wedo2 gdxfor gandiScene gandiTilemap tw
   gandiLighting gandiParticles gandiPhysics`。没有的：`speech2text`（gandi3 的 VM 里没注册）、Gandi 的线上官方扩展
   （从扩展服务联网下发，仓库里没有）、`coreExample`（示例）。几处画法上的出入：
   - 可增减参数的积木（`gandiScene_switchToWithParams` 等 5 块）按起始槽数画（Gandi 编辑器里的 ➕➖ 形状是另一份前端代码长出来的），
     多写的槽在图上不显示，拖进编辑器的 XML 里都在；
   - 随作品变的下拉（场景、角色、灯、发射器……）显示 XML 里的值，没有对应的中文名（`main`、`_myself_` 这类内部值例外：快照里存了默认选项）；
   - `tw` 的两块没有中文译文，显示英文。
2. **CCW 编辑器 / 播放器里：宿主作品里装了的扩展（含第三方）。** 扩展构造时把 VM runtime 登记进来（`setHostRuntimeProvider`），
   `hostExtensions.ts` 读 `runtime._blockInfo`：每个扩展的 `info` 照 Gandi 3.0 的 `runtimeSchema.ts` 换成 schema（只走 `exportSchema`
   的扩展那一半，核心积木仍用随包的），`json` 留着画图用。并到快照上、同名以宿主为准；按「装了哪些扩展、各几块积木」的指纹缓存，
   装 / 卸扩展后编译和渲染缓存自动换键。借宿主积木库画时它本来就有这些定义；自己加载积木库时（播放器页）用 VM 给的那份 JSON。
3. **都不认识的扩展积木：灰色占位块。** `myExt.doThing(1, "a")` 这种前缀既不是核心分类、也不是认识的扩展的调用，按写法现编一块占位积木
   （`unknownCalls.ts`），脚本其余部分照常画，卡片底部提示「扩展 myExt 这里不认识，灰色的是占位积木」：
   - 形状看写在哪：单独一句是指令；if / while 的条件里、`!` `&&` `||` 两边、已知积木的布尔槽里是布尔；其他表达式位置是报告；
     顶层一句、名字以 `when` 开头、最后一个参数是 `() => {…}` 的是帽子；`() => {…}` 参数是 C 形口；
   - 位置参数编成输入 `ARG1`、`ARG2`…（数字字面量是数字框，比较 / 逻辑是布尔槽，其余文字框）；只有一个对象参数
     （`myExt.go({TEXT: "hi"})`）时键就是输入名；
   - 拖进 Gandi 的 XML 里仍是真操作码 `myExt_doThing`：目标作品装了这个扩展就是真积木。但位置参数的输入名 `ARG1` 是猜的，
     和扩展真正的输入名对不上时那几个参数会丢（积木本身在，参数是默认值）；用对象写法写真输入名就不会丢。
     下拉菜单参数在占位块上是文字框，拖过去同样接不上。「放进编辑器」遇到没装的扩展会提示先添加扩展。
   - 拼错的核心积木（`looks.sayy`）、认识的扩展里没有的积木（`pen.penDwn`）、语法错误（`E_PARSE`）照旧是错误，卡片显示报错。
   - 没有围栏的整条消息：占位积木不算「真积木」（`console.log("hi")` 不会被认成积木），但和真积木写在一起不影响识别。

**宿主积木库只加不改。** 借 CCW 编辑器的积木库画时，宿主没有的定义（没装的快照扩展、占位块）挂在带前缀的类型名下
（`kukedsl:pen_penDown`；冒号不是标识符字符，Gandi 按 `/^[\w$]+_[\w$]+$/` 枚举积木的地方不会把它当成积木），只在画图用的 XML 里换名，
宿主已有的定义一个都不碰。自己加载的积木库（隐藏 iframe）直接用真类型名定义。

### 重新生成快照

```bash
npm run dsl:extensions                       # = node scripts/gandi-dsl/generate-extension-schemas.mjs
node scripts/gandi-dsl/generate-extension-schemas.mjs --check   # 只比对
```

gandi3 仓库位置用环境变量 `GANDI3_ROOT`（默认 `E:/scratch/gandi3`，只读）。脚本照 `gandi-gui-3.0/scripts/generate-dsl-schema.mjs` 的做法
（jsdom + gandi-blocks + `src/dsl/schema.ts` 的 `exportSchema`），另在 Node 里起一个 scratch-vm：内置扩展走
`extensionManager.loadExtensionIdSync`，引擎三件套执行 `gandi-engine/dist/*.js`（tempExt 格式）后 `injectExtension` 注册；
`vm.setLocale('zh-cn', scratch-l10n 的扩展译文)` 后取 `runtime._blockInfo`。动态菜单的选项函数在空作品里调一次存下默认项。
图标每个扩展只存一份（积木 JSON 里写 `$icon`），和分类相同的配色省掉，加载时补回。输出末尾列出每个扩展的积木数和没能加进来的扩展。
gandi3 的扩展改了积木之后重跑一遍、跑测试。如果 `detect.ts` 的 `SNAPSHOT_EXTENSION_IDS` 和快照对不上，测试会失败，要同步改。

大小：`extension-schemas.json` 约 127 KB、`extension-blocks.json` 约 201 KB（压缩后 JSON；gzip 17 KB / 46 KB，其中图标 46 KB）。
桌面端 / 网页里积木定义是单独懒加载的一块（只在真要画扩展积木时取），schema 在编译器那一块里（识别要同步用）；
社区扩展和安卓渲染页是单文件，都内联进去了。

## 架构

```
src/vendor/gandi-dsl/     从 gandi-gui-3.0 原样拷来的编译器（见那里的 README）+ 扩展快照（extension-*.json，生成的）
scripts/gandi-dsl/        generate-extension-schemas.mjs：生成扩展快照
src/gandiDsl/
  detect.ts               围栏切段、预筛、包围栏、会话列表摘要（同步、零依赖）
  engine.ts               compileSnippet（自动补声明、扩展 schema、占位积木）、detectDsl
  hostExtensions.ts       宿主 VM 里装了的扩展 → schema + 积木定义（CCW 编辑器 / 播放器里）
  unknownCalls.ts         不认识的扩展调用 → 占位积木的样子（acorn 扫用法）
  extensionBlocks.ts      画图前补扩展 / 占位积木的定义（宿主积木库上加前缀，不覆盖）
  blockXml.ts             VM 积木表 → Blockly XML（移植自 scratch-vm 的 blockToXML）
  blockly.ts              拿积木库：宿主的，或者在隐藏 iframe 里加载 gandi-blocks
  render.ts               离屏工作区画积木 → 独立 SVG（内联样式、data URL 图标、<metadata> 藏 XML）、PNG
  media.ts                打进包里的几张积木图标（绿旗、旋转箭头、下拉三角）
  pipeline.ts             compile + render 一条龙（带缓存）、放进编辑器、安卓契约实现
  index.ts                对外入口；loadGandiDsl() 懒加载 pipeline
src/components/chat/gandiDsl/
  DslMessageText.tsx      renderMessageText：替代 renderMentionedText 用在消息正文上
  DslBlockCard.tsx        积木卡片
  DslComposerPreview.tsx  输入框上方的积木预览、发送前自动包围栏
src/dslRender/main.ts     安卓渲染页入口
vendor/gandi-blocks/      gandi-blocks 静态文件（Apache-2.0）
vite.gandiBlocks.ts       开发服务器提供 /gandi-blocks/、构建时拷进产物、注入地址和指纹常量
```

### 画积木

照 Gandi 3.0 的做法（`gandi-gui-3.0/src/blocks/blockThumbs.ts`、`exportBlock.ts`）：

1. 编译得到 VM 积木表 → 每段脚本一条 `<block>` XML；
2. 在一个**离屏、只读**的工作区里 `Blockly.Xml.domToBlock`（事件关着），量 `getBBox`，克隆 SVG，
   把 computed style 一条条写死在克隆上；`<image>` 换成 data URL；按 id 引用的渐变 / 滤镜一起搬进 `<defs>`；
3. 几段脚本竖着排进一张 SVG，原始 XML 用 base64 藏进 `<metadata id="gandi-blocks">`（几段 `<block>` 首尾相接、带坐标和注释，
   和 Gandi 的 `blocksFromSvg` / `insertBlocksXml` 认的格式一致）；
4. 消息里用 `<img src="data:image/svg+xml;base64,…">` 显示 —— 和页面样式完全隔离，天然可拖。

**积木库从哪来**（`blockly.ts`）：

- 社区扩展在 CCW 的 Gandi 编辑器里：借宿主的（`runtime.scratchBlocks`，其次 `window.ScratchBlocks` / `window.Blockly`）。
  只另起一个离屏工作区，inject 之后立刻把 `Blockly.mainWorkspace` 换回编辑器的；不传 `colours`、不改 `Blockly.Colours`
  （都是全局的）。宿主没有的扩展积木按上面「扩展积木」补带前缀的定义；还是画不出来时卡片提示「积木画不出来」并显示代码。
- 其他情况（播放器页、桌面端、网页、安卓渲染页）：在一个**隐藏的同源 iframe** 里加载 gandi-blocks，不在宿主页面上留下
  `window.Blockly` / `window.goog`。语言设成 zh-cn，并补几条 Gandi 自己加的积木文案。深色主题只在这份积木库上生效
  （输入框换深底浅字）；借宿主积木库时保持宿主的样子。

## gandi-blocks 文件的部署

| 目标 | 怎么拿到 gandi-blocks |
|:--|:--|
| 桌面端 / 网页（`npm run build:desktop-web`） | 自动拷进 `dist-desktop/gandi-blocks/`，随包发布，按需加载 |
| 安卓渲染页（`npm run build:dsl-render`） | 自动拷进 `dist-dsl-render/gandi-blocks/` |
| 开发服务器（`npm run dev` / `dev:desktop`） | 插件在 `…/gandi-blocks/` 下直接提供 `vendor/gandi-blocks` |
| **社区扩展**（`npm run build` → 单文件 `KukeChat.js`） | **不内联**。编辑器里借宿主积木库；播放器页从 `VITE_GANDI_BLOCKS_BASE` 加载 |

### 扩展要用的对象存储（需要手动上传一次，换版本时再传）

上传到主桶 `kukechat`（公共读）的一个**带版本号**的目录，例如 `static/gandi-blocks/049fd8f/`
（版本号 = 同步 gandi-blocks 时 gandi3 的提交号；换了内容就换目录，不用操心缓存）。要传的文件（相对 `vendor/gandi-blocks/`，目录结构保持不变）：

```
blockly_compressed_vertical.js      1.8 MB   Content-Type: text/javascript
blocks_compressed.js                         text/javascript
blocks_compressed_vertical.js                text/javascript
msg/messages.js                              text/javascript
msg/scratch_msgs.js                          text/javascript
media/*.svg  media/1x1.gif                   image/svg+xml / image/gif
media/extensions/*.svg  media/icons/*.svg    image/svg+xml
LICENSE                                      text/plain（Apache-2.0 要求随附）
```

最省事的做法：`npm run build:dsl-render` 之后把 `dist-dsl-render/gandi-blocks/` 整个目录传上去（里面就是上面这些文件）。
然后在 `.env` / GitHub 仓库变量里设置 `VITE_GANDI_BLOCKS_BASE=<主桶公网地址>/static/gandi-blocks/049fd8f/`（结尾带 `/`）再构建扩展。
雨云对象存储默认对所有来源放行，脚本是普通 `<script>` 加载，不需要 CORS；桶的防盗链要保持关闭。
没设这个变量时，扩展在编辑器里照常能画（借宿主），播放器页的积木消息显示为代码。

## 安卓渲染页

```bash
npm run build:dsl-render     # → dist-dsl-render/（index.html + kuke-dsl-render.js + gandi-blocks/）
```

整个目录拷进安卓的 `assets/`（例如 `assets/dsl-render/`），在隐藏 WebView 里打开 `file:///android_asset/dsl-render/index.html`。
全部相对路径、不联网、不读 `.env`。脚本是普通脚本（不是 ES 模块，file:// 下模块脚本会被拦）。
WebView 需要 `javaScriptEnabled`；页面在 iframe 里加载 gandi-blocks，同源，不需要额外的文件访问开关。

页面加载完会设 `window.kukeDslReady = true` 并派发 `kukedslready` 事件。然后：

```ts
window.kukeDslDetect(text: string): boolean
// 同步。text 是整条消息：有积木围栏 → true；否则按上面的「没有围栏的整条消息」规则判断。

window.kukeDslRender(text: string, opts: { theme: 'light' | 'dark'; scale?: number }): Promise<{
  ok: boolean;
  png?: string;        // data:image/png;base64,…，按 scale 倍（默认 2，范围 (0, 4]）
  svg?: string;        // 独立 SVG 文本，带 <metadata id="gandi-blocks">（可以存成 .svg 分享）
  width?: number;      // 1 倍尺寸（CSS 像素），png 的实际像素 = width × scale
  height?: number;
  diagnostics: Array<{ line?: number; column?: number; code: string; message: string; fix?: string }>;
  detected?: boolean;  // 这条消息按聊天规则会不会被当成积木（同 kukeDslDetect）
  unknownExtensions?: string[];  // 画成灰色占位积木的扩展 id（不认识的扩展）；没有就不带。界面可以照聊天卡片提示一句
}>
// text 有积木围栏时画第一段围栏里的代码，否则把整段当积木文本。
// ok=false 时 diagnostics 里是编译错误（行号从 1 起，列号从 1 起）；
// 渲染本身失败时是一条 code 为 E_RENDER / E_RENDERER / E_INTERNAL 的记录。
// 同一段文本 + 主题的结果会缓存。
```

背景是透明的，深色主题下输入框是深底浅字。一段几十块积木的脚本通常几十毫秒。

## 重新同步上游

- 编译器：见 `src/vendor/gandi-dsl/README.md`。
- 扩展快照：见上面「重新生成快照」（编译器或 gandi-blocks 换了版本时也重跑一遍）。
- gandi-blocks：见 `vendor/gandi-blocks/README.md`。换了 gandi-blocks 之后，对象存储上要传一个新版本目录并更新 `VITE_GANDI_BLOCKS_BASE`。

## 测试

```bash
npm run test:gandi-dsl       # 围栏切段、识别规则、自动补声明、报错位置、嵌入 XML 格式、扩展快照、占位积木
```

界面可以在 `npm run dev:desktop` 后打开 `http://127.0.0.1:1420/dev/chat-harness.html?c=2`（`&theme=dark` 看深色）：
和阿夸的私聊末尾放了几条积木消息（围栏 + 文字、自动识别、报错、长脚本、普通消息里提到积木）。
