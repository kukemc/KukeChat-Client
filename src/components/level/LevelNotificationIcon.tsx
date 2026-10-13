import { readAccountLevel } from '@/api/levels';
import { useLevelStore } from '@/store/levelStore';
import type { UnifiedNotification } from '@/types/api';
import { LevelGlyph } from './LevelGlyph';
import { milestoneOf, splitLevel } from './levelMath';

/** 通知中心里的升级通知（docs/account-level.md 3.6）：type 是 account_level，payload 是 { level, icons }。 */
export function isLevelNotification(notification: Pick<UnifiedNotification, 'type'>): boolean {
  return notification.type === 'account_level';
}

/**
 * 升级通知左边的图标：一块暖色的圆牌，中间是这次换出来的那个图标（通知只在升到月亮的整数倍时才写，所以通常是月亮、太阳或皇冠）。
 * 这类通知没有触发人，也不属于哪个群，放头像或群头像都不对。
 */
export function LevelNotificationIcon({ notification, className }: { notification: Pick<UnifiedNotification, 'payload'>; className?: string }): JSX.Element {
  const rules = useLevelStore((state) => state.icons);
  const level = readAccountLevel(notification.payload?.level);
  const kind = milestoneOf(level, rules)?.key ?? splitLevel(level, rules)[0]?.key ?? 'star';
  return <span className={`klv-notice-icon${className ? ` ${className}` : ''}`} data-level-notice={level || undefined} aria-hidden="true"><LevelGlyph kind={kind} /></span>;
}
