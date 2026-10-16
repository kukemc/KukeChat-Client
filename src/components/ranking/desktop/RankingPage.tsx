import { Icon } from '@/components/ui/Icon';
import { useKukeStore } from '@/store/kukeStore';
import { pickBoard, useRankingBoards } from '../boards';
import { RankingBody } from '../RankingBody';

/**
 * 排行榜：桌面端的页面，一个工作区（导航栏里有它的入口，奖杯图标）。全站的榜都在这里，用标题栏右边的页签切换；
 * 别处的入口（等级页的「活跃排行榜」等）也跳到这里的对应页签。外框（标题栏、滚动区、空状态）沿用商店 / 等级页的那一套（ksp-），
 * 内容区借等级页的量（klv-page），榜单本身见 RankingBody。
 */
export function RankingPage(): JSX.Element {
  const wanted = useKukeStore((state) => state.rankingBoard);
  const setBoard = useKukeStore((state) => state.setRankingBoard);
  const boards = useRankingBoards();
  const current = pickBoard(boards, wanted);

  return (
    <section className="ksp-root" aria-label="排行榜">
      <div className="ksp klv-page krk-page" data-ranking-page={current?.id ?? 'none'}>
        <header className="ksp-head">
          <h1 className="ksp-head-title">排行榜</h1>
          <p className="ksp-head-sub">活跃、礼物、好友亲密、风纪</p>
          {boards.length > 1 ? (
            <div className="ksp-head-actions">
              <div className="kui-segment" role="tablist" aria-label="榜单">
                {boards.map((board) => <button key={board.id} type="button" role="tab" data-ranking-tab={board.id} aria-selected={current?.id === board.id} className={current?.id === board.id ? 'is-active' : undefined} onClick={() => setBoard(board.id)}><Icon name={board.icon} className="h-3.5 w-3.5" />{board.label}</button>)}
              </div>
            </div>
          ) : null}
        </header>
        <div className="ksp-body kui-scroll">
          <div className="ksp-wrap klv-wrap">
            {current ? <RankingBody board={current.id} layout="desktop" /> : (
              <div className="ksp-state" data-ranking="unavailable">
                <span className="ksp-state-icon"><Icon name="trophy" className="h-5 w-5" /></span>
                <p className="ksp-state-title">排行榜还没有开放</p>
                <div className="ksp-state-text">当前连接的服务端还没有开放账号等级、礼物或风纪排行。开放后这里会自动出现，不需要更新客户端。</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
