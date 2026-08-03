import { API_ORIGIN } from '@/config';
import { resolveAssetUrl } from '@/utils/assetUrl';

// XSS-safe markdown renderer. Never uses dangerouslySetInnerHTML — every node is
// constructed from parsed tokens, and all URLs are validated against an http(s)
// allow-list. Mirrors the hardened renderer used for bot messages.

function safeLinkUrl(value: string): string | undefined {
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

function safeImageUrl(value: string): string | undefined {
  const resolved = resolveAssetUrl(value);
  if (!resolved) {
    return undefined;
  }
  try {
    const parsed = new URL(resolved, typeof window === 'undefined' ? API_ORIGIN : window.location.href);
    if (!/^https?:$/.test(parsed.protocol)) {
      return undefined;
    }
    if (!/\.(png|jpe?g|webp|gif)$/.test(parsed.pathname.toLowerCase())) {
      return undefined;
    }
    return resolved;
  } catch {
    return undefined;
  }
}

function renderInline(value: string, keyPrefix: string): Array<string | JSX.Element> {
  const result: Array<string | JSX.Element> = [];
  const pattern = /(!\[([^\]\n]{0,80})\]\(([^\s)<>]{1,500})\))|(\*\*([^*\n]+)\*\*)|(__([^_\n]+)__)|(~~([^~\n]+)~~)|(\*([^*\n]+)\*)|(_([^_\n]+)_)|(`([^`\n]+)`)|(\[([^\]\n]{1,80})\]\(([^\s)<>]{1,500})\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    if (match.index > lastIndex) {
      result.push(value.slice(lastIndex, match.index));
    }
    if (match[1]) {
      const src = safeImageUrl(match[3]);
      result.push(src ? <img key={`${keyPrefix}-img-${match.index}`} src={src} alt={match[2] || '图片'} loading="lazy" className="my-1 max-h-72 max-w-full rounded-xl border object-contain [border-color:var(--kc-border)]" /> : <span key={`${keyPrefix}-badimg-${match.index}`} className="text-xs [color:var(--kc-muted)]">[图片链接不可用]</span>);
    } else if (match[4]) {
      result.push(<strong key={`${keyPrefix}-b-${match.index}`} className="font-bold">{renderInline(match[5], `${keyPrefix}-b-${match.index}`)}</strong>);
    } else if (match[6]) {
      result.push(<strong key={`${keyPrefix}-b2-${match.index}`} className="font-bold">{renderInline(match[7], `${keyPrefix}-b2-${match.index}`)}</strong>);
    } else if (match[8]) {
      result.push(<del key={`${keyPrefix}-s-${match.index}`} className="opacity-70">{renderInline(match[9], `${keyPrefix}-s-${match.index}`)}</del>);
    } else if (match[10]) {
      result.push(<em key={`${keyPrefix}-i-${match.index}`} className="italic">{renderInline(match[11], `${keyPrefix}-i-${match.index}`)}</em>);
    } else if (match[12]) {
      result.push(<em key={`${keyPrefix}-i2-${match.index}`} className="italic">{renderInline(match[13], `${keyPrefix}-i2-${match.index}`)}</em>);
    } else if (match[14]) {
      result.push(<code key={`${keyPrefix}-c-${match.index}`} className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.9em] dark:bg-white/10">{match[15]}</code>);
    } else if (match[16] && match[18]) {
      const href = safeLinkUrl(match[18]);
      result.push(href ? <a key={`${keyPrefix}-a-${match.index}`} href={href} target="_blank" rel="noreferrer" className="font-medium [color:var(--kc-accent)] hover:underline">{match[17]}</a> : <span key={`${keyPrefix}-bada-${match.index}`}>{match[17]}</span>);
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < value.length) {
    result.push(value.slice(lastIndex));
  }
  return result.length > 0 ? result : [value];
}

function tableCells(value: string): string[] | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) {
    return null;
  }
  return trimmed.slice(1, -1).split('|').slice(0, 8).map((cell) => cell.trim());
}

function isTableDivider(value: string): boolean {
  const cells = tableCells(value);
  return Boolean(cells?.length && cells.every((cell) => /^:?-{1,}:?$/.test(cell)));
}

export function renderMarkdown(content: string): JSX.Element {
  const limited = content.length > 12000 ? `${content.slice(0, 12000)}…` : content;
  const lines = limited.replace(/\r\n/g, '\n').split('\n').slice(0, 400);
  const nodes: JSX.Element[] = [];
  let listItems: string[] = [];
  let orderedItems: string[] = [];
  let codeLines: string[] = [];
  let codeLang = '';
  let inCode = false;

  function flushUl(key: string): void {
    if (listItems.length === 0) return;
    const items = listItems;
    nodes.push(<ul key={key} className="my-1.5 list-disc space-y-1 pl-5">{items.map((item, index) => <li key={index}>{renderInline(item, `${key}-${index}`)}</li>)}</ul>);
    listItems = [];
  }
  function flushOl(key: string): void {
    if (orderedItems.length === 0) return;
    const items = orderedItems;
    nodes.push(<ol key={key} className="my-1.5 list-decimal space-y-1 [padding-inline-start:2.5em]">{items.map((item, index) => <li key={index}>{renderInline(item, `${key}-${index}`)}</li>)}</ol>);
    orderedItems = [];
  }
  function flushLists(key: string): void {
    flushUl(`${key}-ul`);
    flushOl(`${key}-ol`);
  }
  function flushCode(key: string): void {
    if (codeLines.length > 0) {
      const lang = codeLang;
      const code = codeLines.join('\n');
      nodes.push(
        <pre key={key} className="my-2 max-w-full overflow-x-auto rounded-xl bg-black/5 px-3 py-2.5 text-[12px] leading-5 dark:bg-white/10">
          {lang ? <span className="mb-1 block select-none text-[10px] uppercase tracking-wide [color:var(--kc-muted)]">{lang.slice(0, 20)}</span> : null}
          <code className="font-mono">{code}</code>
        </pre>
      );
    }
    codeLines = [];
    codeLang = '';
    inCode = false;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    const fence = /^```\s*([\w#+.-]{0,24})\s*$/.exec(trimmed);
    if (fence) {
      if (inCode) {
        flushCode(`code-${index}`);
      } else {
        flushLists(`pre-code-${index}`);
        inCode = true;
        codeLang = fence[1] || '';
      }
      continue;
    }
    if (inCode) {
      if (codeLines.length < 200) {
        codeLines.push(line.slice(0, 1000));
      }
      continue;
    }
    // table
    const header = tableCells(line);
    if (header && isTableDivider(lines[index + 1] ?? '')) {
      flushLists(`pre-table-${index}`);
      const rows: string[][] = [];
      let cursor = index + 2;
      while (cursor < lines.length && rows.length < 30) {
        const cells = tableCells(lines[cursor]);
        if (!cells) break;
        rows.push(cells);
        cursor += 1;
      }
      nodes.push(
        <div key={`table-${index}`} className="scroll-soft my-2 block w-full max-w-full overflow-x-auto rounded-xl border [border-color:var(--kc-border)]">
          <table className="w-max min-w-full border-collapse text-left text-[13px] leading-5">
            <thead className="[background:var(--kc-panel-muted)]">
              <tr>{header.map((cell, cellIndex) => <th key={cellIndex} className="border-b px-3 py-2 font-semibold [border-color:var(--kc-border)]">{renderInline(cell, `th-${index}-${cellIndex}`)}</th>)}</tr>
            </thead>
            <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex} className={rowIndex % 2 ? 'bg-black/[0.02] dark:bg-white/[0.03]' : ''}>{header.map((_cell, cellIndex) => <td key={cellIndex} className="border-t px-3 py-2 align-top [border-color:var(--kc-border)]">{renderInline(row[cellIndex] ?? '', `td-${index}-${rowIndex}-${cellIndex}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      index = cursor - 1;
      continue;
    }
    const bullet = /^[-*+]\s+(.+)$/.exec(trimmed);
    if (bullet) {
      flushOl(`ol-flush-${index}`);
      listItems.push(bullet[1]);
      continue;
    }
    const ordered = /^\d{1,3}\.\s+(.+)$/.exec(trimmed);
    if (ordered) {
      flushUl(`ul-flush-${index}`);
      orderedItems.push(ordered[1]);
      continue;
    }
    flushLists(`list-${index}`);
    if (!trimmed) {
      nodes.push(<div key={`sp-${index}`} className="h-2.5" />);
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      nodes.push(<hr key={`hr-${index}`} className="my-3 border-0 border-t [border-color:var(--kc-border)]" />);
      continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length;
      const sizeClass = level === 1 ? 'text-lg' : level === 2 ? 'text-base' : level === 3 ? 'text-[15px]' : 'text-sm';
      nodes.push(<p key={`h-${index}`} className={`mt-1 font-black leading-7 [color:var(--kc-text)] ${sizeClass}`}>{renderInline(heading[2], `h-${index}`)}</p>);
      continue;
    }
    const quote = /^>\s?(.+)$/.exec(trimmed);
    if (quote) {
      nodes.push(<blockquote key={`q-${index}`} className="my-1 border-l-[3px] pl-3 text-[0.95em] [border-color:var(--kc-accent)] [color:var(--kc-muted)]">{renderInline(quote[1], `q-${index}`)}</blockquote>);
      continue;
    }
    nodes.push(<p key={`p-${index}`} className="leading-7">{renderInline(line, `p-${index}`)}</p>);
  }
  flushLists('list-end');
  flushCode('code-end');

  return <div className="kc-markdown min-w-0 max-w-full space-y-0.5 break-words [overflow-wrap:anywhere]">{nodes}</div>;
}

export function Markdown({ content, className }: { content: string; className?: string }): JSX.Element {
  return <div className={className}>{renderMarkdown(content)}</div>;
}
