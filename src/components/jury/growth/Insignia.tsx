import type { ReactNode } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import type { JuryTier } from '@/types/jury';

// 层级徽记和成就徽章。全部是单色线稿，颜色取主题令牌：这是一个治理系统，要的是「徽记」的克制，不是游戏里的贴纸。

const SHIELD = 'M12 2.6 19.6 5.4v6.3c0 4.7-3.2 8.2-7.6 9.7-4.4-1.5-7.6-5-7.6-9.7V5.4Z';

/** 一道向上的折线（军衔式的 V 形纹），y 是尖端的位置 */
function chevron(y: number, half = 3.6): string {
  return `M${12 - half} ${y + 2.4} 12 ${y} ${12 + half} ${y + 2.4}`;
}

const TIER_MARKS: Record<JuryTier, number[]> = { trainee: [11], regular: [9.2, 12.8], senior: [7.6, 11, 14.4] };

/** 层级徽记：盾形里一、二、三道折线，对应见习、正式、资深。 */
export function TierInsignia({ tier, size = 28, className }: { tier: JuryTier; size?: number; className?: string }): JSX.Element {
  return (
    <svg className={cx('kjr-insignia', `is-${tier}`, className)} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path className="kjr-insignia-plate" d={SHIELD} />
      {(TIER_MARKS[tier] ?? TIER_MARKS.trainee).map((y) => <path key={y} className="kjr-insignia-mark" d={chevron(y)} />)}
    </svg>
  );
}

type Plate = 'round' | 'hex' | 'shield';

interface MedalDesign {
  plate: Plate;
  glyph: ReactNode;
}

function numeral(value: string, unit: string): ReactNode {
  return (
    <>
      <text className="kjr-medal-num" x="12" y={value.length > 2 ? 13.6 : 14} textAnchor="middle" fontSize={value.length > 2 ? 7.4 : value.length > 1 ? 9.4 : 11}>{value}</text>
      <text className="kjr-medal-unit" x="12" y="18.6" textAnchor="middle" fontSize="3.6">{unit}</text>
    </>
  );
}

/** 每个成就的图形。里程碑是圆牌上的数字，能力类是六边牌，层级是盾牌。认不出的成就（后端新加的）用通用的星形。 */
const MEDALS: Record<string, MedalDesign> = {
  first_vote: { plate: 'round', glyph: <path d="M12 6v11.5M9 17.5h6M6.6 8.4h10.8M6.6 8.4 4.6 13h4ZM17.4 8.4l-2 4.6h4Z" /> },
  votes_10: { plate: 'round', glyph: numeral('10', '案') },
  votes_50: { plate: 'round', glyph: numeral('50', '案') },
  votes_100: { plate: 'round', glyph: numeral('100', '案') },
  streak_7: { plate: 'round', glyph: numeral('7', '天') },
  streak_30: { plate: 'round', glyph: numeral('30', '天') },
  sharp_eye: { plate: 'hex', glyph: <><path d="M5 12c2-3.2 4.3-4.8 7-4.8s5 1.6 7 4.8c-2 3.2-4.3 4.8-7 4.8S7 15.2 5 12Z" /><circle cx="12" cy="12" r="2.1" /></> },
  quality_10: { plate: 'hex', glyph: <><circle cx="12" cy="12" r="5.6" /><circle cx="12" cy="12" r="2.6" /><path d="M12 4.6v2M12 17.4v2M4.6 12h2M17.4 12h2" /></> },
  liked_10: { plate: 'hex', glyph: <path d="M6.4 7.6h11.2v7.2H12l-3 2.4v-2.4H6.4ZM9.2 10.4h5.6M9.2 12.6h3.4" /> },
  exam_first_try: { plate: 'hex', glyph: <path d="M8 5.6h8v12.8H8ZM10.2 8.6h3.6M10.2 11h3.6M10 14.6l1.4 1.4 2.6-3" /> },
  tier_regular: { plate: 'shield', glyph: <path d={`${chevron(9.4, 3.4)}${chevron(13, 3.4)}`} /> },
  tier_senior: { plate: 'shield', glyph: <path d={`${chevron(7.8, 3.4)}${chevron(11.2, 3.4)}${chevron(14.6, 3.4)}`} /> }
};

const FALLBACK: MedalDesign = { plate: 'round', glyph: <path d="m12 6.4 1.7 3.5 3.8.5-2.8 2.7.7 3.8-3.4-1.8-3.4 1.8.7-3.8-2.8-2.7 3.8-.5Z" /> };

const PLATES: Record<Plate, ReactNode> = {
  round: <circle cx="12" cy="12" r="8.6" />,
  hex: <path d="M12 3.2 19.6 7.6v8.8L12 20.8 4.4 16.4V7.6Z" />,
  shield: <path d="M12 3 19.2 5.7v6c0 4.300-2.900 7.6-7.2 9.100-4.300-1.5-7.2-4.8-7.2-9.100v-6Z" />
};

/**
 * 成就徽章：外圈是进度（没拿到时走到哪儿了；拿到后是一整圈），里面是一块牌和它的图形。
 * 拿到的是强调色的实线，没拿到的是灰色的线稿 —— 对比靠线的轻重，不靠花哨的颜色。
 */
export function Medal({ achievementKey, earned, progress, size = 60 }: { achievementKey: string; earned: boolean; /** 0–1 */ progress: number; size?: number }): JSX.Element {
  const design = MEDALS[achievementKey] ?? FALLBACK;
  const radius = 11.2;
  const length = 2 * Math.PI * radius;
  const ratio = earned ? 1 : Math.min(1, Math.max(0, progress));
  return (
    <svg className={cx('kjr-medal', earned ? 'is-earned' : 'is-locked')} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle className="kjr-medal-track" cx="12" cy="12" r={radius} />
      {ratio > 0 ? <circle className="kjr-medal-arc" cx="12" cy="12" r={radius} strokeDasharray={`${ratio * length} ${length}`} transform="rotate(-90 12 12)" /> : null}
      <g className="kjr-medal-plate">{PLATES[design.plate]}</g>
      <g className="kjr-medal-glyph">{design.glyph}</g>
    </svg>
  );
}
