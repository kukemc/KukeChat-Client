/** 任务中心里两个只读的视图：仪表盘（各状态的数量）和动态（谁对哪条任务做了什么）。 */
import { useMemo } from 'react';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import type { TaskActivity, TaskDashboard } from '@/types/api';
import { activityText } from '../taskConstants';
import { feedDayHeader, feedTime, groupActivitiesByDay } from '../taskModel';
import { cx } from './parts';

function Figure({ value, label, tone, lead = false }: { value: number; label: string; tone?: 'danger' | 'warn'; lead?: boolean }): JSX.Element {
  // 0 不上色：没有逾期就不该有一个红色的 0 抢眼
  return <div className={cx('ktk-figure', lead && 'ktk-figure--lead', tone && value > 0 && `is-${tone}`)}><strong>{value}</strong><span>{label}</span></div>;
}

export function TaskOverview({ data }: { data?: TaskDashboard }): JSX.Element {
  if (!data) {
    return <div className="kui-empty">加载中…</div>;
  }
  const percent = data.total ? Math.round((data.completed / data.total) * 100) : 0;
  const shares = [
    { key: 'is-done', label: '已完成', value: data.completed },
    { key: 'is-doing', label: '进行中', value: data.in_progress },
    { key: 'is-pending', label: '待处理', value: data.pending }
  ];
  return (
    <div className="ktk-overview">
      <div className="ktk-sheet ktk-overview-lead">
        <Figure value={data.total} label="全部任务" lead />
        <div className="ktk-overview-split">
          <p>已完成 <b>{percent}%</b></p>
          <div className="ktk-stack-bar">
            {shares.map((share) => (share.value > 0 ? <span key={share.key} className={share.key} style={{ flexGrow: share.value }} /> : null))}
          </div>
          <div className="ktk-legend">
            {shares.map((share) => <span key={share.key}><i className={share.key} />{share.label}<b>{share.value}</b></span>)}
          </div>
        </div>
      </div>
      <div className="ktk-sheet ktk-figures">
        <Figure value={data.overdue} label="已逾期" tone="danger" />
        <Figure value={data.due_today} label="今日到期" tone="warn" />
        <Figure value={data.due_soon} label="即将到期" />
      </div>
    </div>
  );
}

export function TaskActivityFeed({ activities, loading, onOpenTask }: { activities: TaskActivity[]; loading: boolean; onOpenTask: (taskId: number) => void }): JSX.Element {
  const days = useMemo(() => groupActivitiesByDay(activities), [activities]);
  if (activities.length === 0) {
    return <div className="kui-empty">{loading ? '加载中…' : '暂无动态'}</div>;
  }
  return (
    <div className="ktk-feed">
      {days.map((day) => {
        const header = feedDayHeader(day.date);
        return (
          <section key={day.key} className="ktk-feed-day">
            <div className="ktk-feed-date"><strong>{header.day}</strong><span>{header.weekday}</span></div>
            <div className="ktk-sheet">
              {day.items.map((activity) => (
                <button key={activity.id} type="button" className="ktk-feed-item" onClick={() => onOpenTask(activity.task_id)}>
                  <time>{feedTime(activity.created_at)}</time>
                  <Avatar user={activity.actor ?? undefined} size="sm" />
                  <span className="ktk-feed-text">
                    <span className="ktk-feed-task ktk-clip">{activity.task_title}</span>
                    <span className="ktk-feed-what ktk-clip"><b>{getDisplayName(activity.actor)}</b> {activityText(activity.type, '', activity.payload)}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
