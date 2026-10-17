import { memo, useMemo, useRef, useState, type ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { MAX_GROUP_EMOJIS, type GroupEmoji } from '@/api/groupEmojis';
import type { FavoriteStickerItem } from '@/api/messages';
import { Icon } from '@/components/ui/Icon';
import { resolveMessageImagePreviewUrl } from '../../message/messageMeta';
import { EMOJI_SECTIONS, SEARCH_SUGGESTIONS, emojiEntry, searchEmojis, type EmojiEntry } from './emojiData';
import type { RecentEmojis, StickerItem } from './emojiPrefs';
import { FAVORITE_IMAGE_TYPES, type PendingFavorite } from './useFavoriteStickers';
import { useGroupEmojis } from './useGroupEmojis';
import { modKeyCombo } from '@/utils/platform';

/** 表情面板的各个分类页。它们只管展示；选中、右键之后做什么由面板决定。 */

export type StickerSource = 'favorites' | 'group' | 'recent';
type PickEmoji = (glyph: string) => void;
type SendSticker = (item: StickerItem) => void;
export type OpenStickerMenu = (event: React.MouseEvent<HTMLElement>, item: StickerItem, source: StickerSource) => void;

interface StickerPageProps {
  /** 上一条还在发送时不能再发 */
  disabled: boolean;
  onSend: SendSticker;
  onMenu: OpenStickerMenu;
}

const EmojiButton = memo(function EmojiButton({ entry, onPick }: { entry: EmojiEntry; onPick: PickEmoji }): JSX.Element {
  return (
    <button
      type="button"
      className="kce-emoji"
      data-kce-preview="emoji"
      data-name={entry.name}
      aria-label={`插入表情 ${entry.name || entry.glyph}`}
      // 不让按钮拿走焦点：光标留在输入框里，连着点就能连着插入
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onPick(entry.glyph)}
    >{entry.glyph}</button>
  );
});

const StickerButton = memo(function StickerButton({ item, source, disabled, onSend, onMenu, onBroken }: StickerPageProps & { item: StickerItem; source: StickerSource; onBroken?: (item: StickerItem) => void }): JSX.Element {
  const src = resolveMessageImagePreviewUrl(item.url);
  return (
    <button type="button" className="kce-sticker" data-kce-preview="img" data-src={src} data-name={item.name} aria-label={item.name ? `发送表情 ${item.name}` : '发送表情'} disabled={disabled} onClick={() => onSend(item)} onContextMenu={(event) => onMenu(event, item, source)}>
      {src ? <img src={src} alt="" loading="lazy" decoding="async" draggable={false} onError={onBroken ? () => onBroken(item) : undefined} /> : <span>不可用</span>}
    </button>
  );
});

/** 分组标题，滚动时吸在顶上。右边可以放数量和操作。 */
function Title({ children, count, side }: { children: ReactNode; count?: ReactNode; side?: ReactNode }): JSX.Element {
  return (
    <div className="kce-title">
      <span>{children}</span>
      {count !== undefined ? <span className="kce-count">{count}</span> : null}
      {side ? <span className="kce-title-side">{side}</span> : null}
    </div>
  );
}

function favoriteItem(sticker: FavoriteStickerItem): StickerItem {
  return { url: sticker.url, assetId: sticker.asset_id };
}

function groupItem(emoji: GroupEmoji): StickerItem {
  return { url: emoji.url, name: emoji.name, groupEmojiId: emoji.id };
}

export const SystemPage = memo(function SystemPage({ onPick }: { onPick: PickEmoji }): JSX.Element {
  return (
    <>
      {EMOJI_SECTIONS.map((section) => (
        <section key={section.id} className="kce-section">
          <Title>{section.title}</Title>
          <div className="kce-emoji-grid">
            {section.emojis.map((entry) => <EmojiButton key={entry.glyph} entry={entry} onPick={onPick} />)}
          </div>
        </section>
      ))}
    </>
  );
});

interface RecentPageProps extends StickerPageProps {
  recents: RecentEmojis;
  onPick: PickEmoji;
  /** 图片已经打不开了（收藏被删掉之类），从最近使用里拿掉 */
  onBroken: (item: StickerItem) => void;
  onClear: () => void;
}

