import { useMemo, useRef, useState } from 'react';
import { MenuLayer } from '@/components/ui/ContextMenu';
import type { Message } from '@/types/api';
import { clampOverlayPosition } from '../../message/chatDom';
import type { ReactionPickerState } from '../../message/types';
import { DEFAULT_FREQUENT_REACTIONS, REACTION_CATEGORIES, type ReactionCategory } from './reactionEmojis';
import { readRecentReactions, rememberReaction } from './reactionRecent';

/** 面板固定尺寸，用来把它夹在聊天区范围内（和 desktop-reactions.css 里的宽高一致）。 */
const PICKER_WIDTH = 352;
const PICKER_HEIGHT = 388;

// Windows 自带的 Segoe UI Emoji 不画国旗，只会显示成两个字母，那边干脆不给国旗页
const HIDE_FLAGS = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);

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

  const mine = useMemo(() => new Set((picker.message.reactions ?? []).filter((reaction) => reaction.reacted_by_me).map((reaction) => reaction.emoji)), [picker.message.reactions]);

  function pick(emoji: string): void {
    if (!mine.has(emoji)) {
      rememberReaction(emoji);
    }
    onPick(picker.message, emoji);
  }

  function jump(id: string): void {
    const scroller = scrollRef.current;
    const section = sectionRefs.current.get(id);
    if (!scroller || !section) {
      return;
    }
    setActive(id);
    jumpUntil.current = Date.now() + 450;
    scroller.scrollTo({ top: section.offsetTop - scroller.offsetTop, behavior: 'smooth' });
  }

  // 滚动时让页签跟着走：最后一个顶边已经滚过可视区顶部的分类就是当前分类
  function onScroll(): void {
    const scroller = scrollRef.current;
    if (!scroller || Date.now() < jumpUntil.current) {
      return;
    }
    const top = scroller.scrollTop + 12;
    let current = categories[0].id;
    for (const category of categories) {
      const section = sectionRefs.current.get(category.id);
      if (section && section.offsetTop - scroller.offsetTop <= top) {
        current = category.id;
      }
    }
    // 滚到底时最后几个分类可能顶不到上面，直接算最后一个
    if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) {
      current = categories[categories.length - 1].id;
    }
    setActive((previous) => (previous === current ? previous : current));
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
          {categories.map((category) => (
            <section
              key={category.id}
              ref={(node) => {
                if (node) {
                  sectionRefs.current.set(category.id, node);
                } else {
                  sectionRefs.current.delete(category.id);
                }
              }}
              className="kcrp-section"
            >
              <h3 className="kcrp-title">{category.title}</h3>
              <div className="kcrp-grid">
                {category.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className={mine.has(emoji) ? 'is-mine' : undefined}
                    onClick={() => pick(emoji)}
                    title={mine.has(emoji) ? '已回应，再点取消' : undefined}
                    aria-label={mine.has(emoji) ? `取消回应 ${emoji}` : `回应 ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </MenuLayer>
  );
}
