/**
 * 游戏模式的权限弹窗。
 *
 * 刻意做成**页面级**而不是挂在舞台里：授权是需要玩家看清楚再决定的事，
 * 舞台可能只有几百像素宽，把同意/拒绝按钮缩到那个尺度里既难读也容易误点。
 * 它有自己的 Shadow DOM，不受作品样式影响。
 */

export interface ModalCheckbox {
  id: string;
  label: string;
  hint?: string;
  /** 默认是否勾选。涉及授权的项一律默认 false。 */
  checked: boolean;
}

export interface ModalOptions {
  title: string;
  /** 正文段落，逐段渲染。 */
  paragraphs: string[];
  /** 需要玩家明确知晓的条目，带图标突出显示。 */
  notices?: string[];
  checkboxes?: ModalCheckbox[];
  confirmText: string;
  cancelText: string;
}

export interface ModalResult {
  confirmed: boolean;
  /** 各复选框的最终状态，key 为 ModalCheckbox.id。 */
  checked: Record<string, boolean>;
}

const HOST_ID = 'kukechat-game-modal';
const ENTER_MS = 220;
const LEAVE_MS = 160;

function styles(): string {
  return `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: inherit; }

    .mask {
      position: fixed; inset: 0;
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
      background: rgba(6, 9, 18, 0);
      backdrop-filter: blur(0px);
      -webkit-backdrop-filter: blur(0px);
      z-index: 2147483600;
      font-family: system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      transition: background ${ENTER_MS}ms ease, backdrop-filter ${ENTER_MS}ms ease;
    }
    .mask.in { background: rgba(6, 9, 18, .52); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
    .mask.out { background: rgba(6, 9, 18, 0); backdrop-filter: blur(0px); -webkit-backdrop-filter: blur(0px); }

    .card {
      width: min(420px, 100%);
      max-height: calc(100vh - 40px);
      overflow-y: auto;
      padding: 22px;
      border-radius: 18px;
      background: rgba(16, 20, 34, .94);
      border: 1px solid rgba(238, 242, 255, .12);
      box-shadow: 0 24px 70px rgba(0, 0, 0, .45);
      color: #eef2ff;
      opacity: 0;
      transform: translateY(14px) scale(.96);
      transition: opacity ${ENTER_MS}ms cubic-bezier(.2, .9, .3, 1), transform ${ENTER_MS}ms cubic-bezier(.2, .9, .3, 1);
    }
    .mask.in .card { opacity: 1; transform: translateY(0) scale(1); }
    .mask.out .card { opacity: 0; transform: translateY(8px) scale(.98); transition-duration: ${LEAVE_MS}ms; }

    h2 { font-size: 17px; font-weight: 700; letter-spacing: .01em; }
    .brand { display: flex; align-items: center; gap: 9px; margin-bottom: 14px; }
    .brand .dot {
      width: 9px; height: 9px; border-radius: 999px; background: #7aa2ff;
      box-shadow: 0 0 12px rgba(122, 162, 255, .9);
    }

    p { font-size: 13px; line-height: 1.72; opacity: .8; margin-bottom: 9px; }

    .notices { display: grid; gap: 8px; margin: 14px 0 4px; }
    .notice {
      display: flex; gap: 9px; align-items: flex-start;
      padding: 10px 12px;
      border-radius: 12px;
      background: rgba(122, 162, 255, .1);
      border: 1px solid rgba(122, 162, 255, .18);
      font-size: 12.5px; line-height: 1.65;
    }
    .notice .icon { flex: 0 0 auto; opacity: .9; }

    .checks { display: grid; gap: 10px; margin-top: 16px; }
    label.check {
      display: flex; gap: 10px; align-items: flex-start;
      padding: 11px 12px;
      border-radius: 12px;
      background: rgba(238, 242, 255, .05);
      border: 1px solid rgba(238, 242, 255, .1);
      cursor: pointer;
      transition: background 160ms ease, border-color 160ms ease;
    }
    label.check:hover { background: rgba(238, 242, 255, .09); border-color: rgba(238, 242, 255, .18); }
    label.check input { margin-top: 2px; width: 15px; height: 15px; accent-color: #7aa2ff; cursor: pointer; flex: 0 0 auto; }
    label.check .body { font-size: 13px; line-height: 1.6; }
    label.check .hint { display: block; margin-top: 3px; font-size: 11.5px; opacity: .58; line-height: 1.55; }

    .actions { display: flex; gap: 10px; margin-top: 20px; }
    button {
      flex: 1 1 0; min-width: 0;
      border: 0; cursor: pointer;
      padding: 11px 14px;
      border-radius: 12px;
      font-size: 13.5px; font-weight: 700;
      transition: transform 140ms cubic-bezier(.2, .9, .3, 1), background 160ms ease, opacity 160ms ease;
    }
    button:active { transform: scale(.97); }
    .cancel { background: rgba(238, 242, 255, .09); color: #eef2ff; }
    .cancel:hover { background: rgba(238, 242, 255, .15); }
    .confirm { background: linear-gradient(135deg, #7aa2ff, #5b8cff); color: #0a0e1a; }
    .confirm:hover { filter: brightness(1.07); }

    @media (prefers-reduced-motion: reduce) {
      .mask, .card, button { transition: none !important; }
    }
  `;
}

