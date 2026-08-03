import botApiMarkdown from '../../../docs/bot-api.md?raw';
import { API_BASE_URL, EXTENSION_ASSET_URL } from '@/config';
import { Icon } from '@/components/ui/Icon';

interface BotApiDocsModalProps {
  onClose: () => void;
}

type Block =
  | { type: 'heading'; level: number; content: string }
  | { type: 'paragraph'; content: string }
  | { type: 'quote'; content: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'code'; language: string; content: string }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'hr' };

function parseMarkdown(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let index = 0;

  function tableCells(value: string): string[] | null {
    const trimmed = value.trim();
    if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
    return trimmed.slice(1, -1).split('|').map((cell) => cell.trim());
  }

  function isDivider(value: string): boolean {
    const cells = tableCells(value);
    return Boolean(cells?.length && cells.every((cell) => /^:?-{3,}:?$/.test(cell)));
  }

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    const fence = /^```\s*([\w#+.-]*)\s*$/.exec(trimmed);
    if (fence) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index].trim())) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: 'code', language: fence[1] || '', content: codeLines.join('\n') });
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, content: heading[2] });
      index += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      index += 1;
      continue;
    }

    const quote = /^>\s?(.+)$/.exec(trimmed);
    if (quote) {
      blocks.push({ type: 'quote', content: quote[1] });
      index += 1;
      continue;
    }

    const header = tableCells(line);
    if (header && isDivider(lines[index + 1] ?? '')) {
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length) {
        const cells = tableCells(lines[index]);
        if (!cells) break;
        rows.push(cells);
        index += 1;
      }
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    const listMatch = /^((?:[-*]|\d+\.)\s+)(.+)$/.exec(trimmed);
    if (listMatch) {
      const ordered = /^\d+\./.test(listMatch[1]);
      const items: string[] = [];
      while (index < lines.length) {
        const item = /^(?:[-*]|\d+\.)\s+(.+)$/.exec(lines[index].trim());
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const paragraph: string[] = [trimmed];
    index += 1;
    while (index < lines.length) {
      const next = lines[index].trim();
      if (!next || /^```/.test(next) || /^#{1,4}\s+/.test(next) || /^[-*]\s+/.test(next) || /^\d+\.\s+/.test(next) || tableCells(lines[index])) break;
      paragraph.push(next);
      index += 1;
    }
    blocks.push({ type: 'paragraph', content: paragraph.join(' ') });
  }
  return blocks;
}

