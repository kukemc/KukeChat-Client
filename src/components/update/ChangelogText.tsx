import type { ReactNode } from 'react';

/**
 * 更新日志正文。发版服务的 changelog 是很简单的 Markdown：一行引导语（「x.y.z 更新内容包括：」）加
 * 短横线列表。这里只认段落、`-` / `*` / `•` / `1.` 列表和 `**加粗**`，其余符号原样当文字显示；
 * 所有节点都由解析结果构造，不用 innerHTML。
 */

type Block = { kind: 'p'; text: string } | { kind: 'ul'; items: string[] };

const BULLET = /^\s*(?:[-*•·]|\d+[.、)])\s+/;
const HEADING = /^\s*#{1,6}\s+/;

function parse(source: string): Block[] {
  const blocks: Block[] = [];
  for (const rawLine of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      blocks.push({ kind: 'p', text: '' });
      continue;
    }
    if (BULLET.test(line)) {
      const text = line.replace(BULLET, '');
      const last = blocks[blocks.length - 1];
      if (last?.kind === 'ul') last.items.push(text);
      else blocks.push({ kind: 'ul', items: [text] });
      continue;
    }
    const text = line.replace(HEADING, '').trim();
    const last = blocks[blocks.length - 1];
    // 列表项的续行（缩进）并进上一项
    if (last?.kind === 'ul' && /^\s{2,}/.test(rawLine)) {
      last.items[last.items.length - 1] += ` ${text}`;
    } else if (last?.kind === 'p' && last.text) {
      last.text += `\n${text}`;
    } else {
      blocks.push({ kind: 'p', text });
    }
  }
  return blocks.filter((block) => block.kind === 'ul' || block.text);
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={index}>{part.slice(2, -2)}</strong> : <span key={index}>{part}</span>
  );
}

export function ChangelogText({ text, className = '' }: { text: string; className?: string }): JSX.Element {
  const blocks = parse(text);
  if (blocks.length === 0) return <p className={`kup-text ${className}`}>这个版本没有写更新日志。</p>;
  return (
    <div className={`kup-log ${className}`}>
      {blocks.map((block, index) => block.kind === 'ul' ? (
        <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>)}</ul>
      ) : (
        <p key={index} className={index === 0 && /[:：]$/.test(block.text) ? 'kup-log-lead' : undefined} style={{ whiteSpace: 'pre-line' }}>{inline(block.text)}</p>
      ))}
    </div>
  );
}
