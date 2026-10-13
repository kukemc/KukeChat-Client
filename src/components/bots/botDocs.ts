/**
 * 机器人接入文档（docs/bot-api.md）的解析，桌面 / 移动两端的文档弹窗共用。
 * 这里只把 Markdown 拆成结构，长什么样由两端各自决定。
 */
import botApiMarkdown from '../../../docs/bot-api.md?raw';
import { API_BASE_URL, WS_URL } from '@/config';

/**
 * 把文档里的占位域名换成本次构建实际连接的地址。
 *
 * 仓库里的 `docs/bot-api.md` 用 `chat.example.com` 作占位符，这样开源仓库不含
 * 任何具体部署信息；但用户在客户端里看到的应该是能直接复制粘贴的真实地址。
 *
 * 只替换 API 与 WebSocket 两处 —— 那是开发者必须调用的端点。示例里的
 * `files.example.com` 保持不变：图片地址来自上传接口的返回值，换成真实域名
 * 反而会误导开发者去硬编码它。
 */
function resolveDocEndpoints(markdown: string): string {
  const apiBase = API_BASE_URL.replace(/\/+$/, '');
  let wsOrigin = WS_URL;
  try {
    const parsed = new URL(WS_URL);
    wsOrigin = `${parsed.protocol}//${parsed.host}`;
  } catch {
    // WS_URL 形态异常时保持原样，不至于把文档改坏
  }

  return markdown
    .replace(/https:\/\/chat\.example\.com/g, apiBase)
    .replace(/wss:\/\/chat\.example\.com/g, wsOrigin)
    // 顶部那段「占位域名」说明在替换后只对图片地址还成立，相应收窄
    .replace(
      /^> 文档中的 [\s\S]*?当前这份构建所连接的真实地址。\n/m,
      '> 示例中的 `files.example.com` 是占位域名，图片、语音等地址请以上传接口的返回值为准。\n'
    );
}

export type DocBlock =
  | { type: 'heading'; level: number; content: string }
  | { type: 'paragraph'; content: string }
  | { type: 'quote'; content: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'code'; language: string; content: string }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'hr' };

function tableCells(value: string): string[] | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  return trimmed.slice(1, -1).split('|').map((cell) => cell.trim());
}

function isTableDivider(value: string): boolean {
  const cells = tableCells(value);
  return Boolean(cells?.length && cells.every((cell) => /^:?-{3,}:?$/.test(cell)));
}

function parseMarkdown(markdown: string): DocBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: DocBlock[] = [];
  let index = 0;

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
    if (header && isTableDivider(lines[index + 1] ?? '')) {
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

/** 整份文档只在模块加载时解析一次 */
export const botApiDocBlocks: DocBlock[] = parseMarkdown(resolveDocEndpoints(botApiMarkdown));

export type DocInlineToken =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'link'; text: string; href: string }
  | { type: 'image'; alt: string; src: string };

function safeLink(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** 行内语法：图片、`代码`、**加粗**、[链接](地址)。地址不是 http(s) 的退回成纯文本。 */
export function tokenizeDocInline(value: string): DocInlineToken[] {
  const tokens: DocInlineToken[] = [];
  const pattern = /(!\[([^\]\n]{0,80})\]\((https?:\/\/[^\s)<>]{1,500})\))|(`([^`\n]+)`)|(\*\*([^*\n]+)\*\*)|(\[([^\]\n]{1,80})\]\((https?:\/\/[^\s)<>]{1,500})\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    if (match.index > lastIndex) tokens.push({ type: 'text', text: value.slice(lastIndex, match.index) });
    if (match[2] !== undefined && match[3]) {
      const src = safeLink(match[3]);
      tokens.push(src ? { type: 'image', alt: match[2] || '文档图片', src } : { type: 'text', text: match[2] });
    } else if (match[5]) {
      tokens.push({ type: 'code', text: match[5] });
    } else if (match[7]) {
      tokens.push({ type: 'bold', text: match[7] });
    } else if (match[9] && match[10]) {
      const href = safeLink(match[10]);
      tokens.push(href ? { type: 'link', text: match[9], href } : { type: 'text', text: match[9] });
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < value.length) tokens.push({ type: 'text', text: value.slice(lastIndex) });
  return tokens.length > 0 ? tokens : [{ type: 'text', text: value }];
}

export interface DocCodeToken {
  text: string;
  /** 没有 kind 的是普通代码 */
  kind?: 'comment' | 'string' | 'keyword';
}

/** 很粗的语法着色：Python 认注释、字符串和关键字；其他语言（HTTP、JSON）认字符串、请求方法和地址。 */
export function tokenizeDocCode(code: string, language: string): DocCodeToken[] {
  const pattern = language.toLowerCase() === 'python'
    ? /(#.*$)|("(?:\\.|[^"])*"|'(?:\\.|[^'])*')|\b(import|from|def|return|if|elif|else|for|while|try|except|with|as|class|lambda|True|False|None|in|is|and|or|not)\b/gm
    : /("(?:\\.|[^"])*")|(\b(?:GET|POST|PATCH|DELETE|PUT|Authorization|Content-Type)\b)|(https?:\/\/[^\s"']+)/g;
  const tokens: DocCodeToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(code)) !== null) {
    if (match.index > lastIndex) tokens.push({ text: code.slice(lastIndex, match.index) });
    const text = match[0];
    tokens.push({ text, kind: text.startsWith('#') ? 'comment' : /^['"]/.test(text) || /^https?:/.test(text) ? 'string' : 'keyword' });
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < code.length) tokens.push({ text: code.slice(lastIndex) });
  return tokens.length > 0 ? tokens : [{ text: code }];
}
