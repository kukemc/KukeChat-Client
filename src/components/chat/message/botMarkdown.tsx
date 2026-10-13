import { type CSSProperties } from 'react';
import { type MessageInteractionPayload } from '@/api/messages';
import { API_ORIGIN } from '@/config';
import type { Message, MessageMentionMetadata } from '@/types/api';
import { Icon } from '@/components/ui/Icon';
import { resolveAssetUrl } from '@/utils/assetUrl';
import type { BotInteraction } from './types';
import { asString, asNumber, messageElements, isBotMarkdownMessage, botMarkdownContent, isBotRenderableElementType, botComponentState } from './messageMeta';
import { renderMentionedText } from './messageText';

export function renderBotElementContent(message: Message, mentionData: { mentions: MessageMentionMetadata[]; mentionAll: boolean }, onInteract?: (interaction: BotInteraction) => void): JSX.Element {
  const elements = messageElements(message.metadata).filter((element) => isBotRenderableElementType(element.type));
  if (elements.length === 0) {
    return isBotMarkdownMessage(message) ? renderSafeBotMarkdown(botMarkdownContent(message), onInteract, message) : <>{renderMentionedText(message.content, mentionData)}</>;
  }
  const nodes: JSX.Element[] = [];
  let interactionGroup: BotInteraction[] = [];

  function flushInteractionGroup(key: string): void {
    if (interactionGroup.length === 0) {
      return;
    }
    nodes.push(renderBotInteractionGroup(interactionGroup, key, onInteract));
    interactionGroup = [];
  }

  elements.forEach((element, index) => {
    if (element.type === 'markdown' || element.type === 'md') {
      flushInteractionGroup(`interactions-before-md-${index}`);
      nodes.push(<div key={`md-${index}`} className="my-1">{renderSafeBotMarkdown(element.content ?? '', onInteract, message)}</div>);
      return;
    }
    if (element.type === 'button' || element.type === 'btn' || element.type === 'link') {
      const interaction = botInteractionFromAttrs(element.type === 'link' ? 'link' : 'button', element.attrs, element.content ?? '', index);
      if (interaction) {
        interactionGroup.push({ ...interaction, state: botComponentState(message, interaction.componentId) });
      }
      return;
    }
    flushInteractionGroup(`interactions-before-${index}`);
    if (element.type === 'br') {
      nodes.push(<br key={`br-${index}`} />);
      return;
    }
    if (element.type === 'at_all' || element.type === 'mention_all') {
      nodes.push(<span key={`all-${index}`} className="font-semibold [color:var(--kc-accent)]">@全体成员</span>);
      return;
    }
    if (element.type === 'at' || element.type === 'mention') {
      const userId = asNumber(element.attrs?.id) ?? asNumber(element.attrs?.user_id) ?? asNumber(element.attrs?.userId);
      const name = asString(element.attrs?.name) ?? asString(element.attrs?.nickname) ?? asString(element.attrs?.username) ?? mentionData.mentions.find((mention) => mention.user_id === userId)?.name ?? (userId ? `用户 ${userId}` : '用户');
      nodes.push(<span key={`at-${index}`} className="font-semibold [color:var(--kc-accent)]">@{name}</span>);
      return;
    }
    nodes.push(<span key={`text-${index}`} className="whitespace-pre-wrap">{renderMentionedText(element.content ?? '', mentionData)}</span>);
  });
  flushInteractionGroup('interactions-end');
  return <div className="space-y-1">{nodes}</div>;
}

