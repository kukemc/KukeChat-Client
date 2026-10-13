/** 桌面端任务界面里到处要用的小零件：勾选圈、标签、头像叠放、进度条、浮层、菜单按钮。 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Icon, type IconName } from '@/components/ui/Icon';
import { cx, useEvent } from '@/components/chat/desktop/runtime';
import type { TaskCardAssignee, TaskPriority, TaskStatus, User } from '@/types/api';
import { PRIORITY_META, STATUS_META, formatDueLabel, isOverdue } from '../taskConstants';

export { cx, useEvent };

/** 任务前面的勾选圈。放在整行可点的元素里时，点它不该连带触发行的点击。 */
export function CheckMark({ checked, disabled = false, onToggle }: { checked: boolean; disabled?: boolean; onToggle?: () => void }): JSX.Element {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={checked ? '标记为未完成' : '标记为完成'}
      title={checked ? '标记为未完成' : '标记为完成'}
      disabled={disabled}
      className={cx('ktk-check', checked && 'is-checked')}
      onClick={(event) => {
        event.stopPropagation();
        onToggle?.();
      }}
    >
      {checked ? <Icon name="check" className="h-3 w-3" /> : null}
    </button>
  );
}

const PRIORITY_TONE: Record<TaskPriority, string> = { urgent: 'kui-tag--danger', high: 'kui-tag--warn', normal: 'kui-tag--accent', low: '' };

export function PriorityTag({ priority, compact = false }: { priority: TaskPriority; compact?: boolean }): JSX.Element {
  const meta = PRIORITY_META[priority];
  return <span className={cx('kui-tag', PRIORITY_TONE[priority])} title={`优先级：${meta.label}`}>{meta.code}{compact ? null : ` ${meta.label}`}</span>;
}

const STATUS_TONE: Record<TaskStatus, string> = { pending: '', in_progress: 'kui-tag--accent', completed: 'kui-tag--ok', cancelled: '' };

export function StatusTag({ status }: { status: TaskStatus }): JSX.Element {
  return <span className={cx('kui-tag', STATUS_TONE[status])}>{STATUS_META[status].label}</span>;
}

/** 截止时间。逾期且没完成的标红。 */
export function DueText({ dueAt, status, icon = false, suffix }: { dueAt?: string | null; status?: TaskStatus; icon?: boolean; suffix?: string }): JSX.Element | null {
  if (!dueAt) {
    return null;
  }
  return (
    <span className={cx('ktk-due', isOverdue(dueAt, status) && 'is-overdue')}>
      {icon ? <Icon name="clock" className="h-3 w-3" /> : null}
      {formatDueLabel(dueAt)}{suffix}
    </span>
  );
}

/** 一排叠放的小头像，超出的折成 +N。people 是聊天卡片里固化的那份（只有名字和头像地址）。 */
export function AvatarStack({ users, people, max = 3 }: { users?: User[]; people?: TaskCardAssignee[]; max?: number }): JSX.Element | null {
  const total = users?.length ?? people?.length ?? 0;
  if (total === 0) {
    return null;
  }
  return (
    <span className="ktk-avatars">
      {users?.slice(0, max).map((user) => <Avatar key={user.id} user={user} size="sm" />)}
      {people?.slice(0, max).map((person) => <Avatar key={person.id} label={person.name} avatarUrl={person.avatar_url} toneKey={person.id} size="sm" />)}
      {total > max ? <span className="ktk-avatars-more">+{total - max}</span> : null}
    </span>
  );
}

export function Progress({ done, total, wide = false }: { done: number; total: number; wide?: boolean }): JSX.Element {
  const percent = total ? Math.round((done / total) * 100) : 0;
  return (
    <span className={cx('ktk-progress', wide && 'ktk-progress--wide')} title={`子任务 ${done}/${total}`}>
      <span className="ktk-progress-track"><span style={{ width: `${percent}%` }} /></span>
      <span>{done}/{total}</span>
    </span>
  );
}

/**
 * 贴着触发元素弹出的浮层，fixed 定位，所以不会被对话框、滚动区裁掉。
 * 点外面、按 Esc、外层滚动或窗口变化都会关掉。
 */
