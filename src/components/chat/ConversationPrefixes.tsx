import type { Conversation } from '@/types/api';
import { conversationPrefixes } from './conversationMeta';

/**
 * 会话列表里最后一条消息预览前面的提示前缀：「[有人@我]」/「[@全体成员]」、「[有红包]」。桌面和移动的列表共用。
 * 有哪些、谁排前面由 conversationMeta.ts 的 conversationPrefixes 定；这里只管画。
 * 放在预览正文的外面、和它并排：前缀自己不截断，窄的时候截的是后面的正文。没有前缀时什么都不渲染。
 * 颜色在 desktop-shell.css（kc-conv-prefix），字号由两套列表各自用 className 给。
 */
export function ConversationPrefixes({ conversation, className }: { conversation: Conversation; className?: string }): JSX.Element | null {
  const prefixes = conversationPrefixes(conversation);
  if (prefixes.length === 0) {
    return null;
  }
  return (
    <span className={className ? `kc-conv-prefixes ${className}` : 'kc-conv-prefixes'}>
      {prefixes.map((prefix) => <span key={prefix.kind} className={`kc-conv-prefix kc-conv-prefix--${prefix.kind}`} data-conv-prefix={prefix.kind}>{prefix.text}</span>)}
    </span>
  );
}
