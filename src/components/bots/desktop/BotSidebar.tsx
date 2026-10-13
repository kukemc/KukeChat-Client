import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { ContextMenuSurface } from '@/components/ui/ContextMenu';
import { Icon } from '@/components/ui/Icon';
import type { Bot } from '@/types/api';
import { useMyBots, useSquareBots } from '../botQueries';
import { botUser, errorMessage, formatCount } from '../botShared';
import { BotMenuItems, BotTags, cx, type BotActions } from './botUi';

export type BotTab = 'square' | 'mine';

interface BotSidebarProps {
  tab: BotTab;
  keyword: string;
  selectedId: number | null;
  currentUserId: number | undefined;
  actions: BotActions;
  onTabChange: (tab: BotTab) => void;
  onKeywordChange: (keyword: string) => void;
}

interface MenuState {
  bot: Bot;
  left: number;
  top: number;
}

const MENU_WIDTH = 176;
// 按最长的那套菜单（创建者看自己的机器人）估的高度，只用来保证菜单不探出栏底
const MENU_HEIGHT = 240;

function BotRow({ bot, active, mine, onSelect, onContextMenu }: { bot: Bot; active: boolean; mine: boolean; onSelect: () => void; onContextMenu: (event: React.MouseEvent<HTMLElement>) => void }): JSX.Element {
  return (
    <button type="button" className={cx('kcb-row', active && 'is-active')} onClick={onSelect} onContextMenu={onContextMenu}>
      <span className="kcb-row-avatar">
        <Avatar user={botUser(bot)} />
        {bot.online ? <i className="kcb-online" title="在线" /> : null}
      </span>
      <span className="kcb-row-main">
        <span className="kcb-row-line">
          <span className="kcb-row-name">{bot.name}</span>
          {mine && !bot.is_public ? <span className="kui-tag">私有</span> : null}
          <BotTags bot={bot} />
          {bot.rating_average ? <span className="kcb-row-rating"><Icon name="star" className="h-3 w-3" />{bot.rating_average.toFixed(1)}</span> : null}
        </span>
        <span className="kcb-row-line">
          <span className="kcb-row-desc">{bot.description?.trim() || '暂无介绍'}</span>
          {bot.install_count ? <span className="kcb-row-count">{formatCount(bot.install_count)} 群</span> : null}
        </span>
      </span>
    </button>
  );
}

