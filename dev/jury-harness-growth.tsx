/**
 * 风纪预览页 · 二期的控制条和地址参数（场景的取值见 jury-mock-growth.ts 的 GrowthScenario）。
 *
 *   ?phase2=on|off   exam=ready|unavailable|active|passed|failed|exhausted   examRequired=no|yes   autoAppoint=off|on
 *   practice=questions|few|round|limit|empty|forbidden|error   standing=ok|warn|warn_old|cooldown|muted|banned   recuse=left|none
 *   progress=early|near|ready|risk   achievements=some|none|all   board=many|few|empty|outside   badge=hidden|visible
 *   explanation=yes|no   daily=trend|zero|none   reject=none|invalid_category|settings_not_juror|exam_not_found|exam_submitted|exam_closed_old
 *   examLeft=<秒>（进行中的考试只剩这么多秒）   card=1（资料卡预览）
 *
 * 脚本测试用 window.__jury2：
 *   growth            场景对象，改完调 __jury.queryClient.resetQueries()
 *   emit(type, data)  模拟一条实时事件（jury.points.changed / jury.achievement.earned）：假接口的数字、缓存、界面提示一起走
 *   examLeft(seconds) 把考试时钟拨到「进行中的这一场只剩 seconds 秒」；shiftExamClock(ms) 直接拨
 *   examKey()         进行中这一场每道题的标准结论
 */
import { useState, type CSSProperties } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { handleJuryGrowthEvent } from '@/components/jury/data/growth';
import { examNow, shiftExamClock } from '@/components/jury/exam/clock';
import { JuryBadge } from '@/components/jury/growth/JuryBadge';
import { UserCardDesktop } from '@/components/ui/desktop/UserCardDesktop';
import { emitRealtimeEvent } from '@/realtime/events';
import type { User } from '@/types/api';
import type { JuryExamState } from '@/types/juryGrowth';
import { scenario } from './jury-mock';
import { applyGrowthEvent, examAnswerKey, GROWTH_LABELS, GROWTH_OPTIONS, growthPoints, growthScenario, latestPointsLabel, type GrowthScenario } from './jury-mock-growth';

type Bag = Record<string, string>;

let client: QueryClient | null = null;

function emit(rawType: string, data: Record<string, unknown>): void {
  applyGrowthEvent(rawType, data);
  const payload = rawType === 'jury.points.changed' ? { ...data, total: growthPoints(), label: latestPointsLabel() } : data;
  if (client) {
    handleJuryGrowthEvent(client, rawType, payload);
  }
  emitRealtimeEvent({ type: 'unknown', rawType, data: payload, receivedAt: new Date().toISOString() });
}

/** 把考试时钟拨到进行中的这一场只剩 seconds 秒。没有进行中的考试时什么都不做。 */
function examLeft(seconds: number): boolean {
  const active = client?.getQueryData<JuryExamState>(['jury', 'exam'])?.active;
  if (!active) {
    return false;
  }
  shiftExamClock(Date.parse(active.expires_at) - seconds * 1000 - examNow());
  return true;
}

export function readGrowthParams(params: URLSearchParams, queryClient: QueryClient): void {
  client = queryClient;
  for (const [key, values] of Object.entries(GROWTH_OPTIONS) as Array<[keyof GrowthScenario, string[]]>) {
    const value = params.get(key);
    if (value && values.includes(value)) {
      (growthScenario as unknown as Bag)[key] = value;
    }
  }
  // ?examLeft=<秒>：等进行中的考试加载出来之后，把时钟拨到只剩这么多秒（截图用）
  const left = Number(params.get('examLeft'));
  if (params.get('examLeft') && Number.isFinite(left)) {
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (examLeft(left) || tries > 40) {
        window.clearInterval(timer);
      }
    }, 300);
  }
  (window as unknown as { __jury2: unknown }).__jury2 = { growth: growthScenario, emit, examLeft, shiftExamClock, examNow, examKey: examAnswerKey, points: growthPoints };
}

/** 资料卡是聊天里的浮层，风纪预览页里没有聊天：这里直接渲染真实的资料卡组件，看公开身份后的徽章。 */
function CardProbe({ onClose }: { onClose: () => void }): JSX.Element {
  const tier = scenario.tier === 'none' ? 'trainee' : scenario.tier;
  const user = { id: 1, username: 'kuke', nickname: '酷可mc', bio: '做点小游戏', profile_tagline: '像素画爱好者', jury_badge: growthScenario.badge === 'visible' ? tier : null } as User;
  return (
    <div data-harness="card-probe" data-theme="light" data-layout="desktop" style={{ position: 'fixed', zIndex: 50, right: 16, top: 96, width: 380, height: 420, border: '1px solid #9aa1b1', borderRadius: 8, background: 'var(--kc-chat, #f5f6f9)', overflow: 'hidden' }}>
      <UserCardDesktop user={user} anchor={{ left: 190, top: 60 }} onClose={onClose} />
      <p style={{ position: 'absolute', left: 12, bottom: 10, display: 'flex', alignItems: 'center', gap: 6, font: '12px sans-serif', color: '#676d7c' }}>
        昵称旁：<JuryBadge tier="trainee" /><JuryBadge tier="regular" /><JuryBadge tier="senior" />　成员栏：<JuryBadge tier="regular" variant="icon" /><JuryBadge tier="senior" variant="icon" />
      </p>
    </div>
  );
}

export function GrowthControls({ onChange, initialCard = false }: { onChange: () => void; initialCard?: boolean }): JSX.Element {
  const [card, setCard] = useState(initialCard);
  const state = growthScenario as unknown as Bag;
  const label: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, font: '12px sans-serif', color: '#12141a' };
  const button: CSSProperties = { padding: '2px 8px', border: '1px solid #9aa1b1', borderRadius: 6, background: '#fff', color: '#12141a', font: '12px sans-serif', cursor: 'pointer' };
  return (
    <>
      {(Object.entries(GROWTH_OPTIONS) as Array<[string, string[]]>).map(([key, values]) => (
        <label key={key} style={label}>{GROWTH_LABELS[key as keyof GrowthScenario]}
          <select data-harness={key} value={state[key]} style={{ font: '12px sans-serif' }} onChange={(event) => {
            state[key] = event.target.value;
            onChange();
          }}>
            {values.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      ))}
      <button type="button" style={button} data-harness="emit-points" onClick={() => emit('jury.points.changed', { delta: 10, kind: 'vote_agreed', case_id: 1287 })}>模拟：定案 +10</button>
      <button type="button" style={button} data-harness="emit-overturn" onClick={() => emit('jury.points.changed', { delta: -7, kind: 'overturn_adjust', case_id: 1254 })}>模拟：改判 −7</button>
      <button type="button" style={button} data-harness="emit-achievement" onClick={() => emit('jury.achievement.earned', { key: 'votes_100', label: '百案' })}>模拟：获得成就</button>
      <button type="button" style={button} data-harness="exam-5m" onClick={() => examLeft(295)}>考试剩 4:55</button>
      <button type="button" style={button} data-harness="exam-1m" onClick={() => examLeft(55)}>考试剩 0:55</button>
      <button type="button" style={button} data-harness="exam-auto" onClick={() => examLeft(20)}>考试剩 0:20</button>
      <button type="button" style={button} data-harness="card" onClick={() => setCard((value) => !value)}>资料卡 / 徽章</button>
      {card ? <CardProbe onClose={() => setCard(false)} /> : null}
    </>
  );
}
