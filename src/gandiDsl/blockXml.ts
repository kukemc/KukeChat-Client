/**
 * VM 积木表 → Blockly / scratch-blocks 认的 XML。
 *
 * 移植自 scratch-vm 的 `Blocks.blockToXML` / `blockOpenToXML` / `mutationToXML`
 * （gandi3 仓库 scratch-vm/src/engine/blocks.js），去掉了对 VM 实例的依赖：
 * 聊天里没有作品，只有编译器吐出来的一张表。
 *
 * 和原版一样，沿 next 走的那一段用循环拼，嵌在输入里的才递归 —— 一条很长的积木链不会把栈撑爆。
 */
import type { BlockTable, CommentTable, VmBlock } from '@/vendor/gandi-dsl/blocks';

export function xmlEscape(value: unknown): string {
  return String(value).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      default: return '&quot;';
    }
  });
}

interface MutationLike {
  tagName?: unknown;
  children?: unknown;
  [key: string]: unknown;
}

function mutationToXml(mutation: MutationLike): string {
  const tag = typeof mutation.tagName === 'string' && mutation.tagName ? mutation.tagName : 'mutation';
  let out = `<${tag}`;
  for (const [key, raw] of Object.entries(mutation)) {
    if (key === 'children' || key === 'tagName' || raw === undefined) continue;
    const value = key === 'blockInfo' || (typeof raw === 'object' && raw !== null) ? JSON.stringify(raw) : raw;
    out += ` ${key}="${xmlEscape(value)}"`;
  }
  out += '>';
  if (Array.isArray(mutation.children)) {
    for (const child of mutation.children) {
      if (child && typeof child === 'object') out += mutationToXml(child as MutationLike);
    }
  }
  return `${out}</${tag}>`;
}

function commentToXml(comment: CommentTable[string] | undefined): string {
  if (!comment) return '';
  const attrs = [
    `id="${xmlEscape(comment.id)}"`,
    comment.x !== null && comment.x !== undefined ? `x="${comment.x}"` : '',
    comment.y !== null && comment.y !== undefined ? `y="${comment.y}"` : '',
    `w="${comment.width}"`,
    `h="${comment.height}"`,
    'pinned="true"',
    `minimized="${comment.minimized ? 'true' : 'false'}"`
  ].filter(Boolean).join(' ');
  return `<comment ${attrs}>${xmlEscape(comment.text ?? '')}</comment>`;
}

function blockOpenToXml(block: VmBlock, blocks: BlockTable, comments: CommentTable | null, withPosition: boolean): string {
  const tag = block.shadow ? 'shadow' : 'block';
  const position = withPosition && block.topLevel ? ` x="${Math.round(block.x ?? 0)}" y="${Math.round(block.y ?? 0)}"` : '';
  let out = `<${tag} id="${xmlEscape(block.id)}" type="${xmlEscape(block.opcode)}"${position}>`;
  if (comments && typeof block.comment === 'string') {
    out += commentToXml(comments[block.comment]);
  }
  if (block.mutation) {
    out += mutationToXml(block.mutation as MutationLike);
  }
  for (const input of Object.values(block.inputs ?? {})) {
    if (!input.block && !input.shadow) continue;
    out += `<value name="${xmlEscape(input.name)}">`;
    if (input.block) out += blockToXml(input.block, blocks, comments, withPosition);
    if (input.shadow && input.shadow !== input.block) out += blockToXml(input.shadow, blocks, comments, withPosition);
    out += '</value>';
  }
  for (const field of Object.values(block.fields ?? {})) {
    out += `<field name="${xmlEscape(field.name)}"`;
    if (field.id) out += ` id="${xmlEscape(field.id)}"`;
    if (typeof field.variableType === 'string') out += ` variabletype="${xmlEscape(field.variableType)}"`;
    out += `>${xmlEscape(field.value ?? '')}</field>`;
  }
  return out;
}

/**
 * 一串积木（从 blockId 开始，带上它的 next 链）的 XML。
 * @param comments 传了就把积木注释一起写进去（拖进编辑器用）；画图时不传，注释气泡会把包围盒撑歪。
 * @param withPosition 顶层积木要不要带 x / y。
 */
export function blockToXml(blockId: string, blocks: BlockTable, comments: CommentTable | null = null, withPosition = false): string {
  let xml = '';
  let closers = '';
  let id: string | null | undefined = blockId;
  const seen = new Set<string>();
  while (id && !seen.has(id)) {
    seen.add(id);
    const block: VmBlock | undefined = blocks[id];
    if (!block) break;
    xml += blockOpenToXml(block, blocks, comments, withPosition);
    const tag = block.shadow ? 'shadow' : 'block';
    if (block.next) {
      xml += '<next>';
      closers = `</next></${tag}>${closers}`;
    } else {
      closers = `</${tag}>${closers}`;
    }
    id = block.next;
  }
  return xml + closers;
}
