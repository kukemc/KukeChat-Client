/**
 * 积木注释文字 ⇄ `/** ... *\/` 注释的编码。往返必须无损：首尾空白、`*\/`、`\r`、空串都要原样回来。
 *
 * 两种写法：
 *  - 好读的写法：单行 `/** 文字 *\/`，多行 JSDoc 样式（每行 ` * ` 开头）；
 *  - 精确写法 `/** @text "JSON 字符串" *\/`：好读的写法读回来和原文不一样（首尾空白、`*\/`、`\r`、行首有 `@text` 等）时才用。
 * 打印器用解码函数自己验证：好读的写法解回来不等于原文就改用精确写法，所以两边不会不一致。
 */

const EXACT = /^\s*@text\s+("(?:[^"\\]|\\[\s\S])*")\s*$/;

/**
 * 注释正文 → 文字。
 * @param body `/**` 和 `*\/` 之间的原文。
 * @returns 注释文字。
 */
export const decodeComment = (body: string): string => {
    const exact = EXACT.exec(body);
    if (exact) {
        try {
            const parsed: unknown = JSON.parse(exact[1]);
            if (typeof parsed === 'string') return parsed;
        } catch { /* 不是合法 JSON 字符串：按普通注释读 */ }
    }
    const lines = body.split(/\r?\n/);
    const content = lines.slice(1).filter(line => line.trim());
    const prefix = content[0] && /^([ \t]+)\*(?:[ \t]|$)/.exec(content[0]);
    const decoration = prefix ? `${prefix[1]}*` : null;
    const decoratedLines = decoration && /\r?\n[ \t]*$/.test(body) && content.every(line => line.startsWith(decoration) &&
        (!line[decoration.length] || /[ \t]/.test(line[decoration.length]))) ?
        lines.map((line, offset) => offset && line.startsWith(decoration) ?
            line.slice(decoration.length).replace(/^[ \t]/, '') : line) : lines;
    return decoratedLines.join('\n').trim();
};

/**
 * 文字 → 注释（含 `/**` 和 `*\/`，多行时后面几行带 indent 缩进）。
 * @param text 注释文字。
 * @param indent 这条注释所在的缩进。
 * @returns 注释源码。
 */
export const encodeComment = (text: string, indent = ''): string => {
    const readable = text.includes('\n') ?
        `/**\n${text.split('\n').map(line => `${indent} *${line ? ` ${line}` : ''}`).join('\n')}\n${indent} */` :
        text ? `/** ${text} */` : '/** */';
    if (readable.indexOf('*/') === readable.length - 2 && decodeComment(readable.slice(3, -2)) === text) return readable;
    return `/** @text ${JSON.stringify(text).replace(/\*\//g, '*\\/')} */`;
};

/** 这段源码是不是 JSDoc 样式的积木注释（以 slash-star-star 开头；空的 slash-star-star-slash 不算） */
export const isDocComment = (raw: string): boolean => raw.startsWith('/**') && raw.length >= 5 && raw !== '/***/';
