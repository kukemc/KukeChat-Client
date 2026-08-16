/**
 * 戳一戳的进程内广播。
 *
 * 戳一戳既不落库也不进消息列表，走 react-query 的缓存体系反而绕远路，
 * 所以单独开一条极轻的订阅通道：realtime 客户端收到事件就往这里丢，
 * 聊天面板订阅后播动画、弹提示。
 */

export interface PokeEvent {
  conversationId: number;
  actorId: number;
  actorName: string;
  userId: number;
  userName: string;
}

type PokeListener = (event: PokeEvent) => void;

const listeners = new Set<PokeListener>();

export function subscribePoke(listener: PokeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitPoke(event: PokeEvent): void {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      // 一个订阅者出错不该拖累其他订阅者
    }
  });
}
