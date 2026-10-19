<div align="center">

<img src=".github/assets/cover.png" alt="KukeChat" width="880">

# KukeChat

**长在创作社区里的聊天客户端**

一套 React + TypeScript 代码，构建出 Scratch / CCW 社区扩展和 Windows 桌面端。

<p align="center">
<img src=".github/assets/icons/puzzle.svg" width="16" height="16" align="absmiddle">&nbsp;社区页面里的聊天浮窗&emsp;&emsp;
<img src=".github/assets/icons/monitor.svg" width="16" height="16" align="absmiddle">&nbsp;Windows 桌面端&emsp;&emsp;
<img src=".github/assets/icons/blocks.svg" width="16" height="16" align="absmiddle">&nbsp;40+ Scratch 积木&emsp;&emsp;
<img src=".github/assets/icons/bot.svg" width="16" height="16" align="absmiddle">&nbsp;开放 Bot API
</p>

[![License](https://img.shields.io/badge/License-MIT-111111?style=flat-square&logo=opensourceinitiative&logoColor=white)](LICENSE)
[![React](https://img.shields.io/badge/React-18.3-111111?style=flat-square&logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-111111?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-5-111111?style=flat-square&logo=vite&logoColor=white)](https://vite.dev)
[![Tauri](https://img.shields.io/badge/Tauri-2-111111?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-stable-111111?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org)
[![CI](https://img.shields.io/github/actions/workflow/status/kukemc/KukeChat-Client/ci.yml?branch=main&style=flat-square&label=CI&color=111111&logo=githubactions&logoColor=white)](https://github.com/kukemc/KukeChat-Client/actions/workflows/ci.yml)

**简体中文** · [English](README.en.md)

[关于](#关于) · [形态](#形态) · [功能](#功能) · [快速开始](#快速开始) · [配置](#配置) · [构建](#构建) · [相关仓库](#相关仓库)

</div>

---

## 关于

图形化编程社区里，创作者一直是离散的。

作品评论区是异步的，几小时才有一条回复；社区私信更像邮箱，而不是对话。想找人一起做项目、想问一句「这个积木为什么不动」、想在深夜给刚发布作品的朋友说声「做得真好」—— 这些事在 Scratch / CCW 社区里都很难即时发生。于是大家去别的聊天软件建群，创作留在社区，交流搬去别处。

KukeChat 想做的事很简单：**把实时交流放回创作发生的地方。**

### 三个坚持

**聊天长在创作页面上。** 第一形态是社区扩展：加载后用 Shadow DOM 在当前页面挂载一个可拖拽、可缩放、可最小化的浮动窗口。你在编辑器里拼积木，聊天就浮在旁边，不用离开作品。Shadow DOM 让它和宿主页面的样式互不干扰。

**在哪创作，就在哪聊。** 社区里用扩展，电脑上用桌面端，手机上用 App。它们共用一套业务逻辑、状态管理和接口层，只按平台换外壳，改一个功能，各端一起更新。

**聊天本身可编程。** 这是给 Scratcher 的聊天软件，所以它能用 Scratch 的方式驱动。扩展提供 40 多个积木，从监听新消息到完整的机器人与群管能力；不想用积木，也可以用任何语言调 [Bot API](docs/bot-api.md)。用户能用自己会的方式扩展它，这本身就是社区精神。

### 为什么开源

服务于社区的东西，不应该只有一个人能看见它怎么运转。你可以审计客户端把什么数据发去了哪里，可以自己部署一整套服务自己的社区，也可以 fork 出完全不同的样子。

客户端代码里**没有任何硬编码的服务器地址**，后端地址必须在构建时由你注入 —— 这是刻意的设计。

> [!NOTE]
> 本仓库只包含客户端。配套服务端见 [KukeChat-Server](https://github.com/kukemc/KukeChat-Server)；也可以自行实现提供相同 REST + WebSocket 接口的后端，约定见 [`docs/bot-api.md`](docs/bot-api.md) 与 `src/api/`、`src/types/`。

## 形态

| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;形&#8288;态&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; | 运行环境 | 实现 | 产物 | 状态 |
| --- | --- | --- | --- | --- |
| <img src=".github/assets/icons/puzzle.svg" width="16" height="16" align="absmiddle">&nbsp;社区扩展 | CCW / Gandi IDE 网页 | Vite library 模式 + Shadow DOM | `dist/KukeChat.js` | 正式 |
| <img src=".github/assets/icons/monitor.svg" width="16" height="16" align="absmiddle">&nbsp;Windows 桌面端 | Windows | Tauri 2（Rust + WebView2） | `.msi` / `-setup.exe` | 正式 |
| <img src=".github/assets/icons/smartphone.svg" width="16" height="16" align="absmiddle">&nbsp;Android | Android | Kotlin + Jetpack Compose 原生应用 | 见 [KukeChat-Android](https://github.com/kukemc/KukeChat-Android) | 正式，另一个仓库 |
| <img src=".github/assets/icons/laptop.svg" width="16" height="16" align="absmiddle">&nbsp;macOS | macOS | Tauri 2 | `mac-beta` 分支 | 测试中 |
| <img src=".github/assets/icons/terminal.svg" width="16" height="16" align="absmiddle">&nbsp;Linux | Linux 桌面 | 社区维护 | [kenins.l2.ink/kukechat](https://kenins.l2.ink/kukechat/) | 非官方 |

官方安装包（Windows、Android）在 [KukeChat 下载页](https://chat-api.kuke.ink/download)。

桌面端带系统托盘、新消息托盘闪烁、开机自启、单实例和内置更新器。

本仓库构建两个目标：社区扩展和 Windows 桌面端（macOS 测试版在 `mac-beta` 分支）。Android 应用是独立的原生项目，见 [KukeChat-Android](https://github.com/kukemc/KukeChat-Android)。

## 功能

| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;分&#8288;类&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; | 内容 |
| --- | --- |
| <img src=".github/assets/icons/message-circle.svg" width="16" height="16" align="absmiddle">&nbsp;消息 | 私聊、群聊、临时会话；文本、图片、多图、语音、表情包（含动图）、文件；引用、@ 提及、表情回应、撤回；Markdown 与消息内按钮（机器人可动态更新） |
| <img src=".github/assets/icons/mic.svg" width="16" height="16" align="absmiddle">&nbsp;语音 | 语音消息，点一下即可转成文字 |
| <img src=".github/assets/icons/bookmark.svg" width="16" height="16" align="absmiddle">&nbsp;整理与转发 | 收藏、群精华、合并转发，三者都能完整展示所有消息类型，合并转发可嵌套查看 |
| <img src=".github/assets/icons/search.svg" width="16" height="16" align="absmiddle">&nbsp;查找 | QQ 式聊天记录搜索（分类、日期、发送人筛选，点击定位）、全局搜索、「有人 @ 我」跳转提示 |
| <img src=".github/assets/icons/gift.svg" width="16" height="16" align="absmiddle">&nbsp;互动 | 红包（含按住说出口令才能领的语音红包）、礼物与礼物墙、投票、群待办 |
| <img src=".github/assets/icons/users.svg" width="16" height="16" align="absmiddle">&nbsp;群聊 | 群主 / 管理员 / 成员三级权限、全员禁言、慢速模式、入群审批、群公告、群表情、成员头衔与等级、签到 |
| <img src=".github/assets/icons/crown.svg" width="16" height="16" align="absmiddle">&nbsp;群升级 | Pro / Pro+ / MAX 档位、群文件（配额、限时或永久保留、上传进度、取消与重试） |
| <img src=".github/assets/icons/heart.svg" width="16" height="16" align="absmiddle">&nbsp;社交 | 好友申请与备注、动态（发布、评论、点赞）、组队中心、任务看板、亲密度、好友火花、生日、资料点赞、等级 |
| <img src=".github/assets/icons/palette.svg" width="16" height="16" align="absmiddle">&nbsp;个性化 | 主题与壁纸、商店里的头像框和聊天气泡 |
| <img src=".github/assets/icons/shield-check.svg" width="16" height="16" align="absmiddle">&nbsp;社区与安全 | CCW 账号绑定与作品卡片、举报、风纪委员（考试、合议、判例） |
| <img src=".github/assets/icons/bell.svg" width="16" height="16" align="absmiddle">&nbsp;客户端 | 桌面通知与托盘提醒；自动更新，后端发版后实时推送，各端错峰检查 |

### Scratch 积木

扩展提供 40 多个积木，分为四组：

| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;分&#8288;组&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; | 能做什么 |
| --- | --- |
| <img src=".github/assets/icons/app-window.svg" width="16" height="16" align="absmiddle">&nbsp;基础 | 窗口控制、登录状态、未读数、新消息事件、推荐加群 / 加好友 |
| <img src=".github/assets/icons/bot.svg" width="16" height="16" align="absmiddle">&nbsp;机器人 | 设置 Key 并连接实时消息；收到消息 / 被 @ 时触发；发送文字、图片、表情、语音、私信；表情回应、撤回、更新消息按钮 |
| <img src=".github/assets/icons/user-cog.svg" width="16" height="16" align="absmiddle">&nbsp;群管 | 查询成员信息、禁言 / 解除禁言、移出群聊、审批入群申请（机器人需被设为管理员，权限规则与人类管理员一致） |
| <img src=".github/assets/icons/gamepad-2.svg" width="16" height="16" align="absmiddle">&nbsp;游戏模式 | 把群聊接进作品舞台，请求玩家授权后以玩家身份发言，可自定义聊天框外观与位置 |

```text
设置机器人 Key [KEY]  →  连接机器人实时消息
当机器人被@ 会话=[] 消息=[] 发送者ID=[] 发送者=[] 类型=[] 内容=[]
机器人向会话 [GROUP_ID] 发送消息 [MESSAGE]
接入游戏聊天 群号 [GROUP_ID]
```

## 技术栈

<p align="center">
<img src="https://skillicons.dev/icons?i=react,ts,vite,tailwind,tauri,rust&theme=dark" height="40" alt="React, TypeScript, Vite, Tailwind CSS, Tauri, Rust">
</p>

| 层 | 选型 |
| --- | --- |
| UI | React 18 + TypeScript 5.6（严格模式） |
| 构建 | Vite 5，两份配置对应两个目标 |
| 样式 | Tailwind CSS 3.4 + CSS 变量主题 |
| 状态 | Zustand 5 |
| 数据 | TanStack Query 5（无限滚动、乐观更新） |
| 实时 | 原生 WebSocket，断线重连与状态同步 |
| 桌面端 | Tauri 2 + Rust：托盘、单实例、通知、开机自启、更新器 |
| 图标 | lucide-react |

Markdown 渲染器不使用 `dangerouslySetInnerHTML`，所有节点都由解析后的 token 构造，链接只放行 http(s)。

## 架构

业务 UI（`src/components`）、全局状态（`src/store`）、接口层（`src/api`）和实时事件（`src/realtime`）各端共享，每个目标只有自己的入口和外壳：

| 目标 | 入口 | Vite 配置 | 产物 |
| --- | --- | --- | --- |
| 社区扩展 | `src/extension/index.ts` | `vite.config.ts` | `dist/KukeChat.js`（IIFE 单文件） |
| 桌面端 | `src/desktop-app.tsx` | `vite.desktop.config.ts` | `dist-desktop/`，由 Tauri 打包 |

平台差异收敛在 `src/native/`（原生能力封装）和 `src/utils/appMode.ts`（运行环境判断），业务组件不关心自己跑在哪个壳里。两份配置共用 `vite.env.ts` 校验环境变量。

## 快速开始

需要 Node.js 18+（CI 使用 20）。桌面端另需 Rust 稳定版与 [Tauri 2 系统依赖](https://tauri.app/start/prerequisites/)。

```bash
git clone https://github.com/kukemc/KukeChat-Client.git
cd KukeChat-Client
npm install
cp .env.example .env          # PowerShell：Copy-Item .env.example .env
```

在 `.env` 里填好后端地址：

```env
VITE_API_BASE_URL=https://chat.example.com
VITE_WS_URL=wss://chat.example.com/ws
```

启动本地预览：

```bash
npm run dev
```

预览页（`:5173`）会在普通网页里挂载聊天窗口，行为和在 CCW 里加载扩展一致。开发时 `/api`、`/uploads`、`/ws` 默认代理到本机后端 `http://127.0.0.1:8000`；设 `KUKE_DEV_REMOTE=1` 则改为代理到 `.env` 里配置的后端。

> [!IMPORTANT]
> 必填项缺失时 `dev` 和各个 `build` 都会直接失败并给出提示，不会产出一个连不上后端的包。

## 配置

所有部署配置都在构建期从 `.env` 注入，模板见 [`.env.example`](.env.example)。

| 变量 | 必填 | 说明 |
| --- | :---: | --- |
| `VITE_API_BASE_URL` | 是 | 后端 HTTP API 根地址，不带 `/api/v1` 和结尾斜杠 |
| `VITE_WS_URL` | 是 | 实时消息 WebSocket 地址 |
| `VITE_SECURE_LOGIN_ORIGIN` | | 安全登录弹窗 `postMessage` 的可信来源，默认取 API 的 origin |
| `VITE_DESKTOP_UPDATE_URL` | | 桌面端备用更新元数据地址，默认 `<API>/desktop-update.json` |
| `VITE_EXTENSION_ASSET_URL` | | 已发布的扩展文件地址，用于机器人接入说明，留空则隐藏 |
| `VITE_BOT_API_DOCS_URL` | | 机器人 API 文档地址，用于积木面板的文档入口，留空则隐藏 |
| `KUKECHAT_UPDATE_METADATA_URL` | | 覆盖桌面端更新元数据地址（Rust 侧读取，运行期优先于编译期），便于本地测试 |

客户端检查更新时先问后端的 `/api/v1/releases/latest`，拿到更新日志、强制更新标记和 sha256；接口不可用时才退回上面的元数据地址。

配置代码集中在 `src/config/`：

| 文件 | 职责 |
| --- | --- |
| `env.ts` | 部署相关配置，全部来自环境变量，没有默认的服务器地址 |
| `ccw.ts` | CCW 社区平台的公开域名与链接拼装 |
| `branding.ts` | 应用名、扩展 ID、署名与赞助入口 |

想 fork 出自己的版本，改 `branding.ts` 即可整体换名（MIT 要求保留 `LICENSE` 里的原始版权声明）。

## 构建

### 社区扩展

```bash
npm run build
```

产物是 `dist/KukeChat.js`，在 CCW / Gandi 的扩展加载器里加载即可。社区侧会缓存扩展，更新后先卸载旧扩展再重新加载。

### Windows 桌面端

```bash
npm run tauri:dev      # 调试
npm run tauri:build    # 打包 .msi 与 -setup.exe
```

版本号以 `package.json` 的 `version` 为准。`tauri:dev` / `tauri:build` 会先执行 `sync:desktop-version`，把它同步到 `src-tauri/tauri.conf.json`、`Cargo.toml` 和 `Cargo.lock`。

### 持续集成与发布

| 工作流 | 触发 | 做什么 |
| --- | --- | --- |
| [`ci.yml`](.github/workflows/ci.yml) | 推送到 `main`、Pull Request | 类型检查，并构建扩展、桌面端 web 两份产物 |
| [`release.yml`](.github/workflows/release.yml) | 推送 `v*` 标签 | 并行构建各端产物，汇总成草稿 Release，人工确认后发布 |

发布构建的后端地址取自仓库变量（Settings → Secrets and variables → Actions → Variables），变量名与上面的配置表一致，fork 后填你自己的即可。

## 项目结构

```text
src/
  api/            REST 接口封装，按业务域拆分
  app/            应用外壳、窗口管理、面板切换
  components/     业务 UI，按功能域分目录
  config/         部署配置、CCW 常量、品牌信息
  extension/      扩展入口、积木定义、游戏模式、自更新
  native/         Tauri 原生能力封装、返回键与页面过渡
  realtime/       WebSocket 客户端与事件分发
  store/          Zustand 全局状态
  styles/         Tailwind 与 Shadow DOM 样式注入
  theme/          主题与壁纸
  types/          接口与实时事件类型
  utils/          通用工具
src-tauri/        Tauri 桌面端（Rust）
dev/              组件预览页与假接口
docs/             Bot API、CCW 运行时 API、各版本更新日志
scripts/          版本同步、打包与测试脚本
```

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 扩展本地预览（`:5173`） |
| `npm run dev:desktop` | 桌面端 web 开发服务器（`:1420`） |
| `npm run typecheck` | 应用与构建脚本的类型检查 |
| `npm run build` | 类型检查后构建社区扩展 |
| `npm run build:desktop-web` | 构建桌面端 web 产物 |
| `npm run preview` | 预览构建结果 |
| `npm run tauri:dev` | 桌面端调试 |
| `npm run tauri:build` | 桌面端打包 |
| `npm run sync:desktop-version` | 把 `package.json` 版本号同步进 Tauri 配置 |

## 相关仓库

| 仓库 | 说明 |
| --- | --- |
| <img src=".github/assets/icons/monitor.svg" width="16" height="16" align="absmiddle">&nbsp;[KukeChat-Client](https://github.com/kukemc/KukeChat-Client) | 本仓库：社区扩展与桌面端（Windows，macOS 测试中） |
| <img src=".github/assets/icons/server.svg" width="16" height="16" align="absmiddle">&nbsp;[KukeChat-Server](https://github.com/kukemc/KukeChat-Server) | 后端：REST API、WebSocket 与数据模型 |
| <img src=".github/assets/icons/smartphone.svg" width="16" height="16" align="absmiddle">&nbsp;[KukeChat-Android](https://github.com/kukemc/KukeChat-Android) | 原生 Android 应用，Kotlin + Jetpack Compose |

## 贡献

欢迎 Issue 和 Pull Request。提交前请确保 `npm run typecheck` 和 `npm run build` 通过，详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

一条硬性约定：不要在业务代码里写死任何服务器域名，新增的部署地址一律走 `src/config/env.ts` 和 `.env.example`。

## License

以 [MIT](LICENSE) 协议开源。

---

<div align="center">
<sub>MIT © 2026 kukemc</sub>
</div>
