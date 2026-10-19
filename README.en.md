<div align="center">

<img src=".github/assets/cover.png" alt="KukeChat" width="880">

# KukeChat

**A chat client that lives inside the creator community**

One React + TypeScript codebase that builds a Scratch / CCW community extension, a Windows desktop app and a mobile web app.

[![License](https://img.shields.io/badge/License-MIT-111111?style=flat-square)](LICENSE)
[![React](https://img.shields.io/badge/React-18.3-111111?style=flat-square&logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-111111?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tauri](https://img.shields.io/badge/Tauri-2-111111?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app)
[![CI](https://img.shields.io/github/actions/workflow/status/kukemc/KukeChat-Client/ci.yml?branch=main&style=flat-square&label=CI&color=111111)](https://github.com/kukemc/KukeChat-Client/actions/workflows/ci.yml)

[简体中文](README.md) · **English**

[About](#about) · [Platforms](#platforms) · [Features](#features) · [Quick start](#quick-start) · [Configuration](#configuration) · [Building](#building) · [Related repositories](#related-repositories)

</div>

---

## About

In visual programming communities, creators have always been scattered.

Project comments are asynchronous, with replies hours apart; community messages feel more like email than conversation. Finding someone to build a project with, asking "why won't this block run", telling a friend at midnight that their new project is great — none of this happens in real time on Scratch / CCW. So people set up group chats elsewhere: the creating stays in the community, the talking moves away.

KukeChat sets out to do one simple thing: **bring real-time conversation back to where creation happens.**

### Three principles

**Chat lives on the creative page.** The first form is a community extension. Once loaded, it mounts a draggable, resizable, minimizable floating window on the current page via Shadow DOM. You snap blocks together in the editor while the chat floats beside you, and you never leave your project. Shadow DOM keeps its styles and the host page's styles from interfering with each other.

**Chat wherever you create.** The extension in the community, the desktop app on your computer, an app on your phone. They share one set of business logic, state management and API layer, with only the shell swapped per platform. Change a feature once and every platform gets it.

**Chat itself is programmable.** This is a chat app for Scratchers, so it can be driven the Scratch way. The extension ships more than 40 blocks, from listening for new messages to full bot and group-moderation capabilities. If blocks aren't your thing, call the [Bot API](docs/bot-api.md) from any language. Letting users extend it with the skills they already have is what community spirit is about.

### Why open source

Something that serves a community shouldn't be a black box only one person can see into. You can audit exactly what data the client sends and where, deploy the whole stack for your own community, or fork it into something entirely different.

The client contains **no hard-coded server addresses**. You inject the backend address at build time — by design.

> [!NOTE]
> This repository contains only the client. The matching backend is [KukeChat-Server](https://github.com/kukemc/KukeChat-Server). You can also write your own backend that exposes the same REST + WebSocket interface; see [`docs/bot-api.md`](docs/bot-api.md), `src/api/` and `src/types/`.

## Platforms

| Platform | Runs on | Built with | Output | Status |
| --- | --- | --- | --- | --- |
| Community extension | CCW / Gandi IDE in the browser | Vite library mode + Shadow DOM | `dist/KukeChat.js` | Stable |
| Windows desktop | Windows | Tauri 2 (Rust + WebView2) | `.msi` / `-setup.exe` | Stable |
| Mobile web (H5) | Mobile browsers | Standalone page with the mobile layout | `dist-mobile/` | Self-hosted |
| Android | Android | Native app, Kotlin + Jetpack Compose | See [KukeChat-Android](https://github.com/kukemc/KukeChat-Android) | Stable, separate repo |
| macOS | macOS | Tauri 2 | `mac-beta` branch | Beta |
| Linux | Linux desktop | Community-maintained | [kenins.l2.ink/kukechat](https://kenins.l2.ink/kukechat/) | Unofficial |

Official installers (Windows, Android) are on the [KukeChat download page](https://chat-api.kuke.ink/download).

The desktop app comes with a system tray, tray flashing on new messages, launch at startup, single-instance mode and a built-in updater.

The `android/` directory in this repo is the early Capacitor shell (frozen at 1.3.1 and no longer updated). The official Android app now lives in [KukeChat-Android](https://github.com/kukemc/KukeChat-Android).

## Features

| Area | What's included |
| --- | --- |
| Messaging | Direct, group and temporary chats; text, images, multi-image, voice, stickers (animated included) and files; replies, @-mentions, reactions, recall; Markdown and in-message buttons (bots can update them live) |
| Voice | Voice messages that turn into text with one tap |
| Saving and forwarding | Favorites, featured group messages and merged forwards, each rendering every message type in full; merged forwards can be opened level by level |
| Finding things | QQ-style chat history search (by category, date and sender, click to jump), global search, an "@ mentioned you" jump pill |
| Interaction | Red packets (including voice red packets you claim by saying the passphrase), gifts and gift walls, polls, group to-dos |
| Groups | Owner / admin / member roles, mute all, slow mode, join approval, announcements, group stickers, member titles and levels, check-ins |
| Group upgrades | Pro / Pro+ / MAX tiers; group files with quotas, timed or permanent retention, upload progress, cancel and retry |
| Social | Friend requests and remarks, posts (publish, comment, like), team-up center, task boards, intimacy, friend streaks, birthdays, profile likes, levels |
| Personalization | Themes and wallpapers; avatar frames and chat bubbles from the shop |
| Community and safety | CCW account binding and project cards, reporting, community jury (exams, deliberation, precedents) |
| Client | Desktop notifications and tray alerts; auto-update with a real-time push when the backend publishes a release, with staggered checks across clients |

### Scratch blocks

The extension provides more than 40 blocks in four groups:

| Group | What it does |
| --- | --- |
| Basics | Window control, login state, unread count, new-message events, suggest joining a group / adding a friend |
| Bots | Set a key and connect to real-time messages; trigger on messages or @-mentions; send text, images, stickers, voice and direct messages; react, recall and update message buttons |
| Moderation | Look up members, mute / unmute, remove from group, review join requests (the bot must be an admin and follows the same permission rules as human admins) |
| Game mode | Bring a group chat onto the project stage; after the player authorizes, send as the player; customize the chat box's look and position |

```text
Set bot key [KEY]  →  Connect bot realtime
When bot is mentioned conversation=[] message=[] sender id=[] sender=[] type=[] content=[]
Bot send message [MESSAGE] to conversation [GROUP_ID]
Connect game chat to group [GROUP_ID]
```

## Tech stack

| Layer | Choice |
| --- | --- |
| UI | React 18 + TypeScript 5.6 (strict mode) |
| Build | Vite 5, one config per target |
| Styling | Tailwind CSS 3.4 + CSS-variable themes |
| State | Zustand 5 |
| Data | TanStack Query 5 (infinite scrolling, optimistic updates) |
| Real-time | Native WebSocket with reconnection and state sync |
| Desktop | Tauri 2 + Rust: tray, single instance, notifications, autostart, updater |
| Icons | lucide-react |

The Markdown renderer never uses `dangerouslySetInnerHTML`: every node is built from parsed tokens, and only http(s) links are allowed.

## Architecture

Business UI (`src/components`), global state (`src/store`), the API layer (`src/api`) and real-time events (`src/realtime`) are shared by every target. Each target only has its own entry point and shell:

| Target | Entry | Vite config | Output |
| --- | --- | --- | --- |
| Community extension | `src/extension/index.ts` | `vite.config.ts` | `dist/KukeChat.js` (single IIFE file) |
| Desktop | `src/desktop-app.tsx` | `vite.desktop.config.ts` | `dist-desktop/`, packaged by Tauri |
| Mobile web | `src/mobile-app.tsx` | `vite.mobile.config.ts` | `dist-mobile/` |

Platform differences are confined to `src/native/` (native capability wrappers) and `src/utils/appMode.ts` (runtime detection), so business components don't care which shell they run in. All three configs share `vite.env.ts` for environment validation.

## Quick start

You need Node.js 18+ (CI uses 20). The desktop app also needs stable Rust and the [Tauri 2 prerequisites](https://tauri.app/start/prerequisites/).

```bash
git clone https://github.com/kukemc/KukeChat-Client.git
cd KukeChat-Client
npm install
cp .env.example .env          # PowerShell: Copy-Item .env.example .env
```

Fill in your backend in `.env`:

```env
VITE_API_BASE_URL=https://chat.example.com
VITE_WS_URL=wss://chat.example.com/ws
```

Start the local preview:

```bash
npm run dev
```

The preview page (`:5173`) mounts the chat window on a plain web page and behaves exactly as the extension does inside CCW. During development, `/api`, `/uploads` and `/ws` are proxied to a local backend at `http://127.0.0.1:8000` by default; set `KUKE_DEV_REMOTE=1` to proxy to the backend configured in `.env` instead.

> [!IMPORTANT]
> If a required variable is missing, `dev` and every `build` fail immediately with a hint, rather than producing a bundle that can't reach a backend.

## Configuration

All deployment settings are injected from `.env` at build time; see [`.env.example`](.env.example) for the template.

| Variable | Required | Description |
| --- | :---: | --- |
| `VITE_API_BASE_URL` | Yes | Backend HTTP API root, without `/api/v1` or a trailing slash |
| `VITE_WS_URL` | Yes | Real-time WebSocket URL |
| `VITE_SECURE_LOGIN_ORIGIN` | | Trusted origin for the secure-login popup's `postMessage`; defaults to the API origin |
| `VITE_DESKTOP_UPDATE_URL` | | Fallback desktop update metadata URL; defaults to `<API>/desktop-update.json` |
| `VITE_MOBILE_UPDATE_URL` | | Fallback mobile update metadata URL; defaults to `<API>/desktop-update.json` |
| `VITE_EXTENSION_ASSET_URL` | | URL of the published extension file, shown in the bot setup guide; hidden if empty |
| `VITE_BOT_API_DOCS_URL` | | Bot API docs URL for the block palette's docs link; hidden if empty |
| `KUKECHAT_UPDATE_METADATA_URL` | | Overrides the desktop update metadata URL (read by Rust; runtime takes precedence over compile time), handy for local testing |

When checking for updates, the client first asks the backend's `/api/v1/releases/latest` for the changelog, forced-update flag and sha256, and only falls back to the metadata URLs above if that endpoint is unavailable.

Configuration code lives in `src/config/`:

| File | Responsibility |
| --- | --- |
| `env.ts` | Deployment settings, all from environment variables, with no default server address |
| `ccw.ts` | Public CCW platform domains and link builders |
| `branding.ts` | App name, extension ID, credits and sponsor links |

To fork your own edition, editing `branding.ts` is enough to rebrand the whole app (MIT requires keeping the original copyright notice in `LICENSE`).

## Building

### Community extension

```bash
npm run build
```

The output is `dist/KukeChat.js`; load it with the CCW / Gandi extension loader. The community caches extensions, so remove the old one before loading an update.

### Windows desktop

```bash
npm run tauri:dev      # debug
npm run tauri:build    # build the .msi and -setup.exe installers
```

The version comes from `version` in `package.json`. `tauri:dev` / `tauri:build` run `sync:desktop-version` first, which copies it into `src-tauri/tauri.conf.json`, `Cargo.toml` and `Cargo.lock`.

### Mobile web

```bash
npm run build:mobile-web
```

The output is in `dist-mobile/`; deploy it as a static site.

### CI and releases

| Workflow | Trigger | What it does |
| --- | --- | --- |
| [`ci.yml`](.github/workflows/ci.yml) | Push to `main`, pull requests | Type-checks and builds the extension, desktop web and mobile web bundles |
| [`release.yml`](.github/workflows/release.yml) | Push a `v*` tag | Builds every target in parallel and collects them into a draft release to publish after review |

Release builds read backend addresses from repository variables (Settings → Secrets and variables → Actions → Variables), using the same names as the configuration table above; set your own after forking. `release.yml` still includes the APK job for the legacy Capacitor shell, which needs the `ANDROID_KEYSTORE_*` set of signing secrets.

## Project structure

```text
src/
  api/            REST wrappers, split by domain
  app/            App shell, window management, panel switching
  components/     Business UI, grouped by feature
  config/         Deployment config, CCW constants, branding
  extension/      Extension entry, block definitions, game mode, self-update
  native/         Tauri / mobile native capability wrappers
  realtime/       WebSocket client and event dispatch
  store/          Zustand global state
  styles/         Tailwind and Shadow DOM style injection
  theme/          Themes and wallpapers
  types/          API and real-time event types
  utils/          Shared utilities
src-tauri/        Tauri desktop app (Rust)
android/          Early Capacitor shell (no longer updated)
dev/              Component preview pages and mock APIs
docs/             Bot API, CCW runtime API, per-version release notes
scripts/          Version sync, packaging and test scripts
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Local extension preview (`:5173`) |
| `npm run dev:desktop` | Desktop web dev server (`:1420`) |
| `npm run typecheck` | Type-check the app and build scripts |
| `npm run build` | Type-check, then build the community extension |
| `npm run build:desktop-web` | Build the desktop web bundle |
| `npm run build:mobile-web` | Build the mobile web bundle |
| `npm run preview` | Preview the build output |
| `npm run tauri:dev` | Debug the desktop app |
| `npm run tauri:build` | Package the desktop app |
| `npm run sync:desktop-version` | Sync the `package.json` version into the Tauri config |
| `npm run android:sync` / `android:apk` | Sync and package the legacy Capacitor shell |

## Related repositories

| Repository | Description |
| --- | --- |
| [KukeChat-Client](https://github.com/kukemc/KukeChat-Client) | This repo: community extension, Windows desktop, mobile web |
| [KukeChat-Server](https://github.com/kukemc/KukeChat-Server) | Backend: REST API, WebSocket and data models |
| [KukeChat-Android](https://github.com/kukemc/KukeChat-Android) | Native Android app, Kotlin + Jetpack Compose |

## Contributing

Issues and pull requests are welcome. Please make sure `npm run typecheck` and `npm run build` pass before submitting; see [CONTRIBUTING.md](CONTRIBUTING.md).

One hard rule: never hard-code a server domain in business code. Any new deployment address goes through `src/config/env.ts` and `.env.example`.

## License

Released under the [MIT](LICENSE) License.

---

<div align="center">
<sub>MIT © 2026 kukemc</sub>
</div>