export function safeMarkdownLinkUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || /[\u0000-\u001f<>"'`]/.test(trimmed)) {
    return undefined;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function safeMarkdownImageUrl(value: string): string | undefined {
  const resolved = resolveAssetUrl(value);
  if (!resolved) {
    return undefined;
  }
  try {
    const parsed = new URL(resolved, typeof window === 'undefined' ? API_ORIGIN : window.location.href);
    if (!/^https?:$/.test(parsed.protocol)) {
      return undefined;
    }
    const pathname = parsed.pathname.toLowerCase();
    if (!/\.(png|jpe?g|webp|gif)$/.test(pathname)) {
      return undefined;
    }
    return resolved;
  } catch {
    return undefined;
  }
}

export function botInteractionFromAttrs(kind: 'button' | 'link', attrs: Record<string, unknown> | undefined, content = '', elementIndex?: number): BotInteraction | null {
  const label = (asString(attrs?.label) ?? asString(attrs?.text) ?? asString(attrs?.title) ?? content ?? '').trim() || (kind === 'button' ? '按钮' : '链接');
  const rawAction = (asString(attrs?.action) ?? asString(attrs?.type) ?? asString(attrs?.mode) ?? (kind === 'link' ? 'open' : 'callback')).trim().toLowerCase().replace(/-/g, '_');
  const action = rawAction === 'input' || rawAction === 'insert' || rawAction === 'fill' || rawAction === 'preset' || rawAction === 'text' ? 'input' : rawAction === 'open' ? 'open' : 'callback';
  const componentId = (asString(attrs?.component_id) ?? asString(attrs?.componentId) ?? asString(attrs?.button_id) ?? asString(attrs?.buttonId) ?? asString(attrs?.id))?.trim();
  const actionId = (asString(attrs?.action_id) ?? asString(attrs?.actionId) ?? asString(attrs?.id) ?? asString(attrs?.key))?.trim();
  const value = (asString(attrs?.value) ?? asString(attrs?.input) ?? asString(attrs?.command))?.trim();
  const href = (asString(attrs?.href) ?? asString(attrs?.url))?.trim();
  if (action === 'input' && !value) {
    return null;
  }
  if (action === 'callback' && !actionId) {
    return null;
  }
  if (action === 'open' && (!href || !safeMarkdownLinkUrl(href))) {
    return null;
  }
  return { kind, action, componentId, label: label.slice(0, 80), actionId, value, href, elementIndex };
}

export function decodeBotInlineEntity(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

export function parseBotInlineAttrs(raw: string): Record<string, string | boolean> {
  const attrs: Record<string, string | boolean> = {};
  const pattern = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    const key = match[1]?.trim();
    if (!key) {
      continue;
    }
    const value = match[2] ?? match[3] ?? match[4];
    attrs[key] = value === undefined ? true : decodeBotInlineEntity(value);
  }
  return attrs;
}

export function botInteractionFromMarkdownTag(tag: string, rawAttrs: string, rawContent: string | undefined): BotInteraction | null {
  const kind = tag.toLowerCase() === 'link' ? 'link' : 'button';
  const attrs = parseBotInlineAttrs(rawAttrs);
  const content = decodeBotInlineEntity(rawContent ?? '').trim();
  const label = (asString(attrs.label) ?? asString(attrs.text) ?? asString(attrs.title) ?? content).trim() || (kind === 'button' ? '按钮' : '链接');
  const rawAction = (asString(attrs.action) ?? asString(attrs.type) ?? asString(attrs.mode) ?? (kind === 'link' ? 'open' : 'callback')).trim().toLowerCase().replace(/-/g, '_');
  const action = rawAction === 'input' || rawAction === 'insert' || rawAction === 'fill' || rawAction === 'preset' || rawAction === 'text' ? 'input' : rawAction === 'open' ? 'open' : 'callback';
  const componentId = (asString(attrs.component_id) ?? asString(attrs.componentId) ?? asString(attrs.button_id) ?? asString(attrs.buttonId) ?? asString(attrs.id))?.trim();
  const actionId = (asString(attrs.action_id) ?? asString(attrs.actionId) ?? asString(attrs.id) ?? asString(attrs.key) ?? asString(attrs.value) ?? label)?.trim();
  const value = (asString(attrs.value) ?? asString(attrs.input) ?? asString(attrs.command) ?? label)?.trim();
  const href = (asString(attrs.href) ?? asString(attrs.url))?.trim();
  if (action === 'input' && !value) {
    return null;
  }
  if (action === 'callback' && !actionId) {
    return null;
  }
  if (action === 'open' && (!href || !safeMarkdownLinkUrl(href))) {
    return null;
  }
  return { kind, action, componentId, label: label.slice(0, 80), actionId, value, href };
}

export function interactionPayload(interaction: BotInteraction): MessageInteractionPayload {
  return {
    kind: interaction.kind,
    action: interaction.action,
    component_id: interaction.componentId ?? null,
    action_id: interaction.actionId ?? null,
    value: interaction.value ?? null,
    href: interaction.href ?? null,
    label: interaction.label,
    element_index: interaction.elementIndex ?? null
  };
}

export function botInteractionDisplay(interaction: BotInteraction): BotInteraction {
  return interaction.state ? { ...interaction, label: interaction.state.label ?? interaction.label } : interaction;
}

export function botInteractionStyle(interaction: BotInteraction): CSSProperties | undefined {
  const state = interaction.state;
  if (!state) {
    return undefined;
  }
  const variantColors: Record<string, { borderColor: string; color: string; backgroundColor?: string }> = {
    success: { borderColor: '#22c55e', color: '#16a34a', backgroundColor: 'rgba(34,197,94,0.08)' },
    danger: { borderColor: '#ef4444', color: '#dc2626', backgroundColor: 'rgba(239,68,68,0.08)' },
    warning: { borderColor: '#f59e0b', color: '#d97706', backgroundColor: 'rgba(245,158,11,0.08)' },
    primary: { borderColor: '#0a84ff', color: '#0a84ff', backgroundColor: 'rgba(10,132,255,0.08)' }
  };
  const variant = state.variant && state.variant !== 'default' ? variantColors[state.variant] : undefined;
  return {
    borderColor: state.border_color ?? variant?.borderColor,
    color: state.text_color ?? variant?.color,
    backgroundColor: state.background_color ?? variant?.backgroundColor,
    opacity: state.disabled ? 0.72 : undefined,
    cursor: state.disabled ? 'not-allowed' : undefined
  };
}

export function renderBotInteraction(interaction: BotInteraction, key: string, onInteract?: (interaction: BotInteraction) => void): JSX.Element {
  const display = botInteractionDisplay(interaction);
  const style = botInteractionStyle(display);
  if (display.action === 'open' && display.href) {
    return <a key={key} href={display.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg px-1 font-medium [color:var(--kc-accent)] hover:underline" style={style}>{display.label}</a>;
  }
  const buttonClass = display.kind === 'button'
    ? 'my-1 mr-1 inline-flex max-w-full items-center justify-center rounded-xl border px-3 py-1.5 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-sm [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]'
    : 'inline-flex items-center rounded-md px-1 font-medium [color:var(--kc-accent)] hover:underline';
  return <button key={key} type="button" className={buttonClass} style={style} disabled={display.state?.disabled} onClick={() => onInteract?.(display)}>{display.label}</button>;
}

export function renderBotInteractionButton(interaction: BotInteraction, key: string, onInteract?: (interaction: BotInteraction) => void): JSX.Element {
  const display = botInteractionDisplay(interaction);
  const style = botInteractionStyle(display);
  const buttonClass = `kc-bot-action-button flex min-h-10 min-w-0 flex-1 basis-[var(--kc-bot-action-min-width)] items-center justify-center gap-1 rounded-lg border px-3 py-2 text-center text-sm font-semibold leading-5 shadow-[0_1px_0_rgba(15,23,42,0.03)] transition hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 disabled:hover:translate-y-0 disabled:hover:shadow-none ${display.kind === 'link' || display.action === 'open' ? '[border-color:rgba(10,132,255,0.55)] [color:var(--kc-accent)] hover:[background:var(--kc-accent-soft)]' : '[background:var(--kc-panel)] [border-color:var(--kc-border-strong)] [color:var(--kc-text)] hover:[border-color:var(--kc-accent)] hover:[color:var(--kc-accent)]'}`;
  if (display.action === 'open' && display.href) {
    return <a key={key} href={display.href} target="_blank" rel="noreferrer" className={buttonClass} style={style}>{display.label}</a>;
  }
  return <button key={key} type="button" className={buttonClass} style={style} disabled={display.state?.disabled} onClick={() => onInteract?.(display)}>{display.label}</button>;
}

export function renderBotInteractionGroup(interactions: BotInteraction[], key: string, onInteract?: (interaction: BotInteraction) => void): JSX.Element {
  const longestLabelLength = Math.max(...interactions.map((interaction) => botInteractionDisplay(interaction).label.length), 1);
  const minWidth = Math.max(64, Math.min(160, longestLabelLength * 14 + 36));
  const groupStyle = { '--kc-bot-action-min-width': `${minWidth}px` } as CSSProperties;
  return (
    <div key={key} className="not-prose my-2 flex w-full max-w-[520px] flex-wrap gap-2 whitespace-normal" style={groupStyle}>
      {interactions.map((interaction, index) => renderBotInteractionButton(interaction, `${key}-${index}`, onInteract))}
    </div>
  );
}

export function botInteractionsFromMarkdownLine(value: string, message?: Message): BotInteraction[] | null {
  const interactions: BotInteraction[] = [];
  const pattern = /<\s*(button|btn|link)\b([^<>]*?)(?:\/\s*>|>(.*?)<\s*\/\s*\1\s*>)/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    const separator = value.slice(lastIndex, match.index).trim();
    if (separator && !/^[|｜、，,;；/]+$/.test(separator)) {
      return null;
    }
    const interaction = botInteractionFromMarkdownTag(match[1], match[2] ?? '', match[3]);
    if (!interaction) {
      return null;
    }
    interactions.push({ ...interaction, state: botComponentState(message, interaction.componentId) });
    lastIndex = pattern.lastIndex;
  }
  const suffix = value.slice(lastIndex).trim();
  if (suffix && !/^[|｜、，,;；/]+$/.test(suffix)) {
    return null;
  }
  return interactions.length > 0 ? interactions : null;
}

export function renderSafeBotMarkdown(content: string, onInteract?: (interaction: BotInteraction) => void, message?: Message): JSX.Element {
  const limited = content.length > 8000 ? `${content.slice(0, 8000)}...` : content;
  const lines = limited.split(/\r?\n/).slice(0, 80);
  const nodes: JSX.Element[] = [];
  let listItems: string[] = [];
  let orderedListItems: string[] = [];
  let codeLines: string[] = [];
  let codeLanguage = '';
  let inCodeBlock = false;

  function flushList(key: string): void {
    if (listItems.length === 0) {
      return;
    }
    nodes.push(<ul key={key} className="my-1 list-disc space-y-0.5 pl-5">{listItems.map((item, index) => <li key={index}>{renderInlineMarkdown(item, onInteract, message)}</li>)}</ul>);
    listItems = [];
  }

  function flushOrderedList(key: string): void {
    if (orderedListItems.length === 0) {
      return;
    }
    nodes.push(<ol key={key} className="my-1 list-decimal space-y-0.5 [padding-inline-start:2.5em]">{orderedListItems.map((item, index) => <li key={index}>{renderInlineMarkdown(item, onInteract, message)}</li>)}</ol>);
    orderedListItems = [];
  }

  function flushLists(key: string): void {
    flushList(`${key}-ul`);
    flushOrderedList(`${key}-ol`);
  }

  function flushCode(key: string): void {
    if (codeLines.length === 0) {
      codeLanguage = '';
      inCodeBlock = false;
      return;
    }
    nodes.push(
      <pre key={key} className="my-1 max-w-full overflow-x-auto rounded-xl bg-black/5 px-3 py-2 text-[12px] leading-5 dark:bg-white/10">
        {codeLanguage ? <span className="mb-1 block select-none text-[10px] uppercase tracking-wide [color:var(--kc-muted)]">{codeLanguage.slice(0, 20)}</span> : null}
        <code className="font-mono">{codeLines.join('\n')}</code>
      </pre>
    );
    codeLines = [];
    codeLanguage = '';
    inCodeBlock = false;
  }

  function tableRowCells(value: string): string[] | null {
    const trimmedRow = value.trim();
    if (!trimmedRow.startsWith('|') || !trimmedRow.endsWith('|')) {
      return null;
    }
    return trimmedRow.slice(1, -1).split('|').slice(0, 6).map((cell) => cell.trim());
  }

  function isTableDivider(value: string): boolean {
    const cells = tableRowCells(value);
    return Boolean(cells?.length && cells.every((cell) => /^:?-{3,}:?$/.test(cell)));
  }

  function collectTable(startIndex: number): { endIndex: number; node?: JSX.Element } | null {
    const header = tableRowCells(lines[startIndex]);
    if (!header || !isTableDivider(lines[startIndex + 1] ?? '')) {
      return null;
    }
    const rows: string[][] = [];
    let cursor = startIndex + 2;
    while (cursor < lines.length && rows.length < 12) {
      const cells = tableRowCells(lines[cursor]);
      if (!cells) {
        break;
      }
      rows.push(cells);
      cursor += 1;
    }
    return {
      endIndex: cursor - 1,
      node: (
        <div key={`table-${startIndex}`} className="scroll-soft my-2 block w-full max-w-full min-w-0 overflow-x-auto overscroll-x-contain rounded-xl border [border-color:var(--kc-border)]">
          <table className="w-max min-w-full max-w-none table-auto border-collapse text-left text-[12px] leading-5">
            <thead className="[background:var(--kc-panel-muted)]">
              <tr>{header.map((cell, cellIndex) => <th key={cellIndex} className="border-b px-3 py-2 font-semibold [border-color:var(--kc-border)]">{renderInlineMarkdown(cell, onInteract, message)}</th>)}</tr>
            </thead>
            <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex} className={rowIndex % 2 ? 'bg-black/[0.02] dark:bg-white/[0.03]' : ''}>{header.map((_cell, cellIndex) => <td key={cellIndex} className="border-t px-3 py-2 align-top [border-color:var(--kc-border)]">{renderInlineMarkdown(row[cellIndex] ?? '', onInteract, message)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )
    };
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    const fence = /^```\s*([\w#+.-]{0,24})\s*$/.exec(trimmed);
    if (fence) {
      if (inCodeBlock) {
        flushCode(`code-${index}`);
      } else {
        flushLists(`list-before-code-${index}`);
        inCodeBlock = true;
        codeLanguage = fence[1] || '';
      }
      continue;
    }
    if (inCodeBlock) {
      if (codeLines.length < 40) {
        codeLines.push(line.slice(0, 500));
      }
      continue;
    }
    const table = collectTable(index);
    if (table?.node) {
      flushLists(`list-before-table-${index}`);
      nodes.push(table.node);
      index = table.endIndex;
      continue;
    }
    const task = /^[-*]\s+\[([ xX])\]\s+(.+)$/.exec(trimmed);
    if (task) {
      flushLists(`list-before-task-${index}`);
      nodes.push(
        <p key={index} className="flex items-start gap-1.5 leading-6">
          <span className={`mt-1 grid h-4 w-4 shrink-0 place-items-center rounded border ${task[1].toLowerCase() === 'x' ? '[background:var(--kc-accent)] [border-color:var(--kc-accent)] text-white' : '[border-color:var(--kc-border)]'}`}>
            {task[1].toLowerCase() === 'x' ? <Icon name="check" className="h-3 w-3" /> : null}
          </span>
          <span>{renderInlineMarkdown(task[2], onInteract, message)}</span>
        </p>
      );
      continue;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
    if (bullet) {
      flushOrderedList(`ol-before-ul-${index}`);
      listItems.push(bullet[1]);
      continue;
    }
    const ordered = /^\d{1,3}\.\s+(.+)$/.exec(trimmed);
    if (ordered) {
      flushList(`ul-before-ol-${index}`);
      orderedListItems.push(ordered[1]);
      continue;
    }
    flushLists(`list-${index}`);
    if (!trimmed) {
      nodes.push(<div key={`br-${index}`} className="h-2" />);
      continue;
    }
    const interactionLine = botInteractionsFromMarkdownLine(trimmed, message);
    if (interactionLine) {
      nodes.push(renderBotInteractionGroup(interactionLine, `interaction-line-${index}`, onInteract));
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      nodes.push(<hr key={`hr-${index}`} className="my-3 border-0 border-t [border-color:var(--kc-border)]" />);
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      const sizeClass = heading[1].length === 1 ? 'text-base' : heading[1].length === 2 ? 'text-[15px]' : 'text-sm';
      nodes.push(<p key={index} className={`${sizeClass} font-semibold leading-6`}>{renderInlineMarkdown(heading[2], onInteract, message)}</p>);
      continue;
    }
    const quote = /^>\s?(.+)$/.exec(trimmed);
    if (quote) {
      nodes.push(<blockquote key={index} className="border-l-2 pl-3 text-[0.95em] [border-color:var(--kc-accent)] [color:var(--kc-muted)]">{renderInlineMarkdown(quote[1], onInteract, message)}</blockquote>);
      continue;
    }
    nodes.push(<p key={index} className="leading-6">{renderInlineMarkdown(line, onInteract, message)}</p>);
  }
  flushList('list-end');
  flushOrderedList('ordered-list-end');
  flushCode('code-end');
  return <div className="kc-bot-markdown min-w-0 max-w-full space-y-1 overflow-hidden break-words text-sm leading-6 [overflow-wrap:anywhere]">{nodes}</div>;
}

export function renderInlineMarkdown(value: string, onInteract?: (interaction: BotInteraction) => void, message?: Message): Array<string | JSX.Element> {
  const result: Array<string | JSX.Element> = [];
  const pattern = /(<\s*(button|btn|link)\b([^<>]*?)(?:\/\s*>|>(.*?)<\s*\/\s*\2\s*>))|(<\s*(at|mention|at_all|mention_all)\b([^<>]*?)\/\s*>)|(<\s*(img|image)\b([^<>]*?)(?:\/\s*>|>(.*?)<\s*\/\s*\9\s*>))|(!\[([^\]\n]{0,80})\]\(([^\s)<>]{1,500})\))|(\*\*([^*\n]+)\*\*)|(`([^`\n]+)`)|(\[([^\]\n]{1,80})\]\(([^\s)<>]{1,500})\))/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    if (match.index > lastIndex) {
      result.push(value.slice(lastIndex, match.index));
    }
    if (match[1]) {
      const interaction = botInteractionFromMarkdownTag(match[2], match[3] ?? '', match[4]);
      result.push(interaction ? renderBotInteraction({ ...interaction, state: botComponentState(message, interaction.componentId) }, `tag-${match.index}`, onInteract) : match[1]);
    } else if (match[5]) {
      const tag = match[6].toLowerCase().replace(/-/g, '_');
      if (tag === 'at_all' || tag === 'mention_all') {
        result.push(<span key={`at-all-${match.index}`} className="font-semibold [color:var(--kc-accent)]">@全体成员</span>);
      } else {
        const attrs = parseBotInlineAttrs(match[7] ?? '');
        const userId = Number(attrs.id ?? attrs.user_id ?? attrs.userId ?? 0);
        const name = String(attrs.name ?? attrs.nickname ?? attrs.username ?? '').trim() || message?.metadata?.mentions?.find((mention) => mention.user_id === userId)?.name || (userId > 0 ? `用户 ${userId}` : '用户');
        result.push(<span key={`at-${match.index}`} className="font-semibold [color:var(--kc-accent)]">@{name}</span>);
      }
    } else if (match[8]) {
      const attrs = parseBotInlineAttrs(match[10] ?? '');
      const src = safeMarkdownImageUrl(String(attrs.src ?? attrs.url ?? attrs.href ?? match[11] ?? ''));
      result.push(src ? <img key={`img-tag-${match.index}`} src={src} alt={String(attrs.alt ?? attrs.title ?? 'Markdown 图片')} className="my-1 max-h-48 max-w-full rounded-xl border object-contain [border-color:var(--kc-border)]" loading="lazy" /> : <span key={`bad-img-tag-${match.index}`} className="text-xs [color:var(--kc-muted)]">[图片链接不可用]</span>);
    } else if (match[12]) {
      const src = safeMarkdownImageUrl(match[14]);
      result.push(src ? <img key={`img-${match.index}`} src={src} alt={match[13] || 'Markdown 图片'} className="my-1 max-h-48 max-w-full rounded-xl border object-contain [border-color:var(--kc-border)]" loading="lazy" /> : <span key={`bad-img-${match.index}`} className="text-xs [color:var(--kc-muted)]">[图片链接不可用]</span>);
    } else if (match[16]) {
      result.push(<strong key={`b-${match.index}`} className="font-semibold">{match[16]}</strong>);
    } else if (match[18]) {
      result.push(<code key={`c-${match.index}`} className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.92em] dark:bg-white/10">{match[18]}</code>);
    } else if (match[20] && match[21]) {
      const href = safeMarkdownLinkUrl(match[21]);
      result.push(href ? <a key={`a-${match.index}`} href={href} target="_blank" rel="noreferrer" className="font-medium [color:var(--kc-accent)] hover:underline">{match[20]}</a> : <span key={`bad-a-${match.index}`}>{match[20]}</span>);
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < value.length) {
    result.push(value.slice(lastIndex));
  }
  return result.length > 0 ? result : [value];
}
