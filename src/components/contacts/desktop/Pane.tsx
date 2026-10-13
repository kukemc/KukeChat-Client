import type { ReactNode } from 'react';

/** 内容区的一页：顶上一条标题栏（标题、一句计数、右侧的筛选），下面是自己滚动的内容。 */
export function Pane({ title, meta, aside, children }: { title: string; meta?: ReactNode; aside?: ReactNode; children: ReactNode }): JSX.Element {
  return (
    <>
      <header className="kcc-pane-header">
        <div className="kcc-pane-title">
          <h2>{title}</h2>
          {meta ? <span>{meta}</span> : null}
        </div>
        {aside}
      </header>
      <div className="kui-scroll kcc-pane-body">
        <div className="kcc-pane-inner">{children}</div>
      </div>
    </>
  );
}