/** 机器人中心左边那一栏：搜索、新建、广场 / 我的 两个列表，以及每个机器人的右键菜单。 */
export function BotSidebar({ tab, keyword, selectedId, currentUserId, actions, onTabChange, onKeywordChange }: BotSidebarProps): JSX.Element {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const squareQuery = useSquareBots(keyword);
  const myBotsQuery = useMyBots();
  const squarePages = squareQuery.data?.pages;
  const squareBots = useMemo(() => (squarePages ?? []).flatMap((page) => page.items), [squarePages]);
  const stats = squarePages?.[0]?.stats;
  const square = tab === 'square';
  const needle = keyword.trim().toLowerCase();
  // 广场的搜索走接口；「我的」数量少，又没有搜索接口，就在本地按同样的几个字段筛
  const myBots = useMemo(
    () => (myBotsQuery.data ?? []).filter((bot) => !needle || [bot.name, bot.description, bot.functions, bot.commands].some((field) => field?.toLowerCase().includes(needle))),
    [myBotsQuery.data, needle]
  );
  const bots = square ? squareBots : myBots;
  const query = square ? squareQuery : myBotsQuery;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = squareQuery;

  // 广场滚到接近底部时接着拉下一页
  useEffect(() => {
    const target = moreRef.current;
    if (!square || !target || !hasNextPage || isFetchingNextPage) {
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void fetchNextPage();
      }
    }, { root: listRef.current, rootMargin: '260px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, square, squareBots.length]);

  useEffect(() => {
    if (!menu) {
      return undefined;
    }
    // 点菜单以外的任何地方（包括右边的内容区）或按 Esc 都收起
    const close = (event: MouseEvent | KeyboardEvent): void => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !(menuRef.current && event.composedPath().includes(menuRef.current))) {
        setMenu(null);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menu]);

  function openMenu(event: React.MouseEvent<HTMLElement>, bot: Bot): void {
    event.preventDefault();
    const bounds = rootRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }
    // 菜单相对这一栏定位；横向可以探到右边的内容区上，纵向别超出栏底
    setMenu({ bot, left: Math.max(4, Math.min(event.clientX - bounds.left, bounds.width - 12)), top: Math.max(4, Math.min(event.clientY - bounds.top, bounds.height - MENU_HEIGHT - 4)) });
  }

  const searching = needle !== '';

  return (
    <aside ref={rootRef} className="kcb-side">
      <div className="kcb-side-header">
        <label className="kui-field kcb-side-search">
          <Icon name="search" className="h-4 w-4 shrink-0" />
          <input value={keyword} placeholder="搜索名称、功能或指令" aria-label="搜索机器人" onChange={(event) => onKeywordChange(event.target.value)} />
          {keyword ? <button type="button" className="kcb-side-clear" aria-label="清空搜索" onClick={() => onKeywordChange('')}><Icon name="close" className="h-3.5 w-3.5" /></button> : null}
        </label>
        <button type="button" className="kui-icon-btn" title="新建机器人" aria-label="新建机器人" onClick={actions.create}><Icon name="plus" className="h-4 w-4" /></button>
      </div>

      <div className="kcb-side-tabs">
        <div className="kui-segment" role="tablist">
          <button type="button" role="tab" aria-selected={square} className={square ? 'is-active' : undefined} onClick={() => onTabChange('square')}>广场</button>
          <button type="button" role="tab" aria-selected={!square} className={square ? undefined : 'is-active'} onClick={() => onTabChange('mine')}>我的{myBotsQuery.data?.length ? ` ${myBotsQuery.data.length}` : ''}</button>
        </div>
      </div>

      <div ref={listRef} className="kcb-side-list kui-scroll">
        <button type="button" className={cx('kcb-row', selectedId === null && 'is-active')} onClick={() => actions.select(null)}>
          <span className="kcb-row-glyph"><Icon name="blocks" className="h-[18px] w-[18px]" /></span>
          <span className="kcb-row-main">
            <span className="kcb-row-line"><span className="kcb-row-name">广场概览</span></span>
            <span className="kcb-row-line"><span className="kcb-row-desc">{stats ? `${formatCount(stats.total_bots)} 个机器人 · ${formatCount(stats.online_bots)} 个在线` : '数据、我的机器人和接入方式'}</span></span>
          </span>
        </button>
        <div className="kcb-side-label">
          <span>{searching ? '搜索结果' : square ? '公开的机器人' : '我创建的'}</span>
          {query.isLoading ? null : <span>{square ? squarePages?.[0]?.total ?? bots.length : bots.length}</span>}
        </div>

        {query.isLoading ? <p className="kui-empty">正在加载…</p> : null}
        {query.error ? <p className="kui-empty">{errorMessage(query.error)}<button type="button" className="kui-btn kui-btn--sm" onClick={() => void query.refetch()}>重试</button></p> : null}
        {!query.isLoading && !query.error && bots.length === 0 ? (
          searching
            ? <p className="kui-empty">没有找到相关的机器人<button type="button" className="kui-btn kui-btn--sm" onClick={() => onKeywordChange('')}>清空搜索</button></p>
            : square
              ? <p className="kui-empty">暂无公开机器人<br />之后公开的机器人会显示在这里</p>
              : <p className="kui-empty">你还没有创建机器人<br />创建后可以选择是否公开到广场<button type="button" className="kui-btn kui-btn--sm kui-btn--primary" onClick={actions.create}>新建机器人</button></p>
        ) : null}

        {bots.map((bot) => (
          <BotRow key={bot.id} bot={bot} mine={!square} active={bot.id === selectedId} onSelect={() => actions.select(bot.id)} onContextMenu={(event) => openMenu(event, bot)} />
        ))}

        {square && bots.length > 0 ? (
          <div ref={moreRef} className="kcb-side-foot">{isFetchingNextPage ? '正在加载更多…' : hasNextPage ? '继续下滑加载更多' : '已经到底啦'}</div>
        ) : null}
      </div>

      <button type="button" className="kcb-side-docs" onClick={actions.openDocs}>
        <Icon name="code" className="h-4 w-4" />
        <span>接入文档</span>
        <Icon name="chevron" className="h-3.5 w-3.5" />
      </button>

      {menu ? (
        <ContextMenuSurface ref={menuRef} className="kcb-menu" style={{ left: menu.left, top: menu.top, width: MENU_WIDTH }}>
          <BotMenuItems bot={menu.bot} isOwner={menu.bot.owner_id === currentUserId} actions={actions} onClose={() => setMenu(null)} />
        </ContextMenuSurface>
      ) : null}
    </aside>
  );
}
