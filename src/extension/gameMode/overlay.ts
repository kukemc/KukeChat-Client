/**
 * 舞台上的游戏风格聊天框。
 *
 * 用原生 DOM + Shadow DOM 挂在 Scratch 舞台容器里：Shadow DOM 保证作品自己的
 * 样式不会串进来，也不会被聊天框影响；不引入 React 是为了让这层足够轻，
 * 作品运行时不该为一个聊天框付出额外的框架开销。
 */

import { resolveAssetUrl } from '@/utils/assetUrl';
import { authorizeGameMode, isGameAuthorized, subscribeGameAuth } from './auth';
import { readUntrustedCcwIdentity } from './ccwIdentity';
import {
  attachOverlayHost,
  findStageCanvas,
  fullscreenElement,
  measureStage,
  readCanvasShape,
  restoreOverlayHost,
  stageLogicalSize,
  stageOverlayHost,
  stageOverlayZIndex
} from './stage';
import {
  refreshGameSession,
  sendGameChatMessage,
  subscribeGameChat,
  type GameChatMessage,
  type GameChatState
} from './session';

export type OverlayCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** 内置外观预设。开发者可以一块积木切换，也可以在预设基础上继续微调。 */
export type OverlayPreset = 'glass' | 'midnight' | 'frost' | 'terminal' | 'bubble' | 'minimal';

/**
 * 聊天框外观。
 *
 * **所有尺寸都是舞台逻辑单位**（默认 480×360 坐标系），不是屏幕像素 ——
 * 覆盖层整体按舞台实际大小缩放，所以聊天框在小窗、大窗、全屏下始终占据
 * 相同比例的画面，就像作品自己画上去的一样。
 */
export interface OverlayStyle {
  corner: OverlayCorner;
  /** 宽度，舞台逻辑单位 */
  width: number;
  /** 高度，舞台逻辑单位 */
  height: number;
  /** 面板不透明度，0–100。 */
  opacity: number;
  accent: string;
  background: string;
  textColor: string;
  fontSize: number;
  radius: number;
  /** 毛玻璃模糊半径，0 表示关闭。 */
  blur: number;
  showAvatars: boolean;
  showTitle: boolean;
  /** 追加到样式表末尾的自定义 CSS，可覆盖任意内置规则。 */
  customCss: string;
}

export const DEFAULT_OVERLAY_STYLE: OverlayStyle = {
  corner: 'bottom-left',
  // 480×360 舞台下约占宽 40%、高 33%。字号 7 配 1.45 行高，
  // 消息区能稳定容纳 6 行以上，这是「一眼能看到对话」的下限。
  width: 190,
  height: 118,
  opacity: 55,
  accent: '#7aa2ff',
  background: '#0a0e1a',
  textColor: '#eef2ff',
  fontSize: 7,
  radius: 9,
  blur: 14,
  showAvatars: false,
  showTitle: true,
  customCss: ''
};

