import type { ReactNode } from 'react';
import { looksLikeDsl, mayContainDsl, splitDslFences } from '@/gandiDsl';
import type { MessageMentionMetadata } from '@/types/api';
import { renderMentionedText } from '../message/messageText';
import { DslBlockCard } from './DslBlockCard';
import { useDslDetect } from './useDslRender';

type MentionData = { mentions: MessageMentionMetadata[]; mentionAll: boolean } | undefined;

/**
 * 文字消息的正文：带 ```gandi-dsl（```gandi、```dsl）围栏的部分画成积木卡片，其余照常；
 * 没有围栏、但整条消息就是一段积木文本的，也画成积木（识别规则见 src/gandiDsl/engine.ts 的 detectDsl）。
 */
function DslMessageText({ content, mentionData }: { content: string; mentionData: MentionData }): JSX.Element {
  const segments = splitDslFences(content);
  const detected = useDslDetect(content, segments === null && looksLikeDsl(content));
  if (segments) {
    return (
      <>
        {segments.map((segment, index) => segment.kind === 'dsl'
          ? <DslBlockCard key={`dsl-${index}`} code={segment.code} />
          : <span key={`text-${index}`} className="kdsl-text">{renderMentionedText(segment.text, mentionData)}</span>)}
      </>
    );
  }
  if (detected) {
    return <DslBlockCard code={content.trim()} />;
  }
  return <>{renderMentionedText(content, mentionData)}</>;
}

/** 替代 renderMentionedText 用在消息正文上：可能有积木时交给 DslMessageText，否则原样（不多一层组件）。 */
export function renderMessageText(content: string, mentionData?: MentionData): ReactNode {
  if (!mayContainDsl(content)) {
    return renderMentionedText(content, mentionData);
  }
  return <DslMessageText content={content} mentionData={mentionData} />;
}
