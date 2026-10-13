import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '@/components/chat/desktop/runtime';
import { FULL_REACTION_EMOJIS } from '@/components/chat/message/constants';
import { MenuLayer } from '@/components/ui/ContextMenu';
import { Icon } from '@/components/ui/Icon';
import type { Announcement, AnnouncementReaction } from '@/types/api';
import { formatReactionCount, useAnnouncementReactionOptions, useAnnouncementReactions } from './announcementReactions';

interface AnnouncementReactionBarProps {
  announcement: Announcement;
  /** 手机布局（整页的公告详情）用另一套外观 */
  mobile?: boolean;
}

/**
 * 公告正文下面的回应栏：已有的回应（emoji + 数量，自己回应过的高亮，点一下切换），
 * 后面跟一排还没人用过的快捷 emoji 和一个打开完整选择器的「+」。
 */
export function AnnouncementReactionBar({ announcement, mobile = false }: AnnouncementReactionBarProps): JSX.Element {
  return mobile ? <MobileReactionBar announcement={announcement} /> : <DesktopReactionBar announcement={announcement} />;
}

function reactionLabel(reaction: AnnouncementReaction): string {
  return `${reaction.emoji} ${reaction.count} 人回应${reaction.reacted_by_me ? '，你也回应了，点击取消' : ''}`;
}

/** 选择器里列出来的 emoji：服务端给的快捷回应排前面，后面是和消息回应同一份的完整列表。 */
function usePickerEmojis(): string[] {
  const { quick } = useAnnouncementReactionOptions();
  return useMemo(() => Array.from(new Set([...quick, ...FULL_REACTION_EMOJIS])), [quick]);
}

/**
 * 回应栏在正文最底下：自己点了之后多出来的一行、或者失败的那句提示，可能正好落在可视范围外面。
 * 刚点过的那几秒里，内容一变就把它滚进来；别人的回应（实时事件）引起的变化不动滚动位置。
 */
function useRevealAfterAction(reactionCount: number, notice: string): { ref: RefObject<HTMLDivElement>; markAction: () => void } {
  const ref = useRef<HTMLDivElement>(null);
  const actedAtRef = useRef(0);

  useEffect(() => {
    const element = ref.current;
    if (!element || performance.now() - actedAtRef.current > 6000) {
      return;
    }
    // 只动最近的那个滚动容器（公告正文），不用 scrollIntoView：它会一路滚到页面，扩展形态下会带着宿主页面一起动
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const overflowY = getComputedStyle(parent).overflowY;
      // 还要真的滚得动：只写了 overflow-x: hidden 的容器，overflow-y 算出来也是 auto
      if ((overflowY === 'auto' || overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight) {
        const overshoot = element.getBoundingClientRect().bottom - parent.getBoundingClientRect().bottom;
        if (overshoot > 0) {
          parent.scrollTop += overshoot + 12;
        }
        return;
      }
    }
  }, [reactionCount, notice]);

  return { ref, markAction: () => { actedAtRef.current = performance.now(); } };
}

/* ───────── 桌面 ───────── */

interface PickerAnchor {
  /** 选择器挂在哪个容器里（对话框的正文区），位置也相对它来算 */
  root: HTMLElement;
  /** 「+」按钮在容器里的位置 */
  left: number;
  top: number;
  bottom: number;
}

