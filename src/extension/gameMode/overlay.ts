/**
 * 舞台上的游戏风格聊天框。
 *
 * 用原生 DOM + Shadow DOM 挂在 Scratch 舞台容器里：Shadow DOM 保证作品自己的
 * 样式不会串进来，也不会被聊天框影响；不引入 React 是为了让这层足够轻，
 * 作品运行时不该为一个聊天框付出额外的框架开销。
 */

import { resolveAssetUrl } from '@/utils/assetUrl';
import { authorizeGameMode, isGameAuthorized, subscribeGameAuth } from './auth';
import {
  refreshGameSession,
  sendGameChatMessage,
  subscribeGameChat,
  type GameChatMessage,
  type GameChatState
} from './session';

export type OverlayCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface OverlayStyle {
  corner: OverlayCorner;
  width: number;
  height: number;
  /** 面板不透明度，0–100。 */
  opacity: number;
  accent: string;
  background: string;
  textColor: string;
  fontSize: number;
  radius: number;
  showAvatars: boolean;
  showTitle: boolean;
}

export const DEFAULT_OVERLAY_STYLE: OverlayStyle = {
  corner: 'bottom-left',
  width: 300,
  height: 220,
  opacity: 72,
  accent: '#5b8cff',
  background: '#0b1020',
  textColor: '#f3f5ff',
  fontSize: 13,
  radius: 14,
  showAvatars: true,
  showTitle: true
};

let host: HTMLElement | null = null;
let root: ShadowRoot | null = null;
let panel: HTMLElement | null = null;
let listEl: HTMLElement | null = null;
let inputEl: HTMLInputElement | null = null;
let footerEl: HTMLElement | null = null;
let titleEl: HTMLElement | null = null;
let style: OverlayStyle = { ...DEFAULT_OVERLAY_STYLE };
let visible = false;
let unsubscribers: Array<() => void> = [];
let renderedIds = new Set<number>();

/**
 * 找到 Scratch 舞台容器。
 *
 * 不同版本的编辑器/播放器类名不一样，所以优先按舞台 canvas 反查其定位父元素，
 * 找不到就退回 body（此时聊天框相对视口定位，仍然可用）。
 */
function findStageContainer(): HTMLElement {
  const canvas = document.querySelector<HTMLCanvasElement>('canvas[class*="stage"], .stage canvas, canvas');
  let node: HTMLElement | null = canvas?.parentElement ?? null;
  while (node && node !== document.body) {
    const position = window.getComputedStyle(node).position;
    if (position === 'relative' || position === 'absolute' || position === 'fixed') {
      return node;
    }
    node = node.parentElement;
  }
  return canvas?.parentElement ?? document.body;
}

