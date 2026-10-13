import type { IconName } from '@/components/ui/Icon';
import type { JurySection } from '@/store/kukeStore';
import type { JuryCapability } from '@/types/jury';
import type { JuryIdentity } from './identity';

/**
 * 风纪页的板块登记表。二级导航、可见性、「即将开放」都从这里读。
 *
 * 加一个板块：1) kukeStore.ts 的 JurySection 里加 id；2) 在下面加一行；3) 在 JuryPage.tsx 的 SECTION_VIEWS 里登记组件。
 * 把一个「即将开放」的板块做出来：写好组件后在 SECTION_VIEWS 里登记，并确认这里的 capability 和后端下发的名字一致。
 */
export interface JurySectionDef {
  id: JurySection;
  label: string;
  icon: IconName;
  group: 'home' | 'review' | 'public' | 'community';
  /** 属于第几期。只影响占位页上的说明 */
  phase: 1 | 2 | 3;
  /**
   * 这个板块依赖的后端能力（GET /jury/config 的 capabilities）。后端没有这项能力时显示「即将开放」。
   * 不填表示不依赖新能力（用的是一直就有的接口，或板块自己处理降级）。
   */
  capability?: JuryCapability;
  visible: (identity: JuryIdentity) => boolean;
}

const everyone = (): boolean => true;

export const JURY_GROUPS: Array<{ id: JurySectionDef['group']; label: string | null }> = [
  { id: 'home', label: null },
  { id: 'review', label: '评审' },
  { id: 'public', label: '公开' },
  { id: 'community', label: '社区' }
];

export const JURY_SECTIONS: JurySectionDef[] = [
  { id: 'overview', label: '总览', icon: 'poll', group: 'home', phase: 1, visible: everyone },
  { id: 'desk', label: '评审台', icon: 'scale', group: 'review', phase: 1, visible: (identity) => identity.isJuror },
  // 二、三期板块的 capability 名字取自 docs/jury-v2.md 第 2、3 节开头的列表
  { id: 'practice', label: '练习场', icon: 'sparkles', group: 'review', phase: 2, capability: 'practice', visible: everyone },
  { id: 'mine', label: '我的评审', icon: 'clock', group: 'review', phase: 1, visible: (identity) => identity.everJuror },
  { id: 'senior', label: '资深工作台', icon: 'shieldCheck', group: 'review', phase: 3, capability: 'panel', visible: (identity) => identity.isSenior },
  { id: 'bulletin', label: '公示栏', icon: 'list', group: 'public', phase: 1, capability: 'public_cases', visible: everyone },
  { id: 'handbook', label: '规则手册', icon: 'bookmark', group: 'public', phase: 1, visible: everyone },
  { id: 'ranking', label: '排行榜', icon: 'star', group: 'community', phase: 2, capability: 'leaderboard', visible: everyone },
  { id: 'forum', label: '议事厅', icon: 'announcement', group: 'community', phase: 3, capability: 'hall', visible: everyone }
];

export function getJurySection(id: JurySection): JurySectionDef {
  return JURY_SECTIONS.find((section) => section.id === id) ?? JURY_SECTIONS[0];
}

export function isJurySection(value: unknown): value is JurySection {
  return typeof value === 'string' && JURY_SECTIONS.some((section) => section.id === value);
}
