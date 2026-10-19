import { useEffect, useState, type ReactNode } from 'react';
import { describeAnnouncementError } from '@/api/groupAnnouncements';
import { cx } from '@/components/chat/desktop/runtime';
import { getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/desktop/Modal';
import { toast } from '@/components/ui/toast';
import { resolveMessageImagePreviewUrl } from '@/components/chat/message/messageMeta';
import { registerNativeBackHandler } from '@/native/back';
import type { GroupAnnouncement, GroupAnnouncementImage } from '@/types/groupAnnouncement';
import { resolveAssetUrl } from '@/utils/assetUrl';
import { parseApiDate } from '@/utils/dateTime';
import { useChangeMyNickname } from './data';

// 群公告各页面共用的小件：外壳（桌面对话框 / 移动整页）、发布人、时间、正文、图片九宫格、状态标签、改群昵称。

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

export function authorNameOf(announcement: Pick<GroupAnnouncement, 'author' | 'author_id' | 'author_display_name'>): string {
  return announcement.author_display_name?.trim() || getDisplayName(announcement.author, announcement.author_id ? `用户 ${announcement.author_id}` : '已注销用户');
}

export function formatAnnouncementTime(value?: string | null): string {
  const date = parseApiDate(value);
  if (!date) {
    return '';
  }
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleString('zh-CN', {
    year: sameYear ? undefined : 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/** 公告正文：保留换行，网址变成可点的链接，其余原样输出。 */
export function AnnouncementText({ content, className }: { content: string; className?: string }): JSX.Element {
  const nodes: Array<string | JSX.Element> = [];
  content.split(URL_PATTERN).forEach((part, index) => {
    if (!part) {
      return;
    }
    if (/^https?:\/\/[^\s]+$/i.test(part)) {
      nodes.push(<a key={`url-${index}`} href={part} target="_blank" rel="noreferrer" className="kga-link" onClick={(event) => event.stopPropagation()}>{part}</a>);
      return;
    }
    nodes.push(part);
  });
  return <p className={cx('kga-text', className)}>{nodes}</p>;
}

export function imageThumb(image: GroupAnnouncementImage): string | undefined {
  return resolveAssetUrl(image.thumbnail_url) ?? resolveMessageImagePreviewUrl(image.url);
}

/** 图片九宫格。一张时按原比例放大一点，多张时方格。 */
export function AnnouncementImages({ images, onOpen }: { images: GroupAnnouncementImage[]; onOpen: (index: number) => void }): JSX.Element | null {
  if (images.length === 0) {
    return null;
  }
  return (
    <div className={cx('kga-images', images.length === 1 && 'is-single')}>
      {images.map((image, index) => {
        const src = imageThumb(image);
        return (
          <button key={`${image.url}-${index}`} type="button" className="kga-image" aria-label={`查看第 ${index + 1} 张图片`} onClick={(event) => {
            event.stopPropagation();
            onOpen(index);
          }}>
            {src ? <img src={src} alt="" loading="lazy" decoding="async" draggable={false} /> : <Icon name="image" className="h-5 w-5" />}
          </button>
        );
      })}
    </div>
  );
}

/** 列表、详情右上角的小标签：置顶、需确认 / 已确认。 */
export function AnnouncementTags({ announcement }: { announcement: GroupAnnouncement }): JSX.Element | null {
  const tags: ReactNode[] = [];
  if (announcement.pinned) {
    tags.push(<span key="pin" className="kga-tag is-ink"><Icon name="pin" className="h-2.5 w-2.5" />置顶</span>);
  }
  if (announcement.require_confirm) {
    tags.push(announcement.my_confirmed
      ? <span key="confirm" className="kga-tag"><Icon name="check" className="h-2.5 w-2.5" />已确认</span>
      : <span key="confirm" className="kga-tag is-strong">需确认</span>);
  }
  return tags.length > 0 ? <span className="kga-tags">{tags}</span> : null;
}

export interface PageShellProps {
  mobile: boolean;
  title: string;
  subtitle?: ReactNode;
  /** 有上一页时给；没有时左上角是关闭 */
  onBack?: () => void;
  onClose: () => void;
  actions?: ReactNode;
  footer?: ReactNode;
  /** 正在写的东西：遮罩、Esc 不关 */
  guard?: boolean;
  onSubmit?: () => void;
  children: ReactNode;
}

/** 页面外壳：桌面布局是对话框（二级页面带返回箭头），移动布局是整页。 */
export function PageShell({ mobile, title, subtitle, onBack, onClose, actions, footer, guard = false, onSubmit, children }: PageShellProps): JSX.Element {
  if (!mobile) {
    return (
      <Modal
        title={title}
        subtitle={subtitle}
        className="kmd-modal--md kmd-modal--tall kga kga-modal"
        bodyClassName="kga-body"
        actions={actions}
        footer={footer}
        onBack={onBack}
        onSubmit={onSubmit}
        dismissOnBackdrop={!guard}
        dismissOnEscape={!guard}
        onClose={onClose}
      >
        {children}
      </Modal>
    );
  }
  const content = (
    <>
      <header className="kga-m-head">
        <button type="button" className="kga-m-back" onClick={onBack ?? onClose} aria-label={onBack ? '返回' : '关闭'}>
          <Icon name="chevronLeft" className="h-6 w-6" />
        </button>
        <div className="kga-m-title">
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <div className="kga-m-actions">{actions}</div>
      </header>
      <main className="kga-m-main scroll-soft">{children}</main>
      {footer ? <footer className="kga-m-foot">{footer}</footer> : null}
    </>
  );
  return onSubmit ? (
    <form className="kga kui kga-m-page" onSubmit={(event) => {
      event.preventDefault();
      onSubmit();
    }}>{content}</form>
  ) : <div className="kga kui kga-m-page">{content}</div>;
}

/** 移动布局：系统返回键先退一页。 */
export function useNativeBack(active: boolean, handler: () => void, priority = 180): void {
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    return registerNativeBackHandler(() => {
      handler();
      return true;
    }, priority);
  }, [active, handler, priority]);
}

/** 「修改群昵称」：点开是一行输入框，保存就是改自己在这个群的群昵称。 */
export function NicknameEditor({ conversationId, currentNickname, onDone }: { conversationId: number; currentNickname: string; onDone?: () => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentNickname);
  const mutation = useChangeMyNickname(conversationId);

  if (!open) {
    return (
      <button type="button" className="kga-btn" onClick={() => {
        setValue(currentNickname);
        setOpen(true);
      }}>
        <Icon name="edit" className="h-3.5 w-3.5" />修改群昵称
      </button>
    );
  }
  const save = (): void => {
    const nickname = value.trim();
    if (mutation.isPending) {
      return;
    }
    mutation.mutate(nickname, {
      onSuccess: () => {
        toast.success(nickname ? '群昵称已修改' : '已清除群昵称');
        setOpen(false);
        onDone?.();
      },
      onError: (error) => toast.error(describeAnnouncementError(error, error instanceof Error && /[一-龥]/.test(error.message) ? error.message : '群昵称修改失败，请稍后重试。'))
    });
  };
  return (
    <div className="kga-nick">
      <input
        className="kga-nick-input"
        value={value}
        maxLength={120}
        autoFocus
        placeholder="输入你在本群的昵称"
        aria-label="我的本群昵称"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault();
            save();
          }
        }}
      />
      <button type="button" className="kga-btn is-ghost" onClick={() => setOpen(false)}>取消</button>
      <button type="button" className="kga-btn is-ink" disabled={mutation.isPending} onClick={save}>{mutation.isPending ? '保存中…' : '保存'}</button>
    </div>
  );
}