function DesktopReactionBar({ announcement }: { announcement: Announcement }): JSX.Element {
  const model = useAnnouncementReactions(announcement);
  const { reactions, quick, canAddNew, notice } = model;
  const { ref, markAction } = useRevealAfterAction(reactions.length, notice);
  const [picker, setPicker] = useState<PickerAnchor | null>(null);
  const toggle = (emoji: string): void => {
    markAction();
    model.toggle(emoji);
  };
  // 选择器开着的时候点「+」：按下的那一刻它已经被「点了外面」关掉了（MenuLayer 在捕获阶段听 mousedown），
  // 松开时的这一下 click 不能又把它打开。按下时看一眼是不是刚被这同一下关掉的，是的话这次 click 不算。
  const closedAtRef = useRef(0);
  const swallowClickRef = useRef(false);

  function closePicker(): void {
    closedAtRef.current = performance.now();
    setPicker(null);
  }

  function togglePicker(event: React.MouseEvent<HTMLElement>): void {
    // detail 为 0 是键盘触发的，没有前面那一下 mousedown
    if (swallowClickRef.current && event.detail > 0) {
      swallowClickRef.current = false;
      return;
    }
    if (picker) {
      closePicker();
      return;
    }
    // 回应栏在会滚动的正文里，选择器不能跟着被裁掉，所以挂到外面一层不滚动的对话框正文区
    const root = event.currentTarget.closest<HTMLElement>('.kui-dialog-body');
    if (!root) {
      return;
    }
    const bounds = root.getBoundingClientRect();
    const rect = event.currentTarget.getBoundingClientRect();
    setPicker({ root, left: rect.left - bounds.left, top: rect.top - bounds.top, bottom: rect.bottom - bounds.top });
  }

  return (
    <div ref={ref} className="kmd-ann-react">
      <div className="kmd-ann-reactions" role="group" aria-label="回应">
        {reactions.map((reaction) => (
          <button key={reaction.emoji} type="button" className={cx('kmd-ann-reaction', reaction.reacted_by_me && 'is-mine')} aria-pressed={reaction.reacted_by_me} aria-label={reactionLabel(reaction)} title={`${reaction.count} 人回应`} onClick={() => toggle(reaction.emoji)}>
            <span className="kmd-ann-reaction-emoji">{reaction.emoji}</span>
            <span>{formatReactionCount(reaction.count)}</span>
          </button>
        ))}
        {canAddNew ? (
          <>
            {quick.map((emoji) => (
              <button key={emoji} type="button" className="kmd-ann-reaction kmd-ann-reaction--quick" aria-label={`回应 ${emoji}`} onClick={() => toggle(emoji)}>
                <span className="kmd-ann-reaction-emoji">{emoji}</span>
              </button>
            ))}
            <button type="button" className={cx('kmd-ann-reaction kmd-ann-reaction--add', picker && 'is-open')} aria-label="选择其他表情" aria-haspopup="dialog" aria-expanded={picker !== null} onMouseDown={() => { swallowClickRef.current = performance.now() - closedAtRef.current < 60; }} onClick={togglePicker}>
              <Icon name="plus" className="h-3.5 w-3.5" />
            </button>
          </>
        ) : null}
      </div>
      {notice ? <p className="kmd-ann-react-notice" role="alert">{notice}</p> : null}
      {picker ? (
        <DesktopReactionPicker
          anchor={picker}
          reactions={reactions}
          onPick={(emoji) => {
            toggle(emoji);
            closePicker();
          }}
          onClose={closePicker}
        />
      ) : null}
    </div>
  );
}

const PICKER_GAP = 6;
const PICKER_MARGIN = 8;

/** 完整的 emoji 选择器。外观和消息回应的那个是同一套（kcd-popover / kcd-emoji-grid），只是挂在公告对话框里。 */
function DesktopReactionPicker({ anchor, reactions, onPick, onClose }: { anchor: PickerAnchor; reactions: AnnouncementReaction[]; onPick: (emoji: string) => void; onClose: () => void }): JSX.Element {
  const emojis = usePickerEmojis();
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  // 量出实际大小再定位：下面放得下就贴着「+」往下开，放不下往上开，左右夹在容器里
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const { offsetWidth: width, offsetHeight: height } = element;
    const { clientWidth: rootWidth, clientHeight: rootHeight } = anchor.root;
    const below = anchor.bottom + PICKER_GAP;
    const top = below + height + PICKER_MARGIN <= rootHeight ? below : Math.max(PICKER_MARGIN, anchor.top - PICKER_GAP - height);
    const left = Math.min(Math.max(PICKER_MARGIN, anchor.left), Math.max(PICKER_MARGIN, rootWidth - width - PICKER_MARGIN));
    setPosition({ left, top });
  }, [anchor]);

  // 正文一滚，「+」就不在原来的位置了，选择器跟着关掉（它自己里面的滚动不算）
  useEffect(() => {
    function onScroll(event: Event): void {
      if (!(event.target instanceof Node) || !ref.current?.contains(event.target)) {
        onClose();
      }
    }
    anchor.root.addEventListener('scroll', onScroll, true);
    return () => anchor.root.removeEventListener('scroll', onScroll, true);
  }, [anchor, onClose]);

  return createPortal(
    <MenuLayer onClose={onClose} className="absolute inset-0 z-50">
      <div ref={ref} role="dialog" aria-label="选择表情回应" style={position ? position : { left: 0, top: 0, visibility: 'hidden' }} className="kcd-popover kcd-reaction-picker kmd-ann-react-picker kui-scroll">
        <div className="kcd-emoji-grid kcd-emoji-grid--dense">
          {emojis.map((emoji) => {
            const mine = reactions.some((reaction) => reaction.emoji === emoji && reaction.reacted_by_me);
            return <button key={emoji} type="button" className={mine ? 'is-mine' : undefined} aria-pressed={mine} aria-label={mine ? `取消回应 ${emoji}` : `回应 ${emoji}`} onClick={() => onPick(emoji)}>{emoji}</button>;
          })}
        </div>
      </div>
    </MenuLayer>,
    anchor.root
  );
}

