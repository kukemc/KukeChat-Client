import { type ClipboardEvent, type KeyboardEvent, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import type { PostTopic, User } from '@/types/api';
import { type SuggestionRect, placeSuggestions, useMentionInput } from '../postForms';
import { DialogLayerContext } from './PostDialog';

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onPaste?: (event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  /** 单行输入框里按回车时调用（候选列表开着的时候不触发） */
  onEnter?: () => void;
  friends: User[];
  topics: PostTopic[];
  multiline?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  maxLength: number;
  placeholder: string;
  className?: string;
}

/** 能联想 @ 好友和 # 话题的输入框。 */
export function MentionInput({ value, onChange, onPaste, onEnter, friends, topics, multiline = false, disabled = false, autoFocus = false, maxLength, placeholder, className = '' }: MentionInputProps): JSX.Element {
  const layer = useContext(DialogLayerContext);
  const [rect, setRect] = useState<SuggestionRect | null>(null);
  const { inputRef, fieldProps, focused, trigger, query, friendMatches, topicMatches, exactTopicExists, topicSearchPending, chooseMention, chooseTopic } = useMentionInput({ value, onChange, friends, topics });
  const open = focused && Boolean(trigger);

  // 在对话框里：候选列表挂到遮罩层上，位置跟着输入框走
  useEffect(() => {
    if (!open || !layer) {
      return undefined;
    }
    function update(): void {
      if (layer && inputRef.current) {
        setRect(placeSuggestions(inputRef.current, layer));
      }
    }
    update();
    window.addEventListener('resize', update);
    layer.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      layer.removeEventListener('scroll', update, true);
    };
  }, [inputRef, layer, open, value]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && onEnter && !open && !event.nativeEvent.isComposing) {
      event.preventDefault();
      onEnter();
    }
  }

  const commonProps = { ...fieldProps, onPaste, onKeyDown: multiline ? undefined : handleKeyDown, disabled, autoFocus, maxLength, placeholder };
  const layered = Boolean(layer);
  const popup = open && trigger && (!layered || rect) ? (
    // 按下时不让输入框失焦，也不让这一下冒到遮罩上把对话框关掉
    <div
      role="listbox"
      className={`kui-menu kui-scroll kpo-suggest ${layered ? 'is-layered' : ''}`}
      style={layered && rect ? { left: rect.left, top: rect.top, width: Math.min(rect.width, 280), maxHeight: rect.maxHeight, transform: rect.placement === 'top' ? 'translateY(-100%)' : undefined } : undefined}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {trigger.type === 'mention' ? (
        friendMatches.length > 0 ? friendMatches.map((user) => (
          <button key={user.id} type="button" role="option" aria-selected={false} className="kui-menu-item" onClick={() => chooseMention(user)}>
            <span className="kpo-avatar-xs"><Avatar user={user} size="sm" /></span>
            <span className="kpo-clip">@{getDisplayName(user)}</span>
          </button>
        )) : <p className="kpo-suggest-note">没有匹配的好友</p>
      ) : (
        <>
          {topicSearchPending ? <p className="kpo-suggest-note">正在搜索话题…</p> : null}
          {topicMatches.map((topic) => (
            <button key={topic.id} type="button" role="option" aria-selected={false} className="kui-menu-item" onClick={() => chooseTopic(topic.name)}>
              <span className="kpo-clip">#{topic.name}</span>
              <span className="kui-menu-suffix">{topic.post_count}</span>
            </button>
          ))}
          {query && !topicSearchPending && !exactTopicExists ? <button type="button" role="option" aria-selected={false} className="kui-menu-item is-selected" onClick={() => chooseTopic(trigger.query)}><span className="kpo-clip">创建新话题 #{trigger.query}</span></button> : null}
          {!query && topicMatches.length === 0 ? <p className="kpo-suggest-note">输入话题名称</p> : null}
        </>
      )}
    </div>
  ) : null;

  return (
    <div className="kpo-mention">
      {multiline
        ? <textarea ref={(node) => { inputRef.current = node; }} {...commonProps} className={`kui-textarea kui-scroll ${className}`} />
        : <input ref={(node) => { inputRef.current = node; }} {...commonProps} className={`kui-input ${className}`} />}
      {popup && layer ? createPortal(popup, layer) : popup}
    </div>
  );
}
