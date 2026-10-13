import { API_BASE_URL, EXTENSION_ASSET_URL } from '@/config';
import { Icon } from '@/components/ui/Icon';
import { botApiDocBlocks, tokenizeDocCode, tokenizeDocInline } from './botDocs';

interface BotApiDocsModalProps {
  onClose: () => void;
}

const CODE_TOKEN_CLASS = { comment: 'text-emerald-500', string: 'text-amber-500', keyword: 'text-sky-500' };

function renderInline(value: string): Array<string | JSX.Element> {
  return tokenizeDocInline(value).map((token, index) => {
    if (token.type === 'image') {
      return <img key={index} src={token.src} alt={token.alt} className="my-2 max-h-64 max-w-full rounded-2xl border object-contain [border-color:var(--kc-border)]" loading="lazy" />;
    }
    if (token.type === 'code') {
      return <code key={index} className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.92em] dark:bg-white/10">{token.text}</code>;
    }
    if (token.type === 'bold') {
      return <strong key={index} className="font-semibold">{token.text}</strong>;
    }
    if (token.type === 'link') {
      return <a key={index} href={token.href} target="_blank" rel="noreferrer" className="font-semibold [color:var(--kc-accent)] hover:underline">{token.text}</a>;
    }
    return token.text;
  });
}

function highlightCode(code: string, language: string): Array<string | JSX.Element> {
  return tokenizeDocCode(code, language).map((token, index) => (token.kind ? <span key={index} className={CODE_TOKEN_CLASS[token.kind]}>{token.text}</span> : token.text));
}

function MarkdownDocument(): JSX.Element {
  return (
    <div className="select-text space-y-4 text-sm leading-7 [color:var(--kc-text)]">
      {botApiDocBlocks.map((block, index) => {
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

/** 移动端的机器人接入文档弹窗。桌面端用的是 desktop/BotApiDocs.tsx。 */
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
            <MarkdownDocument />
          </section>
        </div>
      </div>
    </div>
  );
}