function cornerCss(corner: OverlayCorner): string {
  const inset = '12px';
  switch (corner) {
    case 'top-left':
      return `top:${inset};left:${inset};`;
    case 'top-right':
      return `top:${inset};right:${inset};`;
    case 'bottom-right':
      return `bottom:${inset};right:${inset};`;
    case 'bottom-left':
    default:
      return `bottom:${inset};left:${inset};`;
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '').trim();
  const full =
    normalized.length === 3
      ? normalized.split('').map((c) => c + c).join('')
      : normalized.padEnd(6, '0').slice(0, 6);
  const value = Number.parseInt(full, 16);
  if (!Number.isFinite(value)) {
    return `rgba(11, 16, 32, ${alpha})`;
  }
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildStyleSheet(): string {
  const bg = hexToRgba(style.background, Math.min(Math.max(style.opacity, 0), 100) / 100);
  return `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: inherit; }
    .panel {
      position: absolute; ${cornerCss(style.corner)}
      display: flex; flex-direction: column;
      width: ${style.width}px; height: ${style.height}px;
      background: ${bg};
      color: ${style.textColor};
      border: 1px solid ${hexToRgba(style.accent, 0.35)};
      border-radius: ${style.radius}px;
      backdrop-filter: blur(10px);
      box-shadow: 0 10px 34px rgba(0, 0, 0, 0.38);
      font-family: system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      font-size: ${style.fontSize}px;
      overflow: hidden;
      z-index: 2147483000;
      pointer-events: auto;
    }
    .title {
      display: flex; align-items: center; gap: 6px;
      padding: 7px 10px;
      border-bottom: 1px solid ${hexToRgba(style.accent, 0.22)};
      font-size: ${Math.max(style.fontSize - 2, 10)}px;
      font-weight: 700;
      letter-spacing: .02em;
      opacity: .92;
    }
    .title .dot { width: 6px; height: 6px; border-radius: 999px; background: ${style.accent}; flex: 0 0 auto; }
    .title .count { margin-left: auto; opacity: .6; font-weight: 600; }
    .list {
      flex: 1 1 auto; min-height: 0;
      overflow-y: auto; overflow-x: hidden;
      padding: 8px 10px;
      display: flex; flex-direction: column; gap: 6px;
      scrollbar-width: thin;
      scrollbar-color: ${hexToRgba(style.accent, 0.5)} transparent;
    }
    .list::-webkit-scrollbar { width: 5px; }
    .list::-webkit-scrollbar-thumb { background: ${hexToRgba(style.accent, 0.5)}; border-radius: 999px; }
    .row { display: flex; gap: 6px; align-items: flex-start; line-height: 1.45; word-break: break-word; }
    .row img { width: 18px; height: 18px; border-radius: 999px; flex: 0 0 auto; object-fit: cover; margin-top: 1px; }
    .row .name { color: ${style.accent}; font-weight: 700; flex: 0 0 auto; }
    .row.own .name { color: #ffd479; }
    .row .text { flex: 1 1 auto; }
    .system { text-align: center; opacity: .55; font-size: ${Math.max(style.fontSize - 2, 10)}px; padding: 2px 0; }
    .footer { display: flex; gap: 6px; padding: 7px 8px; border-top: 1px solid ${hexToRgba(style.accent, 0.22)}; }
    input {
      flex: 1 1 auto; min-width: 0;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid ${hexToRgba(style.accent, 0.28)};
      border-radius: ${Math.max(style.radius - 6, 6)}px;
      padding: 5px 8px;
      color: ${style.textColor};
      font-size: ${style.fontSize}px;
      outline: none;
    }
    input::placeholder { color: ${style.textColor}; opacity: .45; }
    input:focus { border-color: ${style.accent}; }
    button {
      flex: 0 0 auto;
      border: 0; cursor: pointer;
      border-radius: ${Math.max(style.radius - 6, 6)}px;
      padding: 5px 11px;
      background: ${style.accent};
      color: #fff;
      font-size: ${style.fontSize}px;
      font-weight: 700;
    }
    button:disabled { opacity: .55; cursor: default; }
    .auth { width: 100%; }
    .hidden { display: none !important; }
  `;
}

function applyStyle(): void {
  if (!root) {
    return;
  }
  const sheet = root.querySelector('style');
  if (sheet) {
    sheet.textContent = buildStyleSheet();
  }
}

function scrollToBottom(): void {
  if (listEl) {
    listEl.scrollTop = listEl.scrollHeight;
  }
}

function renderMessage(message: GameChatMessage): void {
  if (!listEl || renderedIds.has(message.id)) {
    return;
  }
  renderedIds.add(message.id);

  const row = document.createElement('div');
  row.className = message.own ? 'row own' : 'row';

  if (style.showAvatars) {
    const avatar = resolveAssetUrl(message.avatarUrl);
    if (avatar) {
      const img = document.createElement('img');
      img.src = avatar;
      img.alt = '';
      row.appendChild(img);
    }
  }

  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = `${message.senderName}:`;
  const text = document.createElement('span');
  text.className = 'text';
  // 用 textContent 而非 innerHTML —— 消息内容来自其他玩家，绝不能当 HTML 解析
  text.textContent = message.content;

  row.append(name, text);
  listEl.appendChild(row);

  const atBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 60;
  while (listEl.childElementCount > 200) {
    listEl.removeChild(listEl.firstElementChild as ChildNode);
  }
  if (atBottom || message.own) {
    scrollToBottom();
  }
}

function renderSystem(text: string): void {
  if (!listEl) {
    return;
  }
  const row = document.createElement('div');
  row.className = 'system';
  row.textContent = text;
  listEl.appendChild(row);
  scrollToBottom();
}

function renderFooter(state: GameChatState): void {
  if (!footerEl) {
    return;
  }
  footerEl.replaceChildren();

  if (state.status === 'error') {
    const hint = document.createElement('div');
    hint.className = 'system';
    hint.style.padding = '2px 0';
    hint.textContent = state.error ?? '接入失败';
    footerEl.appendChild(hint);
    return;
  }

  if (isGameAuthorized()) {
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 500;
    input.placeholder = state.willAutoJoin ? '发言后将自动加入本群…' : '说点什么…';
    const send = document.createElement('button');
    send.type = 'button';
    send.textContent = '发送';

    const submit = async (): Promise<void> => {
      const value = input.value.trim();
      if (!value) {
        return;
      }
      input.value = '';
      send.disabled = true;
      const result = await sendGameChatMessage(value);
      send.disabled = false;
      if (result === 'unauthorized') {
        renderSystem('登录状态已失效，请重新授权');
        renderFooter(state);
      } else if (result === 'failed') {
        renderSystem('发送失败，请稍后再试');
      }
      input.focus();
    };

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void submit();
      }
      // 阻止按键冒泡到 Scratch，否则打字会触发作品里的按键积木
      event.stopPropagation();
    });
    input.addEventListener('keyup', (event) => event.stopPropagation());
    input.addEventListener('keypress', (event) => event.stopPropagation());
    send.addEventListener('click', () => void submit());

    inputEl = input;
    footerEl.append(input, send);
    return;
  }

  const authorize = document.createElement('button');
  authorize.type = 'button';
  authorize.className = 'auth';
  authorize.textContent = '授权 KukeChat 账号后发言';
  authorize.addEventListener('click', async () => {
    authorize.disabled = true;
    authorize.textContent = '正在授权…';
    const result = await authorizeGameMode();
    authorize.disabled = false;
    if (result === 'authorized') {
      await refreshGameSession();
      renderSystem('已授权，现在可以发言了');
    } else if (result === 'blocked') {
      authorize.textContent = '弹窗被拦截，请允许后重试';
      renderSystem('浏览器拦截了登录窗口，请在地址栏放行弹窗');
      return;
    } else {
      authorize.textContent = '授权 KukeChat 账号后发言';
    }
  });
  footerEl.appendChild(authorize);
}

