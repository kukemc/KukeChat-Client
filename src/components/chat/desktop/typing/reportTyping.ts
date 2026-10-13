import { sendRealtimeFrame } from '@/realtime/client';
import { useKukeStore } from '@/store/kukeStore';
import { useModerationStore } from '@/store/moderationStore';
import { parseApiDate } from '@/utils/dateTime';

/** 对方收到一次显示约 5 秒，3 秒续一次正好不断档。 */
const REPORT_INTERVAL_MS = 3000;
/** 服务端 2 秒内的重复上报直接丢弃，比这更密发了也是白发。 */
const SERVER_DEDUPE_MS = 2000;

const lastReports = new Map<number, { at: number; wait: number }>();

function mayReport(): boolean {
  if (useKukeStore.getState().currentUser?.share_typing === false) {
    return false;
  }
  const mutedUntil = parseApiDate(useModerationStore.getState().mutedUntil);
  return !mutedUntil || mutedUntil.getTime() <= Date.now();
}

/** 输入框内容每次变化时调用。节流在这里做，调用方不用管频率。 */
export function reportTyping(conversationId: number, text: string): void {
  const now = Date.now();
  const last = lastReports.get(conversationId);
  if (!text.trim() || (last && now - last.at < last.wait) || !mayReport()) {
    return;
  }
  // 没连上时不记时间，连上后的下一次按键就能补报
  if (sendRealtimeFrame({ type: 'typing', conversation_id: conversationId })) {
    lastReports.set(conversationId, { at: now, wait: REPORT_INTERVAL_MS });
  }
}

/** 消息发出后调用：对方收到消息会立刻清掉提示，接着打下一条时不该再等满一个节流周期。 */
export function resetTyping(conversationId: number): void {
  const last = lastReports.get(conversationId);
  if (last) {
    last.wait = SERVER_DEDUPE_MS;
  }
}
