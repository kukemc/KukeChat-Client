import { useState, type CSSProperties } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Markdown } from '@/components/ui/Markdown';
import { Modal } from '@/components/ui/desktop/Modal';
import { resolveAssetUrl } from '@/utils/assetUrl';
import { AnnouncementReactionBar } from '../AnnouncementReactionBar';
import { formatAnnouncementDate, useAnnouncementList, useCoverImage, type AnnouncementModalProps } from '../announcementData';

/** 桌面端的公告中心：左边是公告列表，右边是选中那一条的正文。 */
export function AnnouncementCenterDesktop({ initialId, onClose }: AnnouncementModalProps): JSX.Element {
  const [selectedId, setSelectedId] = useState<number | null>(initialId ?? null);
  const listQuery = useAnnouncementList();
  const list = listQuery.data ?? [];
  // 没指定、或者指定的那条已经不在了，就看最新的一条
  const selected = list.find((item) => item.id === selectedId) ?? list[0] ?? null;
  const cover = selected?.cover_url ? resolveAssetUrl(selected.cover_url) : null;
  const loading = listQuery.isLoading;
  // 没拿到过数据的失败才算失败；手里有旧的一份时照常显示旧的
  const failed = listQuery.isError && !listQuery.data;
  // 出现过骨架屏的话，内容到了淡入一次；之后切换公告不再放
  const [arriving, setArriving] = useState(loading);
  if (loading && !arriving) {
    setArriving(true);
  }

  return (
    <Modal
      title="公告中心"
      subtitle={loading || failed ? null : `${list.length} 条公告`}
      className="kmd-modal--xl kmd-modal--tall"
      bodyClassName="kmd-ann"
      // 加载时底栏就在：不然内容一到，底栏冒出来会把正文区顶矮一截
      footer={selected || loading ? <button type="button" className="kui-btn kui-btn--primary" onClick={onClose}>我知道了</button> : null}
      onClose={onClose}
    >
      {loading ? <AnnouncementSkeleton /> : failed ? (
        <div className="kui-empty kmd-empty is-error" role="alert">
          <Icon name="alert" className="h-7 w-7" />
          <strong>公告没有加载出来</strong>
          <span>检查一下网络，再试一次。</span>
          {/* 还没拿到过数据时重试，查询回到「加载中」，这里会换回骨架屏 */}
          <button type="button" className="kui-btn kui-btn--sm kmd-ann-retry" onClick={() => void listQuery.refetch()}>重试</button>
        </div>
      ) : !selected ? (
        <div className="kui-empty kmd-empty">
          <Icon name="announcement" className="h-7 w-7" />
          <strong>暂无公告</strong>
          <span>还没有发布任何公告，敬请期待～</span>
        </div>
      ) : (
        <>
          <nav className={cx('kmd-ann-list kui-scroll', arriving && 'kmd-ann-arrive')} aria-label="公告列表">
            {list.map((item) => (
              <button key={item.id} type="button" aria-current={item.id === selected.id} className={item.id === selected.id ? 'is-active' : undefined} onClick={() => setSelectedId(item.id)}>
                <span className="kmd-ann-list-title">{item.pinned ? <Icon name="pin" className="h-3 w-3" /> : null}<span>{item.title}</span></span>
                <time>{formatAnnouncementDate(item.created_at, false)}</time>
              </button>
            ))}
          </nav>
          {/* 换一条公告时整块重建，滚动位置回到顶部 */}
          <article key={selected.id} className={cx('kmd-ann-article kui-scroll', arriving && 'kmd-ann-arrive')} onAnimationEnd={(event) => {
            if (event.target === event.currentTarget) {
              setArriving(false);
            }
          }}>
            {cover ? <AnnouncementCover src={cover} /> : null}
            <h1>{selected.title}</h1>
            <div className="kmd-ann-meta">
              {selected.author ? <><Avatar user={selected.author} size="sm" /><span>{getDisplayName(selected.author)}</span><i /></> : null}
              <time>{formatAnnouncementDate(selected.created_at)}</time>
              {selected.pinned ? <span className="kui-tag kui-tag--accent">置顶</span> : null}
            </div>
            <Markdown content={selected.content} className="kmd-md" />
            <AnnouncementReactionBar announcement={selected} />
          </article>
        </>
      )}
    </Modal>
  );
}

/** 封面图。图没到之前先占住位置（一块带流光的底），到了淡入；加载失败就不显示。 */
function AnnouncementCover({ src }: { src: string }): JSX.Element | null {
  const { status, ref, onLoad, onError } = useCoverImage();
  if (status === 'failed') {
    return null;
  }
  return (
    <div className={cx('kmd-ann-cover-box', status === 'loaded' ? 'is-loaded' : 'kcr-bone')}>
      <img ref={ref} className="kmd-ann-cover" src={src} alt="" onLoad={onLoad} onError={onError} />
    </div>
  );
}

const SKELETON_LIST_WIDTHS = [72, 88, 54, 80, 62];
const SKELETON_TEXT_WIDTHS = [94, 100, 86, 97, 58, 0, 91, 100, 42];

function boneStyle(width: number, index: number): CSSProperties {
  return { width: `${width}%`, '--kcr-delay': `${index * 70}ms` } as CSSProperties;
}

/**
 * 加载中的骨架：和真内容同一个版式（左边列表，右边标题、作者时间、几段正文），内容到了原地换上去。
 * 每一块是名单页的 kcr-bone（底色 + 扫过去的流光，「减少动态效果」下流光自己会停），这里只定大小。
 */
function AnnouncementSkeleton(): JSX.Element {
  return (
    <>
      <div className="kmd-ann-list" aria-hidden="true">
        {SKELETON_LIST_WIDTHS.map((width, index) => (
          <span key={index} className="kmd-ann-skel-item">
            <span className="kcr-bone kmd-ann-bone--line" style={boneStyle(width, index)} />
            <span className="kcr-bone kmd-ann-bone--date" style={{ '--kcr-delay': `${index * 70}ms` } as CSSProperties} />
          </span>
        ))}
      </div>
      <div className="kmd-ann-article" role="status" aria-label="正在加载公告">
        <span className="kcr-bone kmd-ann-bone--title" />
        <div className="kmd-ann-meta">
          <span className="kcr-bone kmd-ann-bone--avatar" />
          <span className="kcr-bone kmd-ann-bone--date" />
        </div>
        {SKELETON_TEXT_WIDTHS.map((width, index) => (width === 0
          ? <span key={index} className="kmd-ann-bone--gap" />
          : <span key={index} className="kcr-bone kmd-ann-bone--text" style={boneStyle(width, index)} />))}
      </div>
    </>
  );
}
