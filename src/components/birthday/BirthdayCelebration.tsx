import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useEvent } from '@/components/chat/desktop/runtime';
import { useGiftMotion } from '@/components/gifts/ui';
import { getDisplayName } from '@/components/ui/Avatar';
import { getDesktopPortalRoot, useEscapeLayer } from '@/components/ui/desktop/Modal';
import { registerNativeBackHandler } from '@/native/back';
import type { User } from '@/types/api';
import { chinaToday } from '@/utils/birthday';
import { BIRTHDAY_SCENE_MS, BirthdayScene } from './BirthdayScene';
import { markCelebrated, useMyBirthday } from './data';

// 这次运行里已经播过的（用户 id + 北京时间的日期）：告诉服务端「播过了」的请求万一没成功，重新拉到 celebrate_today 也不会再播第二遍
const played = new Set<string>();

function playKey(userId: number): string {
  const today = chinaToday(Date.now());
  return `${userId}:${today.year}-${today.month}-${today.day}`;
}

/** 本机也记一笔：同一天里刷新页面、重开应用，哪怕服务端没记上也不重复播。存不了（隐私模式之类）就算了，还有服务端那一道 */
function rememberLocally(key: string): void {
  try {
    window.localStorage.setItem('kukechat-birthday-played', key);
  } catch {
    // 忽略
  }
}

/** 预览页用：忘掉「今天播过了」，好再播一次。正式界面里没有地方调它。 */
export function forgetBirthdayPlayed(): void {
  played.clear();
  try {
    window.localStorage.removeItem('kukechat-birthday-played');
  } catch {
    // 忽略
  }
}

function playedLocally(key: string): boolean {
  try {
    return window.localStorage.getItem('kukechat-birthday-played') === key;
  } catch {
    return false;
  }
}

/**
 * 庆生：进入平台（应用打开 / 登录完成，主界面挂上来）时，如果 GET /users/me/birthday 说 celebrate_today（今天是我的生日、今年还没播过），
 * 自动播一段庆生动画 —— 蛋糕、彩带、「生日快乐，<昵称>」，三四秒，点一下（或者 Esc、系统返回键）可以跳过。
 * 播完（或者跳过）调 POST /users/me/birthday/celebrated，当天不再播。
 * 系统开了「减少动态效果」或者外观里开了「性能优先」时不放动画，改成一张静态的贺卡，点「收下祝福」关掉。
 * 挂在主界面上，整个应用一个。服务端没有生日功能（404）时什么都不做。
 */
export function BirthdayCelebration({ user }: { user: User }): JSX.Element | null {
  const queryClient = useQueryClient();
  const motion = useGiftMotion();
  const query = useMyBirthday();
  const due = query.data?.celebrate_today === true;
  const [showing, setShowing] = useState(false);
  // 打开的那一刻定下来是动画还是贺卡：播到一半切了设置不换画面
  const [still, setStill] = useState(false);

  useEffect(() => {
    if (!due || showing) {
      return;
    }
    const key = playKey(user.id);
    if (played.has(key) || playedLocally(key)) {
      // 这台设备今天播过了，只是服务端还不知道：补一次标记
      markCelebrated(queryClient);
      return;
    }
    played.add(key);
    rememberLocally(key);
    setStill(!motion);
    setShowing(true);
  }, [due, motion, queryClient, showing, user.id]);

  const close = useEvent(() => {
    if (!showing) {
      return;
    }
    setShowing(false);
    markCelebrated(queryClient);
  });

  // 动画到点自己收场；贺卡等人点
  useEffect(() => {
    if (!showing || still) {
      return undefined;
    }
    const timer = window.setTimeout(close, BIRTHDAY_SCENE_MS);
    return () => window.clearTimeout(timer);
  }, [close, showing, still]);

  useEscapeLayer(showing ? close : null);
  useEffect(() => {
    if (!showing) {
      return undefined;
    }
    return registerNativeBackHandler(() => {
      close();
      return true;
    }, 140);
  }, [close, showing]);

  if (!showing) {
    return null;
  }
  const name = getDisplayName(user, '你');
  return createPortal(
    <div className={still ? 'kbd-celebrate is-still' : 'kbd-celebrate'} role="dialog" aria-modal="true" aria-label={`生日快乐，${name}`} data-birthday="celebration" data-still={still || undefined} onClick={still ? undefined : close}>
      <BirthdayScene name={name} still={still} />
      {still
        ? <button type="button" className="kbd-celebrate-accept" data-action="birthday-accept" autoFocus onClick={close}>收下祝福</button>
        : <span className="kbd-celebrate-skip">点一下跳过</span>}
    </div>,
    getDesktopPortalRoot()
  );
}