export const RecentPage = memo(function RecentPage({ recents, disabled, onPick, onSend, onMenu, onBroken, onClear }: RecentPageProps): JSX.Element {
  if (recents.emojis.length === 0 && recents.stickers.length === 0) {
    return <p className="kce-status">还没有最近使用的表情<br />用过的 Emoji 和发过的表情会出现在这里</p>;
  }
  const clear = <button type="button" className="kui-link" onClick={onClear}>清空</button>;
  return (
    <>
      {recents.emojis.length > 0 ? (
        <section className="kce-section">
          <Title side={clear}>最近用过的 Emoji</Title>
          <div className="kce-emoji-grid">
            {recents.emojis.map((glyph) => <EmojiButton key={glyph} entry={emojiEntry(glyph)} onPick={onPick} />)}
          </div>
        </section>
      ) : null}
      {recents.stickers.length > 0 ? (
        <section className="kce-section">
          <Title side={recents.emojis.length === 0 ? clear : undefined}>最近发过的表情</Title>
          <div className="kce-sticker-grid">
            {recents.stickers.map((item) => <StickerButton key={item.url} item={item} source="recent" disabled={disabled} onSend={onSend} onMenu={onMenu} onBroken={onBroken} />)}
          </div>
        </section>
      ) : null}
    </>
  );
});

interface FavoritesPageProps extends StickerPageProps {
  query: UseQueryResult<FavoriteStickerItem[]>;
  pending: PendingFavorite[];
  onAddFiles: (files: File[]) => void;
}

export const FavoritesPage = memo(function FavoritesPage({ query, pending, disabled, onAddFiles, onSend, onMenu }: FavoritesPageProps): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const stickers = query.data;

  if (!stickers) {
    return query.isError
      ? <p className="kce-status">收藏表情加载失败<button type="button" className="kui-btn kui-btn--sm" onClick={() => void query.refetch()}>重试</button></p>
      : <p className="kce-status">正在加载收藏表情…</p>;
  }
  const empty = stickers.length === 0 && pending.length === 0;
  return (
    <section className="kce-section">
      <Title count={stickers.length > 0 ? stickers.length : undefined} side={stickers.length > 0 ? '右键可以删除' : undefined}>收藏表情</Title>
      <div className="kce-sticker-grid">
        <input ref={fileInputRef} type="file" accept={FAVORITE_IMAGE_TYPES.join(',')} multiple hidden onChange={(event) => {
          onAddFiles(Array.from(event.target.files ?? []));
          // 清空后再选同一张图也能触发 change
          event.target.value = '';
        }} />
        <button type="button" className="kce-cell kce-cell--add" title="从电脑里选图片添加（可以多选）" aria-label="添加收藏表情" onClick={() => fileInputRef.current?.click()}>
          <Icon name="plus" className="h-5 w-5" />
        </button>
        {pending.map((item) => <span key={item.id} className="kce-sticker is-pending" title="正在添加…"><img src={item.previewUrl} alt="" /></span>)}
        {stickers.map((sticker) => <StickerButton key={sticker.asset_id} item={favoriteItem(sticker)} source="favorites" disabled={disabled} onSend={onSend} onMenu={onMenu} />)}
        {empty ? <p className="kce-hint">点「＋」从电脑里选图片，也可以把图片拖进来，或者在这一页按 {modKeyCombo('V')} 粘贴。<br />在聊天里的图片上右键「添加到表情」，同样会收进这里。</p> : null}
      </div>
    </section>
  );
});

interface GroupPageProps extends StickerPageProps {
  conversationId: number;
  canManage: boolean;
  onManage: () => void;
}

export const GroupPage = memo(function GroupPage({ conversationId, canManage, disabled, onSend, onMenu, onManage }: GroupPageProps): JSX.Element {
  const query = useGroupEmojis(conversationId);
  const emojis = query.data;

  if (!emojis) {
    return <p className="kce-status">{query.isError ? '本群表情加载失败，请稍后再试' : '正在加载本群表情…'}</p>;
  }
  if (emojis.length === 0) {
    return canManage
      ? <p className="kce-status">本群还没有群表情<button type="button" className="kui-btn kui-btn--sm" onClick={onManage}>添加群表情</button></p>
      : <p className="kce-status">本群还没有群表情<br />群主和管理员可以添加</p>;
  }
  return (
    <section className="kce-section">
      <Title count={`${emojis.length} / ${MAX_GROUP_EMOJIS}`} side={canManage ? <button type="button" className="kui-link" onClick={onManage}>管理</button> : undefined}>本群表情</Title>
      <div className="kce-sticker-grid">
        {emojis.map((emoji) => <StickerButton key={emoji.id} item={groupItem(emoji)} source="group" disabled={disabled} onSend={onSend} onMenu={onMenu} />)}
      </div>
    </section>
  );
});

