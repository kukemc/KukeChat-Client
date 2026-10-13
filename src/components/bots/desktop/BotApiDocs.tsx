import { useRef } from 'react';
import { API_BASE_URL, EXTENSION_ASSET_URL } from '@/config';
import { Icon } from '@/components/ui/Icon';
import { botApiDocBlocks, tokenizeDocCode, tokenizeDocInline, type DocBlock } from '../botDocs';
import { Dialog } from './BotDialogs';

/** 两种接入方式的简介。概览页和文档弹窗的开头都用它。 */
export function AccessWays(): JSX.Element {
  return (
    <div className="kcb-ways">
      <div>
        <h4><Icon name="blocks" className="h-4 w-4" />Scratch 扩展</h4>
        <p>加载 KukeChat 扩展后，用机器人 Key 和积木完成连接、收消息、发消息。</p>
        {EXTENSION_ASSET_URL ? <a className="kui-link kcb-ways-url" href={EXTENSION_ASSET_URL} target="_blank" rel="noreferrer">{EXTENSION_ASSET_URL}</a> : null}
      </div>
      <div>
        <h4><Icon name="code" className="h-4 w-4" />Bot API</h4>
        <p>请求头带上 <code>Authorization: Bot &lt;机器人 Key&gt;</code> 调用 REST API，通过 WebSocket 接收群消息事件。</p>
        <code className="kcb-ways-url">{`${API_BASE_URL}/api/v1`}</code>
      </div>
    </div>
  );
}

function Inline({ text }: { text: string }): JSX.Element {
  return (
    <>
      {tokenizeDocInline(text).map((token, index) => {
        switch (token.type) {
          case 'image': return <img key={index} src={token.src} alt={token.alt} loading="lazy" />;
          case 'code': return <code key={index}>{token.text}</code>;
          case 'bold': return <strong key={index}>{token.text}</strong>;
          case 'link': return <a key={index} className="kui-link" href={token.href} target="_blank" rel="noreferrer">{token.text}</a>;
          default: return token.text;
        }
      })}
    </>
  );
}

function Block({ block, index }: { block: DocBlock; index: number }): JSX.Element {
  switch (block.type) {
    case 'heading': {
      const Tag = block.level === 1 ? 'h1' : block.level === 2 ? 'h2' : 'h3';
      return <Tag data-doc-anchor={index}><Inline text={block.content} /></Tag>;
    }
    case 'paragraph': return <p><Inline text={block.content} /></p>;
    case 'quote': return <blockquote className="kui-note"><Inline text={block.content} /></blockquote>;
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return <Tag>{block.items.map((item, itemIndex) => <li key={itemIndex}><Inline text={item} /></li>)}</Tag>;
    }
    case 'code':
      return (
        <pre className="kui-scroll" data-language={block.language || undefined}>
          <code>{tokenizeDocCode(block.content, block.language).map((token, tokenIndex) => (token.kind ? <span key={tokenIndex} className={`is-${token.kind}`}>{token.text}</span> : token.text))}</code>
        </pre>
      );
    case 'table':
      return (
        <div className="kcb-doc-table kui-scroll">
          <table>
            <thead><tr>{block.header.map((cell, cellIndex) => <th key={cellIndex}><Inline text={cell} /></th>)}</tr></thead>
            <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{block.header.map((_cell, cellIndex) => <td key={cellIndex}><Inline text={row[cellIndex] ?? ''} /></td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    default: return <hr />;
  }
}

// 左边目录只列二级标题
const outline = botApiDocBlocks.flatMap((block, index) => (block.type === 'heading' && block.level === 2 ? [{ index, title: block.content }] : []));

/** 桌面端的机器人接入文档：左边目录，右边正文。 */
export function BotApiDocs({ onClose }: { onClose: () => void }): JSX.Element {
  const mainRef = useRef<HTMLDivElement>(null);

  function jump(anchor: number | 'top'): void {
    const main = mainRef.current;
    if (!main) {
      return;
    }
    if (anchor === 'top') {
      main.scrollTop = 0;
      return;
    }
    main.querySelector(`[data-doc-anchor="${anchor}"]`)?.scrollIntoView({ block: 'start' });
  }

  return (
    <Dialog title="接入文档" onClose={onClose} className="kcb-docs" bare>
      <div className="kcb-docs-body">
        <nav className="kcb-docs-toc kui-scroll" aria-label="目录">
          <button type="button" onClick={() => jump('top')}>接入方式</button>
          {outline.map((item) => <button key={item.index} type="button" onClick={() => jump(item.index)}>{item.title}</button>)}
        </nav>
        <div ref={mainRef} className="kcb-docs-main kui-scroll">
          <AccessWays />
          <article className="kcb-doc">
            {botApiDocBlocks.map((block, index) => <Block key={index} block={block} index={index} />)}
          </article>
        </div>
      </div>
    </Dialog>
  );
}