/** 预设只覆盖外观相关字段，尺寸与位置保持开发者已有的设置。 */
export const OVERLAY_PRESETS: Record<OverlayPreset, Partial<OverlayStyle>> = {
  glass: {
    opacity: 55, accent: '#7aa2ff', background: '#0a0e1a', textColor: '#eef2ff',
    radius: 9, blur: 14, showAvatars: false, showTitle: true
  },
  midnight: {
    opacity: 82, accent: '#8b7dff', background: '#05060d', textColor: '#e8e6ff',
    radius: 12, blur: 6, showAvatars: false, showTitle: true
  },
  frost: {
    opacity: 34, accent: '#2f6bff', background: '#f4f8ff', textColor: '#0b1730',
    radius: 14, blur: 20, showAvatars: false, showTitle: true
  },
  terminal: {
    opacity: 78, accent: '#4ade80', background: '#04120a', textColor: '#c8ffd9',
    radius: 3, blur: 0, showAvatars: false, showTitle: true
  },
  bubble: {
    opacity: 62, accent: '#ff8fb1', background: '#1a0f18', textColor: '#ffeaf2',
    radius: 16, blur: 16, showAvatars: true, showTitle: true
  },
  minimal: {
    opacity: 22, accent: '#ffffff', background: '#000000', textColor: '#ffffff',
    radius: 6, blur: 8, showAvatars: false, showTitle: false
  }
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
let frameEl: HTMLElement | null = null;
let syncHandle: number | null = null;
let mountedHost: HTMLElement | null = null;
let lastGeometryKey = '';
let collapsed = false;
/** 首屏批量渲染历史消息时关掉逐条入场动画，否则一进作品满屏乱动。 */
let suppressEnterAnimation = false;

const SEND_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12h13M12 5.5 18.5 12 12 18.5"/></svg>';
const CHEVRON_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" width="8" height="8"><path d="m6 9 6 6 6-6"/></svg>';


function cornerCss(corner: OverlayCorner): string {
  const inset = '8px';  // 舞台逻辑单位
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
  const alpha = Math.min(Math.max(style.opacity, 0), 100) / 100;
  const glass = hexToRgba(style.background, alpha);
  // 输入胶囊比消息面板略实一点，否则在亮色画面上会糊成一片
  const pill = hexToRgba(style.background, Math.min(alpha + 0.18, 0.95));
  const line = Math.max(style.fontSize * 1.45, style.fontSize + 2);
  const gap = Math.max(style.fontSize * 0.55, 3);
  const pad = Math.max(style.fontSize * 0.9, 5);
  const composerH = Math.max(style.fontSize * 2.4, 16);
  const blur = Math.max(style.blur, 0);
  const glassFilter = blur > 0 ? `blur(${blur}px) saturate(1.4)` : 'none';
  const ink = style.textColor;
  // 送出按钮用的圆形尺寸
  const sendSize = composerH - Math.max(style.fontSize * 0.5, 3);

  return `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: inherit; }

    /* 逻辑坐标系：宽高等于舞台逻辑尺寸，由 JS 按舞台实际大小整体 scale */
    .frame {
      position: absolute;
      left: 0; top: 0;
      transform-origin: 0 0;
      pointer-events: none;
    }

    /* 面板本身不画背景：它只是「消息卡片 + 独立输入胶囊」的排版容器 */
    .panel {
      position: absolute; ${cornerCss(style.corner)}
      display: flex; flex-direction: column;
      gap: ${gap}px;
      width: ${style.width}px; height: ${style.height}px;
      color: ${ink};
      font-family: system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      font-size: ${style.fontSize}px;
      line-height: ${line}px;
      pointer-events: auto;
      -webkit-font-smoothing: antialiased;
      /* 折叠时整体高度收缩到只剩胶囊，配合下面的过渡形成收起动画 */
      transition: height 320ms cubic-bezier(.2, .9, .3, 1), gap 320ms cubic-bezier(.2, .9, .3, 1);
    }
    .panel.collapsed { height: ${composerH}px; gap: 0px; }

    /* 消息卡片：毛玻璃 */
    .messages {
      flex: 1 1 auto; min-height: 0;
      display: flex; flex-direction: column;
      background: ${glass};
      border: 1px solid ${hexToRgba(ink, 0.1)};
      border-radius: ${style.radius}px;
      backdrop-filter: ${glassFilter};
      -webkit-backdrop-filter: ${glassFilter};
      box-shadow: 0 ${Math.round(style.fontSize * 0.6)}px ${Math.round(style.fontSize * 2.4)}px rgba(0,0,0,.28);
      overflow: hidden;
      transform-origin: ${style.corner.includes('bottom') ? 'bottom' : 'top'} center;
      transition:
        opacity 260ms cubic-bezier(.2, .9, .3, 1),
        transform 300ms cubic-bezier(.2, .9, .3, 1),
        border-color 200ms ease;
    }
    .panel.collapsed .messages {
      opacity: 0;
      transform: scaleY(.86) translateY(${style.corner.includes('bottom') ? 6 : -6}px);
      pointer-events: none;
    }

    .title {
      display: flex; align-items: center; gap: ${gap}px;
      padding: ${Math.max(pad * 0.55, 3)}px ${pad}px;
      font-size: ${Math.max(style.fontSize - 1, 6)}px;
      font-weight: 600;
      letter-spacing: .02em;
      opacity: .8;
      flex: 0 0 auto;
      cursor: pointer;
      user-select: none;
      transition: opacity 180ms ease;
    }
    .title:hover { opacity: 1; }
    .title .dot {
      width: ${Math.max(style.fontSize * 0.42, 3)}px; height: ${Math.max(style.fontSize * 0.42, 3)}px;
      border-radius: 999px; background: ${style.accent}; flex: 0 0 auto;
      box-shadow: 0 0 ${style.fontSize}px ${hexToRgba(style.accent, 0.9)};
      animation: kc-pulse 2.6s ease-in-out infinite;
    }
    @keyframes kc-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: .55; transform: scale(.82); }
    }
    .title .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .title .count { margin-left: auto; opacity: .55; font-weight: 500; flex: 0 0 auto; }
    .title .chevron {
      flex: 0 0 auto; opacity: .5;
      transition: transform 320ms cubic-bezier(.2, .9, .3, 1), opacity 180ms ease;
    }
    .title:hover .chevron { opacity: .9; }
    .panel.collapsed .title .chevron { transform: rotate(180deg); }

    .list {
      flex: 1 1 auto; min-height: 0;
      overflow-y: auto; overflow-x: hidden;
      padding: 0 ${pad}px ${Math.max(pad * 0.6, 3)}px;
      display: flex; flex-direction: column; gap: ${Math.max(gap * 0.4, 1)}px;
      /* 极简：不占宽度的滚动条 */
      scrollbar-width: none;
      /* 允许触摸端惯性滚动 */
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
      scroll-behavior: smooth;
    }
    .list::-webkit-scrollbar { width: 0; height: 0; }

    /* 消息不足一屏时贴底。不能用 justify-content:flex-end —— 那样内容溢出时
       会从顶部溢出且滚不回去。 */
    .list > :first-child { margin-top: auto; }

    .row {
      display: flex; gap: ${Math.max(gap * 0.6, 2)}px;
      align-items: baseline;
      word-break: break-word;
      /* 单条最多两行，防止一条长消息吃掉整个可视区 */
      max-height: ${line * 2}px; overflow: hidden;
      /* 必须禁止收缩：flex 子项设了 overflow:hidden 后自动最小尺寸变成 0，
         几十条消息挤在固定高度的列里会被压成几乎不可见的细条 */
      flex: 0 0 auto;
      animation: kc-enter 280ms cubic-bezier(.2, .9, .3, 1) both;
    }
    @keyframes kc-enter {
      from { opacity: 0; transform: translateY(${Math.max(line * 0.5, 4)}px); }
      to { opacity: 1; transform: none; }
    }
    /* 首次批量渲染历史消息时不逐条播动画，否则一进作品就是一片乱动 */
    .list.no-anim .row { animation: none; }

    .row img.avatar {
      width: ${line * 0.8}px; height: ${line * 0.8}px;
      border-radius: 999px; flex: 0 0 auto; object-fit: cover;
      align-self: center;
    }
    .row .name { color: ${style.accent}; font-weight: 600; flex: 0 0 auto; opacity: .95; }
    .row.own .name { color: #ffd479; }
    .row .text { flex: 1 1 auto; opacity: .92; }
    .row img.thumb {
      height: ${line * 1.1}px; width: auto; max-width: 55%;
      border-radius: ${Math.max(style.radius * 0.35, 2)}px;
      object-fit: cover; vertical-align: middle;
      transition: transform 200ms cubic-bezier(.2, .9, .3, 1);
    }
    .row img.thumb:hover { transform: scale(1.08); }

    .system {
      flex: 0 0 auto; text-align: center; opacity: .45;
      font-size: ${Math.max(style.fontSize - 1, 6)}px; padding: 1px 0;
      animation: kc-enter 280ms cubic-bezier(.2, .9, .3, 1) both;
    }

    /* 输入区：与消息卡片分离的独立胶囊 */
    .composer {
      flex: 0 0 auto;
      display: flex; align-items: center; gap: ${Math.max(gap * 0.7, 3)}px;
      height: ${composerH}px;
      padding: 0 ${Math.max(pad * 0.35, 2)}px 0 ${pad}px;
      background: ${pill};
      border: 1px solid ${hexToRgba(ink, 0.12)};
      border-radius: 999px;
      backdrop-filter: ${glassFilter};
      -webkit-backdrop-filter: ${glassFilter};
      box-shadow: 0 ${Math.round(style.fontSize * 0.5)}px ${Math.round(style.fontSize * 1.8)}px rgba(0,0,0,.26);
      transition:
        border-color 220ms ease,
        box-shadow 220ms ease,
        transform 220ms cubic-bezier(.2, .9, .3, 1);
    }
    /* 聚焦时整条胶囊微微抬起并亮边，替代生硬的输入框描边 */
    .composer.focused {
      border-color: ${hexToRgba(style.accent, 0.55)};
      box-shadow:
        0 ${Math.round(style.fontSize * 0.7)}px ${Math.round(style.fontSize * 2.2)}px rgba(0,0,0,.3),
        0 0 0 ${Math.max(style.fontSize * 0.14, 1)}px ${hexToRgba(style.accent, 0.22)};
      transform: translateY(-${Math.max(style.fontSize * 0.12, 0.8)}px);
    }
    .composer.sending { animation: kc-sent 420ms cubic-bezier(.2, .9, .3, 1); }
    @keyframes kc-sent {
      0% { transform: scale(1); }
      35% { transform: scale(.975); }
      100% { transform: scale(1); }
    }

    .composer input {
      flex: 1 1 auto; min-width: 0;
      background: transparent; border: 0; outline: none;
      color: ${ink};
      font-size: ${style.fontSize}px;
      line-height: ${line}px;
    }
    .composer input::placeholder { color: ${ink}; opacity: .38; transition: opacity 200ms ease; }
    .composer.focused input::placeholder { opacity: .22; }

    /* 发送键：圆形幽灵按钮，只有描边与图标，不再是毛玻璃里嵌一块实心蓝 */
    .composer .send {
      flex: 0 0 auto;
      display: grid; place-items: center;
      width: ${sendSize}px; height: ${sendSize}px;
      border: 0; cursor: pointer;
      border-radius: 999px;
      background: ${hexToRgba(style.accent, 0.16)};
      color: ${style.accent};
      transition:
        background 200ms ease,
        transform 200ms cubic-bezier(.2, .9, .3, 1),
        opacity 200ms ease;
    }
    .composer .send svg { width: ${Math.max(sendSize * 0.52, 6)}px; height: ${Math.max(sendSize * 0.52, 6)}px; display: block; }
    .composer .send:hover { background: ${hexToRgba(style.accent, 0.3)}; transform: scale(1.08); }
    .composer .send:active { transform: scale(.9); }
    .composer .send:disabled { opacity: .35; cursor: default; transform: none; }
    /* 输入框为空时发送键淡出，减少视觉噪音 */
    .composer .send.idle { opacity: .3; }

    /* 折叠后标题栏随消息卡片一起隐藏，出口必须留在胶囊上，
       否则折叠了就再也展不开。仅折叠状态显示。 */
    .composer .expand {
      flex: 0 0 auto;
      display: none;
      place-items: center;
      width: ${sendSize}px; height: ${sendSize}px;
      margin-right: ${Math.max(gap * 0.4, 2)}px;
      border: 0; cursor: pointer;
      border-radius: 999px;
      background: ${hexToRgba(ink, 0.1)};
      color: ${ink};
      opacity: .7;
      transition: background 200ms ease, opacity 200ms ease, transform 200ms cubic-bezier(.2, .9, .3, 1);
    }
    .composer .expand svg { width: ${Math.max(sendSize * 0.5, 6)}px; height: ${Math.max(sendSize * 0.5, 6)}px; display: block; transform: rotate(180deg); }
    .composer .expand:hover { background: ${hexToRgba(ink, 0.18)}; opacity: 1; transform: scale(1.08); }
    .composer .expand:active { transform: scale(.9); }
    .panel.collapsed .composer .expand { display: grid; }
    /* 折叠时胶囊左内边距让位给展开键 */
    .panel.collapsed .composer { padding-left: ${Math.max(pad * 0.35, 2)}px; }

    /* 未授权时整条胶囊就是授权按钮 */
    .composer.auth { padding: 0; cursor: pointer; }
    .panel.collapsed .composer.auth { padding-left: ${Math.max(pad * 0.35, 2)}px; }
    .composer.auth .authorize {
      flex: 1 1 auto;
      height: 100%;
      border: 0; cursor: pointer; border-radius: 999px;
      background: transparent; color: ${ink};
      font-size: ${Math.max(style.fontSize - 0.5, 6)}px;
      font-weight: 600; opacity: .85;
      transition: background 200ms ease, opacity 200ms ease;
    }
    .composer.auth .authorize:hover { background: ${hexToRgba(style.accent, 0.14)}; opacity: 1; }

    .hidden { display: none !important; }

    @media (prefers-reduced-motion: reduce) {
      .panel, .messages, .composer, .row, .system, .title .chevron, .composer .send { transition: none !important; animation: none !important; }
    }

    /* 自定义 CSS：放在最后，可覆盖以上任意规则 */
    ${style.customCss}
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
  // 尺寸类样式改了，下一帧要重新对齐
  lastGeometryKey = '';
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
  row.dataset.messageId = String(message.id);

  if (style.showAvatars) {
    const avatar = resolveAssetUrl(message.avatarUrl);
    if (avatar) {
      const img = document.createElement('img');
      img.className = 'avatar';
      img.src = avatar;
      img.alt = '';
      row.appendChild(img);
    }
  }

  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = `${message.senderName}:`;
  row.appendChild(name);

  const thumbUrl = message.imageUrl ? resolveAssetUrl(message.imageUrl) : undefined;
  if (thumbUrl) {
    // 图片/表情用小缩略图，而不是把几十字符的 URL 当正文铺满整个列表
    const thumb = document.createElement('img');
    thumb.className = 'thumb';
    thumb.src = thumbUrl;
    thumb.alt = message.content;
    // 图裂时退回文字占位，不留一个空白破图
    thumb.onerror = () => {
      const fallback = document.createElement('span');
      fallback.className = 'text';
      fallback.textContent = message.content;
      thumb.replaceWith(fallback);
    };
    row.appendChild(thumb);
  } else {
    const text = document.createElement('span');
    text.className = 'text';
    // 用 textContent 而非 innerHTML —— 消息内容来自其他玩家，绝不能当 HTML 解析
    text.textContent = message.content;
    row.appendChild(text);
  }

  listEl.appendChild(row);

  const atBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 40;
  while (listEl.childElementCount > 200) {
    const oldest = listEl.firstElementChild as HTMLElement | null;
    if (!oldest) break;
    // 同步清掉记录，否则该 id 会被永久视为「已渲染」，重连后不再重绘
    const staleId = Number(oldest.dataset.messageId);
    if (Number.isFinite(staleId)) renderedIds.delete(staleId);
    listEl.removeChild(oldest);
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

  // 展开键放在最前，CSS 控制它只在折叠时显示。三种状态都要有，
  // 否则在某个状态下折叠就没有出口了。
  const expand = document.createElement('button');
  expand.type = 'button';
  expand.className = 'expand';
  expand.title = '展开聊天';
  expand.innerHTML = CHEVRON_ICON;
  expand.addEventListener('click', (event) => {
    event.stopPropagation();
    setGameOverlayCollapsed(false);
  });
  footerEl.appendChild(expand);

  if (state.status === 'error') {
    footerEl.classList.remove('auth');
    const hint = document.createElement('div');
    hint.className = 'system';
    hint.style.padding = '2px 0';
    hint.style.flex = '1 1 auto';
    hint.textContent = state.error ?? '接入失败';
    footerEl.appendChild(hint);
    return;
  }

  if (isGameAuthorized()) {
    footerEl.classList.remove('auth');
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 500;
    input.placeholder = state.willAutoJoin ? '发言后将自动加入本群…' : '说点什么…';

    const send = document.createElement('button');
    send.type = 'button';
    send.className = 'send idle';
    send.title = '发送';
    send.innerHTML = SEND_ICON;

    const syncSendState = (): void => {
      send.classList.toggle('idle', input.value.trim().length === 0);
    };

    const submit = async (): Promise<void> => {
      const value = input.value.trim();
      if (!value) {
        return;
      }
      input.value = '';
      syncSendState();
      send.disabled = true;
      // 触发一次收缩回弹，给「已发出」一个即时反馈
      footerEl?.classList.remove('sending');
      void footerEl?.offsetWidth;
      footerEl?.classList.add('sending');
      window.setTimeout(() => footerEl?.classList.remove('sending'), 460);

      const result = await sendGameChatMessage(value);
      send.disabled = false;
      if (result === 'unauthorized') {
        renderSystem('登录状态已失效，请重新授权');
        renderFooter(state);
        return;
      }
      if (result === 'denied') {
        renderSystem('你未允许本作品代你发言');
      } else if (result === 'failed') {
        renderSystem('发送失败，请稍后再试');
      }
      input.focus();
    };

    input.addEventListener('input', syncSendState);
    input.addEventListener('focus', () => {
      footerEl?.classList.add('focused');
      // 折叠状态下开始打字，自动展开让玩家看得到上下文
      if (collapsed) {
        setGameOverlayCollapsed(false);
      }
    });
    input.addEventListener('blur', () => footerEl?.classList.remove('focused'));
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

  const defaultLabel = '授权后发言';
  footerEl.classList.add('auth');
  const authorize = document.createElement('button');
  authorize.type = 'button';
  authorize.className = 'authorize';
  authorize.textContent = defaultLabel;
  authorize.addEventListener('click', async () => {
    authorize.disabled = true;
    authorize.textContent = '授权中…';
    const result = await authorizeGameMode({ groupTitle: currentState.title, creationOid: currentState.creationOid });
    authorize.disabled = false;
    if (result === 'authorized') {
      await refreshGameSession();
      renderSystem('已授权，现在可以发言了');
    } else if (result === 'blocked') {
      authorize.textContent = '弹窗被拦截，请放行';
      renderSystem('浏览器拦截了登录窗口，请在地址栏放行弹窗');
      return;
    } else {
      authorize.textContent = defaultLabel;
    }
  });
  footerEl.appendChild(authorize);

  // CCW 昵称只是让提示更亲切，不参与任何鉴权判断 —— 它来自页面，可被篡改。
  // 拿不到就保持默认文案，绝不因此改变授权流程。
  void readUntrustedCcwIdentity().then((identity) => {
    if (identity?.displayName && authorize.textContent === defaultLabel) {
      authorize.textContent = `以 ${identity.displayName} 授权发言`;
      authorize.title = 'KukeChat 会通过安全登录确认你的身份';
    }
  });
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
    const chevron = document.createElement('span');
    chevron.className = 'chevron';
    chevron.innerHTML = CHEVRON_ICON;
    titleEl.append(dot, name, count, chevron);
  }

  if (listEl) {
    // 一次性铺开多条历史消息时不逐条播入场动画
    const bulk = listEl.childElementCount === 0 && state.messages.length > 1;
    if (bulk) {
      suppressEnterAnimation = true;
      listEl.classList.add('no-anim');
    }
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
    if (suppressEnterAnimation) {
      suppressEnterAnimation = false;
      // 下一帧再放开，之后到达的新消息就能正常播动画
      window.requestAnimationFrame(() => listEl?.classList.remove('no-anim'));
    }
  }

  renderFooter(state);
}

/**
 * 每帧把覆盖层对齐到舞台。
 *
 * 用 rAF 而不是 ResizeObserver：舞台尺寸变化的来源太多（小窗/大窗切换、全屏、
 * 窗口缩放、设备旋转、CSS 动画），逐个监听容易漏；每帧对齐代价很低且不会失同步。
 * 几何没变时跳过写样式，避免无谓的重排。
 */
function syncToStage(): void {
  syncHandle = window.requestAnimationFrame(syncToStage);
  if (!host || !frameEl) {
    return;
  }

  const canvas = findStageCanvas();
  if (!canvas) {
    host.style.display = 'none';
    attachOverlayHost(host, document.body);
    return;
  }

  // 舞台可能被搬到别的容器（进入/退出全屏），每帧都要重新确认挂载点。
  // attachOverlayHost 返回实际落点：canvas 自己就是全屏元素时无处可挂，
  // 返回 null，此时只能把覆盖层藏起来。
  let activeHost = attachOverlayHost(host, stageOverlayHost(canvas));
  if (!activeHost) {
    const fullscreen = fullscreenElement();
    if (fullscreen) {
      activeHost = attachOverlayHost(host, fullscreen);
    }
  }
  if (!activeHost) {
    host.style.display = 'none';
    return;
  }
  if (activeHost !== mountedHost) {
    mountedHost = activeHost;
    lastGeometryKey = '';
  }

  const geometry = measureStage(canvas, activeHost);
  if (!geometry.width || !geometry.height) {
    host.style.display = 'none';
    return;
  }

  const shape = readCanvasShape(canvas);
  const zIndex = stageOverlayZIndex(canvas);
  const key = [
    geometry.left, geometry.top, geometry.width, geometry.height,
    geometry.logicalWidth, geometry.logicalHeight, geometry.scale,
    geometry.offsetX, geometry.offsetY,
    shape.transform, shape.borderRadius, zIndex,
    activeHost === document.body
  ].join('|');
  if (key === lastGeometryKey) {
    return;
  }
  lastGeometryKey = key;

  host.style.display = 'block';
  host.style.position = activeHost === document.body ? 'fixed' : 'absolute';
  host.style.left = `${geometry.left}px`;
  host.style.top = `${geometry.top}px`;
  host.style.width = `${geometry.width}px`;
  host.style.height = `${geometry.height}px`;
  host.style.zIndex = String(zIndex);
  // canvas 自身带的形变与圆角要复刻；祖先层面的由「同父」自动继承
  setStyle(host, 'transform', shape.transform);
  setStyle(host, 'transform-origin', shape.transformOrigin);
  setStyle(host, 'border-radius', shape.borderRadius);
  // 始终裁剪：即使几何算偏，聊天框也不会溢出舞台
  host.style.overflow = 'hidden';

  // 逻辑坐标系按舞台等比缩放并居中，聊天框因此随舞台伸缩
  frameEl.style.width = `${geometry.logicalWidth}px`;
  frameEl.style.height = `${geometry.logicalHeight}px`;
  frameEl.style.left = `${geometry.offsetX}px`;
  frameEl.style.top = `${geometry.offsetY}px`;
  frameEl.style.transformOrigin = '0 0';
  frameEl.style.transform = `scale(${geometry.scale})`;
}

/** 空值时移除属性而不是写入空串，避免留下无效的 inline 样式。 */
function setStyle(element: HTMLElement, property: string, value: string): void {
  if (value) {
    element.style.setProperty(property, value);
  } else {
    element.style.removeProperty(property);
  }
}

export function mountGameOverlay(): void {
  if (host) {
    setGameOverlayVisible(true);
    return;
  }

  host = document.createElement('div');
  host.id = 'kukechat-game-overlay';
  host.style.position = 'absolute';
  host.style.pointerEvents = 'none';

  root = host.attachShadow({ mode: 'open' });
  const sheet = document.createElement('style');
  sheet.textContent = buildStyleSheet();

  frameEl = document.createElement('div');
  frameEl.className = 'frame';

  panel = document.createElement('div');
  panel.className = 'panel';

  // 消息卡片与输入胶囊是两个独立元素，中间留出间距 —— 这正是「分离胶囊」的观感
  const messagesCard = document.createElement('div');
  messagesCard.className = 'messages';

  titleEl = document.createElement('div');
  titleEl.className = 'title';
  listEl = document.createElement('div');
  listEl.className = 'list';
  messagesCard.append(titleEl, listEl);

  footerEl = document.createElement('div');
  footerEl.className = 'composer';

  // 点标题栏即可折叠 / 展开
  titleEl.addEventListener('click', () => toggleGameOverlayCollapsed());

  // 折叠时点胶囊的任意空白处也展开 —— 不必精准命中那个小箭头
  footerEl.addEventListener('click', (event) => {
    if (!collapsed) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, input')) {
      return;
    }
    setGameOverlayCollapsed(false);
  });

  panel.append(messagesCard, footerEl);
  frameEl.appendChild(panel);
  root.append(sheet, frameEl);

  const canvas = findStageCanvas();
  mountedHost = attachOverlayHost(host, stageOverlayHost(canvas));

  lastGeometryKey = '';
  syncToStage();

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

/** 折叠 / 展开消息区，只留输入胶囊。 */
export function setGameOverlayCollapsed(next: boolean): void {
  collapsed = next;
  panel?.classList.toggle('collapsed', next);
  if (!next) {
    // 展开后滚回底部，否则会停在折叠前的位置
    window.requestAnimationFrame(scrollToBottom);
  }
}

export function isGameOverlayCollapsed(): boolean {
  return collapsed;
}

export function toggleGameOverlayCollapsed(): void {
  setGameOverlayCollapsed(!collapsed);
}

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
  if (syncHandle !== null) {
    window.cancelAnimationFrame(syncHandle);
    syncHandle = null;
  }
  host?.remove();
  restoreOverlayHost();
  host = null;
  root = null;
  panel = null;
  listEl = null;
  inputEl = null;
  footerEl = null;
  titleEl = null;
  frameEl = null;
  mountedHost = null;
  lastGeometryKey = '';
  collapsed = false;
  renderedIds = new Set();
  visible = false;
}

/** 让作品能主动把焦点交给聊天输入框。 */
export function focusGameOverlayInput(): void {
  inputEl?.focus();
}
