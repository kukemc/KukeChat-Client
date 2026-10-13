import { cx } from '@/components/chat/desktop/runtime';
import type { JuryAchievement } from '@/types/juryGrowth';
import { useJuryAchievements } from '../data/growth';
import { errorText, isUnavailable } from '../data/queries';
import { formatDay } from '../labels';
import { Card, Loading, LoadError, NotOpenYet } from '../widgets/Frame';
import { Medal } from './Insignia';

function progressOf(item: JuryAchievement): number {
  return item.target > 0 ? Math.min(1, Math.max(0, item.current / item.target)) : 0;
}

function AchievementItem({ item }: { item: JuryAchievement }): JSX.Element {
  const earned = item.earned_at !== null;
  return (
    <li className={cx('kjr-ach', earned && 'is-earned')} data-achievement={item.key} data-earned={earned}>
      <Medal achievementKey={item.key} earned={earned} progress={progressOf(item)} />
      <div className="kjr-ach-main">
        <p className="kjr-ach-name">{item.label}</p>
        <p className="kjr-ach-desc">{item.description}</p>
        <p className="kjr-ach-state">{earned ? `${formatDay(item.earned_at)} 获得` : item.target > 1 ? `${Math.min(item.current, item.target)} / ${item.target}` : '尚未获得'}</p>
      </div>
    </li>
  );
}

/** 成就陈列：已经拿到的和还没拿到的放在同一面墙上，没拿到的显示走到哪儿了。 */
export function Achievements({ enabled }: { enabled: boolean }): JSX.Element {
  const query = useJuryAchievements(enabled);
  const items = query.data?.items ?? [];
  const earned = items.filter((item) => item.earned_at !== null).length;
  return (
    <Card title="成就" aside={query.data ? <span className="kjr-meta" data-achievements-earned={earned}>已获得 {earned} / {items.length}</span> : undefined} className="kjr-achs">
      {query.isLoading ? <Loading compact />
        : !query.data ? (isUnavailable(query.error) ? <NotOpenYet what="成就" compact /> : <LoadError compact message={errorText(query.error, '成就加载失败，请稍后再试。')} onRetry={() => void query.refetch()} />)
        : (
          <>
            {earned === 0 ? <p className="kjr-quiet">还没有获得成就。成就记录的是认真评审留下的里程碑：第一案、连续参与、质控题连对、观点被认可……它们不影响层级，也换不了任何东西。</p> : null}
            <ul className="kjr-ach-grid">{items.map((item) => <AchievementItem key={item.key} item={item} />)}</ul>
          </>
        )}
    </Card>
  );
}
