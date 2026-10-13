/**
 * 戳一戳的进程内广播。
 *
 * 聊天记录里的那行字是一条系统消息，走正常的 message.created；这条通道只管即时效果：
 * realtime 客户端收到 conversation.member.poked 就往这里丢，聊天面板订阅后让头像抖一下。
 * （移动端的旧面板还会用它弹一条临时提示。）
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
