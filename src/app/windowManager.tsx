import { createRoot, type Root } from 'react-dom/client';
import { useKukeStore } from '@/store/kukeStore';
import { shadowStyles } from '@/styles/shadowStyles';
import { AppRoot } from './AppRoot';

const HOST_ID = 'kukechat-shadow-host';

let root: Root | null = null;
let host: HTMLElement | null = null;
const guardedShadows = new WeakSet<ShadowRoot>();

type KukeKeyboardEvent = KeyboardEvent & { __kukeChatBackspaceHandled?: boolean };

function editableTarget(target: EventTarget | null): HTMLInputElement | HTMLTextAreaElement | HTMLElement | null {
  const element = target instanceof Element ? target : null;
  if (!element) {
    return null;
  }

  const editable = element.closest('input, textarea, [contenteditable="true"], [contenteditable="plaintext-only"]');
  if (!editable) {
    return null;
  }
  if (editable instanceof HTMLInputElement || editable instanceof HTMLTextAreaElement) {
    return editable.disabled || editable.readOnly ? null : editable;
  }
  return editable instanceof HTMLElement && editable.isContentEditable ? editable : null;
}

function dispatchInput(element: HTMLElement): void {
  try {
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
  } catch {
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function deleteBackwardFromTextControl(control: HTMLInputElement | HTMLTextAreaElement): void {
  const start = control.selectionStart;
  const end = control.selectionEnd;
  if (start === null || end === null || (start === 0 && end === 0)) {
    return;
  }

  const deleteStart = start === end ? Math.max(0, start - 1) : start;
  control.setRangeText('', deleteStart, end, 'end');
  dispatchInput(control);
}

function deleteBackwardFromContentEditable(editable: HTMLElement): void {
  const rootNode = editable.getRootNode();
  const shadowSelection = rootNode instanceof ShadowRoot ? (rootNode as ShadowRoot & { getSelection?: () => Selection | null }).getSelection?.() : null;
  const selection = shadowSelection ?? window.getSelection();
  if (!selection?.rangeCount) {
    return;
  }

  const range = selection.getRangeAt(0);
  if (!editable.contains(range.startContainer)) {
    return;
  }

  if (!range.collapsed) {
    range.deleteContents();
    dispatchInput(editable);
    return;
  }

  const selectionWithModify = selection as Selection & { modify?: (alter: string, direction: string, granularity: string) => void };
  if (typeof selectionWithModify.modify === 'function') {
    selectionWithModify.modify('extend', 'backward', 'character');
    if (!selection.isCollapsed) {
      selection.deleteFromDocument();
      dispatchInput(editable);
    }
    return;
  }

  if (range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset > 0) {
    const text = range.startContainer as Text;
    text.deleteData(range.startOffset - 1, 1);
    range.setStart(text, range.startOffset - 1);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    dispatchInput(editable);
  }
}

function handlePreventedBackspace(event: KukeKeyboardEvent, editable: HTMLInputElement | HTMLTextAreaElement | HTMLElement): void {
  if (event.key !== 'Backspace' || !event.defaultPrevented || event.__kukeChatBackspaceHandled) {
    return;
  }
  if (editable instanceof HTMLInputElement || editable instanceof HTMLTextAreaElement) {
    deleteBackwardFromTextControl(editable);
    return;
  }
  deleteBackwardFromContentEditable(editable);
}

function installKeyboardGuard(shadow: ShadowRoot): void {
  if (guardedShadows.has(shadow)) {
    return;
  }

  const guard: EventListener = (event) => {
    if (!(event instanceof KeyboardEvent)) {
      return;
    }
    const editable = editableTarget(event.target);
    if (!editable) {
      return;
    }
    handlePreventedBackspace(event as KukeKeyboardEvent, editable);
    event.stopPropagation();
  };

  shadow.addEventListener('keydown', guard);
  shadow.addEventListener('keyup', guard);
  shadow.addEventListener('keypress', guard);
  guardedShadows.add(shadow);
}

function ensureHost(): HTMLElement {
  const existing = document.getElementById(HOST_ID);
  if (existing) {
    host = existing;
    return existing;
  }

  const nextHost = document.createElement('div');
  nextHost.id = HOST_ID;
  nextHost.style.position = 'fixed';
  nextHost.style.inset = '0';
  nextHost.style.zIndex = '2147483647';
  nextHost.style.pointerEvents = 'none';
  document.body.appendChild(nextHost);
  host = nextHost;
  return nextHost;
}

function mountReactApp(): void {
  const nextHost = ensureHost();
  const shadow = nextHost.shadowRoot ?? nextHost.attachShadow({ mode: 'open' });
  installKeyboardGuard(shadow);
  let rootElement = shadow.getElementById('kukechat-root');

  if (!rootElement) {
    const style = document.createElement('style');
    style.textContent = shadowStyles;
    rootElement = document.createElement('div');
    rootElement.id = 'kukechat-root';
    shadow.append(style, rootElement);
  }

  if (!root) {
    root = createRoot(rootElement);
    root.render(<AppRoot />);
  }
}

export function ensureKukeChatWindow(): void {
  mountReactApp();
  useKukeStore.getState().openWindow();
}

export function closeKukeChatWindow(): void {
  useKukeStore.getState().closeWindow();
}

export function minimizeKukeChatWindow(): void {
  mountReactApp();
  useKukeStore.getState().minimizeWindow();
}

export function toggleKukeChatFullscreen(): void {
  mountReactApp();
  useKukeStore.getState().toggleFullscreen();
}

export function disposeKukeChatWindow(): void {
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
}
