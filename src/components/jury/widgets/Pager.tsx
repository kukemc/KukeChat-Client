import { Icon } from '@/components/ui/Icon';

/** 列表底部的翻页：共多少条、第几页、上一页 / 下一页。只有一页时不出现翻页按钮。 */
export function Pager({ total, limit, offset, busy = false, onChange }: { total: number; limit: number; offset: number; busy?: boolean; onChange: (offset: number) => void }): JSX.Element {
  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(pages, Math.floor(offset / limit) + 1);
  return (
    <nav className="kjr-pager" aria-label="翻页">
      <span>共 {total} 条{busy ? ' · 加载中…' : ''}</span>
      {pages > 1 ? (
        <span className="kjr-pager-ctrl">
          <button type="button" className="kui-icon-btn" aria-label="上一页" disabled={page <= 1} onClick={() => onChange(Math.max(0, offset - limit))}><Icon name="chevronLeft" className="h-4 w-4" /></button>
          <span aria-current="page">{page} / {pages}</span>
          <button type="button" className="kui-icon-btn" aria-label="下一页" disabled={page >= pages} onClick={() => onChange(offset + limit)}><Icon name="chevron" className="h-4 w-4" /></button>
        </span>
      ) : null}
    </nav>
  );
}
