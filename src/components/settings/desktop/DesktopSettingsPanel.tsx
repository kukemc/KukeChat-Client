import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon, type IconName } from '@/components/ui/Icon';
import { isDesktopUpdateSupported, useDesktopUpdate } from '@/native/desktopUpdate';
import { useKukeStore } from '@/store/kukeStore';
import type { User } from '@/types/api';
import { isTauriDesktopApp } from '@/utils/appMode';
import { AboutSection } from './AboutSection';
import { AccountSection } from './AccountSection';
import { AppearanceSection, GeneralSection, ReportsSection } from './PreferenceSections';
import { ProfileSection } from './ProfileSection';
import { SettingsPage } from './settingsUi';
import { PenaltyCenter } from '@/components/moderation/PenaltyCenter';

/** Tab ids are shared with the mobile panel and ChatDashboard ('account' = profile, 'ccw' = account & security). */
export type DesktopSettingsTab = 'account' | 'ccw' | 'appearance' | 'general' | 'reports' | 'penalties' | 'about' | 'support';

const NAV: Array<{ group: string; items: Array<{ tab: Exclude<DesktopSettingsTab, 'support'>; label: string; icon: IconName }> }> = [
  { group: '账号', items: [{ tab: 'account', label: '我的资料', icon: 'profile' }, { tab: 'ccw', label: '账号与安全', icon: 'shield' }] },
  { group: '偏好', items: [{ tab: 'appearance', label: '外观', icon: 'palette' }, { tab: 'general', label: '通用', icon: 'settings' }] },
  { group: '社区秩序', items: [{ tab: 'reports', label: '举报记录', icon: 'flag' }, { tab: 'penalties', label: '处罚与申诉', icon: 'shield' }] },
  { group: '其他', items: [{ tab: 'about', label: isTauriDesktopApp() ? '关于与更新' : '关于', icon: 'info' }] }
];

function useWidth(ref: React.RefObject<HTMLElement>): number {
  const [width, setWidth] = useState(1200);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

export function DesktopSettingsPanel({ user, initialTab = 'account', focusKey = 0, onLogout }: { user: User; initialTab?: DesktopSettingsTab; focusKey?: number; onLogout?: () => void }): JSX.Element {
  const normalize = (tab: DesktopSettingsTab): Exclude<DesktopSettingsTab, 'support'> => (tab === 'support' ? 'about' : tab);
  const [tab, setTab] = useState(normalize(initialTab));
  useEffect(() => { setTab(normalize(initialTab)); }, [initialTab, focusKey]);
  // 从别的页面直达某个页签（比如风纪页里的「处罚与申诉」）。写在上面那个 effect 之后，首次渲染时以它为准
  const pendingTab = useKukeStore((state) => state.pendingSettingsTab);
  const clearPendingTab = useKukeStore((state) => state.clearPendingSettingsTab);
  useEffect(() => {
    if (pendingTab) {
      setTab(pendingTab);
      clearPendingTab();
    }
  }, [clearPendingTab, pendingTab]);
  const rootRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const width = useWidth(rootRef);
  const navOnTop = width < 720;
  const contentWidth = navOnTop ? width : width - 220;
  const updatePending = useDesktopUpdate((state) => state.phase === 'available' || state.phase === 'ready');

  useEffect(() => { mainRef.current?.scrollTo({ top: 0 }); }, [tab]);

  const content = tab === 'account' ? <ProfileSection user={user} compact={contentWidth < 860} />
    : tab === 'ccw' ? <AccountSection user={user} onLogout={onLogout} />
    : tab === 'appearance' ? <AppearanceSection />
    : tab === 'general' ? <GeneralSection />
    : tab === 'reports' ? <ReportsSection />
    : tab === 'penalties' ? <SettingsPage title="处罚与申诉" description="你的违规记分、处罚记录，以及对处罚的申诉。"><PenaltyCenter /></SettingsPage>
    : <AboutSection />;

  return (
    <section ref={rootRef} className={`relative grid h-full min-h-0 overflow-hidden [background:var(--kc-chat)] [color:var(--kc-text)] ${navOnTop ? 'grid-rows-[auto_minmax(0,1fr)]' : 'grid-cols-[220px_minmax(0,1fr)]'}`}>
      <nav aria-label="设置分类" className={navOnTop ? 'flex gap-1 overflow-x-auto border-b px-3 py-2 [background:var(--kc-list)] [border-color:var(--kc-border)]' : 'flex min-h-0 flex-col overflow-y-auto border-r px-3 py-4 [background:var(--kc-list)] [border-color:var(--kc-border)]'}>
        {navOnTop ? null : (
          <div className="mb-4 flex items-center gap-2.5 px-2">
            <Avatar user={user} size="sm" />
            <div className="min-w-0"><p className="truncate text-sm font-semibold">设置</p><p className="truncate text-xs [color:var(--kc-muted)]">{getDisplayName(user)}</p></div>
          </div>
        )}
        {NAV.map((group) => (
          <div key={group.group} className={navOnTop ? 'contents' : 'mb-3'}>
            {navOnTop ? null : <p className="px-2.5 pb-1 text-[11px] font-semibold [color:var(--kc-muted)]">{group.group}</p>}
            {group.items.map((item) => {
              const active = tab === item.tab;
              const badge = item.tab === 'about' && updatePending && isDesktopUpdateSupported();
              return (
                <button key={item.tab} type="button" aria-current={active ? 'page' : undefined} onClick={() => setTab(item.tab)}
                  className={`flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition ${navOnTop ? '' : 'w-full'} ${active ? 'font-semibold [background:var(--kc-active)] [color:var(--kc-text)]' : '[color:var(--kc-muted)] hover:[background:var(--kc-hover)] hover:[color:var(--kc-text)]'}`}>
                  <Icon name={item.icon} className="h-4 w-4 shrink-0" />
                  <span className="whitespace-nowrap">{item.label}</span>
                  {badge ? <span className="ml-auto h-2 w-2 rounded-full bg-red-500" aria-label="有可用更新" /> : null}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <main ref={mainRef} className="scroll-soft min-h-0 overflow-y-auto px-5 py-6">
        <div key={tab}>{content}</div>
      </main>
    </section>
  );
}
