import { useEffect, useRef, useState } from 'react';
import { isRecord } from '@/api/normalizers';
import { cx } from '@/components/chat/desktop/runtime';
import { Icon } from '@/components/ui/Icon';
import { subscribeRealtimeEvents } from '@/realtime/events';
import { useJury } from '../context';
import { Medal } from './Insignia';
import { pointKindLabel, signed } from './labels';

interface GrowthToast {
  id: number;
  kind: 'points' | 'achievement';
  title: string;
  text: string;
  caseId: number | null;
  achievementKey: string | null;
  loss: boolean;
}

const LIFETIME_MS = 7000;
const MAX_TOASTS = 3;

/**
 * 风纪值变动、获得成就时的轻提示（实时事件 jury.points.changed / jury.achievement.earned）。
 * 只在风纪页里出现，角落里停几秒自己消失；缓存的刷新在 data/growth.ts 的 handleJuryGrowthEvent 里，这里只管提示。
 */
export function GrowthToasts(): JSX.Element | null {
  const { nav, config } = useJury();
  const [toasts, setToasts] = useState<GrowthToast[]>([]);
  const nextId = useRef(1);
  const pointsOn = config.has('points');
  const achievementsOn = config.has('achievements');

  useEffect(() => {
    if (!pointsOn && !achievementsOn) {
      return undefined;
    }
    const timers = new Set<number>();
    const push = (toast: Omit<GrowthToast, 'id'>): void => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-(MAX_TOASTS - 1)), { ...toast, id }]);
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        setToasts((current) => current.filter((item) => item.id !== id));
      }, LIFETIME_MS);
      timers.add(timer);
    };
    const unsubscribe = subscribeRealtimeEvents((event) => {
      const data = isRecord(event.data) ? event.data : {};
      if (event.rawType === 'jury.points.changed' && pointsOn && typeof data.delta === 'number' && data.delta !== 0) {
        push({
          kind: 'points',
          title: `${signed(data.delta)} 风纪值`,
          // 文字优先用事件里的 label（和明细同源，后端新增 kind 时不用跟着改），没有再查本地的对照表
          text: `${pointKindLabel(typeof data.kind === 'string' ? data.kind : '', typeof data.label === 'string' ? data.label : null)}${typeof data.total === 'number' ? ` · 现在共 ${data.total}` : ''}`,
          caseId: typeof data.case_id === 'number' ? data.case_id : null,
          achievementKey: null,
          loss: data.delta < 0
        });
      }
      if (event.rawType === 'jury.achievement.earned' && achievementsOn && typeof data.key === 'string') {
        push({ kind: 'achievement', title: '获得成就', text: typeof data.label === 'string' ? `「${data.label}」` : '', caseId: null, achievementKey: data.key, loss: false });
      }
    });
    return () => {
      unsubscribe();
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [achievementsOn, pointsOn]);

  if (toasts.length === 0) {
    return null;
  }
  const dismiss = (id: number): void => setToasts((current) => current.filter((item) => item.id !== id));
  return (
    <div className="kjr-toasts" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={cx('kjr-toast', `is-${toast.kind}`, toast.loss && 'is-loss')} role="status" data-toast={toast.kind}>
          {toast.achievementKey ? <Medal achievementKey={toast.achievementKey} earned progress={1} size={34} /> : <span className="kjr-toast-icon"><Icon name="star" className="h-4 w-4" /></span>}
          <button type="button" className="kjr-toast-main" onClick={() => {
            dismiss(toast.id);
            if (toast.caseId !== null && config.has('case_detail')) {
              nav.goSection('mine', { caseId: toast.caseId });
            } else {
              nav.goSection('mine', { tab: 'growth' });
            }
          }}>
            <b>{toast.title}</b>
            {/* 事件里的 case_id 是委员侧的评审编号（点了去的是「我的评审」），不是公示栏的案件编号 */}
            <span>{toast.text}{toast.caseId !== null ? ` · 评审 #${toast.caseId}` : ''}</span>
          </button>
          <button type="button" className="kui-icon-btn" aria-label="关闭提示" onClick={() => dismiss(toast.id)}><Icon name="close" className="h-3.5 w-3.5" /></button>
        </div>
      ))}
    </div>
  );
}
