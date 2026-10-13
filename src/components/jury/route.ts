import { useCallback, useEffect, useMemo, useState } from 'react';
import { readPreference, writePreference } from '@/components/chat/desktop/runtime';
import { useKukeStore, type JuryRoute, type JurySection } from '@/store/kukeStore';
import { isJurySection } from './sections';

const LAST_SECTION_KEY = 'kukechat:jury-section';
// 本地存储不可用（宿主页面禁用）时，至少在这次会话里记住
let lastSection: JurySection | null = null;

function rememberedSection(): JurySection {
  const stored = lastSection ?? readPreference(LAST_SECTION_KEY);
  return isJurySection(stored) ? stored : 'overview';
}

export interface JuryNavigation {
  route: JuryRoute;
  /** 换板块（回到板块首页） */
  goSection: (section: JurySection, extra?: Omit<JuryRoute, 'section'>) => void;
  /** 在当前板块里打开 / 关闭一个案件，或换页签 */
  patch: (extra: Omit<JuryRoute, 'section'>) => void;
}

/**
 * 风纪页当前在哪：板块 + 板块内打开的案件 / 页签。
 * 记住上次所在的板块；别处通过 useKukeStore.getState().openJury({ section, caseId }) 直达时，这里接住并清掉。
 */
export function useJuryNavigation(): JuryNavigation {
  const pending = useKukeStore((state) => state.pendingJuryRoute);
  const clearPending = useKukeStore((state) => state.clearPendingJuryRoute);
  const [route, setRoute] = useState<JuryRoute>(() => pending ?? { section: rememberedSection() });

  useEffect(() => {
    if (pending) {
      setRoute(pending);
      clearPending();
    }
  }, [clearPending, pending]);

  useEffect(() => {
    lastSection = route.section;
    writePreference(LAST_SECTION_KEY, route.section);
  }, [route.section]);

  const goSection = useCallback((section: JurySection, extra?: Omit<JuryRoute, 'section'>) => setRoute({ section, ...extra }), []);
  const patch = useCallback((extra: Omit<JuryRoute, 'section'>) => setRoute((current) => ({ ...current, ...extra })), []);
  return useMemo(() => ({ route, goSection, patch }), [goSection, patch, route]);
}
