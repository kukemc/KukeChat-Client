import { useEffect, useState } from 'react';
import { parseApiDate } from '@/utils/dateTime';

/**
 * 考试用的时钟。倒计时不直接用本机时间：
 *   · 服务端在 GET /jury/exam 和 POST /jury/exam/start 里给了 server_time，用它算出本机时钟差了多少；
 *   · 预览页和测试用 shiftExamClock 把时间往后拨，不用真的等 60 分钟。
 */
let serverOffset = 0;
let testOffset = 0;
const listeners = new Set<() => void>();

export function examNow(): number {
  return Date.now() + serverOffset + testOffset;
}

/** 用服务端时间校正。没给或解析不了就保持原样（退回本机时间）。 */
export function syncExamClock(serverTime: string | null | undefined): void {
  // parseApiDate：不带时区的服务端时间按 UTC 算，直接 Date.parse 会按本地时间解析，差 8 小时
  const time = parseApiDate(serverTime)?.getTime() ?? NaN;
  if (Number.isFinite(time)) {
    serverOffset = time - Date.now();
  }
}

/**
 * 只给预览页和测试用：把考试时钟往后拨 ms 毫秒（负数往回拨）。
 * silent 为 true 时不通知正在计时的界面 —— 用来模拟「页面在后台、定时器被浏览器压着没走」的那段时间。
 */
export function shiftExamClock(ms: number, silent = false): void {
  testOffset += ms;
  if (!silent) {
    listeners.forEach((listener) => listener());
  }
}

/**
 * 每秒走一下的考试时间。active 为 false 时不计时。
 * 页面切到后台后浏览器会把定时器压到很慢（隐藏超过 5 分钟后每分钟才走一次），所以页面可见性一变就立刻重算一次，
 * 回到前台时看到的剩余时间不会是几十秒之前的旧数。
 */
export function useExamNow(active: boolean): number {
  const [now, setNow] = useState(examNow);
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const tick = (): void => setNow(examNow());
    tick();
    const timer = window.setInterval(tick, 1000);
    listeners.add(tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      listeners.delete(tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [active]);
  return now;
}