/* ───────── 手机 ───────── */

const MOBILE_PILL = 'flex h-8 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[13px] font-bold leading-none transition active:scale-95';
const MOBILE_ROUND = 'grid h-8 w-8 shrink-0 place-items-center rounded-full leading-none transition active:scale-95 [background:var(--kc-panel-muted)]';

function MobileReactionBar({ announcement }: { announcement: Announcement }): JSX.Element {
  const model = useAnnouncementReactions(announcement);
  const { reactions, quick, canAddNew, notice } = model;
  const emojis = usePickerEmojis();
  const [pickerOpen, setPickerOpen] = useState(false);
  const { ref, markAction } = useRevealAfterAction(reactions.length + Number(pickerOpen), notice);
  const toggle = (emoji: string): void => {
    markAction();
    model.toggle(emoji);
  };

  return (
    <div ref={ref} className="select-none">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="回应">
        {reactions.map((reaction) => (
          <button
            key={reaction.emoji}
            type="button"
            aria-pressed={reaction.reacted_by_me}
            aria-label={reactionLabel(reaction)}
            onClick={() => toggle(reaction.emoji)}
            className={`${MOBILE_PILL} ${reaction.reacted_by_me ? '[background:var(--kc-accent-soft)] [border-color:var(--kc-accent)] [color:var(--kc-accent)]' : '[background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-muted)]'}`}
          >
            <span className="text-[16px]">{reaction.emoji}</span>
            <span className="tabular-nums">{formatReactionCount(reaction.count)}</span>
          </button>
        ))}
        {canAddNew ? (
          <>
            {quick.map((emoji) => (
              <button key={emoji} type="button" aria-label={`回应 ${emoji}`} onClick={() => toggle(emoji)} className={`${MOBILE_ROUND} text-[17px]`}>{emoji}</button>
            ))}
            <button type="button" aria-label={pickerOpen ? '收起表情' : '选择其他表情'} aria-expanded={pickerOpen} onClick={() => {
              markAction();
              setPickerOpen(!pickerOpen);
            }} className={`${MOBILE_ROUND} [color:var(--kc-muted)]`}>
              <Icon name={pickerOpen ? 'close' : 'plus'} className="h-4 w-4" />
            </button>
          </>
        ) : null}
      </div>
      {notice ? <p className="mt-2 text-[12px] font-bold text-red-500" role="alert">{notice}</p> : null}
      {pickerOpen && canAddNew ? (
        <div className="mt-2.5 grid grid-cols-8 gap-1 rounded-[20px] border p-2 [background:var(--kc-panel)] [border-color:var(--kc-border)]">
          {emojis.map((emoji) => {
            const mine = reactions.some((reaction) => reaction.emoji === emoji && reaction.reacted_by_me);
            return (
              <button
                key={emoji}
                type="button"
                aria-pressed={mine}
                aria-label={mine ? `取消回应 ${emoji}` : `回应 ${emoji}`}
                onClick={() => {
                  toggle(emoji);
                  setPickerOpen(false);
                }}
                className={`grid aspect-square place-items-center rounded-xl text-[20px] leading-none transition active:scale-90 ${mine ? '[background:var(--kc-accent-soft)]' : ''}`}
              >
                {emoji}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
