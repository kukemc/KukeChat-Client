import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { MenuLayer } from '@/components/ui/ContextMenu';
import type { Message } from '@/types/api';
import { clampOverlayPosition } from '../../message/chatDom';
import type { ReactionPickerState } from '../../message/types';
import { useEvent } from '../runtime';
import { DEFAULT_FREQUENT_REACTIONS, REACTION_CATEGORIES, type ReactionCategory } from './reactionEmojis';
import { readRecentReactions, rememberReaction } from './reactionRecent';

/** 面板固定尺寸，用来把它夹在聊天区范围内（和 desktop-reactions.css 里的宽高一致）。 */
const PICKER_WIDTH = 352;
const PICKER_HEIGHT = 388;

/** 一格的行高和格间距（和 desktop-reactions.css 里 .kcrp-grid 的 grid-auto-rows / gap 一致），用来给还没挂上的分类占位。 */
const CELL_ROW = 39;
const CELL_GAP = 2;
const COLUMNS = 8;

/** 打开时直接画出来的分类数：最近使用 + 第一个分类，正好铺满首屏。其余的等浏览器空闲再分批挂上。 */
const INITIAL_SECTIONS = 2;
/** 空闲时每批挂几个分类，一批控制在一帧以内。 */
const SECTIONS_PER_IDLE = 2;

// Windows 自带的 Segoe UI Emoji 不画国旗，只会显示成两个字母，那边干脆不给国旗页
const HIDE_FLAGS = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);

function gridHeight(count: number): number {
  const rows = Math.ceil(count / COLUMNS);
  return rows > 0 ? rows * CELL_ROW + (rows - 1) * CELL_GAP : 0;
}

type IdleHandle = { cancel: () => void };

/** requestIdleCallback，没有的环境退回 setTimeout。timeout 保证再忙也会在这么久之后执行。 */
function whenIdle(callback: () => void, timeout: number): IdleHandle {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(callback, { timeout });
    return { cancel: () => window.cancelIdleCallback(id) };
  }
  const id = window.setTimeout(callback, 16);
  return { cancel: () => window.clearTimeout(id) };
}

const EMOJI_FONT = "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";
let prewarmStarted = false;

/**
 * 预热彩色表情字体。Windows 上 Segoe UI Emoji 的每个字形第一次排版都很贵（要取彩色字形的边界，实测约 2ms 一个），
 * 原来面板第一次打开时近 500 个表情一起排，主线程要卡一秒多；之后同一字号再排就很快。
 * 所以聊天面板挂上以后，趁空闲把面板会用到的表情按面板里的字号（格子 23px、页签 17px）在屏幕外排一遍，
 * 分类标题（加粗中文小字，第一次用要现读一个十几兆的粗体字体文件）也一起。
 * 每次空闲只做几毫秒，做完就把节点删掉。整个应用只做一次，重复调用无效。
 *
 * container 传面板将来挂在的那个节点（聊天区的浮层根）：字体缓存按完整的字体描述区分，
 * 继承来的 -webkit-font-smoothing 之类不一样就等于没预热。不传时挂在 body 上，并补上桌面端的抗锯齿设置。
 */
export function prewarmReactionPicker(container?: HTMLElement | null): void {
  if (prewarmStarted || typeof document === 'undefined') {
    return;
  }
  prewarmStarted = true;
  const categories = REACTION_CATEGORIES.filter((category) => !(HIDE_FLAGS && category.id === 'flags'));
  const jobs: Array<{ className?: string; size?: number; text: string }> = [
    { className: 'kcrp-title', text: ['最近使用', '常用', ...categories.map((category) => category.title)].join(' ') },
    { size: 17, text: ['🕘', ...categories.map((category) => category.icon)].join(' ') }
  ];
  const grid = [...new Set([...readRecentReactions(), ...DEFAULT_FREQUENT_REACTIONS, ...categories.flatMap((category) => category.emojis)])];
  // 用空格隔开：浏览器按「词」缓存排版结果，面板里每个按钮就是单独一个表情
  for (let index = 0; index < grid.length; index += 4) {
    jobs.push({ size: 23, text: grid.slice(index, index + 4).join(' ') });
  }
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:400px;visibility:hidden;pointer-events:none;contain:layout style;line-height:1';
  if (!container) {
    host.style.setProperty('-webkit-font-smoothing', 'antialiased');
  }
  (container ?? document.body).appendChild(host);
  const step = (): void => {
    // 容器在预热途中被卸掉了（比如切走了聊天）：停下，下次再从头来
    if (!host.isConnected) {
      prewarmStarted = false;
      return;
    }
    const until = performance.now() + 8;
    while (jobs.length > 0 && performance.now() < until) {
      const job = jobs.shift() as { className?: string; size?: number; text: string };
      const span = document.createElement('span');
      if (job.className) {
        span.className = job.className;
      } else {
        span.style.fontFamily = EMOJI_FONT;
        span.style.fontSize = `${job.size}px`;
      }
      span.textContent = job.text;
      host.appendChild(span);
      // 读一次尺寸逼浏览器现在就排版（宿主在屏幕外、隐藏且 contain 住，只排这一小块）
      void span.offsetWidth;
    }
    if (jobs.length > 0) {
      whenIdle(step, 2000);
    } else {
      host.remove();
    }
  };
  whenIdle(step, 2000);
}

