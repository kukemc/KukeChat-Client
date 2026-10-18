import type { Conversation, TypingIndicatorMode } from '@/types/api';
import type { SelectOption } from './shared';

/** 「自动」时按这个人数分界：服务端的规则，这里只用来写说明文字，显不显示由服务端决定推不推。 */
export const TYPING_AUTO_MAX_MEMBERS = 200;

export const typingIndicatorOptions: Array<SelectOption<TypingIndicatorMode>> = [
  { value: 'auto', label: '自动' },
  { value: 'on', label: '开启' },
  { value: 'off', label: '关闭' }
];

/** 旧后端没有这个字段，或者给了不认识的值，都按「自动」。 */
export function typingIndicatorMode(conversation: Pick<Conversation, 'typing_indicator'> | null | undefined): TypingIndicatorMode {
  const value = conversation?.typing_indicator;
  return value === 'on' || value === 'off' ? value : 'auto';
}

export function typingIndicatorHint(mode: TypingIndicatorMode, memberCount?: number | null): string {
  if (mode === 'on') {
    return '人再多也显示谁正在输入。';
  }
  if (mode === 'off') {
    return '成员输入时不再提示。';
  }
  const base = `${TYPING_AUTO_MAX_MEMBERS} 人以下的群显示`;
  if (typeof memberCount !== 'number' || memberCount <= 0) {
    return `${base}。`;
  }
  return `${base}，本群 ${memberCount} 人，${memberCount <= TYPING_AUTO_MAX_MEMBERS ? '会显示' : '不显示'}。`;
}
