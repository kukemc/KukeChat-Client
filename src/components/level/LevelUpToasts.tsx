import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { normalizeLevelUpEvent } from '@/api/levels';
import { cx } from '@/components/chat/desktop/runtime';
import { Icon } from '@/components/ui/Icon';
import { getDesktopPortalRoot } from '@/components/ui/desktop/Modal';
import { toast } from '@/components/ui/toast';
import { subscribeRealtimeEvents } from '@/realtime/events';
import { useKukeStore } from '@/store/kukeStore';
import { useLevelStore } from '@/store/levelStore';
import { useThemeStore } from '@/theme/themeStore';
import { formatDays } from './labels';
import { LevelGlyph } from './LevelGlyph';
import { LevelIcons } from './LevelIcons';
import { milestoneOf, type LevelPart } from './levelMath';

interface Celebration {
  id: number;
  level: number;
  activeDays: number | null;
  /** 这次升级正好换出来的那种图标（月亮 / 太阳 / 皇冠） */
  milestone: LevelPart;
}

const GRAND_LIFETIME_MS = 10_000;
/** 大图标四周的几粒碎光：角度（度）、离中心的距离（像素）、大小、出场的延迟（毫秒） */
const SPARKS: ReadonlyArray<readonly [number, number, number, number]> = [[-62, 62, 9, 80], [-18, 74, 6, 260], [28, 66, 10, 140], [74, 70, 6, 380], [128, 64, 8, 200], [172, 72, 6, 320], [-118, 70, 7, 440], [-152, 60, 9, 20]];

/**
 * 升级提示（实时事件 account.level.up，只发给本人）。挂在主界面上，停在哪个页面都会出现。
 *
 *   · 平常的一级（只是多了一颗星）：走统一的提示组件 —— 「升到 Lv.24」+ 图标串走 leading，几秒后自己收起。
 *   · 正好换出一个月亮 / 太阳 / 皇冠：这是一次庆祝，不是一条提示。放大摆出来、后面一圈慢慢转的光、四周几粒碎光，
 *     停得也久一点。所以它留在这里自己渲染（和礼物 tier 3 动效、庆生动画同类）。
 *
 * 不抢焦点、不挡操作（只有卡片本身接鼠标），点卡片进等级页。系统设了「减少动态效果」或开了性能优先时，光和碎光都不动。
 * 缓存的刷新（各处的图标跟着变）在 data.ts 的 handleLevelEvent，这里只管提示。
 */
export function LevelUpToasts(): JSX.Element | null {
  const isMobile = useKukeStore((state) => state.layoutMode === 'mobile');
  const openLevel = useKukeStore((state) => state.openLevel);
  const still = useThemeStore((state) => state.performance);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const nextId = useRef(1);

  useEffect(() => subscribeRealtimeEvents((event) => {
    if (event.rawType !== 'account.level.up') {
      return;
    }
    const data = normalizeLevelUpEvent(event.data);
    const store = useLevelStore.getState();
    if (!data || store.available === false) {
      return;
    }
    const milestone = milestoneOf(data.level, store.icons);
    const activeDays = data.active_days;
    if (milestone) {
      // 连着升了几级（后台补了活跃天）：只留最后一次
      setCelebration({ id: nextId.current++, level: data.level, activeDays, milestone });
      return;
    }
    toast.show({
      // 连着升几级时只留最后一条，不刷屏
      id: 'account.level.up',
      tone: 'success',
      message: `升到 Lv.${data.level}`,
      subtitle: activeDays !== null ? `累计活跃 ${formatDays(activeDays)} 天` : undefined,
      leading: <LevelIcons level={data.level} variant="full" size={20} plain />,
      duration: 6500,
      actions: [{ label: '看我的等级', onClick: () => openLevel('me') }]
    });
  }), [openLevel]);

  useEffect(() => {
    if (!celebration) {
      return undefined;
    }
    const timer = window.setTimeout(() => setCelebration((current) => (current?.id === celebration.id ? null : current)), GRAND_LIFETIME_MS);
    return () => window.clearTimeout(timer);
  }, [celebration]);

  if (!celebration) {
    return null;
  }
  const { milestone } = celebration;
  const close = (): void => setCelebration(null);
  const node = (
    <div className={cx('kui klv-up-layer', isMobile && 'is-mobile')} aria-live="polite">
      <div key={celebration.id} className={cx('klv-up is-grand', still && 'is-still')} role="status" data-level-up={celebration.level} data-level-up-grand={milestone.key}>
        <button type="button" className="klv-up-main" data-action="level-up-open" onClick={() => {
          close();
          openLevel('me');
        }}>
          <span className={`klv-up-stage klv-up-stage--${milestone.key}`} aria-hidden="true">
            <i className="klv-up-rays" />
            <i className="klv-up-halo" />
            {SPARKS.map(([angle, distance, size, delay], index) => <i key={index} className="klv-up-spark" style={{ '--klv-a': `${angle}deg`, '--klv-d': `${distance}px`, '--klv-z': `${size}px`, '--klv-t': `${delay}ms` } as React.CSSProperties} />)}
            <LevelGlyph kind={milestone.key} className="klv-up-big" />
          </span>
          <span className="klv-up-text">
            <span className="klv-up-kicker">{milestone.count === 1 ? `点亮了第一个${milestone.label}` : `又多了一个${milestone.label}`}</span>
            <b className="klv-up-level">Lv.{celebration.level}</b>
            <LevelIcons level={celebration.level} variant="full" size={18} plain />
            <span className="klv-up-sub">{celebration.activeDays !== null ? `累计活跃 ${formatDays(celebration.activeDays)} 天 · ` : ''}点这里看我的等级</span>
          </span>
        </button>
        <button type="button" className="klv-up-close" aria-label="关闭提示" onClick={close}><Icon name="close" className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
  // 移动布局下各个二级页面是挂到窗口根上的全屏层，提示也得挂过去才不会被它们盖住
  return isMobile ? createPortal(node, getDesktopPortalRoot()) : node;
}
