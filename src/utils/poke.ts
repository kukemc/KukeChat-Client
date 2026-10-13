import { ApiError } from '@/api/client';
import { isRecord } from '@/api/normalizers';
import type { Message } from '@/types/api';

/*
 * 戳一戳在聊天记录里是一条系统消息：content 是服务端拼好的整句（旧客户端直接显示），
 * metadata 里带着结构化字段，新客户端用它把自己换成「你」、把名字做成可点击的。
 */

const POKE_SYSTEM_EVENT = 'conversation.member.poked';
/** 资料里没带动作时的默认值，和服务端的 default_action 一致。 */
const DEFAULT_POKE_ACTION = '戳';

export interface PokeInfo {
  actorId: number;
  userId: number;
  action: string;
  suffix: string;
  /** 发起时的名字快照：群昵称 > 昵称 > 用户名 */
  actorName: string;
  userName: string;
}

/** 不是戳一戳，或者 metadata 不完整（按普通系统消息显示 content）时返回 null。 */
export function pokeInfoOf(message: Message): PokeInfo | null {
  const metadata = message.metadata;
  if (message.type !== 'system' || !metadata || metadata.system_event !== POKE_SYSTEM_EVENT) {
    return null;
  }
  const { actor_id: actorId, user_id: userId, action, suffix, actor_name: actorName, user_name: userName } = metadata;
  if (typeof actorId !== 'number' || typeof userId !== 'number' || typeof action !== 'string' || !action.trim() || typeof actorName !== 'string' || !actorName || typeof userName !== 'string' || !userName) {
    return null;
  }
  return { actorId, userId, action: action.trim(), suffix: typeof suffix === 'string' ? suffix.trim() : '', actorName, userName };
}

/** 菜单和设置里的叫法：「拍」→「拍一拍」。 */
export function pokeActionLabel(action?: string | null): string {
  const word = action?.trim() || DEFAULT_POKE_ACTION;
  return `${word}一${word}`;
}

/** 聊天记录里的写法：「拍」→「拍了拍」。 */
export function pokeVerb(action?: string | null): string {
  const word = action?.trim() || DEFAULT_POKE_ACTION;
  return `${word}了${word}`;
}

/** 整句文案，自己显示成「你」。 */
export function pokeText(info: PokeInfo, currentUserId: number | null): string {
  const name = (id: number, fallback: string): string => (id === currentUserId ? '你' : fallback);
  return [name(info.actorId, info.actorName), pokeVerb(info.action), name(info.userId, info.userName), info.suffix].filter(Boolean).join(' ');
}

/** 服务端业务错误里的 code（detail 是 { code, message } 时）。 */
export function apiErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError) || !isRecord(error.detail)) {
    return null;
  }
  const detail = isRecord(error.detail.detail) ? error.detail.detail : error.detail;
  return typeof detail.code === 'string' ? detail.code : null;
}

/** 发起戳一戳失败时给用户看的话。限频和禁言的 message 是服务端写好的中文，直接用。 */
export function describePokeError(error: unknown): string {
  const code = apiErrorCode(error);
  if ((code === 'poke_rate_limited' || code === 'poke_muted' || code === 'account_muted') && error instanceof Error && error.message) {
    return error.message;
  }
  if (code === 'invalid_poke_action') {
    return '这个动作已经不能用了，换一个试试';
  }
  const status = error instanceof ApiError ? error.status : 0;
  if (status === 429) {
    return '戳得太快了，等一会儿再试';
  }
  if (status === 400) {
    return '不能戳自己';
  }
  if (status === 404) {
    return '对方已经不在这个会话里了';
  }
  return '戳一戳失败，请稍后重试';
}
