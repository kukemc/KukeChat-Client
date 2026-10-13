/** 桌面端机器人中心各页共用的小部件和操作约定。 */
import type { CSSProperties, ReactNode } from 'react';
import { ContextMenuItem, ContextMenuSeparator } from '@/components/ui/ContextMenu';
import { Icon } from '@/components/ui/Icon';
import type { Bot } from '@/types/api';
import { clampRating, ratingLabel } from '../botShared';

/** 各页能触发的操作，统一由 BotCenterDesktop 实现：它管着选中项、编辑页和所有弹窗。 */
export interface BotActions {
  /** 在右侧打开一个机器人的详情；传 null 回到概览 */
  select: (botId: number | null) => void;
  openDashboard: (botId: number) => void;
  create: () => void;
  edit: (bot: Bot) => void;
  install: (bot: Bot) => void;
  share: (bot: Bot) => void;
  remove: (bot: Bot) => void;
  rotateKey: (bot: Bot) => void;
  openDocs: () => void;
  openUser: (userId: number) => void;
  /** 把一次失败的操作显示在右侧顶部的提示条里；传 null 收起 */
  report: (error: unknown) => void;
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

function StarRow(): JSX.Element {
  return (
    <span className="kcb-stars-row">
      {[0, 1, 2, 3, 4].map((item) => (
        <svg key={item} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.6 5.3 5.85.85-4.23 4.12 1 5.83L12 16.55 6.78 19.3l1-5.83-4.23-4.12 5.85-.85L12 3.2z" /></svg>
      ))}
    </span>
  );
}

/** 五颗星，支持小数：上面一排着色的按比例裁掉右边。大小跟随字号。 */
export function Stars({ value, className }: { value: number; className?: string }): JSX.Element {
  const rating = clampRating(value);
  return (
    <span className={cx('kcb-stars', className)} role="img" aria-label={`${ratingLabel(Math.round(rating * 10) / 10)} 分`}>
      <StarRow />
      <span className="kcb-stars-fill" style={{ width: `${rating * 20}%` }}><StarRow /></span>
    </span>
  );
}

/** 打分：每颗星分左右两半，各是一个看不见的单选按钮，所以能打半星。 */
export function StarsInput({ value, onChange }: { value: number; onChange: (value: number) => void }): JSX.Element {
  return (
    <span className="kcb-stars-input" role="radiogroup" aria-label="我的评分">
      <Stars value={value} />
      <span className="kcb-stars-hit">
        {Array.from({ length: 10 }, (_, index) => {
          const score = (index + 1) / 2;
          return <button key={score} type="button" role="radio" aria-checked={value === score} aria-label={`${ratingLabel(score)} 分`} title={`${ratingLabel(score)} 分`} onClick={() => onChange(score)} />;
        })}
      </span>
    </span>
  );
}

/** 名字后面的状态标记。在线 / 离线只在详情页头部标出来，列表里用头像角上的圆点。 */
export function BotTags({ bot, showOnline = false, showVisibility = false }: { bot: Bot; showOnline?: boolean; showVisibility?: boolean }): JSX.Element {
  return (
    <>
      {showOnline ? <span className={bot.online ? 'kui-tag kui-tag--ok' : 'kui-tag'}>{bot.online ? '在线' : '离线'}</span> : null}
      {showVisibility ? <span className="kui-tag">{bot.is_public ? '公开' : '私有'}</span> : null}
      {bot.status === 'disabled' ? <span className="kui-tag kui-tag--warn">已停用</span> : null}
    </>
  );
}

/** 画布上的一块白色的面：标题是小号分组标题，右边可以带计数或操作。 */
export function Card({ title, aside, className, children }: { title?: string; aside?: ReactNode; className?: string; children: ReactNode }): JSX.Element {
  return (
    <section className={cx('kcb-card', className)}>
      {title ? <div className="kui-group-title"><span>{title}</span>{aside}</div> : null}
      {children}
    </section>
  );
}

/** 一排数字：标签在上、数字在下，格子之间只隔发丝线。列数等于项数，窄了由样式折成两行。 */
export function StatStrip({ items }: { items: Array<{ label: string; value: string; detail?: string }> }): JSX.Element {
  return (
    <dl className={items.length > 5 ? 'kcb-stats kcb-stats--wrap' : 'kcb-stats'} style={{ '--kcb-stat-cols': items.length } as CSSProperties}>
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
          {item.detail ? <dd className="kcb-stats-detail">{item.detail}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/** 整块区域的占位：加载中、出错、没有内容。 */
export function PaneState({ title, text, action }: { title: string; text?: string; action?: ReactNode }): JSX.Element {
  return (
    <div className="kcb-state">
      <Icon name="bot" className="h-7 w-7" />
      <strong>{title}</strong>
      {text ? <p>{text}</p> : null}
      {action}
    </div>
  );
}

/**
 * 一个机器人的操作菜单项。列表右键菜单给全套；详情页头部的「更多」只给头部按钮里没有的那几项。
 * 管理项（仪表盘、编辑、重置 Key、删除）只有创建者看得到。
 */
export function BotMenuItems({ bot, isOwner, compact = false, actions, onClose }: { bot: Bot; isOwner: boolean; compact?: boolean; actions: BotActions; onClose: () => void }): JSX.Element {
  const run = (action: () => void) => () => {
    onClose();
    action();
  };
  return (
    <>
      {compact ? null : (
        <>
          <ContextMenuItem icon="eye" label="查看详情" onClick={run(() => actions.select(bot.id))} />
          <ContextMenuItem icon="plus" label="添加到群聊" disabled={bot.status === 'disabled'} onClick={run(() => actions.install(bot))} />
          <ContextMenuItem icon="share" label="分享名片" onClick={run(() => actions.share(bot))} />
        </>
      )}
      {isOwner ? (
        <>
          {compact ? null : <ContextMenuSeparator />}
          {compact ? null : <ContextMenuItem icon="poll" label="仪表盘" onClick={run(() => actions.openDashboard(bot.id))} />}
          <ContextMenuItem icon="edit" label="编辑资料" onClick={run(() => actions.edit(bot))} />
          <ContextMenuItem icon="shield" label="重置 Key" onClick={run(() => actions.rotateKey(bot))} />
          <ContextMenuSeparator />
          <ContextMenuItem icon="trash" label="删除机器人" danger onClick={run(() => actions.remove(bot))} />
        </>
      ) : null}
    </>
  );
}
