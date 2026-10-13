import { useEffect, useRef, useState } from 'react';
import { BotCommandSignature } from '@/components/chat/desktop/BotCommandHint';
import { Avatar } from '@/components/ui/Avatar';
import { ContextMenuSurface } from '@/components/ui/ContextMenu';
import { Icon } from '@/components/ui/Icon';
import { useKukeStore } from '@/store/kukeStore';
import type { Bot } from '@/types/api';
import { parseBotCommands } from '@/utils/botCommands';
import { useBotDetail, useBotDirectChat } from '../botQueries';
import { botOwner, botUser, errorMessage, formatBotDate, formatCount, nonEmptyLines, userName } from '../botShared';
import { BotReviews } from './BotReviews';
import { BotMenuItems, BotTags, Card, PaneState, Stars, type BotActions } from './botUi';

interface BotDetailProps {
  botId: number;
  currentUserId: number | undefined;
  actions: BotActions;
}

/** 创建者才有的「更多」菜单：编辑、重置 Key、删除。 */
function OwnerMenu({ bot, actions }: { bot: Bot; actions: BotActions }): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const close = (event: MouseEvent | KeyboardEvent): void => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !(ref.current && event.composedPath().includes(ref.current))) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div ref={ref} className="kcb-more">
      <button type="button" className={open ? 'kui-icon-btn is-active' : 'kui-icon-btn'} title="管理" aria-label="管理" aria-expanded={open} onClick={() => setOpen((value) => !value)}><Icon name="more" className="h-4 w-4" /></button>
      {open ? (
        <ContextMenuSurface className="kcb-more-menu">
          <BotMenuItems bot={bot} isOwner compact actions={actions} onClose={() => setOpen(false)} />
        </ContextMenuSurface>
      ) : null}
    </div>
  );
}

/** 右侧的机器人详情：头部是身份和操作，下面是介绍、指令、评价，旁边一栏基本信息。 */
export function BotDetail({ botId, currentUserId, actions }: BotDetailProps): JSX.Element {
  const setActiveConversationId = useKukeStore((state) => state.setActiveConversationId);
  const botQuery = useBotDetail(botId);
  const direct = useBotDirectChat();
  const bot = botQuery.data;

  if (!bot) {
    return botQuery.error
      ? <PaneState title="打不开这个机器人" text={errorMessage(botQuery.error)} action={<button type="button" className="kui-btn kui-btn--sm" onClick={() => actions.select(null)}>回到概览</button>} />
      : <PaneState title="正在加载…" />;
  }

  const isOwner = bot.owner_id === currentUserId;
  const disabled = bot.status === 'disabled';
  const owner = botOwner(bot);
  const commands = parseBotCommands(bot.commands);
  const legacyCommands = bot.commands?.trim() ?? '';
  const functionLines = nonEmptyLines(bot.functions);
  const updatedAt = formatBotDate(bot.updated_at);

  return (
    <>
      <header className="kcb-head">
        <Avatar user={botUser(bot)} size="lg" />
        <div className="kcb-head-main">
          <div className="kcb-head-title">
            <h2 title={bot.name}>{bot.name}</h2>
            <BotTags bot={bot} showOnline />
          </div>
          <p className="kcb-head-meta">
            {bot.rating_average ? <><Stars value={bot.rating_average} /><b>{bot.rating_average.toFixed(1)}</b></> : <span>暂无评分</span>}
            <span>{formatCount(bot.review_count)} 条评价</span>
            <span>{formatCount(bot.install_count)} 个群在使用</span>
          </p>
        </div>
        <div className="kcb-head-actions">
          {isOwner ? <button type="button" className="kui-btn" onClick={() => actions.openDashboard(bot.id)}><Icon name="poll" className="h-4 w-4" />仪表盘</button> : null}
          <button type="button" className="kui-btn" disabled={direct.isPending || disabled} onClick={() => direct.mutate(bot, { onSuccess: (conversation) => setActiveConversationId(conversation.id), onError: actions.report })}><Icon name="message" className="h-4 w-4" />私信</button>
          <button type="button" className="kui-btn kui-btn--primary" disabled={disabled} onClick={() => actions.install(bot)}><Icon name="plus" className="h-4 w-4" />添加到群聊</button>
          <button type="button" className="kui-icon-btn" title="分享名片" aria-label="分享名片" onClick={() => actions.share(bot)}><Icon name="share" className="h-4 w-4" /></button>
          {isOwner ? <OwnerMenu bot={bot} actions={actions} /> : null}
        </div>
      </header>

      <div className="kcb-body kui-scroll">
        <div className="kcb-page kcb-page--split">
          <div className="kcb-page-main">
            <Card title="介绍">
              <p className={bot.description?.trim() ? 'kcb-prose' : 'kcb-prose is-empty'}>{bot.description?.trim() || '这个机器人还没有写介绍'}</p>
              {functionLines.length > 0 ? <ul className="kcb-features">{functionLines.map((line, index) => <li key={index}>{line}</li>)}</ul> : null}
            </Card>

            <Card title="指令" aside={commands.length > 0 ? <span>{commands.length}</span> : null}>
              {commands.length > 0 ? (
                <div className="kcb-commands">
                  {commands.map((item, index) => (
                    <div key={index} className="kcb-detail-command">
                      <code><BotCommandSignature command={item} /></code>
                      <span>{item.description}</span>
                    </div>
                  ))}
                </div>
              ) : (
                /* 一条都解析不出来的旧自由文本原样显示，不当成「暂无指令」 */
                <p className={legacyCommands ? 'kcb-prose' : 'kcb-prose is-empty'}>{legacyCommands || '暂无指令'}</p>
              )}
              {commands.some((item) => item.params.length > 0) ? <p className="kcb-card-foot">&lt;尖括号&gt; 里的是必填参数，[方括号] 里的可以不填。</p> : null}
            </Card>

            <BotReviews bot={bot} isOwner={isOwner} actions={actions} />
          </div>

          <aside className="kcb-page-aside">
            <Card title="信息">
              <button type="button" className="kui-row" onClick={() => actions.openUser(owner.id)}>
                <span className="kui-row-label">创建者</span>
                <span className="kui-row-value"><Avatar user={owner} size="sm" /><span className="kcb-clip">{userName(owner)}</span></span>
                <Icon name="chevron" className="kcb-row-arrow" />
              </button>
              <div className="kui-row"><span className="kui-row-label">可见范围</span><span className="kui-row-value">{bot.is_public ? '公开到广场' : '私有'}</span></div>
              <div className="kui-row"><span className="kui-row-label">运行状态</span><span className="kui-row-value">{disabled ? '已停用' : bot.online ? '在线' : '离线'}</span></div>
              <div className="kui-row"><span className="kui-row-label">最近更新</span><span className="kui-row-value">{updatedAt || '未知'}</span></div>
            </Card>
            {disabled ? <p className="kui-note kui-note--warn">这个机器人已被停用，暂时不能私信，也不能添加到群聊。</p> : null}
          </aside>
        </div>
      </div>
    </>
  );
}
