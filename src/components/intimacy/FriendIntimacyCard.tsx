import { cx } from '@/components/chat/desktop/runtime';
import { Icon } from '@/components/ui/Icon';
import { BadgeGlyph } from './BadgeGlyph';
import { openIntimacy, useFriendBond } from './data';

/**
 * 资料卡上的一行：我和这个好友的友谊等级、亲密度、徽章数，点开「我们的友谊」。
 * 不是好友（或者服务端没有这个功能）时什么都不画，所以资料卡里可以直接放，不用先判断。
 */
export function FriendIntimacyCard({ userId, className, onOpen }: { userId: number | null | undefined; className?: string; /** 打开之前先做的事（比如关掉资料卡浮层） */ onOpen?: () => void }): JSX.Element | null {
  const bond = useFriendBond(userId);
  if (!bond) {
    return null;
  }
  const sub = `亲密度 ${bond.intimacy.toLocaleString('zh-CN')} · ${bond.badge_count} 枚徽章 · 排第 ${bond.rank}`;
  return (
    <button
      type="button"
      className={cx('kit-row', className)}
      data-intimacy-level={bond.level}
      title="看看你们的友谊和好友成就"
      onClick={() => {
        onOpen?.();
        openIntimacy(bond.friend.id);
      }}
    >
      <span className="kit-row-badge">{bond.badge ? <BadgeGlyph icon={bond.badge.icon} tier={bond.badge.tier} size={28} /> : <Icon name="heart" className="h-4 w-4" />}</span>
      <span className="kit-row-main">
        <span className="kit-row-title">
          <b>{bond.level_name}</b><span className="kit-hero-lv">Lv.{bond.level}</span>{bond.new_badges > 0 ? <span className="kit-new">新</span> : null}
          {/* 今天涨了多少单独放在标题行右边：统计那一行窄的时候会截断，这个最想一眼看到 */}
          {bond.today_gained > 0 ? <span className="kit-row-today">今天 +{bond.today_gained}</span> : null}
        </span>
        <span className="kit-row-sub" title={sub}>{sub}</span>
      </span>
      <Icon name="chevron" className="kit-row-arrow h-3.5 w-3.5" />
    </button>
  );
}
