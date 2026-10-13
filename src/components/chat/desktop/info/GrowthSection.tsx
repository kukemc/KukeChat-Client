import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { checkinGroup, getGroupCheckinStatus } from '@/api/conversations';
import type { GroupLeaderboardType } from '@/types/api';
import { useInfo } from './infoContext';

/** 群成长：等级、经验进度、每日签到，以及通往排行榜的三个数字。 */
export function GrowthSection(): JSX.Element {
  const { conversation, currentMember, notify, openDialog } = useInfo();
  const queryClient = useQueryClient();
  const conversationId = conversation.id;

  const statusQuery = useQuery({
    queryKey: ['group-checkin-status', conversationId],
    queryFn: () => getGroupCheckinStatus(conversationId),
    staleTime: 15_000
  });

  const checkinMutation = useMutation({
    mutationFn: () => checkinGroup(conversationId),
    onSuccess: (checkin) => {
      notify(`签到成功，获得 ${checkin.exp_awarded} 群经验。`);
      void queryClient.invalidateQueries({ queryKey: ['group-checkin-status', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['group-leaderboard', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['conversation-members', conversationId] });
    },
    onError: () => {
      notify('签到失败，可能今天已经签过了。', 'error');
      void queryClient.invalidateQueries({ queryKey: ['group-checkin-status', conversationId] });
    }
  });

  const status = statusQuery.data;
  const level = status?.level ?? currentMember?.level ?? 1;
  const levelExp = status?.level_exp ?? currentMember?.level_exp ?? 0;
  // 接口给的是「距下一级还差多少」，不是下一级的总经验
  const remainingExp = status?.next_level_exp ?? currentMember?.next_level_exp ?? 50;
  // 升到下一级要的经验是 40 + 12×(等级-1)（规则在服务端 docs/group-levels.md），本级进度 = 1 - 还差的 / 这一级总共要的
  const progress = remainingExp > 0 ? Math.max(0, Math.min(100, Math.round((1 - remainingExp / (40 + 12 * (level - 1))) * 100))) : 100;
  const levelTitle = conversation.level_titles_enabled ? [...(conversation.level_titles ?? [])].reverse().find((tier) => tier.min_level <= level)?.title : undefined;
  const checked = Boolean(status?.checked_in_today);
  const stats: Array<{ label: string; value: number; board: GroupLeaderboardType }> = [
    { label: '连续签到', value: status?.current_streak ?? currentMember?.current_checkin_streak ?? 0, board: 'checkin_streak' },
    { label: '累计签到', value: status?.total_checkins ?? currentMember?.total_checkins ?? 0, board: 'checkin_total' },
    { label: '活跃值', value: currentMember?.activity_score ?? 0, board: 'activity' }
  ];

  return (
    <section className="kui-group">
      <div className="kci-growth">
        <span className="kci-growth-level">LV{level}{levelTitle ? <small>{levelTitle}</small> : null}</span>
        <div className="kci-growth-exp">
          <div className="kci-growth-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="群经验"><span style={{ width: `${progress}%` }} /></div>
          <p>{remainingExp > 0 ? `经验 ${levelExp} · 距下一级还差 ${remainingExp}` : `经验 ${levelExp} · 已满级`}</p>
        </div>
        <button type="button" className="kui-btn kui-btn--primary kui-btn--sm" disabled={checked || checkinMutation.isPending || statusQuery.isLoading} onClick={() => checkinMutation.mutate()}>
          {checkinMutation.isPending ? '签到中…' : checked ? '已签到' : '签到'}
        </button>
      </div>
      <div className="kci-stats">
        {stats.map((stat) => (
          <button key={stat.board} type="button" title={`查看${stat.label}排行`} onClick={() => openDialog({ kind: 'leaderboard', type: stat.board })}>
            <strong>{stat.value}</strong>{stat.label}
          </button>
        ))}
      </div>
    </section>
  );
}
