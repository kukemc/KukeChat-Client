import { useState, type CSSProperties } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import { Icon } from '@/components/ui/Icon';
import type { LevelTab } from '@/types/level';
import { useLevelRules } from '../data';
import { LevelBody } from '../LevelBody';

const TABS: Array<{ value: LevelTab; label: string }> = [{ value: 'me', label: '我的等级' }, { value: 'board', label: '排行榜' }];

/**
 * 账号等级的移动端界面：二级页面，从「我」的页面（设置首页的「我的等级」）、自己的等级图标、个人主页进来。
 * 内容和桌面端是同一个 LevelBody；外框沿用移动端页面的那一套（kc-qq-page），自己的样式在 level.css（.klv-m 下面），颜色取移动端的令牌。
 */
export function MobileLevelPage({ initialTab = 'me', onMobileBack, transitionStyle }: { initialTab?: LevelTab; onMobileBack?: () => void; transitionStyle?: CSSProperties }): JSX.Element {
  const [tab, setTab] = useState<LevelTab>(initialTab);
  // 排行榜里「我的位置」那一行的落脚处：在滚动区域外面，所以始终贴着页面底部
  const [pinnedSlot, setPinnedSlot] = useState<HTMLDivElement | null>(null);
  const query = useLevelRules();
  const rules = query.data;

  return (
    <section className="kc-qq-page kui klv-m flex h-full min-h-0 flex-col overflow-hidden" style={transitionStyle} aria-label="账号等级" data-level-page={tab}>
      <header className="kc-qq-home-header kc-qq-sticky-home-header mx-4 shrink-0">
        {onMobileBack ? <button type="button" onClick={onMobileBack} className="ksp-m-round" aria-label="返回" data-action="level-back"><Icon name="chevronLeft" className="h-5 w-5" /></button> : <span className="h-9 w-9" />}
        <div className="min-w-0 text-center"><h1 className="ksp-m-title">账号等级</h1><p className="ksp-m-subtitle">在 KukeChat 待了多久、有多活跃</p></div>
        <span className="h-9 w-9" />
      </header>
      {rules ? (
        <div className="klv-m-tabs" role="tablist" aria-label="等级页">
          {TABS.map((item) => <button key={item.value} type="button" role="tab" data-level-tab={item.value} aria-selected={tab === item.value} className={cx('klv-m-tab', tab === item.value && 'is-active')} onClick={() => setTab(item.value)}>{item.label}</button>)}
        </div>
      ) : null}
      <div className="kc-qq-scroll kc-mobile-page-transition scroll-soft klv-m-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(var(--kc-native-safe-bottom,env(safe-area-inset-bottom))+24px)]">
        {rules ? <LevelBody rules={rules} tab={tab} layout="mobile" onTab={setTab} pinnedSlot={pinnedSlot} />
          : rules === null ? (
            <div className="ksp-m-state" data-level="unavailable">
              <span className="ksp-m-state-icon"><Icon name="clock" className="h-6 w-6" /></span>
              <p className="ksp-m-state-title">账号等级即将开放</p>
              <p className="ksp-m-state-text">当前连接的服务端还没有开放账号等级，开放后这里会自动出现。</p>
            </div>
          ) : query.error ? (
            <div className="ksp-m-state" role="alert" data-level="error">
              <span className="ksp-m-state-icon"><Icon name="alert" className="h-6 w-6" /></span>
              <p className="ksp-m-state-title">等级规则没有加载出来</p>
              <p className="ksp-m-state-text">{query.error.message}</p>
              <button type="button" className="ksp-m-btn" onClick={() => void query.refetch()}>重试</button>
            </div>
          ) : (
            <div className="klv-grid" role="status" aria-label="正在加载等级"><span className="kcr-bone klv-bone" /><span className="kcr-bone klv-bone" /></div>
          )}
      </div>
      <div ref={setPinnedSlot} className="klv-m-foot" />
    </section>
  );
}
