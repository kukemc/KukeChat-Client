import type { ReactNode } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import { Icon, type IconName } from '@/components/ui/Icon';

/** 一个板块的外框：顶上一条标题栏，下面是可滚动的内容。每个板块都用它，标题栏的高度和层次才对得齐。 */
export function SectionFrame({ title, subtitle, actions, onBack, flush = false, children }: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** 给了就在标题前出现返回箭头（板块内的二级页面） */
  onBack?: () => void;
  /** 内容自己管宽度和内边距（评审台那种左右分栏的页面） */
  flush?: boolean;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="kjr-main">
      <header className="kjr-head">
        {onBack ? <button type="button" className="kui-icon-btn" aria-label="返回" onClick={onBack}><Icon name="chevronLeft" className="h-4 w-4" /></button> : null}
        <h1 className="kjr-head-title">{title}</h1>
        {subtitle ? <div className="kjr-head-sub">{subtitle}</div> : null}
        {actions ? <div className="kjr-head-actions">{actions}</div> : null}
      </header>
      {flush ? children : <div className="kjr-body kui-scroll"><div className="kjr-wrap">{children}</div></div>}
    </div>
  );
}

/** 画布上的一块白面。标题是小号加粗的分组标题；面里不要再套面。 */
export function Card({ title, aside, className, children }: { title?: ReactNode; aside?: ReactNode; className?: string; children: ReactNode }): JSX.Element {
  return (
    <section className={cx('kjr-card', className)}>
      {title || aside ? <header className="kjr-card-head"><h2>{title}</h2>{aside ? <div className="kjr-card-aside">{aside}</div> : null}</header> : null}
      {children}
    </section>
  );
}

/** 空、出错、不可用、无权限：图标 + 一句标题 + 说明 + 可做的事。整个板块只有它时居中，嵌在卡片里时用 compact。 */
export function StateBlock({ icon = 'info', title, children, actions, compact = false, tone }: { icon?: IconName; title: string; children?: ReactNode; actions?: ReactNode; compact?: boolean; tone?: 'danger' }): JSX.Element {
  return (
    <div className={cx('kjr-state', compact && 'is-compact', tone === 'danger' && 'is-danger')} role={tone === 'danger' ? 'alert' : undefined}>
      <span className="kjr-state-icon"><Icon name={icon} className="h-5 w-5" /></span>
      <p className="kjr-state-title">{title}</p>
      {children ? <div className="kjr-state-text">{children}</div> : null}
      {actions ? <div className="kjr-state-actions">{actions}</div> : null}
    </div>
  );
}

export function Loading({ label = '加载中…', compact = false }: { label?: string; compact?: boolean }): JSX.Element {
  return <p className={cx('kjr-loading', compact && 'is-compact')} role="status">{label}</p>;
}

/** 请求失败。接口在这个后端上不存在的情况由调用方先用 isUnavailable 分出去，不走这里。 */
export function LoadError({ message, onRetry, compact = false }: { message: string; onRetry?: () => void; compact?: boolean }): JSX.Element {
  return (
    <StateBlock icon="alert" title="没有加载出来" compact={compact} tone="danger" actions={onRetry ? <button type="button" className="kui-btn kui-btn--sm" onClick={onRetry}>重试</button> : undefined}>
      {message}
    </StateBlock>
  );
}

/** 服务端还没有这项能力（旧版本的后端）。不是错误，所以不用报错的样子。 */
export function NotOpenYet({ what, compact = false, children }: { what: string; compact?: boolean; children?: ReactNode }): JSX.Element {
  return (
    <StateBlock icon="clock" title={`${what}尚未开放`} compact={compact}>
      {children ?? '服务端还在准备这部分数据，开放后这里会自动出现，不需要更新客户端。'}
    </StateBlock>
  );
}
