# KukeChat Client

Scratch/CCW 社区扩展 + Windows 桌面端（Tauri）+ Android（Capacitor），一套 React + TypeScript 代码三端复用。

## 这个仓库的定位

**客户端代码的唯一真相源。** 改客户端一律在这里改。

相关仓库：

| 仓库 | 位置 | 说明 |
| --- | --- | --- |
| KukeChat-Client | 本仓库（公开） | 客户端三端 |
| KukeChat-Server | `../KukeChat-Server`（公开） | 后端 API |
| KukeChat | `../KukeChat`（私有） | 后台管理端 + 运维脚本 |

> `../KukeChat/KukeChat/` 是拆分前的旧副本，**不要在那里改代码**。

## 常用命令

```bash
npm run dev              # 扩展本地预览（:5173，代理到本地后端 :8000）
npm run typecheck        # 应用 + 构建脚本类型检查
npm run build            # 扩展 → dist/KukeChat.js
npm run build:desktop-web
npm run build:mobile-web
npm run tauri:dev        # 桌面端调试
npm run tauri:build      # 桌面端打包
npm run android:sync     # 构建移动端 web 并同步到 android/
npm run android:apk      # Windows 一条龙打 APK
```

提交前 `npm run typecheck` 和 `npm run build` 必须通过。

## 硬性约定

**1. 不要在业务代码里写死任何服务器域名。**

所有部署相关地址走 `src/config/`：

| 文件 | 职责 |
| --- | --- |
| `src/config/env.ts` | 部署配置，全部来自 `VITE_*` 环境变量，**无任何默认值** |
| `src/config/ccw.ts` | CCW 社区平台的公开域名与链接拼装 |
| `src/config/branding.ts` | 应用名、扩展 ID、署名、赞助入口 |

新增地址类配置时：加到 `env.ts` → 加到 `.env.example` → 加到 `src/vite-env.d.ts` 的 `ImportMetaEnv`。

`vite.env.ts` 会在三份构建配置里校验必填项，缺失直接构建失败 —— 这是刻意的，不要为了方便加回退默认值。

**2. 绝不把 `runtime.ccwAPI` 的返回值当作身份或权限依据。**

`ccwAPI` 运行在作品页面里，任何脚本都能覆写它的方法返回伪造数据。它的产物只能
用于渲染界面文案。身份判断一律以安全登录换取的令牌为准 —— 那个令牌由后端签发
和校验，页面无法伪造。

封装见 `src/extension/gameMode/ccwIdentity.ts`：类型名带 `Untrusted` 前缀，
且只暴露 `displayName` / `avatarUrl`，不暴露 `userId` / `uuid`。新增字段前先想清楚
它会不会被误当成凭据。完整 API 清单见 [`docs/ccw-runtime-api.md`](docs/ccw-runtime-api.md)。

**3. 本地开发需要 `.env`。**

```bash
cp .env.example .env    # 至少填 VITE_API_BASE_URL 和 VITE_WS_URL
```

## 目录结构

```text
src/
  api/          REST 封装，按业务域拆分
  app/          应用外壳、窗口管理、面板路由
  components/   业务 UI，按功能域分目录
  config/       部署配置 / CCW 常量 / 品牌信息
  extension/    扩展入口、积木定义、桥接、自更新
  mobile/       移动端功能开关与排序
  native/       Capacitor / Tauri 原生能力封装
  realtime/     WebSocket 客户端与事件分发
  store/        Zustand 全局状态
  types/        接口与实时事件类型
  utils/        通用工具
android/        Capacitor Android 工程（含自研原生插件）
src-tauri/      Tauri 桌面端（Rust）
```

三份 Vite 配置对应三个目标：`vite.config.ts`（扩展）、`vite.desktop.config.ts`、`vite.mobile.config.ts`，共用 `vite.env.ts` 做校验。

平台差异收敛在 `src/native/` 和 `src/utils/appMode.ts`，业务组件不应关心自己跑在哪个壳里。

## 技术栈约定

- React 18 + TypeScript 严格模式，不要用 `any` 兜底
- 状态用 Zustand（`src/store/kukeStore.ts`），数据请求用 TanStack Query
- 图标一律走 `src/components/ui/Icon.tsx`（lucide-react），不要手写 SVG path
- 样式用 Tailwind + CSS 变量（`src/styles/tailwind.css`），扩展形态下通过 Shadow DOM 注入
- Markdown 渲染器禁止 `dangerouslySetInnerHTML`，所有节点由解析后的 token 构造，URL 走 http(s) 白名单

## 容易踩的坑

**移动端版本号有两处**，发版时必须同步：

- `src/native/appUpdate.ts` 的 `MOBILE_APP_VERSION` —— 客户端自更新的比较基准
- `android/app/build.gradle` 的 `versionName` / `versionCode`

**桌面端版本号**以 `package.json` 的 `version` 为准，`npm run sync:desktop-version` 会同步进 `tauri.conf.json` / `Cargo.toml` / `Cargo.lock`，`tauri:dev` 和 `tauri:build` 已自动执行。

**桌面端更新源**由 Rust 在编译期读 `KUKECHAT_UPDATE_METADATA_URL`（无 `VITE_` 前缀），不设置则跳过更新检查。改动后需重新编译才生效。

**扩展在社区侧有缓存**，更新后要先卸载旧扩展再重新加载。

**游戏模式覆盖层贴合舞台**（`src/extension/gameMode/stage.ts`）有三条不能改的约定：

- 用布局盒 `offsetLeft/offsetWidth` 定位，**不要用 `getBoundingClientRect()`** ——
  手机播放器会把舞台整体 rotate(90deg)，包围盒宽高会被对调、原点也不对，
  覆盖层会缩成一小块贴在角落
- 覆盖层必须挂成舞台 canvas 的**兄弟节点**，祖先层面的 transform 才会自动生效
- 用 `requestAnimationFrame` 持续对齐，不要用 ResizeObserver —— 舞台尺寸变化
  来源太多（布局切换、全屏、窗口缩放、设备旋转、CSS 动画），逐个监听会漏

聊天框的宽高与字号都是**舞台逻辑单位**（默认 480×360），不是屏幕像素。

**Android 签名密钥必须固定**。换密钥签出来的 APK 无法覆盖安装到已有版本，客户端自动更新会一起失效。

## 发布

推 `v*` 标签触发 `.github/workflows/release.yml`：三端并行构建 → 汇总成草稿 Release → 人工确认后发布。

生产地址来自**仓库变量**（Settings → Secrets and variables → Actions → Variables），不写在源码里。Android 签名走 secrets，见 README「发布」一节。

## 更新日志

- 面向用户的更新日志用于客户端「公告」（后台公告编辑器发布）：简洁、口语化，格式为「x.y.z 更新内容包括：」加短横线列表，每条一句话。
- `CHANGELOG.md` 保留面向开发者的详细版（新功能 / 体验优化 / 问题修复）。
- 被要求"写更新日志"时，默认产出公告用的简洁版。
