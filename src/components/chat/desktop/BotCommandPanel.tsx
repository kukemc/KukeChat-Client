import { useEffect, useRef } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import type { Bot, BotInstallation } from '@/types/api';
import { parseBotCommands, type BotCommand } from '@/utils/botCommands';
import { BotCommandSignature } from './BotCommandHint';
import { cx } from './runtime';

export interface BotCommandOption extends BotCommand {
  bot: Bot;
}

/** 本群可用机器人的全部指令，按机器人顺序摊平。面板的选中项和键盘上下键共用这一个下标。 */
export function botCommandOptions(installations: BotInstallation[] | undefined): BotCommandOption[] {
  return (installations ?? []).flatMap((installation) => {
    const bot = installation.bot;
    return bot && installation.enabled && bot.status !== 'disabled' ? parseBotCommands(bot.commands).map((item) => ({ ...item, bot })) : [];
  });
}

interface BotCommandPanelProps {
  /** 不能为空：没有可选的指令时由调用方收起面板 */
  options: BotCommandOption[];
  activeIndex: number;
  onActiveChange: (index: number) => void;
  onPick: (option: BotCommandOption) => void;
  onClose: () => void;
}

/**
 * 输入框上方的机器人指令面板：左列选机器人，右边是它的指令。
 * 焦点始终留在输入框里，上下键、回车和 Esc 由 Composer 接住再转成这里的 props。
 */
export function BotCommandPanel({ options, activeIndex, onActiveChange, onPick, onClose }: BotCommandPanelProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const activeRowRef = useRef<HTMLButtonElement | null>(null);
  const activeBot = options[activeIndex].bot;
  const bots = options.reduce<Array<{ bot: Bot; first: number }>>((list, option, index) => {
    if (list[list.length - 1]?.bot.id !== option.bot.id) {
      list.push({ bot: option.bot, first: index });
    }
    return list;
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent): void {
      const root = rootRef.current;
      if (root && !event.composedPath().includes(root)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [onClose]);

  useEffect(() => {
    // 自己算滚动量而不用 scrollIntoView：后者会连带滚动扩展所在的宿主页面
    const list = listRef.current;
    const row = activeRowRef.current;
    if (!list || !row) {
      return;
    }
    const listRect = list.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    if (rowRect.top < listRect.top) {
      list.scrollTop += rowRect.top - listRect.top;
    } else if (rowRect.bottom > listRect.bottom) {
      list.scrollTop += rowRect.bottom - listRect.bottom;
    }
  }, [activeIndex, options]);

  return (
    // 按下时不让输入框失焦，键盘选择才能接着用
    <div ref={rootRef} className="kcb-panel" onMouseDown={(event) => event.preventDefault()}>
      <div className="kcb-panel-bots kui-scroll">
        {bots.map(({ bot, first }) => (
          <button key={bot.id} type="button" className={cx('kcb-panel-bot', bot.id === activeBot.id && 'is-active')} title={bot.name} aria-label={bot.name} aria-pressed={bot.id === activeBot.id} onClick={() => onActiveChange(first)}>
            <Avatar user={bot.user} label={bot.name} avatarUrl={bot.avatar_url} size="sm" />
          </button>
        ))}
      </div>
      <div className="kcb-panel-main">
        <div className="kcb-panel-title">{activeBot.name}</div>
        <div ref={listRef} className="kcb-panel-list kui-scroll" role="listbox" aria-label={`${activeBot.name} 的指令`}>
          {options.map((option, index) => (option.bot.id === activeBot.id ? (
            <button
              key={index}
              ref={index === activeIndex ? activeRowRef : undefined}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={cx('kcb-command', index === activeIndex && 'is-active')}
              // 用 mousemove 而不是 mouseenter：键盘翻动带着列表滚动时，停着不动的鼠标不该把选中项抢走
              onMouseMove={() => {
                if (index !== activeIndex) {
                  onActiveChange(index);
                }
              }}
              onClick={() => onPick(option)}
            >
              <span className="kcb-command-name"><BotCommandSignature command={option} /></span>
              {option.description ? <span className="kcb-command-desc" title={option.description}>{option.description}</span> : null}
            </button>
          ) : null))}
        </div>
      </div>
    </div>
  );
}
