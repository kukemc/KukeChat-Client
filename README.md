<div align="center">

# KukeChat

**长在创作社区里的聊天客户端**

一套 React + TypeScript 代码，同时构建为 Scratch / CCW 社区扩展、Windows 桌面端和 Android 移动端。

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/kukemc/KukeChat-Client/actions/workflows/ci.yml/badge.svg)](https://github.com/kukemc/KukeChat-Client/actions/workflows/ci.yml)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6.svg)](https://www.typescriptlang.org)
[![Tauri](https://img.shields.io/badge/Tauri-2-ffc131.svg)](https://tauri.app)
[![Capacitor](https://img.shields.io/badge/Capacitor-6-119eff.svg)](https://capacitorjs.com)

</div>

---

## 关于这个项目

图形化编程社区里，创作者其实一直是**离散**的。

作品评论区是异步的，几小时才有一条回复；社区私信像邮箱，不像对话。想找人一起做个项目、想问一句"这个积木为什么不动"、想在深夜给刚发布作品的朋友说一声"做得真好" —— 这些事在 Scratch / CCW 社区里都很难即时发生。于是大家跑去别的聊天软件建群，把创作留在社区，把交流搬去别处，社区本身反而成了一个只能看不能说的地方。

KukeChat 想做的事很简单：**把实时交流放回创作发生的地方。**

### 三个坚持

**一、聊天要长在创作页面上，而不是另开一个窗口。**

KukeChat 的第一形态是一个社区扩展。加载后它用 Shadow DOM 在当前网页上挂载一个可拖拽、可缩放、可最小化的浮动窗口 —— 你在编辑器里写着积木，聊天就浮在旁边，不用切标签页，不用离开作品。Shadow DOM 保证它不会污染宿主页面的样式，宿主页面也污染不了它。

**二、在哪创作，就在哪聊。**

同一份代码构建出三种形态：社区里用扩展，电脑上用桌面客户端，手机上用 App。不是三个各自为战的项目，而是一套业务逻辑、一套状态管理、一套接口层，按目标平台换外壳。改一个功能，三端一起更新。

**三、聊天本身应该是可编程的。**

这是给 Scratcher 的聊天软件，所以它必须能被 Scratch 的方式驱动。扩展提供了三十多个积木：判断登录状态、监听新消息、推荐加群、推荐加好友，以及一整套机器人积木 —— 连接实时消息、收发消息、发图片语音表情、加表情回应、撤回消息、更新消息里的按钮。你可以用积木搭一个群管理机器人，也可以用任何语言调 [Bot API](docs/bot-api.md)。**用户能用自己会的方式扩展它**，这件事本身就是社区精神。

### 为什么开源

一个服务于社区的东西，不应该只有一个人能看见它怎么运转。

开源意味着：你可以审计客户端到底把什么数据发去了哪里；你可以自己部署一整套，服务自己的社区；你可以 fork 出一个完全不同的样子。客户端代码里**不包含任何硬编码的服务器地址** —— 后端地址必须由你自己在构建时注入，这是刻意的设计，不是疏忽。

采用 [MIT 协议](LICENSE)，你几乎可以做任何事，包括商用。

> **注意：这个仓库只包含客户端。** 服务端不在开源范围内，你需要自行实现一个提供相同 REST + WebSocket 接口的后端。接口约定可参考 [`docs/bot-api.md`](docs/bot-api.md) 与 `src/api/`、`src/types/`。

---

## 三种形态

| 形态 | 运行环境 | 技术 | 产物 |
| --- | --- | --- | --- |
| **社区扩展** | CCW / Gandi IDE 网页 | Vite library 模式 + Shadow DOM | `dist/KukeChat.js` |
| **桌面端** | Windows | Tauri 2（Rust + WebView2） | `.msi` / `.exe` |
| **移动端** | Android 5.1+ | Capacitor 6 | `.apk` |

桌面端带系统托盘、消息闪烁提醒、开机自启和内置更新器；移动端带本地通知、后台实时连接、返回键处理和 APK 自更新。

## 功能

<table>
<tr><td width="33%" valign="top">

**消息**
- 私聊 / 群聊 / 临时会话
- 文本、图片、多图、语音、表情包
- 引用、@提及、表情回应
- 撤回、转发、收藏、精选
- 消息内按钮组件（机器人可动态更新）
- 内置图片查看器（缩放 / 拖拽 / 多图切换）
- 会话内消息搜索与上下文定位

</td><td width="33%" valign="top">

**社交**
- 好友搜索、申请、备注
- 群聊创建、群资料、群公告
- 群权限：群主 / 管理员 / 成员
- 全员禁言、慢速模式、加群审批
- 群成员头衔、等级、签到
- 动态（Posts）：发布、评论、点赞
- 组队中心：名片、技能标签、作品展示

</td><td width="33%" valign="top">

**扩展能力**
- 30+ Scratch 积木
- 机器人：Key 鉴权 + WebSocket 事件
- 任务系统：看板、分组、事件卡片
- CCW 账号绑定与作品卡片解析
- 全局搜索、邀请、举报
- 公告、通知、在线状态
- 移动端功能入口自定义排序

</td></tr>
</table>

### Scratch 积木

窗口控制、登录状态、未读数、新消息事件、推荐加群 / 加好友，以及完整的机器人积木组：

```
设置机器人 Key [KEY]  →  连接机器人实时消息
当机器人收到消息 会话=[] 消息=[] 发送者=[] 类型=[] 内容=[]
当机器人被@ 会话=[] 消息=[] 发送者=[] 类型=[] 内容=[]
机器人向会话 [GROUP_ID] 发送消息 [MESSAGE]
机器人向群 [GROUP_ID] 发送 [图片/表情] URL [URL]
机器人给群 [] 消息 [] 添加/取消表情 [EMOJI]
机器人更新会话 [] 消息 [] 按钮 [] 文案 [] 样式 [] 禁用 [] 范围 []
```

不想用积木？直接调 REST + WebSocket，见 [Bot API 文档](docs/bot-api.md)。

## 技术栈

**核心**

| | |
| --- | --- |
| UI | React 18 + TypeScript 5.6（严格模式） |
| 构建 | Vite 5（三份配置对应三个目标） |
| 样式 | Tailwind CSS 3.4 + CSS 变量主题系统 |
| 状态 | Zustand 5（含持久化与平台差异化策略） |
| 数据 | TanStack Query 5（含无限滚动与乐观更新） |
| 图标 | lucide-react |

**平台层**

| | |
| --- | --- |
| 社区扩展 | Shadow DOM 挂载，IIFE 单文件产物，运行时注入 `window.tempExt` |
| 桌面端 | Tauri 2 + Rust：托盘、单实例、通知、开机自启、更新器 |
| 移动端 | Capacitor 6 + 自研 Android 插件（系统栏控制、APK 下载安装） |
| 实时 | 原生 WebSocket，40+ 事件类型，断线重连与状态同步 |

**工程**

- 全量 TypeScript 严格模式，`npm run typecheck` 覆盖应用代码与构建脚本
- 部署配置集中在 `src/config/`，构建期强制校验，缺失即失败
- GitHub Actions 每次 PR 跑类型检查 + 三端构建
- XSS 加固的 Markdown 渲染器：不使用 `dangerouslySetInnerHTML`，所有节点由解析后的 token 构造，URL 走 http(s) 白名单

## 架构

```
                    ┌─────────────────────────────┐
                    │   src/components  业务 UI    │
                    │   src/store       全局状态    │
                    │   src/api         接口层     │
                    │   src/realtime    实时事件    │
                    └──────────────┬──────────────┘
                                   │  共享
              ┌────────────────────┼────────────────────┐
              │                    │                    │
      ┌───────▼───────┐   ┌────────▼────────┐   ┌───────▼───────┐
      │ extension/    │   │ desktop-app.tsx │   │ mobile-app.tsx│
      │ Shadow DOM    │   │ Tauri 窗口       │   │ Capacitor     │
      │ + 积木定义     │   │ + 托盘/更新器     │   │ + 通知/后台    │
      └───────────────┘   └─────────────────┘   └───────────────┘
       vite.config.ts    vite.desktop.config   vite.mobile.config
```

平台差异被收敛在 `src/native/`（原生能力封装）和 `src/utils/appMode.ts`（运行环境判断）里，业务组件基本不需要关心自己跑在哪个壳里。布局模式（桌面 / 移动）由 `src/store/kukeStore.ts` 统一判定，允许用户手动覆盖。

---

## 快速开始

### 环境要求

- Node.js 18+ 与 npm
- 桌面端还需要：Rust 稳定版工具链 + [Tauri 2 系统依赖](https://tauri.app/start/prerequisites/)
- Android 还需要：JDK 17 + Android SDK（Windows 下 `scripts/build-android.ps1` 会自动下载命令行工具）

### 安装与配置

```bash
git clone https://github.com/kukemc/KukeChat-Client.git
cd KukeChat-Client
npm install
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
```

编辑 `.env`，至少填好这两项：

```env
VITE_API_BASE_URL=https://chat.example.com
VITE_WS_URL=wss://chat.example.com/ws
```

**没填就构建不了。** `vite.env.ts` 会在三份构建配置里做校验，缺必填项直接失败并给出提示，不会产出一个连不上后端的包。

### 本地预览

```bash
npm run dev
```

预览页会用 Shadow DOM 在一个普通网页里挂载聊天窗口，行为和在 CCW 里点积木完全一致。开发模式下请求会走 Vite 代理到本地后端（`http://127.0.0.1:8000`）。

## 配置

所有部署相关配置集中在 [`src/config/`](src/config/)，由 Vite 在构建期从 `.env` 注入：

| 变量 | 必填 | 说明 |
| --- | :---: | --- |
| `VITE_API_BASE_URL` | ✅ | 后端 HTTP API 根地址，不带 `/api/v1` |
| `VITE_WS_URL` | ✅ | 实时消息 WebSocket 地址 |
| `VITE_SECURE_LOGIN_ORIGIN` | | 安全登录弹窗 `postMessage` 的可信来源，默认取 API 的 origin |
| `VITE_MOBILE_UPDATE_URL` | | Android 更新元数据地址，默认 `<API>/desktop-update.json` |
| `VITE_EXTENSION_ASSET_URL` | | 已发布的扩展文件地址，用于机器人接入说明，留空则隐藏 |
| `VITE_BOT_API_DOCS_URL` | | 机器人 API 文档地址，用于积木面板文档入口，留空则隐藏 |

桌面端的「检查更新」由 Rust 侧在**编译期**读取环境变量 `KUKECHAT_UPDATE_METADATA_URL`（不带 `VITE_` 前缀），不设置则跳过更新检查。

三个配置文件分工明确：

| 文件 | 职责 |
| --- | --- |
| `src/config/env.ts` | 部署相关，全部来自环境变量，无任何默认值 |
| `src/config/ccw.ts` | CCW 社区平台的公开域名与链接拼装 |
| `src/config/branding.ts` | 应用名、扩展 ID、署名与赞助入口 |

想 fork 出自己的版本？改 `branding.ts` 一个文件就能完成整体换名换署名（MIT 要求保留 `LICENSE` 中的原始版权声明）。

## 构建

### 社区扩展

```bash
npm run build
```

产物为 `dist/KukeChat.js`，在 CCW / Gandi 的扩展加载器里加载即可，它会设置 `window.tempExt`。

> 社区侧有扩展缓存，更新后建议先卸载旧扩展再重新加载。

### Windows 桌面端

```bash
npm run tauri:dev      # 开发调试
npm run tauri:build    # 打包安装程序
```

桌面端版本号以 `package.json` 的 `version` 为准，`npm run sync:desktop-version` 会同步写入 `src-tauri/tauri.conf.json`、`Cargo.toml` 和 `Cargo.lock`，`tauri:dev` / `tauri:build` 已自动执行。

### Android

```bash
npm run android:sync   # 构建移动端 web 产物并同步到 android/
npm run android:apk    # Windows：一条龙打包 APK
```

发布签名 APK 需要在 `android/` 下自建 `keystore.properties`（已被 `.gitignore` 排除）：

```properties
storeFile=your-release.keystore
storePassword=...
keyAlias=...
keyPassword=...
```

缺少该文件时只会产出 unsigned APK，打包脚本会直接报错提醒。

> **发版注意**：移动端版本号有两处必须同步 —— `src/native/appUpdate.ts` 的 `MOBILE_APP_VERSION` 和 `android/app/build.gradle` 的 `versionName` / `versionCode`。前者是客户端自更新的比较基准。

## 项目结构

```text
src/
  api/          REST 接口封装（按业务域拆分）
  app/          应用外壳、窗口管理、路由式面板切换
  components/   业务 UI，按功能域分目录
  config/       部署配置、CCW 平台常量、品牌信息
  extension/    社区扩展入口、积木定义、桥接与自更新
  mobile/       移动端功能开关与排序
  native/       Capacitor / Tauri 原生能力封装
  realtime/     WebSocket 客户端与事件分发
  store/        Zustand 全局状态
  styles/       Tailwind 与 Shadow DOM 样式注入
  types/        接口与实时事件类型
  utils/        通用工具
android/        Capacitor Android 工程（含自研原生插件）
src-tauri/      Tauri 桌面端工程（Rust）
docs/           机器人 API 文档
scripts/        版本同步与 Android 打包脚本
```

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 扩展本地预览 |
| `npm run typecheck` | 应用与构建脚本的类型检查 |
| `npm run build` | 构建社区扩展 |
| `npm run build:desktop-web` | 构建桌面端 web 产物 |
| `npm run build:mobile-web` | 构建移动端 web 产物 |
| `npm run tauri:dev` / `tauri:build` | 桌面端开发 / 打包 |
| `npm run android:sync` / `android:apk` | 移动端同步 / 打包 |

## 贡献

欢迎 Issue 和 Pull Request。提交前请确保 `npm run typecheck` 和 `npm run build` 都通过，详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

有一条硬性约定：**不要在业务代码里写死任何服务器域名**，新增的部署相关地址一律走 `src/config/env.ts` + `.env.example`。

## License

[MIT](LICENSE) © kukemc

如果这个项目对你有帮助，欢迎点一个 Star。
