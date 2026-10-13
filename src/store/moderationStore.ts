import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import { ApiError } from '@/api/client';
import { getModerationStanding } from '@/api/moderation';
import { isRecord } from '@/api/normalizers';
import { parseApiDate } from '@/utils/dateTime';

/**
 * 当前账号的禁言状态。
 *
 * 来源有三处，谁新听谁的：登录后拉一次 /moderation/me、实时事件、以及发送被拒时服务端带回来的到期时间。
 * 到点后本地自己解锁，不用再问服务端。
 */
interface ModerationState {
  mutedUntil: string | null;
  muteReason: string | null;
  setMute: (mutedUntil: string | null, reason?: string | null) => void;
}

export const useModerationStore = create<ModerationState>((set) => ({
  mutedUntil: null,
  muteReason: null,
  setMute: (mutedUntil, reason) => set((state) => ({ mutedUntil, muteReason: mutedUntil ? reason ?? state.muteReason : null }))
}));

/** 发送类接口在禁言期间返回 403 account_muted。是的话顺手记下到期时间，并返回 true。 */
export function absorbMuteError(error: unknown): boolean {
  if (!(error instanceof ApiError) || !isRecord(error.detail)) {
    return false;
  }
  const detail = isRecord(error.detail.detail) ? error.detail.detail : error.detail;
  if (detail.code !== 'account_muted') {
    return false;
  }
  useModerationStore.getState().setMute(typeof detail.muted_until === 'string' ? detail.muted_until : null, typeof detail.reason === 'string' ? detail.reason : null);
  return true;
}

export function formatMuteEnd(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export interface MuteStatus {
  muted: boolean;
  until: Date | null;
  reason: string | null;
}

/** 订阅禁言状态。第一次使用时会去拉一次处罚状态；到期那一刻组件会自动重渲染解锁。 */
export function useMuteStatus(enabled = true): MuteStatus {
  const mutedUntil = useModerationStore((state) => state.mutedUntil);
  const muteReason = useModerationStore((state) => state.muteReason);
  const setMute = useModerationStore((state) => state.setMute);
  const [, tick] = useState(0);

  const standing = useQuery({ queryKey: ['moderation', 'me'], queryFn: () => getModerationStanding(), enabled, staleTime: 5 * 60_000, retry: false });
  useEffect(() => {
    if (standing.data) {
      setMute(standing.data.muted_until ?? null, standing.data.mute_reason ?? null);
    }
  }, [setMute, standing.data]);

  const until = parseApiDate(mutedUntil);
  const remaining = until ? until.getTime() - Date.now() : 0;
  useEffect(() => {
    if (remaining <= 0) {
      return;
    }
    // setTimeout 的延时上限约 24.8 天，超长禁言分段等
    const timer = window.setTimeout(() => tick((value) => value + 1), Math.min(remaining + 500, 2 ** 31 - 1));
    return () => window.clearTimeout(timer);
  }, [remaining]);

  const muted = remaining > 0;
  return { muted, until: muted ? until : null, reason: muted ? muteReason : null };
}
