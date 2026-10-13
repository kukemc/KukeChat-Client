import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getDesktopPortalRoot } from '@/components/ui/desktop/Modal';
import { useKukeStore } from '@/store/kukeStore';
import { useUserLevel } from './data';
import { formatDays, formatRank } from './labels';
import { LevelIcons } from './LevelIcons';

interface HoverTarget {
  element: HTMLElement;
  level: number;
  userId: number | null;
  self: boolean;
  /** 点开的（而不是悬停出来的）：鼠标移开不收，点别处才收 */
  pinned: boolean;
}

const SHOW_DELAY_MS = 320;
const HIDE_DELAY_MS = 160;
const EDGE = 8;

function readTarget(node: EventTarget | null): HoverTarget | null {
  const element = node instanceof Element ? node.closest<HTMLElement>('[data-klv]') : null;
  if (!element) {
    return null;
  }
  const level = Number(element.dataset.klv);
  if (!Number.isFinite(level) || level < 1) {
    return null;
  }
  const userId = Number(element.dataset.klvUid);
  return { element, level, userId: Number.isFinite(userId) && userId > 0 ? userId : null, self: element.dataset.klvSelf !== undefined, pinned: false };
}

/**
 * 等级图标的小卡片：悬停（桌面）或点一下（触屏）昵称旁的等级图标，弹出完整的图标串和「Lv.23 · 累计活跃 631.5 天」。
 * 点自己的图标直接进等级页。
 *
 * 整个界面只挂一个（在 ChatDashboard 里）。它在自己所在的根（文档，或者扩展形态下的 Shadow Root）上监听鼠标事件，
 * 靠 LevelIcons 写在元素上的 data-klv 认出目标 —— 所以聊天里成百上千个图标自己一个事件都不用绑。
 * 累计活跃天不在用户对象上，卡片出来之后才去取（GET /users/{id}/level，取过的一分钟内不再取）。
 */
export function LevelHoverCard(): JSX.Element {
  const probeRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<HoverTarget | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const openLevel = useKukeStore((state) => state.openLevel);
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    const root = probeRef.current?.getRootNode();
    if (!root) {
      return undefined;
    }
    let showTimer = 0;
    let hideTimer = 0;
    let touching = false;
    const inCard = (node: EventTarget | null): boolean => node instanceof Node && Boolean(cardRef.current?.contains(node));

    const onPointerDown = (event: Event): void => {
      touching = (event as PointerEvent).pointerType === 'touch';
    };
    const onOver = (event: Event): void => {
      if (inCard(event.target)) {
        window.clearTimeout(hideTimer);
        return;
      }
      // 触屏上点一下也会补发 mouseover：那边只认点击，不然点成员列表的一行会同时冒出卡片
      const next = touching ? null : readTarget(event.target);
      if (!next) {
        return;
      }
      window.clearTimeout(hideTimer);
      if (targetRef.current?.element === next.element) {
        return;
      }
      window.clearTimeout(showTimer);
      showTimer = window.setTimeout(() => setTarget((current) => (current?.pinned ? current : next)), SHOW_DELAY_MS);
    };
    const onOut = (event: Event): void => {
      const from = readTarget(event.target);
      if (!from && !inCard(event.target)) {
        return;
      }
      const to = (event as MouseEvent).relatedTarget;
      if (inCard(to) || (from && to instanceof Node && from.element.contains(to))) {
        return;
      }
      window.clearTimeout(showTimer);
      hideTimer = window.setTimeout(() => setTarget((current) => (current?.pinned ? current : null)), HIDE_DELAY_MS);
    };
    const onClick = (event: Event): void => {
      if (inCard(event.target)) {
        return;
      }
      const next = readTarget(event.target);
      window.clearTimeout(showTimer);
      if (!next) {
        setTarget((current) => (current ? null : current));
        return;
      }
      // 在别的按钮里的图标（成员列表的一行）：点击是那个按钮的事
      if (next.element.dataset.klvPassive !== undefined) {
        setTarget(null);
        return;
      }
      if (next.self) {
        setTarget(null);
        // 多选消息时整行的点击是「选中」，不跳走
        if (!next.element.closest('.is-selecting')) {
          openLevel('me');
        }
        return;
      }
      setTarget((current) => (current?.element === next.element && current.pinned ? null : { ...next, pinned: true }));
    };
    const onScroll = (): void => {
      window.clearTimeout(showTimer);
      setTarget((current) => (current ? null : current));
    };

    root.addEventListener('pointerdown', onPointerDown, true);
    root.addEventListener('mouseover', onOver);
    root.addEventListener('mouseout', onOut);
    root.addEventListener('click', onClick);
    root.addEventListener('scroll', onScroll, true);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
      root.removeEventListener('pointerdown', onPointerDown, true);
      root.removeEventListener('mouseover', onOver);
      root.removeEventListener('mouseout', onOut);
      root.removeEventListener('click', onClick);
      root.removeEventListener('scroll', onScroll, true);
    };
  }, [openLevel]);

  // 贴着图标往下弹，放不下就翻到上面；左右收进窗口里。卡片的内容（累计活跃天）到了之后会变宽，所以每次渲染后都重新量
  useLayoutEffect(() => {
    const card = cardRef.current;
    const layer = card?.parentElement;
    if (!target || !card || !layer) {
      setPosition(null);
      return;
    }
    if (!target.element.isConnected) {
      setTarget(null);
      return;
    }
    const bounds = layer.getBoundingClientRect();
    const anchor = target.element.getBoundingClientRect();
    const maxLeft = Math.max(EDGE, bounds.width - card.offsetWidth - EDGE);
    const left = Math.round(Math.min(Math.max(anchor.left - bounds.left + anchor.width / 2 - card.offsetWidth / 2, EDGE), maxLeft));
    const below = anchor.bottom - bounds.top + 6;
    const top = Math.round(below + card.offsetHeight + EDGE > bounds.height ? Math.max(EDGE, anchor.top - bounds.top - card.offsetHeight - 6) : below);
    setPosition((current) => (current?.left === left && current.top === top ? current : { left, top }));
  });

  return (
    <>
      <span ref={probeRef} hidden />
      {target ? createPortal(
        <div className="klv-pop-layer">
          <div ref={cardRef} className="kui klv-pop" role="tooltip" data-level-pop={target.level} style={position ? position : { visibility: 'hidden' }}>
            <PopContent target={target} onOpenLevel={() => {
              setTarget(null);
              openLevel('me');
            }} />
          </div>
        </div>,
        getDesktopPortalRoot()
      ) : null}
    </>
  );
}

function PopContent({ target, onOpenLevel }: { target: HoverTarget; onOpenLevel: () => void }): JSX.Element {
  const query = useUserLevel(target.userId);
  const card = query.data;
  // 卡片上的等级以图标上的为准：它和昵称旁边画的是同一个数，等级卡的缓存可能还是升级之前的
  return (
    <>
      <LevelIcons level={target.level} variant="full" size={18} plain />
      <p className="klv-pop-title"><b>Lv.{target.level}</b>{card ? <span> · 累计活跃 {formatDays(card.active_days)} 天</span> : target.userId !== null && query.isLoading ? <span> · 正在读取…</span> : null}</p>
      {card ? <p className="klv-pop-sub">连续活跃 {card.streak} 天 · 全站{formatRank(card.rank) === '—' ? '名次 —' : formatRank(card.rank)}</p> : null}
      {target.self ? <button type="button" className="kui-link klv-pop-link" onClick={onOpenLevel}>查看我的等级</button> : null}
    </>
  );
}