interface ReactionPickerPanelProps {
  picker: ReactionPickerState;
  overlayRoot: HTMLElement | null;
  onPick: (message: Message, emoji: string) => void;
  onClose: () => void;
}

/**
 * 「添加表情回应」的完整面板：顶部分类页签，下面整块可滚动，第一组是最近使用（没记录时是默认常用）。
 * 点一个就交给 onPick（沿用原来的切换逻辑：已经回应过的再点一次是取消），新加的回应记进最近使用。
 * Esc、点面板外面都会关（MenuLayer 负责）。
 *
 * 性能：一次挂近 500 个按钮会让打开卡上几百毫秒（主要是样式和布局），所以首帧只画最近使用和第一个分类，
 * 其余分类先放同样高度的占位块（跳转位置不受影响），空闲时分批挂上；每个分类块带 content-visibility: auto，
 * 滚不到的不参与布局和绘制。页签跟随用 IntersectionObserver，不在滚动事件里逐个量分类位置。
 */
export function ReactionPickerPanel({ picker, overlayRoot, onPick, onClose }: ReactionPickerPanelProps): JSX.Element {
  const position = clampOverlayPosition(picker, PICKER_WIDTH, PICKER_HEIGHT, overlayRoot);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  // 点页签平滑滚动的那一小段时间里不跟滚动改页签，不然高亮会从中间几个分类上一路闪过去
  const jumpUntil = useRef(0);

  // 打开时取一次最近使用；面板开着的时候不跟着变，免得格子挪位置
  const categories = useMemo<ReactionCategory[]>(() => {
    const recent = readRecentReactions();
    const frequent: ReactionCategory = recent.length > 0
      ? { id: 'recent', title: '最近使用', icon: '🕘', emojis: recent }
      : { id: 'recent', title: '常用', icon: '🕘', emojis: DEFAULT_FREQUENT_REACTIONS };
    return [frequent, ...REACTION_CATEGORIES.filter((category) => !(HIDE_FLAGS && category.id === 'flags'))];
  }, []);
  const [active, setActive] = useState(categories[0].id);
  const [mounted, setMounted] = useState(Math.min(INITIAL_SECTIONS, categories.length));

  // 已回应的表情拼成字符串传下去：消息对象换了但回应没变时，分类块不用重画
  const mineKey = useMemo(() => (picker.message.reactions ?? []).filter((reaction) => reaction.reacted_by_me).map((reaction) => reaction.emoji).join('\n'), [picker.message.reactions]);

  const pick = useEvent((emoji: string, alreadyMine: boolean) => {
    if (!alreadyMine) {
      rememberReaction(emoji);
    }
    onPick(picker.message, emoji);
  });

  // 万一聊天面板那边还没来得及预热（或者没调），打开时补上，后面滚到的分类就不会再卡
  useEffect(() => prewarmReactionPicker(overlayRoot), [overlayRoot]);

  // 首帧画完以后，空闲时分批把剩下的分类挂上
  useEffect(() => {
    if (mounted >= categories.length) {
      return;
    }
    const handle = whenIdle(() => setMounted((count) => Math.min(categories.length, count + SECTIONS_PER_IDLE)), 300);
    return handle.cancel;
  }, [mounted, categories.length]);

  // 页签跟随：在滚动区顶部往下 12px 处放一条 1px 的线，压在哪个分类上哪个就是当前分类
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || typeof IntersectionObserver === 'undefined') {
      return;
    }
    const onLine = new Set<string>();
    const order = new Map(categories.map((category, index) => [category.id, index]));
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.category ?? '';
        if (entry.isIntersecting) {
          onLine.add(id);
        } else {
          onLine.delete(id);
        }
      }
      if (onLine.size === 0 || Date.now() < jumpUntil.current || atBottom(scroller)) {
        return;
      }
      const current = [...onLine].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)).pop() as string;
      setActive(current);
    }, { root: scroller, rootMargin: `-12px 0px ${-(scroller.clientHeight - 13)}px 0px`, threshold: 0 });
    for (const section of sectionRefs.current.values()) {
      observer.observe(section);
    }
    return () => observer.disconnect();
  }, [categories]);

  function jump(id: string): void {
    const scroller = scrollRef.current;
    const section = sectionRefs.current.get(id);
    if (!scroller || !section) {
      return;
    }
    // 占位块和真实高度一样，位置已经是对的；顺手把剩下的都挂上，滚到的时候不是空的
    setMounted(categories.length);
    setActive(id);
    jumpUntil.current = Date.now() + 450;
    scroller.scrollTo({ top: section.offsetTop - scroller.offsetTop, behavior: 'smooth' });
  }

  // 滚到底时最后几个分类可能顶不到那条线，直接算最后一个。这里只读滚动区自己的尺寸，不量分类
  function onScroll(): void {
    const scroller = scrollRef.current;
    if (!scroller || Date.now() < jumpUntil.current || !atBottom(scroller)) {
      return;
    }
    setActive(categories[categories.length - 1].id);
  }

  return (
    <MenuLayer onClose={onClose} className="absolute inset-0 z-50">
      <div role="dialog" aria-label="添加表情回应" onMouseDown={(event) => event.stopPropagation()} style={position} className="kcd-popover kcrp-picker">
        <div className="kcrp-tabs" role="tablist">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              role="tab"
              aria-selected={active === category.id}
              title={category.title}
              aria-label={category.title}
              className={`kcrp-tab ${active === category.id ? 'is-active' : ''}`}
              onClick={() => jump(category.id)}
            >
              <span className="kcrp-tab-icon">{category.icon}</span>
            </button>
          ))}
        </div>
        <div ref={scrollRef} className="kcrp-scroll scroll-soft" onScroll={onScroll}>
          {categories.map((category, index) => (
            <section
              key={category.id}
              data-category={category.id}
              ref={(node) => {
                if (node) {
                  sectionRefs.current.set(category.id, node);
                } else {
                  sectionRefs.current.delete(category.id);
                }
              }}
              className="kcrp-section"
              style={{ containIntrinsicBlockSize: `auto ${gridHeight(category.emojis.length) + 32}px` }}
            >
              <h3 className="kcrp-title">{category.title}</h3>
              {index < mounted
                ? <ReactionGrid emojis={category.emojis} mineKey={mineKey} onPick={pick} />
                : <div aria-hidden="true" style={{ height: gridHeight(category.emojis.length) }} />}
            </section>
          ))}
        </div>
      </div>
    </MenuLayer>
  );
}

function atBottom(scroller: HTMLElement): boolean {
  return scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
}

/** 一个分类的表情格。页签切换、空闲挂载都不会让已经画好的格子重画。 */
const ReactionGrid = memo(function ReactionGrid({ emojis, mineKey, onPick }: { emojis: string[]; mineKey: string; onPick: (emoji: string, alreadyMine: boolean) => void }): JSX.Element {
  const mine = useMemo(() => new Set(mineKey ? mineKey.split('\n') : []), [mineKey]);
  return (
    <div className="kcrp-grid">
      {emojis.map((emoji) => {
        const isMine = mine.has(emoji);
        return (
          <button
            key={emoji}
            type="button"
            className={isMine ? 'is-mine' : undefined}
            onClick={() => onPick(emoji, isMine)}
            title={isMine ? '已回应，再点取消' : undefined}
            aria-label={isMine ? `取消回应 ${emoji}` : `回应 ${emoji}`}
          >
            {emoji}
          </button>
        );
      })}
    </div>
  );
});