interface SearchPageProps extends StickerPageProps {
  /** 群聊才有；私聊里只搜 Emoji */
  conversationId: number | null;
  onPick: PickEmoji;
}

const NO_GROUP_EMOJIS: GroupEmoji[] = [];

function SearchView({ groupEmojis, disabled, onPick, onSend, onMenu }: StickerPageProps & { groupEmojis: GroupEmoji[] | null; onPick: PickEmoji }): JSX.Element {
  const [query, setQuery] = useState('');
  const keyword = query.trim().toLowerCase();
  const emojis = useMemo(() => searchEmojis(keyword), [keyword]);
  const stickers = useMemo(() => (keyword ? (groupEmojis ?? NO_GROUP_EMOJIS).filter((emoji) => emoji.name.toLowerCase().includes(keyword)) : NO_GROUP_EMOJIS), [groupEmojis, keyword]);

  return (
    <>
      <div className="kce-search">
        <label className="kui-field">
          <Icon name="search" className="h-3.5 w-3.5" />
          <input
            value={query}
            placeholder={groupEmojis ? '搜索 Emoji 和本群表情' : '搜索 Emoji'}
            aria-label="搜索表情"
            autoFocus
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // 面板在输入框的表单里面，回车不拦的话会把正在写的消息发出去
              if (event.key === 'Enter') {
                event.preventDefault();
                if (!event.nativeEvent.isComposing && emojis.length > 0) {
                  onPick(emojis[0].glyph);
                }
              }
            }}
          />
          {query ? <button type="button" className="kce-search-clear" aria-label="清空" onClick={() => setQuery('')}><Icon name="close" className="h-3 w-3" /></button> : null}
        </label>
      </div>
      {!keyword ? (
        <div className="kce-suggest">
          <p>可以搜名称或关键词，比如</p>
          <div>
            {SEARCH_SUGGESTIONS.map((word) => <button key={word} type="button" className="kui-tag" onClick={() => setQuery(word)}>{word}</button>)}
          </div>
        </div>
      ) : emojis.length === 0 && stickers.length === 0 ? (
        <p className="kce-status">没有找到和「{query.trim()}」有关的表情<br />收藏表情没有名称，搜不到</p>
      ) : (
        <>
          {emojis.length > 0 ? (
            <section className="kce-section">
              <Title count={emojis.length} side="回车插入第一个">Emoji</Title>
              <div className="kce-emoji-grid">
                {emojis.map((entry) => <EmojiButton key={entry.glyph} entry={entry} onPick={onPick} />)}
              </div>
            </section>
          ) : null}
          {stickers.length > 0 ? (
            <section className="kce-section">
              <Title count={stickers.length}>本群表情</Title>
              <div className="kce-sticker-grid">
                {stickers.map((emoji) => <StickerButton key={emoji.id} item={groupItem(emoji)} source="group" disabled={disabled} onSend={onSend} onMenu={onMenu} />)}
              </div>
            </section>
          ) : null}
        </>
      )}
    </>
  );
}

/** 群聊里的搜索多搜一份本群表情。单独成一个组件，私聊里就不会去请求它。 */
function GroupSearchView({ conversationId, ...rest }: Omit<SearchPageProps, 'conversationId'> & { conversationId: number }): JSX.Element {
  return <SearchView {...rest} groupEmojis={useGroupEmojis(conversationId).data ?? NO_GROUP_EMOJIS} />;
}

export const SearchPage = memo(function SearchPage({ conversationId, ...rest }: SearchPageProps): JSX.Element {
  return conversationId ? <GroupSearchView conversationId={conversationId} {...rest} /> : <SearchView {...rest} groupEmojis={null} />;
});
