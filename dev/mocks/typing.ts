import { isRecord } from '@/api/normalizers';
import { emitRealtimeEvent, normalizeRealtimeType } from '@/realtime/events';
import { useKukeStore } from '@/store/kukeStore';
import { json, type MockHandler } from './types';

declare global {
  interface Window {
    /**
     * 预览页没有真的 WebSocket，下行事件从控制台手动派发：
     *   __kcEmit('conversation.typing', { conversation_id: 1, user_id: 2, name: '阿夸' })
     */
    __kcEmit?: (rawType: string, data: unknown) => void;
  }
}

window.__kcEmit = (rawType, data) => emitRealtimeEvent({ type: normalizeRealtimeType(rawType), rawType, data, receivedAt: new Date().toISOString() });

/** 正在输入 相关接口的假数据。 */
export const typingMock: MockHandler = ({ path, method, body }) => {
  // 「向他人显示我正在输入」开关：把改动合进当前用户原样返回
  if (path === '/users/me' && method === 'PATCH') {
    return json({ ...useKukeStore.getState().currentUser, ...(isRecord(body) ? body : {}) });
  }
  return undefined;
};
