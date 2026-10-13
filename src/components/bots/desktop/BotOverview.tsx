import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { useMyBots, useSquareBots } from '../botQueries';
import { botUser, errorMessage, formatBotDate, formatCount } from '../botShared';
import { AccessWays } from './BotApiDocs';
import { BotTags, Card, StatStrip, type BotActions } from './botUi';

// 概览里最多列几个自己的机器人，更多的去左边「我的」里看
const MY_BOTS_PREVIEW = 5;

interface BotOverviewProps {
  keyword: string;
  actions: BotActions;
  onShowMine: () => void;
}

/** 没选中任何机器人时右侧显示的概览：广场的几个数字、自己的机器人、怎么接入。 */
export function BotOverview({ keyword, actions, onShowMine }: BotOverviewProps): JSX.Element {
  // 和左边列表是同一份缓存，统计数字在第一页里
  const stats = useSquareBots(keyword).data?.pages[0]?.stats;
  const myBotsQuery = useMyBots();
  const myBots = myBotsQuery.data ?? [];
  const number = (value: number | undefined): string => (stats ? formatCount(value) : '–');

  return (
    <>
      <header className="kcb-head">
        <div className="kcb-head-main">
          <div className="kcb-head-title"><h2>机器人广场</h2></div>
          <p className="kcb-head-meta">把别人做好的机器人加进你管理的群，或者自己做一个。</p>
        </div>
        <div className="kcb-head-actions">
          <button type="button" className="kui-btn" onClick={actions.openDocs}><Icon name="code" className="h-4 w-4" />接入文档</button>
          <button type="button" className="kui-btn kui-btn--primary" onClick={actions.create}><Icon name="plus" className="h-4 w-4" />新建机器人</button>
        </div>
      </header>

      <div className="kcb-body kui-scroll">
        <div className="kcb-page">
          <Card className="kcb-card--flush">
            <StatStrip items={[
              { label: '广场机器人', value: number(stats?.total_bots) },
              { label: '正在在线', value: number(stats?.online_bots) },
              { label: '已接入群聊', value: number(stats?.installed_groups) },
              { label: '累计安装', value: number(stats?.total_installs) },
              { label: '用户评价', value: number(stats?.total_reviews) }
            ]} />
          </Card>

          <Card title="我的机器人" aside={myBots.length > 0 ? <button type="button" className="kui-link" onClick={onShowMine}>查看全部 {myBots.length}</button> : null}>
            {myBotsQuery.isLoading ? <p className="kcb-card-empty">正在加载…</p> : null}
            {myBotsQuery.error ? <p className="kui-note kui-note--danger" role="alert">{errorMessage(myBotsQuery.error)}</p> : null}
            {!myBotsQuery.isLoading && !myBotsQuery.error && myBots.length === 0 ? (
              <div className="kcb-card-empty">
                <p>你还没有创建机器人。创建后会拿到一个 Key，用它接入 Scratch 扩展或 Bot API；要不要公开到广场由你决定。</p>
                <button type="button" className="kui-btn kui-btn--sm" onClick={actions.create}><Icon name="plus" className="h-3.5 w-3.5" />新建机器人</button>
              </div>
            ) : null}
            {myBots.slice(0, MY_BOTS_PREVIEW).map((bot) => (
              <button key={bot.id} type="button" className="kui-row" onClick={() => actions.select(bot.id)}>
                <Avatar user={botUser(bot)} size="sm" />
                <span className="kui-row-label">
                  <span className="kcb-inline"><span className="kcb-clip">{bot.name}</span><BotTags bot={bot} showOnline showVisibility /></span>
                  <span className="kui-row-hint kcb-clip">{bot.description?.trim() || '暂无介绍'}</span>
                </span>
                <span className="kui-row-value">{formatCount(bot.install_count)} 个群{formatBotDate(bot.updated_at) ? ` · ${formatBotDate(bot.updated_at)}` : ''}</span>
                <Icon name="chevron" className="kcb-row-arrow" />
              </button>
            ))}
          </Card>

          <Card title="接入方式" aside={<button type="button" className="kui-link" onClick={actions.openDocs}>查看完整文档</button>}>
            <AccessWays />
          </Card>
        </div>
      </div>
    </>
  );
}
