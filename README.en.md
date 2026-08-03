<div align="center">

# KukeChat

**A chat client that lives where the creating happens**

One React + TypeScript codebase, built as a Scratch / CCW community extension, a Windows desktop app, and an Android app.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/kukemc/KukeChat-Client/actions/workflows/ci.yml/badge.svg)](https://github.com/kukemc/KukeChat-Client/actions/workflows/ci.yml)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6.svg)](https://www.typescriptlang.org)
[![Tauri](https://img.shields.io/badge/Tauri-2-ffc131.svg)](https://tauri.app)
[![Capacitor](https://img.shields.io/badge/Capacitor-6-119eff.svg)](https://capacitorjs.com)

**English** · [简体中文](README.md)

</div>

---

## About

In block-based programming communities, creators are structurally **disconnected**.

Comment sections are asynchronous — a reply might come hours later. Community DMs feel more like email than conversation. Wanting to find a collaborator, wanting to ask "why won't this block fire," wanting to tell a friend "this is really good" the night they publish something — none of this can happen in the moment on Scratch or CCW. So everyone leaves for another chat app, builds a group there, and the community ends up as a place you can look at but not talk in.

KukeChat exists to do one thing: **put real-time conversation back where the creating happens.**

### Three commitments

**1. Chat should live on the creation page, not in another window.**

KukeChat's primary form is a community extension. Once loaded, it mounts a draggable, resizable, minimizable floating window onto the current page using Shadow DOM — you're writing blocks in the editor and the chat floats right beside it. No tab switching, no leaving your project. Shadow DOM guarantees it won't leak styles into the host page, and the host page can't leak into it.

**2. Wherever you create, that's where you chat.**

The same codebase builds three forms: the extension inside the community, a desktop client on your computer, an app on your phone. Not three projects drifting apart — one business layer, one state store, one API layer, with the shell swapped per platform. Change a feature once, all three get it.

**3. Chat itself should be programmable.**

This is a chat app for Scratchers, so it has to be drivable the Scratch way. The extension ships 30+ blocks: check login state, listen for new messages, recommend a group, recommend a friend — plus a full bot block set for connecting to the realtime feed, sending and receiving messages, posting images / voice / stickers, adding reactions, recalling messages, and updating buttons embedded in messages. You can build a group-moderation bot out of blocks, or call the [Bot API](docs/bot-api.md) from any language. **Users can extend it using what they already know** — that's the community spirit, encoded.

### Why open source

Something built to serve a community shouldn't be a black box that only one person can see inside.

Open source means: you can audit exactly what the client sends and where; you can deploy the whole thing yourself for your own community; you can fork it into something completely different. The client contains **no hardcoded server address anywhere** — the backend URL must be injected by you at build time. That's a deliberate design decision, not an oversight.

Released under the [MIT License](LICENSE), so you can do nearly anything with it, commercial use included.

> **Note: this repository contains the client only.** The server is not part of this release; you'll need to implement a backend exposing the same REST + WebSocket contract. See [`docs/bot-api.md`](docs/bot-api.md) along with `src/api/` and `src/types/` for the contract.

---

## Three forms

| Form | Runs on | Built with | Output |
| --- | --- | --- | --- |
| **Community extension** | CCW / Gandi IDE web page | Vite library mode + Shadow DOM | `dist/KukeChat.js` |
| **Desktop** | Windows | Tauri 2 (Rust + WebView2) | `.msi` / `.exe` |
| **Mobile** | Android 5.1+ | Capacitor 6 | `.apk` |

The desktop build adds a system tray, blinking message alerts, launch-on-startup, and a built-in updater. The mobile build adds local notifications, a background realtime connection, back-button handling, and APK self-update.

## Features

<table>
<tr><td width="33%" valign="top">

**Messaging**
- Direct, group, and temporary conversations
- Text, images, multi-image, voice, stickers
- Quotes, @mentions, emoji reactions
- Recall, forward, bookmark, feature
- In-message button components (bots can update them live)
- Built-in image viewer (zoom / pan / multi-image)
- In-conversation search with context jump

</td><td width="33%" valign="top">

**Social**
- Friend search, requests, nicknames
- Group creation, profiles, announcements
- Roles: owner / admin / member
- Mute-all, slow mode, join approval
- Member titles, levels, check-ins
- Posts: publish, comment, like
- Team-up hub: profiles, skill tags, portfolios

</td><td width="33%" valign="top">

**Extensibility**
- 30+ Scratch blocks
- Bots: key auth + WebSocket events
- Task system: boards, groups, event cards
- CCW account binding and project card parsing
- Global search, invites, reporting
- Announcements, notifications, presence
- Reorderable feature entries on mobile

</td></tr>
</table>

### Scratch blocks

Window control, login state, unread count, new-message events, recommend-a-group / recommend-a-friend, plus the full bot block set:

```
set bot key [KEY]  →  connect bot realtime
when bot receives message  conv=[] msg=[] sender=[] type=[] content=[]
when bot is mentioned      conv=[] msg=[] sender=[] type=[] content=[]
bot send message [MESSAGE] to conversation [GROUP_ID]
bot send [image/sticker] URL [URL] to group [GROUP_ID]
bot toggle reaction [EMOJI] on message [] in group []
bot update button [] label [] variant [] disabled [] scope [] on message [] in conversation []
```

Prefer not to use blocks? Call the REST + WebSocket API directly — see the [Bot API docs](docs/bot-api.md).

## Tech stack

**Core**

| | |
| --- | --- |
| UI | React 18 + TypeScript 5.6 (strict mode) |
| Build | Vite 5 (three configs, one per target) |
| Styling | Tailwind CSS 3.4 + CSS-variable theming |
| State | Zustand 5 (with persistence and per-platform strategies) |
| Data | TanStack Query 5 (infinite scroll, optimistic updates) |
| Icons | lucide-react |

**Platform layer**

| | |
| --- | --- |
| Extension | Shadow DOM mount, single-file IIFE bundle, injects `window.tempExt` at runtime |
| Desktop | Tauri 2 + Rust: tray, single instance, notifications, autostart, updater |
| Mobile | Capacitor 6 + custom Android plugins (system bars, APK download & install) |
| Realtime | Native WebSocket, 40+ event types, reconnection and state reconciliation |

**Engineering**

- Full TypeScript strict mode; `npm run typecheck` covers both app code and build scripts
- Deployment config centralized in `src/config/`, validated at build time — missing values fail the build
- GitHub Actions runs typecheck plus all three builds on every PR
- Hardened Markdown renderer: no `dangerouslySetInnerHTML`, every node constructed from parsed tokens, URLs filtered through an http(s) allow-list

## Architecture

```
                    ┌─────────────────────────────┐
                    │  src/components   business UI│
                    │  src/store        global state│
                    │  src/api          API layer  │
                    │  src/realtime     event feed │
                    └──────────────┬──────────────┘
                                   │  shared
              ┌────────────────────┼────────────────────┐
              │                    │                    │
      ┌───────▼───────┐   ┌────────▼────────┐   ┌───────▼───────┐
      │ extension/    │   │ desktop-app.tsx │   │ mobile-app.tsx│
      │ Shadow DOM    │   │ Tauri window    │   │ Capacitor     │
      │ + block defs  │   │ + tray/updater  │   │ + notif/bg    │
      └───────────────┘   └─────────────────┘   └───────────────┘
       vite.config.ts    vite.desktop.config   vite.mobile.config
```

Platform differences are confined to `src/native/` (native capability wrappers) and `src/utils/appMode.ts` (runtime environment detection), so business components generally don't need to know which shell they're running in. Layout mode (desktop / mobile) is decided centrally in `src/store/kukeStore.ts` and can be overridden by the user.

---

## Getting started

### Requirements

- Node.js 18+ and npm
- For desktop: stable Rust toolchain + [Tauri 2 system dependencies](https://tauri.app/start/prerequisites/)
- For Android: JDK 17 + Android SDK (on Windows, `scripts/build-android.ps1` can fetch the command-line tools automatically)

### Install and configure

```bash
git clone https://github.com/kukemc/KukeChat-Client.git
cd KukeChat-Client
npm install
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
```

Edit `.env` and fill in at least these two:

```env
VITE_API_BASE_URL=https://chat.example.com
VITE_WS_URL=wss://chat.example.com/ws
```

**Without them the build will not run.** `vite.env.ts` validates required values across all three build configs and fails fast with a clear message, rather than producing a bundle that can't reach a backend.

### Local preview

```bash
npm run dev
```

The preview page mounts the chat window into an ordinary web page via Shadow DOM, behaving exactly as it does when triggered by a block inside CCW. In dev mode, requests are proxied to a local backend at `http://127.0.0.1:8000`.

## Configuration

All deployment configuration lives in [`src/config/`](src/config/) and is injected by Vite from `.env` at build time:

| Variable | Required | Description |
| --- | :---: | --- |
| `VITE_API_BASE_URL` | ✅ | Backend HTTP API root, without `/api/v1` |
| `VITE_WS_URL` | ✅ | Realtime WebSocket endpoint |
| `VITE_SECURE_LOGIN_ORIGIN` | | Trusted origin for the secure-login popup's `postMessage`; defaults to the API origin |
| `VITE_MOBILE_UPDATE_URL` | | Android update metadata URL; defaults to `<API>/desktop-update.json` |
| `VITE_EXTENSION_ASSET_URL` | | Published extension file URL, shown in the bot onboarding dialog; hidden if unset |
| `VITE_BOT_API_DOCS_URL` | | Bot API docs URL for the block palette's docs entry; hidden if unset |

The desktop "check for updates" URL is read by the Rust side at **compile time** from `KUKECHAT_UPDATE_METADATA_URL` (no `VITE_` prefix). If unset, the update check is skipped.

The three config files have clear boundaries:

| File | Responsibility |
| --- | --- |
| `src/config/env.ts` | Deployment values, entirely from environment variables, no defaults |
| `src/config/ccw.ts` | CCW community platform domains and link builders |
| `src/config/branding.ts` | App name, extension ID, credits, sponsorship link |

Forking into your own version? Editing `branding.ts` alone is enough to rebrand (MIT requires keeping the original copyright notice in `LICENSE`).

## Building

### Community extension

```bash
npm run build
```

Produces `dist/KukeChat.js`. Load it in the CCW / Gandi extension loader — it sets `window.tempExt`.

> The community caches extensions, so after an update it's best to remove the old extension before loading the new file.

### Windows desktop

```bash
npm run tauri:dev      # development
npm run tauri:build    # build installers
```

The desktop version number follows `version` in `package.json`. `npm run sync:desktop-version` propagates it to `src-tauri/tauri.conf.json`, `Cargo.toml`, and `Cargo.lock`; both `tauri:dev` and `tauri:build` run it automatically.

### Android

```bash
npm run android:sync   # build the mobile web bundle and sync into android/
npm run android:apk    # Windows: one-shot APK build
```

A signed release APK needs your own `keystore.properties` in `android/` (excluded via `.gitignore`):

```properties
storeFile=your-release.keystore
storePassword=...
keyAlias=...
keyPassword=...
```

Without it you'll only get an unsigned APK, and the build script will fail loudly.

> **Release note:** the mobile version number lives in two places that must stay in sync — `MOBILE_APP_VERSION` in `src/native/appUpdate.ts` and `versionName` / `versionCode` in `android/app/build.gradle`. The former is the baseline the client compares against when checking for updates.

## Project structure

```text
src/
  api/          REST wrappers, split by domain
  app/          app shell, window management, panel routing
  components/   business UI, organized by domain
  config/       deployment config, CCW constants, branding
  extension/    community extension entry, block definitions, bridge, self-update
  mobile/       mobile feature toggles and ordering
  native/       Capacitor / Tauri native capability wrappers
  realtime/     WebSocket client and event dispatch
  store/        Zustand global state
  styles/       Tailwind and Shadow DOM style injection
  types/        API and realtime event types
  utils/        shared utilities
android/        Capacitor Android project (with custom native plugins)
src-tauri/      Tauri desktop project (Rust)
docs/           Bot API documentation
scripts/        version sync and Android build scripts
```

## Common commands

| Command | Description |
| --- | --- |
| `npm run dev` | Local extension preview |
| `npm run typecheck` | Type-check app code and build scripts |
| `npm run build` | Build the community extension |
| `npm run build:desktop-web` | Build the desktop web bundle |
| `npm run build:mobile-web` | Build the mobile web bundle |
| `npm run tauri:dev` / `tauri:build` | Desktop development / packaging |
| `npm run android:sync` / `android:apk` | Mobile sync / packaging |

## Contributing

Issues and pull requests are welcome. Please make sure `npm run typecheck` and `npm run build` both pass before submitting — see [CONTRIBUTING.md](CONTRIBUTING.md).

One hard rule: **never hardcode a server domain in business code.** Any new deployment-related URL goes through `src/config/env.ts` and `.env.example`.

## License

[MIT](LICENSE) © kukemc

If this project helped you, a Star is appreciated.