let openHost: HTMLElement | null = null;

/** 关掉当前弹窗（若有）。切换作品或断开时调用，避免残留。 */
export function closeGameModal(): void {
  openHost?.remove();
  openHost = null;
}

/**
 * 弹出权限确认框。返回玩家的选择。
 *
 * 只有点「确认」才算同意；点遮罩、按 Esc、点取消都返回 confirmed=false。
 */
export function showGameModal(options: ModalOptions): Promise<ModalResult> {
  closeGameModal();

  return new Promise<ModalResult>((resolve) => {
    const host = document.createElement('div');
    host.id = HOST_ID;
    const root = host.attachShadow({ mode: 'open' });

    const sheet = document.createElement('style');
    sheet.textContent = styles();

    const mask = document.createElement('div');
    mask.className = 'mask';

    const card = document.createElement('div');
    card.className = 'card';

    const brand = document.createElement('div');
    brand.className = 'brand';
    const dot = document.createElement('span');
    dot.className = 'dot';
    const heading = document.createElement('h2');
    heading.textContent = options.title;
    brand.append(dot, heading);
    card.appendChild(brand);

    for (const text of options.paragraphs) {
      const p = document.createElement('p');
      p.textContent = text;
      card.appendChild(p);
    }

    if (options.notices?.length) {
      const box = document.createElement('div');
      box.className = 'notices';
      for (const text of options.notices) {
        const item = document.createElement('div');
        item.className = 'notice';
        const icon = document.createElement('span');
        icon.className = 'icon';
        icon.textContent = '!';
        const body = document.createElement('span');
        body.textContent = text;
        item.append(icon, body);
        box.appendChild(item);
      }
      card.appendChild(box);
    }

    const inputs = new Map<string, HTMLInputElement>();
    if (options.checkboxes?.length) {
      const box = document.createElement('div');
      box.className = 'checks';
      for (const item of options.checkboxes) {
        const label = document.createElement('label');
        label.className = 'check';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = item.checked;
        const body = document.createElement('span');
        body.className = 'body';
        body.textContent = item.label;
        if (item.hint) {
          const hint = document.createElement('span');
          hint.className = 'hint';
          hint.textContent = item.hint;
          body.appendChild(hint);
        }
        label.append(input, body);
        box.appendChild(label);
        inputs.set(item.id, input);
      }
      card.appendChild(box);
    }

    const actions = document.createElement('div');
    actions.className = 'actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'cancel';
    cancel.textContent = options.cancelText;
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'confirm';
    confirm.textContent = options.confirmText;
    actions.append(cancel, confirm);
    card.appendChild(actions);

    mask.appendChild(card);
    root.append(sheet, mask);
    document.body.appendChild(host);
    openHost = host;

    let settled = false;
    const finish = (confirmed: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      const checked: Record<string, boolean> = {};
      for (const [id, input] of inputs) {
        checked[id] = input.checked;
      }
      document.removeEventListener('keydown', onKeyDown, true);
      mask.classList.remove('in');
      mask.classList.add('out');
      window.setTimeout(() => {
        if (openHost === host) {
          openHost = null;
        }
        host.remove();
        resolve({ confirmed, checked });
      }, LEAVE_MS);
    };

    function onKeyDown(event: KeyboardEvent): void {
      // 拦下按键，别让作品的按键积木在弹窗打开时被触发
      event.stopPropagation();
      if (event.key === 'Escape') {
        finish(false);
      }
    }

    cancel.addEventListener('click', () => finish(false));
    confirm.addEventListener('click', () => finish(true));
    mask.addEventListener('click', (event) => {
      if (event.target === mask) {
        finish(false);
      }
    });
    document.addEventListener('keydown', onKeyDown, true);

    // 下一帧再加 in，保证过渡能触发
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => mask.classList.add('in'));
    });
  });
}
