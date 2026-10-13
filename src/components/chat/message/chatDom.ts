import type { OverlayPosition } from './types';
import { EDITABLE_BLOCK_TAGS, EDITABLE_TRAILING_BREAK_TAGS } from './constants';

export function editablePlainText(editor: HTMLElement): string {
  let output = '';
  const rawText = (editor.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n');

  const appendBreak = (): void => {
    output += '\n';
  };

  const appendNode = (node: ChildNode): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      output += (node.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n');
      return;
    }
    if (node instanceof HTMLBRElement) {
      appendBreak();
      return;
    }
    if (!(node instanceof HTMLElement)) {
      node.childNodes.forEach(appendNode);
      return;
    }

    const isBlock = EDITABLE_BLOCK_TAGS.has(node.tagName);
    if (isBlock && output && !output.endsWith('\n')) {
      appendBreak();
    }
    node.childNodes.forEach(appendNode);
    if (EDITABLE_TRAILING_BREAK_TAGS.has(node.tagName) && output && !output.endsWith('\n')) {
      appendBreak();
    }
  };

  editor.childNodes.forEach(appendNode);

  let text = output.replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n');
  if (!rawText.trim() && !text.trim()) {
    return '';
  }
  if (text.endsWith('\n') && !rawText.endsWith('\n')) {
    text = text.slice(0, -1);
  }
  return text;
}

export function pointInContainer(x: number, y: number, container: HTMLElement | null): OverlayPosition {
  const rect = container?.getBoundingClientRect();
  return rect ? { left: x - rect.left, top: y - rect.top } : { left: x, top: y };
}

export function elementAnchorInContainer(element: HTMLElement, container: HTMLElement | null, xRatio = 0.5, yOffset = 8): OverlayPosition {
  const rect = element.getBoundingClientRect();
  return pointInContainer(rect.left + rect.width * xRatio, rect.bottom + yOffset, container);
}

export function clampOverlayPosition(position: OverlayPosition, width: number, height: number, container: HTMLElement | null): OverlayPosition {
  const margin = 8;
  const bounds = container?.getBoundingClientRect();
  const boundsWidth = bounds?.width ?? window.innerWidth;
  const boundsHeight = bounds?.height ?? window.innerHeight;
  const minLeft = margin;
  const minTop = margin;
  const maxLeft = Math.max(minLeft, boundsWidth - width - margin);
  const maxTop = Math.max(minTop, boundsHeight - height - margin);
  return {
    left: Math.min(Math.max(position.left, minLeft), maxLeft),
    top: Math.min(Math.max(position.top, minTop), maxTop)
  };
}

export function fallbackCopyText(value: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

export function copyText(value: string): void {
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(value).catch(() => fallbackCopyText(value));
    return;
  }

  fallbackCopyText(value);
}

export function isNearBottom(element: HTMLElement | null): boolean {
  if (!element) {
    return true;
  }

  return element.scrollHeight - element.scrollTop - element.clientHeight < 180;
}

export function scrollMessagesToBottom(element: HTMLElement | null, behavior: ScrollBehavior = 'auto'): void {
  if (!element) {
    return;
  }

  const top = Math.max(0, element.scrollHeight - element.clientHeight);
  if (behavior === 'auto') {
    element.scrollTop = top;
    return;
  }

  element.scrollTo({ top, behavior });
}

export function forceScrollMessagesToBottom(element: HTMLElement | null): void {
  if (!element) {
    return;
  }

  const previousScrollBehavior = element.style.scrollBehavior;
  element.style.scrollBehavior = 'auto';
  scrollMessagesToBottom(element, 'auto');
  element.style.scrollBehavior = previousScrollBehavior;
}