export function Floating({ anchorRef, onClose, className, align = 'start', children }: { anchorRef: RefObject<HTMLElement>; onClose: () => void; className?: string; align?: 'start' | 'end'; children: ReactNode }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const close = useEvent(onClose);

  // 每次渲染都重新摆：里面的内容会变高变矮（搜索成员、切月份）
  useLayoutEffect(() => {
    const node = ref.current;
    const anchor = anchorRef.current;
    if (!node || !anchor) {
      return;
    }
    // fixed 的基准不一定是视口：外层有 transform（扩展里的浮窗会整体缩放）时基准是那一层。
    // 先放到 0,0 量出基准原点和缩放比，再把视口坐标换算回去。
    node.style.left = '0px';
    node.style.top = '0px';
    const origin = node.getBoundingClientRect();
    const scale = origin.width / node.offsetWidth || 1;
    const target = anchor.getBoundingClientRect();
    const margin = 8;
    const wanted = align === 'end' ? target.right - origin.width : target.left;
    const left = Math.max(margin, Math.min(wanted, window.innerWidth - origin.width - margin));
    let top = target.bottom + 4;
    if (top + origin.height > window.innerHeight - margin) {
      // 下面放不下就翻到上面，上面也放不下就贴着窗口底
      const above = target.top - 4 - origin.height;
      top = above >= margin ? above : Math.max(margin, window.innerHeight - margin - origin.height);
    }
    node.style.left = `${(left - origin.left) / scale}px`;
    node.style.top = `${(top - origin.top) / scale}px`;
    node.style.visibility = 'visible';
  });

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    // 界面可能在 Shadow DOM 里，事件的 target 会被改写成宿主元素，要用 composedPath 判断点在哪
    const inside = (event: Event): boolean => {
      const path = event.composedPath();
      return path.includes(node) || (anchorRef.current !== null && path.includes(anchorRef.current));
    };
    const onPointer = (event: MouseEvent): void => {
      if (!inside(event)) {
        close();
      }
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.isComposing) {
        // 只关这一层，别把外面的对话框一起关了
        event.stopPropagation();
        close();
      }
    };
    const onScroll = (event: Event): void => {
      if (!(event.target instanceof Node) || !node.contains(event.target)) {
        close();
      }
    };
    // scroll 事件不会穿出 Shadow DOM，所以挂在自己所在的根上
    const root = node.getRootNode();
    document.addEventListener('mousedown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    root.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
      root.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [anchorRef, close]);

  return <div ref={ref} className={cx('ktk-pop', className)} onClick={(event) => event.stopPropagation()}>{children}</div>;
}

/** 点一下弹出浮层的按钮。children 拿到一个 close，用来在选完之后收起。 */
export function PopButton({ className, popClassName, align, disabled = false, title, label, children }: {
  className?: string;
  popClassName?: string;
  align?: 'start' | 'end';
  disabled?: boolean;
  title?: string;
  label: ReactNode;
  children: (close: () => void) => ReactNode;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const close = (): void => setOpen(false);
  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={cx(className, open && 'is-open')}
        disabled={disabled}
        title={title}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        {label}
      </button>
      {open ? <Floating anchorRef={anchorRef} onClose={close} className={popClassName} align={align}>{children(close)}</Floating> : null}
    </>
  );
}

/** 工具栏上的下拉：「图标 + 文字 + 小箭头」，弹出一张菜单。 */
export function MenuButton({ icon, text, title, align, children }: { icon?: IconName; text?: string; title?: string; align?: 'start' | 'end'; children: (close: () => void) => ReactNode }): JSX.Element {
  return (
    <PopButton
      className={text ? 'kui-btn kui-btn--ghost kui-btn--sm ktk-menu-btn' : 'kui-icon-btn ktk-icon-btn'}
      popClassName="kui-menu"
      align={align}
      title={title}
      label={<>{icon ? <Icon name={icon} className="h-3.5 w-3.5" /> : null}{text ? <><span>{text}</span><Icon name="chevron" className="ktk-caret" /></> : null}</>}
    >
      {children}
    </PopButton>
  );
}

/** 行内的小输入框：新建分组、给分组改名。回车或失焦提交，Esc 放弃。 */
export function InlineInput({ initial = '', placeholder, className, onSubmit, onCancel }: { initial?: string; placeholder?: string; className?: string; onSubmit: (value: string) => void; onCancel: () => void }): JSX.Element {
  const [value, setValue] = useState(initial);
  // 回车提交后输入框被卸载，有的浏览器还会补发一次 blur；用它挡掉重复提交
  const settled = useRef(false);

  function finish(save: boolean): void {
    if (settled.current) {
      return;
    }
    settled.current = true;
    const next = value.trim();
    if (save && next && next !== initial) {
      onSubmit(next);
    } else {
      onCancel();
    }
  }

  return (
    <input
      autoFocus
      className={cx('kui-input ktk-inline-input', className)}
      value={value}
      placeholder={placeholder}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
          event.preventDefault();
          finish(true);
        } else if (event.key === 'Escape') {
          event.stopPropagation();
          finish(false);
        }
      }}
    />
  );
}
