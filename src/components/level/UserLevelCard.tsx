import { cx } from '@/components/chat/desktop/runtime';
import { Icon } from '@/components/ui/Icon';
import { useKukeStore } from '@/store/kukeStore';
import type { User } from '@/types/api';
import { isLevelUserMissing, useLevelAvailable, useUserLevel } from './data';
import { formatDays, formatRank } from './labels';
import { LevelIcons, levelOfUser } from './LevelIcons';

/**
 * 某个人的等级卡：等级图标、等级数字、累计活跃天、连续天数、全站名次、注册天数（GET /users/{id}/level）。
 * 放在资料卡和个人主页上；是自己的时候整块可点，进等级页。
 *
 *   variant="row"    资料卡里的一行（桌面资料卡的「等级」那一行、手机资料卡里的一条）
 *   variant="block"  个人主页上的一块，数字排成一排
 *
 * 服务端没有账号等级、对方是机器人、对方不存在（404 user_not_found）时什么都不画。
 * 明细到之前先用用户对象上的 account_level 把图标画出来，卡片不会先空着再跳一下。
 */
export function UserLevelCard({ user, variant = 'row', className, onNavigate, frame }: { user: User | null | undefined; variant?: 'row' | 'block'; className?: string; /** 跳去等级页之前要做的事（关掉资料卡） */ onNavigate?: () => void; /** 卡片外面要套的一层（带标题的区块）：没有等级卡可画时这一层也不出现 */ frame?: (card: JSX.Element) => JSX.Element }): JSX.Element | null {
  const available = useLevelAvailable();
  const currentUserId = useKukeStore((state) => state.currentUser?.id ?? null);
  const openLevel = useKukeStore((state) => state.openLevel);
  const enabled = available && Boolean(user) && !user?.is_bot;
  const query = useUserLevel(user?.id, enabled);
  if (!enabled || !user || isLevelUserMissing(query.error)) {
    return null;
  }
  const card = query.data;
  const self = user.id === currentUserId;
  // 自己的等级以用户对象上的为准：升级时它是第一个变的
  const level = self || !card ? Math.max(levelOfUser(user), card?.level ?? 0) : card.level;
  const facts = card ? [
    { label: '连续活跃', value: `${card.streak} 天` },
    { label: '全站名次', value: formatRank(card.rank) },
    { label: '注册', value: `${card.registered_days.toLocaleString('zh-CN')} 天` }
  ] : [];
  const body = (
    <>
      <span className="klv-user-main">
        {level > 0 ? <LevelIcons level={level} variant="full" plain /> : null}
        <b className="klv-user-level">Lv.{level}</b>
        {card ? <span className="klv-user-days">累计活跃 {formatDays(card.active_days)} 天</span> : query.isLoading ? <span className="klv-user-days">…</span> : null}
      </span>
      {facts.length > 0 ? (
        <span className="klv-user-facts">
          {facts.map((fact) => <span key={fact.label}><i>{fact.label}</i>{fact.value}</span>)}
        </span>
      ) : null}
      {self ? <Icon name="chevron" className="klv-user-arrow h-3.5 w-3.5" /> : null}
    </>
  );
  const name = cx('klv-user', `klv-user--${variant}`, className);
  const element = self ? (
    <button type="button" className={cx(name, 'is-link')} data-level-card={user.id} data-level-card-self title="查看我的等级" onClick={() => {
      onNavigate?.();
      openLevel('me');
    }}>{body}</button>
  ) : <div className={name} data-level-card={user.id}>{body}</div>;
  return frame ? frame(element) : element;
}
