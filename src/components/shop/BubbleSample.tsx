import { useMemo } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import { WRAP_ANYWHERE_CLASS } from '@/components/chat/message/constants';
import { renderMentionedText, renderQuoteBlock } from '@/components/chat/message/messageText';
import { Avatar } from '@/components/ui/Avatar';
import { useKukeStore } from '@/store/kukeStore';
import type { MessageQuoteMetadata } from '@/types/api';
import { bubbleSkinClass, parseBubbleSkin, type BubbleSkin } from './skin/bubbleSkin';
import { SkinDecor, useSkinSettings } from './skin/SkinDecor';
import { DEFAULT_PREVIEW_TEXT } from './labels';

/**
 * 商店里的气泡预览。不是仿画：桌面布局用的就是聊天消息行的那批类名（kcd-row / kcd-bubble …），
 * 移动布局用的是移动端消息列表的那一套，文字、链接、@、引用也走聊天里同一个渲染函数，
 * 所以主题、深浅色、圆角、背景材质怎么设，预览和真聊天里看到的是同一个样子。
 */

export interface SampleMessage {
  mine: boolean;
  text: string;
  /** 回复引用 */
  quote?: { name: string; text: string };
  /** 文字里要高亮成 @ 的名字 */
  mention?: string;
}

const OTHER_NAME = '阿夸';

/** 商品卡片上的两条：别人的一条、自己的一条，文字是商品的 preview_text。 */
export function cardSamples(previewText: string): SampleMessage[] {
  const text = previewText.trim() || DEFAULT_PREVIEW_TEXT;
  return [{ mine: false, text }, { mine: true, text }];
}

/** 试穿用的一段对话：纯文本、带链接、@、回复引用、长文本，别人的和自己的都有。 */
export function tryOnSamples(previewText: string): SampleMessage[] {
  const text = previewText.trim() || DEFAULT_PREVIEW_TEXT;
  return [
    { mine: false, text },
    { mine: true, text: `${text} 😄` },
    { mine: false, text: '作品发出来了，帮我看看 https://www.ccw.site/detail/6650a1b2c3d4e5f6a7b8c9d0' },
    { mine: true, text: `@${OTHER_NAME} 收到，晚上就去玩`, mention: OTHER_NAME, quote: { name: OTHER_NAME, text: '作品发出来了，帮我看看' } },
    { mine: false, text: '说一下思路：先把所有角色的坐标存进列表，每帧只更新移动过的那几个，然后用「碰到颜色」做粗筛，命中了再做精确判断。这样三百个克隆体也不会掉帧。', quote: { name: '我', text } },
    { mine: true, text: '学到了。\n第二行也看看换行的样子：周五晚上的接龙我来开头，大家记得带上自己的角色。' }
  ];
}

function quoteMetadata(quote: NonNullable<SampleMessage['quote']>): MessageQuoteMetadata {
  return { message_id: 0, sender_name: quote.name, preview: quote.text, type: 'text' } as MessageQuoteMetadata;
}

function content(message: SampleMessage): Array<string | JSX.Element> {
  return renderMentionedText(message.text, message.mention ? { mentionAll: false, mentions: [{ user_id: 0, name: message.mention }] } : undefined);
}

interface BubbleStageProps {
  /** 商品的 style，或者已经解析好的皮肤；null 表示不穿皮肤（主题默认的气泡） */
  style?: unknown;
  skin?: BubbleSkin | null;
  messages: SampleMessage[];
  layout: 'desktop' | 'mobile';
  /** 带不带头像。卡片上的小预览不带 */
  avatars?: boolean;
  /** 别人的那几条也穿这件皮肤（试穿时两边都看） */
  both?: boolean;
  className?: string;
}

export function BubbleStage({ style, skin: givenSkin, messages, layout, avatars = false, both = true, className }: BubbleStageProps): JSX.Element {
  const currentUser = useKukeStore((state) => state.currentUser);
  const { motion } = useSkinSettings();
  const skin = useMemo(() => (givenSkin !== undefined ? givenSkin : parseBubbleSkin(style)), [givenSkin, style]);

  if (layout === 'mobile') {
    return (
      <div className={cx('ksp-stage ksp-stage--mobile', className)} aria-hidden="true">
        {messages.map((message, index) => {
          const wear = skin && (message.mine || both) ? skin : null;
          const avatar = avatars ? <span className="h-9 w-9 shrink-0 rounded-full [&>*]:h-full [&>*]:w-full">{message.mine ? <Avatar user={currentUser} label={currentUser ? undefined : '我'} size="message" /> : <Avatar label={OTHER_NAME} toneKey={2} size="message" />}</span> : null;
          return (
            <div key={index} className={`kc-mobile-message-row flex w-full min-w-0 items-start gap-2 px-1 py-0.5 ${message.mine ? 'justify-end' : 'justify-start'}`}>
              {message.mine ? null : avatar}
              <div className={`kc-mobile-message-stack flex min-w-0 flex-col gap-0.5 ${message.mine ? 'items-end' : 'items-start'}`} style={{ flex: '0 1 auto', maxWidth: avatars ? '78%' : '88%' }}>
                <div style={wear?.vars} className={`kc-mobile-message-bubble min-w-0 max-w-full whitespace-pre-wrap rounded-[16px] px-3 py-2 text-[13px] leading-5 shadow-none ${message.mine ? 'rounded-tr-sm [background:var(--kc-bubble-out)] [color:var(--kc-text)]' : 'rounded-tl-sm [background:var(--kc-bubble-in)] [color:var(--kc-text)]'} ${WRAP_ANYWHERE_CLASS}${wear ? ` kcsk-m ${bubbleSkinClass(wear, message.mine)}` : ''}`}>
                  {wear ? <SkinDecor skin={wear} motion={motion} seed={index} /> : null}
                  {message.quote ? renderQuoteBlock(quoteMetadata(message.quote)) : null}
                  {content(message)}
                </div>
              </div>
              {message.mine ? avatar : null}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cx('kcd ksp-stage', className)} aria-hidden="true">
      {messages.map((message, index) => {
        const wear = skin && (message.mine || both) ? skin : null;
        return (
          <div key={index} className="kcd-item">
            <div className={cx('kcd-row', message.mine && 'is-mine')}>
              {avatars ? <div className="kcd-avatar-slot"><span className="kcd-avatar">{message.mine ? <Avatar user={currentUser} label={currentUser ? undefined : '我'} size="message" /> : <Avatar label={OTHER_NAME} toneKey={2} size="message" />}</span></div> : null}
              <div className="kcd-main">
                <div className="kcd-line">
                  <div className={cx('kcd-content kcd-bubble', wear && bubbleSkinClass(wear, message.mine))} style={wear?.vars}>
                    {wear ? <SkinDecor skin={wear} motion={motion} seed={index} /> : null}
                    {message.quote ? <span className="kcd-quote"><span className="kcd-quote-name">{message.quote.name}</span><span className="kcd-quote-text">{message.quote.text}</span></span> : null}
                    <div className="kcd-text kcd-text--pre">{content(message)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
