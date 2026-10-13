import type { MessageMentionMetadata } from '@/types/api';
import { editablePlainText } from '../message/chatDom';

/** 输入框是 contentEditable，@ 提及以不可编辑的 token 节点存在。这里是围绕它的选区与文本工具。 */

const TOKEN_SELECTOR = '[data-mention-token]';

export interface MentionQuery {
  query: string;
  range: Range;
}

export function composerText(editor: HTMLElement): string {
  return editablePlainText(editor);
}

export function endRange(editor: HTMLElement): Range {
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  return range;
}

export function selectionRange(editor: HTMLElement): Range | null {
  // 扩展形态下输入框在 Shadow DOM 里，document 级的 selection 拿到的可能是宿主节点
  const root = editor.getRootNode() as Document | ShadowRoot;
  const selection = ('getSelection' in root && typeof root.getSelection === 'function' ? root.getSelection() : null) ?? window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }
  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;
  return container === editor || editor.contains(container) ? range : null;
}

export function setSelection(range: Range): void {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

export function focusAtEnd(editor: HTMLElement): void {
  editor.focus({ preventScroll: true });
  setSelection(endRange(editor));
}

function intersectsToken(editor: HTMLElement, range: Range): boolean {
  return Array.from(editor.querySelectorAll<HTMLElement>(TOKEN_SELECTOR)).some((node) => range.intersectsNode(node));
}

function lastTextRange(editor: HTMLElement): Range | null {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.parentElement?.closest(TOKEN_SELECTOR) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
  });
  let last: Text | null = null;
  let node = walker.nextNode() as Text | null;
  while (node) {
    last = node;
    node = walker.nextNode() as Text | null;
  }
  if (!last) {
    return null;
  }
  const range = document.createRange();
  range.setStart(last, last.data.length);
  range.collapse(true);
  return range;
}

function textSegments(editor: HTMLElement): Array<{ node: Text; start: number; end: number }> {
  const segments: Array<{ node: Text; start: number; end: number }> = [];
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let current = walker.nextNode() as Text | null;
  while (current) {
    const length = current.data.replace(/ /g, ' ').length;
    segments.push({ node: current, start: offset, end: offset + length });
    offset += length;
    current = walker.nextNode() as Text | null;
  }
  return segments;
}

function positionAtOffset(segments: Array<{ node: Text; start: number; end: number }>, offset: number): { node: Text; offset: number } | null {
  if (offset < 0) {
    return null;
  }
  for (const segment of segments) {
    if (offset >= segment.start && offset <= segment.end) {
      return { node: segment.node, offset: Math.min(segment.node.data.length, Math.max(0, offset - segment.start)) };
    }
  }
  return null;
}

function textBeforeCaret(editor: HTMLElement, range: Range): string {
  const before = document.createRange();
  before.selectNodeContents(editor);
  before.setEnd(range.endContainer, range.endOffset);
  return before.toString().replace(/ /g, ' ');
}

/** 光标前是否正在输入「@关键词」。返回关键词和需要被替换掉的那段范围。 */
export function activeMentionQuery(editor: HTMLElement): MentionQuery | null {
  const range = selectionRange(editor);
  if (!range || !range.collapsed || intersectsToken(editor, range)) {
    return null;
  }
  const before = textBeforeCaret(editor, range);
  const match = before.match(/(^|\s)@([^\s@]*)$/);
  if (!match) {
    return null;
  }
  const query = match[2];
  const segments = textSegments(editor);
  const start = positionAtOffset(segments, before.length - query.length - 1);
  const end = positionAtOffset(segments, before.length);
  if (!start || !end) {
    return { query, range: range.cloneRange() };
  }
  const replaceRange = document.createRange();
  replaceRange.setStart(start.node, start.offset);
  replaceRange.setEnd(end.node, end.offset);
  return { query, range: replaceRange };
}

export function readMentions(editor: HTMLElement): { mentions: MessageMentionMetadata[]; mentionAll: boolean } {
  const seen = new Set<number>();
  const mentions: MessageMentionMetadata[] = [];
  let mentionAll = false;
  editor.querySelectorAll<HTMLElement>(TOKEN_SELECTOR).forEach((node) => {
    if (node.dataset.mentionAll === 'true') {
      mentionAll = true;
      return;
    }
    const userId = Number(node.dataset.mentionId);
    const name = node.dataset.mentionName?.trim() || node.textContent?.replace(/^@/, '').trim();
    if (Number.isFinite(userId) && userId > 0 && name && !seen.has(userId)) {
      seen.add(userId);
      mentions.push({ user_id: userId, name });
    }
  });
  return { mentions, mentionAll };
}

export function insertText(editor: HTMLElement, text: string, at: 'caret' | 'start' = 'caret'): void {
  editor.focus({ preventScroll: true });
  let range: Range;
  if (at === 'start') {
    range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(true);
  } else {
    range = selectionRange(editor) ?? endRange(editor);
    range.deleteContents();
  }
  const node = document.createTextNode(text);
  range.insertNode(node);
  const next = document.createRange();
  next.setStart(node, node.data.length);
  next.collapse(true);
  setSelection(next);
}

/** 删掉输入框开头已有的「/指令 」。换一条机器人指令时先清掉旧的，不然会叠成两个。 */
export function removeLeadingCommand(editor: HTMLElement): void {
  // 连续输入和插入表情会留下相邻的文本节点，先并起来，开头那个词才是完整的
  editor.normalize();
  const first = editor.firstChild;
  if (first instanceof Text) {
    first.deleteData(0, /^\/\S*[^\S\n]*/.exec(first.data)?.[0].length ?? 0);
  }
}

export function insertMentionToken(editor: HTMLElement, name: string, options: { userId?: number; mentionAll?: boolean; range?: Range | null } = {}): void {
  let range = options.range ?? selectionRange(editor) ?? lastTextRange(editor) ?? endRange(editor);
  if (intersectsToken(editor, range)) {
    range = lastTextRange(editor) ?? endRange(editor);
  }
  editor.focus({ preventScroll: true });
  range.deleteContents();
  const token = document.createElement('span');
  token.contentEditable = 'false';
  token.dataset.mentionToken = 'true';
  token.dataset.mentionName = name;
  if (options.userId) {
    token.dataset.mentionId = String(options.userId);
  }
  if (options.mentionAll) {
    token.dataset.mentionAll = 'true';
  }
  token.className = 'kcd-mention-token';
  token.textContent = `@${name}`;
  const space = document.createTextNode(' ');
  const fragment = document.createDocumentFragment();
  fragment.append(token, space);
  range.insertNode(fragment);
  const next = document.createRange();
  next.setStart(space, space.data.length);
  next.collapse(true);
  setSelection(next);
}

/** 光标紧贴在一个 @ token 后面时，退格整体删掉它。返回是否处理了这次按键。 */
export function removeTokenBeforeCaret(editor: HTMLElement): boolean {
  const range = selectionRange(editor);
  if (!range?.collapsed || range.startContainer !== editor) {
    return false;
  }
  const previous = editor.childNodes.item(range.startOffset - 1);
  if (previous instanceof HTMLElement && previous.dataset.mentionToken === 'true') {
    previous.remove();
    return true;
  }
  return false;
}
