import { ensureKukeChatWindow } from '@/app/windowManager';

const BUTTON_ID = 'kukechat-gandi-toolbar-button';
const TOOLTIP_ID = 'kukechat-gandi-toolbar-tooltip';
const TOOLBAR_SELECTOR = '[class*="gandi_plugins_plugins-root"][class*="plugins-wrapper"]';

let observer: MutationObserver | null = null;
let routePatchInstalled = false;
let injectTimer: number | null = null;

function isGandiEditorUrl(): boolean {
  return window.location.hostname === 'www.ccw.site' && /^\/gandi\/[^/]+/.test(window.location.pathname);
}

function scheduleInject(): void {
  if (injectTimer !== null) {
    window.clearTimeout(injectTimer);
  }
  injectTimer = window.setTimeout(() => {
    injectTimer = null;
    injectGandiToolbarButton();
  }, 80);
}

function findToolbar(): HTMLElement | null {
  return document.querySelector<HTMLElement>(TOOLBAR_SELECTOR);
}

function getTooltip(): HTMLElement {
  const existing = document.getElementById(TOOLTIP_ID);
  if (existing) {
    return existing;
  }

  const tooltip = document.createElement('div');
  tooltip.id = TOOLTIP_ID;
  tooltip.textContent = '打开 KukeChat';
  tooltip.style.position = 'fixed';
  tooltip.style.zIndex = '2147483646';
  tooltip.style.height = '44px';
  tooltip.style.padding = '0 17px';
  tooltip.style.border = '1px solid rgba(76, 92, 120, 0.92)';
  tooltip.style.borderRadius = '8px';
  tooltip.style.background = '#111827';
  tooltip.style.boxShadow = '0 10px 24px rgba(0, 0, 0, 0.32), 0 2px 6px rgba(0, 0, 0, 0.22)';
  tooltip.style.color = '#ffffff';
  tooltip.style.display = 'none';
  tooltip.style.alignItems = 'center';
  tooltip.style.justifyContent = 'center';
  tooltip.style.fontSize = '13px';
  tooltip.style.fontWeight = '700';
  tooltip.style.lineHeight = '1';
  tooltip.style.whiteSpace = 'nowrap';
  tooltip.style.pointerEvents = 'none';
  tooltip.style.opacity = '0';
  tooltip.style.transform = 'translateY(-2px)';
  tooltip.style.transition = 'opacity 120ms ease, transform 120ms ease';

  const arrow = document.createElement('span');
  arrow.style.position = 'absolute';
  arrow.style.left = '50%';
  arrow.style.top = '-5px';
  arrow.style.width = '9px';
  arrow.style.height = '9px';
  arrow.style.background = '#111827';
  arrow.style.borderLeft = '1px solid rgba(76, 92, 120, 0.92)';
  arrow.style.borderTop = '1px solid rgba(76, 92, 120, 0.92)';
  arrow.style.transform = 'translateX(-50%) rotate(45deg)';
  tooltip.appendChild(arrow);

  document.body.appendChild(tooltip);
  return tooltip;
}

function positionTooltip(button: HTMLElement, tooltip: HTMLElement): void {
  const buttonRect = button.getBoundingClientRect();
  tooltip.style.display = 'flex';
  const tooltipRect = tooltip.getBoundingClientRect();
  const left = Math.min(Math.max(buttonRect.left + buttonRect.width / 2 - tooltipRect.width / 2, 8), window.innerWidth - tooltipRect.width - 8);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${buttonRect.bottom + 10}px`;
}

function showTooltip(button: HTMLElement): void {
  const tooltip = getTooltip();
  positionTooltip(button, tooltip);
  window.requestAnimationFrame(() => {
    tooltip.style.opacity = '1';
    tooltip.style.transform = 'translateY(0)';
  });
}

function hideTooltip(): void {
  const tooltip = document.getElementById(TOOLTIP_ID);
  if (!tooltip) {
    return;
  }
  tooltip.style.opacity = '0';
  tooltip.style.transform = 'translateY(-2px)';
  window.setTimeout(() => {
    if (tooltip.style.opacity === '0') {
      tooltip.style.display = 'none';
    }
  }, 120);
}

function createButton(): HTMLElement {
  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.setAttribute('aria-label', '打开 KukeChat');
  button.style.width = '32px';
  button.style.height = '32px';
  button.style.border = '0';
  button.style.padding = '0';
  button.style.margin = '0';
  button.style.borderRadius = '10px';
  button.style.display = 'inline-flex';
  button.style.alignItems = 'center';
  button.style.justifyContent = 'center';
  button.style.background = 'transparent';
  button.style.color = 'var(--theme-color-g400, #64748b)';
  button.style.cursor = 'pointer';
  button.style.transition = 'background-color 120ms ease, color 120ms ease, transform 120ms ease';

  button.innerHTML = `
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M9.4 10.9C9.4 8.94 10.99 7.35 12.95 7.35h6.1c1.96 0 3.55 1.59 3.55 3.55v4.1c0 1.96-1.59 3.55-3.55 3.55h-3.32l-3.6 3.2c-.62.55-1.6.11-1.6-.72v-2.78A3.55 3.55 0 0 1 9.4 15v-4.1Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
      <path d="M13.05 13.15h5.9M13.05 16.05h3.7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      <path d="M7.2 13.1v5.65c0 2.15 1.74 3.9 3.9 3.9h6.55" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity=".65"/>
    </svg>
  `;

  button.addEventListener('mouseenter', () => {
    button.style.background = 'var(--theme-color-g50, rgba(15, 23, 42, 0.06))';
    button.style.color = 'var(--theme-color-g500, #475569)';
    button.style.transform = 'translateY(-1px)';
    showTooltip(button);
  });
  button.addEventListener('mouseleave', () => {
    button.style.background = 'transparent';
    button.style.color = 'var(--theme-color-g400, #64748b)';
    button.style.transform = 'translateY(0)';
    hideTooltip();
  });
  button.addEventListener('focus', () => showTooltip(button));
  button.addEventListener('blur', hideTooltip);
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    hideTooltip();
    ensureKukeChatWindow();
  });

  return button;
}

function injectGandiToolbarButton(): void {
  const existing = document.getElementById(BUTTON_ID);
  if (!isGandiEditorUrl()) {
    existing?.remove();
    hideTooltip();
    return;
  }
  const toolbar = findToolbar();
  if (!toolbar) {
    return;
  }

  if (existing) {
    if (existing.parentElement !== toolbar) {
      toolbar.appendChild(existing);
    }
    return;
  }

  toolbar.appendChild(createButton());
}

function patchRouteChanges(): void {
  if (routePatchInstalled) {
    return;
  }
  routePatchInstalled = true;

  const notifyRouteChanged = () => scheduleInject();
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function pushState(...args) {
    const result = originalPushState.apply(this, args);
    notifyRouteChanged();
    return result;
  };
  history.replaceState = function replaceState(...args) {
    const result = originalReplaceState.apply(this, args);
    notifyRouteChanged();
    return result;
  };
  window.addEventListener('popstate', notifyRouteChanged);
}

export function installGandiToolbarButton(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  patchRouteChanges();
  scheduleInject();

  if (observer) {
    return;
  }
  observer = new MutationObserver(() => scheduleInject());
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