function safeLink(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function renderInline(value: string): Array<string | JSX.Element> {
  const result: Array<string | JSX.Element> = [];
  const pattern = /(!\[([^\]\n]{0,80})\]\((https?:\/\/[^\s)<>]{1,500})\))|(`([^`\n]+)`)|(\*\*([^*\n]+)\*\*)|(\[([^\]\n]{1,80})\]\((https?:\/\/[^\s)<>]{1,500})\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    if (match.index > lastIndex) result.push(value.slice(lastIndex, match.index));
    if (match[2] && match[3]) {
      const src = safeLink(match[3]);
      result.push(src ? <img key={`img-${match.index}`} src={src} alt={match[2] || '文档图片'} className="my-2 max-h-64 max-w-full rounded-2xl border object-contain [border-color:var(--kc-border)]" loading="lazy" /> : match[2]);
    } else if (match[5]) {
      result.push(<code key={`code-${match.index}`} className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.92em] dark:bg-white/10">{match[5]}</code>);
    } else if (match[7]) {
      result.push(<strong key={`bold-${match.index}`} className="font-semibold">{match[7]}</strong>);
    } else if (match[9] && match[10]) {
      const href = safeLink(match[10]);
      result.push(href ? <a key={`link-${match.index}`} href={href} target="_blank" rel="noreferrer" className="font-semibold [color:var(--kc-accent)] hover:underline">{match[9]}</a> : match[9]);
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < value.length) result.push(value.slice(lastIndex));
  return result.length > 0 ? result : [value];
}

function highlightCode(code: string, language: string): Array<string | JSX.Element> {
  const lang = language.toLowerCase();
  const pattern = lang === 'python'
    ? /(#.*$)|("(?:\\.|[^"])*"|'(?:\\.|[^'])*')|\b(import|from|def|return|if|elif|else|for|while|try|except|with|as|class|lambda|True|False|None|in|is|and|or|not)\b/gm
    : /("(?:\\.|[^"])*")|(\b(?:GET|POST|PATCH|DELETE|PUT|Authorization|Content-Type)\b)|(https?:\/\/[^\s"']+)/g;
  const result: Array<string | JSX.Element> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(code)) !== null) {
    if (match.index > lastIndex) result.push(code.slice(lastIndex, match.index));
    const value = match[0];
    const className = value.startsWith('#') ? 'text-emerald-500' : /^['"]/.test(value) || /^https?:/.test(value) ? 'text-amber-500' : 'text-sky-500';
    result.push(<span key={`${match.index}-${value}`} className={className}>{value}</span>);
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < code.length) result.push(code.slice(lastIndex));
  return result.length > 0 ? result : [code];
}

function MarkdownDocument({ markdown }: { markdown: string }): JSX.Element {
  const blocks = parseMarkdown(markdown);
  return (
    <div className="select-text space-y-4 text-sm leading-7 [color:var(--kc-text)]">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const size = block.level === 1 ? 'text-xl' : block.level === 2 ? 'text-lg' : 'text-base';
          return <h3 key={index} className={`${size} pt-2 font-black tracking-tight`}>{renderInline(block.content)}</h3>;
        }
        if (block.type === 'paragraph') return <p key={index} className="[color:var(--kc-muted)]">{renderInline(block.content)}</p>;
        if (block.type === 'quote') return <blockquote key={index} className="rounded-r-2xl border-l-2 px-3 py-2 [background:var(--kc-panel-muted)] [border-color:var(--kc-accent)] [color:var(--kc-muted)]">{renderInline(block.content)}</blockquote>;
        if (block.type === 'list') {
          const Tag = block.ordered ? 'ol' : 'ul';
          return <Tag key={index} className={`${block.ordered ? 'list-decimal' : 'list-disc'} space-y-1 pl-5 [color:var(--kc-muted)]`}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}</Tag>;
        }
        if (block.type === 'code') {
          return (
            <div key={index} className="overflow-hidden rounded-2xl border [border-color:var(--kc-border)]">
              {block.language ? <div className="border-b px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] [color:var(--kc-muted)]">{block.language}</div> : null}
              <pre className="scroll-soft max-h-[420px] select-text overflow-auto bg-slate-950 p-4 text-xs leading-6 text-slate-100"><code className="select-text">{highlightCode(block.content, block.language)}</code></pre>
            </div>
          );
        }
        if (block.type === 'table') {
          return (
            <div key={index} className="overflow-x-auto rounded-2xl border [border-color:var(--kc-border)]">
              <table className="w-full min-w-max border-collapse text-left text-xs leading-6">
                <thead className="[background:var(--kc-panel-muted)]"><tr>{block.header.map((cell, cellIndex) => <th key={cellIndex} className="border-b px-3 py-2 font-black [border-color:var(--kc-border)]">{renderInline(cell)}</th>)}</tr></thead>
                <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{block.header.map((_cell, cellIndex) => <td key={cellIndex} className="border-t px-3 py-2 [border-color:var(--kc-border)] [color:var(--kc-muted)]">{renderInline(row[cellIndex] ?? '')}</td>)}</tr>)}</tbody>
              </table>
            </div>
          );
        }
        return <hr key={index} className="border-0 border-t [border-color:var(--kc-border)]" />;
      })}
    </div>
  );
}

export function BotApiDocsModal({ onClose }: BotApiDocsModalProps): JSX.Element {
  return (
    <div className="kc-bot-api-docs-modal fixed inset-0 z-[90] grid place-items-center bg-black/35 p-2 text-[var(--kc-text)] backdrop-blur-sm sm:p-4">
      <div className="kc-message-enter flex h-[calc(100dvh-16px)] w-full max-w-6xl flex-col overflow-hidden rounded-[22px] border shadow-[0_24px_90px_rgba(15,23,42,0.26)] [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)] sm:h-[min(820px,calc(100dvh-32px))] sm:rounded-[28px]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 [border-color:var(--kc-border)] sm:px-5 sm:py-4">
          <div className="min-w-0">
            <h3 className="text-base font-black sm:text-lg">如何接入机器人</h3>
            <p className="mt-0.5 text-xs [color:var(--kc-muted)] sm:text-sm">可以使用 Scratch 扩展，也可以直接调用公开 Bot API。</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl transition hover:[background:var(--kc-hover)] sm:h-10 sm:w-10"><Icon name="close" className="h-4 w-4" /></button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:gap-4 sm:p-5">
          <section className="grid shrink-0 gap-2 lg:grid-cols-2">
            <article className="rounded-[18px] border p-3 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] sm:rounded-[22px] sm:p-4">
              <div className="flex items-center gap-2"><Icon name="blocks" className="h-5 w-5 [color:var(--kc-accent)]" /><h4 className="font-black">方式一：Scratch 扩展</h4></div>
              <p className="mt-1 select-text text-xs leading-5 [color:var(--kc-muted)] [@media(max-height:650px)]:hidden sm:mt-2 sm:text-sm sm:leading-6">加载 KukeChat 扩展后，使用机器人 Key 和积木完成连接、接收消息、发送消息等操作。</p>
              {EXTENSION_ASSET_URL ? (
                <a href={EXTENSION_ASSET_URL} target="_blank" rel="noreferrer" className="mt-2 inline-flex max-w-full items-center gap-2 rounded-2xl border px-3 py-1.5 text-xs font-bold [border-color:var(--kc-border)] [color:var(--kc-accent)] hover:[background:var(--kc-hover)] sm:mt-3 sm:py-2 sm:text-sm">
                  <Icon name="external" className="h-4 w-4" />
                  <span className="truncate">{EXTENSION_ASSET_URL}</span>
                </a>
              ) : null}
            </article>
            <article className="rounded-[18px] border p-3 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] sm:rounded-[22px] sm:p-4">
              <div className="flex items-center gap-2"><Icon name="code" className="h-5 w-5 [color:var(--kc-accent)]" /><h4 className="font-black">方式二：API 接入</h4></div>
              <p className="mt-1 select-text text-xs leading-5 [color:var(--kc-muted)] [@media(max-height:650px)]:hidden sm:mt-2 sm:text-sm sm:leading-6">使用 `Authorization: Bot &lt;机器人Key&gt;` 调用 REST API，并通过 WebSocket 接收群消息事件。</p>
              <p className="mt-2 select-text truncate rounded-2xl px-3 py-1.5 font-mono text-xs [background:var(--kc-panel-muted)] sm:mt-3 sm:py-2">{`${API_BASE_URL}/api/v1`}</p>
            </article>
          </section>

          <section className="scroll-soft min-h-0 flex-1 overflow-y-auto rounded-[20px] border p-4 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] sm:rounded-[24px] sm:p-5">
            <MarkdownDocument markdown={botApiMarkdown} />
          </section>
        </div>
      </div>
    </div>
  );
}
