import { useEffect } from 'react';
import { isRecord } from '@/api/normalizers';
import { Icon } from '@/components/ui/Icon';
import { toast } from '@/components/ui/toast';
import { subscribeRealtimeEvents } from '@/realtime/events';
import { useJury } from '../context';
import { Medal } from './Insignia';
import { pointKindLabel, signed } from './labels';

/**
 * 风纪值变动、获得成就时的轻提示（实时事件 jury.points.changed / jury.achievement.earned）。
 * 只在风纪页里出现，走统一的提示组件；缓存的刷新在 data/growth.ts 的 handleJuryGrowthEvent，这里只管提示。
 */
export function GrowthToasts(): null {
  const { nav, config } = useJury();
  const pointsOn = config.has('points');
  const achievementsOn = config.has('achievements');

  useEffect(() => {
    if (!pointsOn && !achievementsOn) {
      return undefined;
    }
    return subscribeRealtimeEvents((event) => {
      const data = isRecord(event.data) ? event.data : {};
      if (event.rawType === 'jury.points.changed' && pointsOn && typeof data.delta === 'number' && data.delta !== 0) {
        const delta = data.delta;
        const caseId = typeof data.case_id === 'number' ? data.case_id : null;
        const text = `${pointKindLabel(typeof data.kind === 'string' ? data.kind : '', typeof data.label === 'string' ? data.label : null)}${typeof data.total === 'number' ? ` · 现在共 ${data.total}` : ''}`;
        toast.show({
          // 连着变动时只留最后一条
          id: 'jury.points.changed',
          tone: delta < 0 ? 'warning' : 'success',
          message: `${signed(delta)} 风纪值`,
          // 文字优先用事件里的 label（和明细同源，后端新增 kind 时不用跟着改），没有再查本地的对照表
          // 事件里的 case_id 是委员侧的评审编号（点了去的是「我的评审」），不是公示栏的案件编号
          subtitle: `${text}${caseId !== null ? ` · 评审 #${caseId}` : ''}`,
          leading: <span className="kjr-toast-icon"><Icon name="star" className="h-4 w-4" /></span>,
          duration: 7000,
          actions: [{
            label: '看明细',
            onClick: () => {
              if (caseId !== null && config.has('case_detail')) {
                nav.goSection('mine', { caseId });
              } else {
                nav.goSection('mine', { tab: 'growth' });
              }
            }
          }]
        });
      }
      if (event.rawType === 'jury.achievement.earned' && achievementsOn && typeof data.key === 'string') {
        const key = data.key;
        toast.show({
          id: 'jury.achievement.earned',
          tone: 'success',
          message: '获得成就',
          subtitle: typeof data.label === 'string' ? `「${data.label}」` : undefined,
          leading: <Medal achievementKey={key} earned progress={1} size={34} />,
          duration: 7000,
          actions: [{ label: '看成就', onClick: () => nav.goSection('mine', { tab: 'growth' }) }]
        });
      }
    });
  }, [achievementsOn, config, nav, pointsOn]);

  return null;
}