function renderState(state: GameChatState): void {
  if (!panel) {
    return;
  }

  if (titleEl) {
    titleEl.classList.toggle('hidden', !style.showTitle);
    const label = state.title || '群聊';
    titleEl.replaceChildren();
    const dot = document.createElement('span');
    dot.className = 'dot';
    const name = document.createElement('span');
    name.textContent = state.status === 'connected' ? label : `${label}（连接中…）`;
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = state.memberCount ? `${state.memberCount} 人` : '';
    titleEl.append(dot, name, count);
  }

  if (listEl) {
    const known = new Set(state.messages.map((item) => item.id));
    // 会话重建（重新接入）时清空重画，否则只增量追加
    const stale = [...renderedIds].some((id) => !known.has(id));
    if (stale) {
      listEl.replaceChildren();
      renderedIds = new Set();
    }
    for (const message of state.messages) {
      renderMessage(message);
    }
  }

  renderFooter(state);
}

export function mountGameOverlay(): void {
  if (host) {
    setGameOverlayVisible(true);
    return;
  }

  host = document.createElement('div');
  host.id = 'kukechat-game-overlay';
  host.style.position = 'absolute';
  host.style.inset = '0';
  host.style.pointerEvents = 'none';
  host.style.zIndex = '2147483000';

  root = host.attachShadow({ mode: 'open' });
  const sheet = document.createElement('style');
  sheet.textContent = buildStyleSheet();

  panel = document.createElement('div');
  panel.className = 'panel';

  titleEl = document.createElement('div');
  titleEl.className = 'title';
  listEl = document.createElement('div');
  listEl.className = 'list';
  footerEl = document.createElement('div');
  footerEl.className = 'footer';

  panel.append(titleEl, listEl, footerEl);
  root.append(sheet, panel);

  const container = findStageContainer();
  if (container === document.body) {
    host.style.position = 'fixed';
  }
  container.appendChild(host);

  renderedIds = new Set();
  unsubscribers = [
    subscribeGameChat(renderState),
    subscribeGameAuth(() => {
      // 授权状态变化只影响底部输入区
      if (footerEl) {
        renderFooter(currentState);
      }
    })
  ];
  visible = true;
}

let currentState: GameChatState = {
  status: 'idle',
  conversationId: null,
  creationOid: null,
  title: null,
  memberCount: 0,
  canSend: false,
  willAutoJoin: false,
  messages: [],
  error: null
};

// 记录最近一次状态，供仅刷新底部时使用
subscribeGameChat((next) => {
  currentState = next;
});

export function setGameOverlayVisible(next: boolean): void {
  visible = next;
  if (panel) {
    panel.classList.toggle('hidden', !next);
  }
}

export function isGameOverlayVisible(): boolean {
  return visible && host !== null;
}

export function updateGameOverlayStyle(patch: Partial<OverlayStyle>): void {
  style = { ...style, ...patch };
  applyStyle();
  renderState(currentState);
}

export function getGameOverlayStyle(): OverlayStyle {
  return { ...style };
}

export function resetGameOverlayStyle(): void {
  style = { ...DEFAULT_OVERLAY_STYLE };
  applyStyle();
  renderState(currentState);
}

export function unmountGameOverlay(): void {
  for (const dispose of unsubscribers) {
    dispose();
  }
  unsubscribers = [];
  host?.remove();
  host = null;
  root = null;
  panel = null;
  listEl = null;
  inputEl = null;
  footerEl = null;
  titleEl = null;
  renderedIds = new Set();
  visible = false;
}

/** 让作品能主动把焦点交给聊天输入框。 */
export function focusGameOverlayInput(): void {
  inputEl?.focus();
}
