import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getGroupLeaderboard } from '@/api/conversations';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import type { GroupLeaderboardItem, GroupLeaderboardPeriod, GroupLeaderboardType } from '@/types/api';
import { leaderboardPeriodOptions, leaderboardTypeOptions } from '../../../info/shared';
import { cx } from '../../runtime';
import { Dialog, DialogList, Segment } from '../controls';
import { useInfo } from '../infoContext';

function scoreText(item: GroupLeaderboardItem, type: GroupLeaderboardType): string {
  if (type === 'message') return `${item.message_count} 条`;
  if (type === 'checkin_total') return `${item.total_checkins} 天`;
  if (type === 'checkin_streak') return `${item.current_checkin_streak} 天`;
  if (type === 'level') return `${item.level_exp} 经验`;
  return String(item.activity_score);
}

/** 群排行榜：活跃、等级、签到、发言，按周期切换。 */
export function LeaderboardDialog({ initialType }: { initialType: GroupLeaderboardType }): JSX.Element {
  const { conversation, closeDialog } = useInfo();
  const [type, setType] = useState(initialType);
  const [period, setPeriod] = useState<GroupLeaderboardPeriod>('all');

  const boardQuery = useQuery({
    queryKey: ['group-leaderboard', conversation.id, type, period],
    queryFn: () => getGroupLeaderboard(conversation.id, type, period),
    staleTime: 15_000
  });
  const items = boardQuery.data?.items ?? [];
  const empty = boardQuery.isLoading ? '正在加载榜单…' : boardQuery.error ? '榜单加载失败，请稍后重试。' : items.length === 0 ? '暂无榜单数据。' : null;

  return (
    <Dialog title="群排行榜" onClose={closeDialog}>
      <div className="kci-board-filters">
        <Segment value={type} options={leaderboardTypeOptions} onChange={setType} />
        <Segment value={period} options={leaderboardPeriodOptions} onChange={setPeriod} />
      </div>
      <DialogList empty={empty}>
        {items.map((item) => {
          const name = item.member.nickname?.trim() || getDisplayName(item.user, `用户 ${item.user_id}`);
          return (
            <div key={`${item.rank}-${item.user_id}`} className="kci-item">
              <span className={cx('kci-rank', item.rank <= 3 && 'is-top')}>{item.rank}</span>
              <Avatar user={item.user} label={name} size="sm" />
              <span className="kci-item-text">
                <span>{name}</span>
                <span>Lv.{item.level} · 活跃 {item.activity_score} · 连签 {item.current_checkin_streak} 天</span>
              </span>
              <span className="kci-score">{scoreText(item, type)}</span>
            </div>
          );
        })}
      </DialogList>
    </Dialog>
  );
}
