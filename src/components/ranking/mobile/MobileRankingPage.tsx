import { useState, type CSSProperties } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import { Icon } from '@/components/ui/Icon';
import type { RankingBoard } from '@/store/kukeStore';
import { pickBoard, useRankingBoards } from '../boards';
import { RankingBody } from '../RankingBody';

/**
 * 排行榜的移动端界面：二级页面，从「我」的页面（设置首页的「排行榜」）和等级页里的入口进来。
 * 内容和桌面端是同一个 RankingBody；外框沿用等级页移动端的那一套（kc-qq-page + klv-m 的页签和页脚）。
 */
export function MobileRankingPage({ initialBoard = 'level', onMobileBack, transitionStyle }: { initialBoard?: RankingBoard; onMobileBack?: () => void; transitionStyle?: CSSProperties }): JSX.Element {
  const [wanted, setWanted] = useState<RankingBoard>(initialBoard);
  // 「我的位置」那一行的落脚处：在滚动区域外面，所以始终贴着页面底部
  const [pinnedSlot, setPinnedSlot] = useState<HTMLDivElement | null>(null);
  const boards = useRankingBoards();
  const current = pickBoard(boards, wanted);

  return (
    <section className="kc-qq-page kui klv-m krk-m flex h-full min-h-0 flex-col overflow-hidden" style={transitionStyle} aria-label="排行榜" data-ranking-page={current?.id ?? 'none'}>
      <header className="kc-qq-home-header kc-qq-sticky-home-header mx-4 shrink-0">
        {onMobileBack ? <button type="button" onClick={onMobileBack} className="ksp-m-round" aria-label="返回" data-action="ranking-back"><Icon name="chevronLeft" className="h-5 w-5" /></button> : <span className="h-9 w-9" />}
        <div className="min-w-0 text-center"><h1 className="ksp-m-title">排行榜</h1><p className="ksp-m-subtitle">活跃、礼物、风纪</p></div>
        <span className="h-9 w-9" />
      </header>
      {boards.length > 1 ? (
        <div className="klv-m-tabs" role="tablist" aria-label="榜单">
          {boards.map((board) => <button key={board.id} type="button" role="tab" data-ranking-tab={board.id} aria-selected={current?.id === board.id} className={cx('klv-m-tab', current?.id === board.id && 'is-active')} onClick={() => setWanted(board.id)}>{board.label}</button>)}
        </div>
      ) : null}
      <div className="kc-qq-scroll kc-mobile-page-transition scroll-soft klv-m-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(var(--kc-native-safe-bottom,env(safe-area-inset-bottom))+24px)]">
        {current ? <RankingBody board={current.id} layout="mobile" pinnedSlot={pinnedSlot} /> : (
          <div className="ksp-m-state" data-ranking="unavailable">
            <span className="ksp-m-state-icon"><Icon name="trophy" className="h-6 w-6" /></span>
            <p className="ksp-m-state-title">排行榜还没有开放</p>
            <p className="ksp-m-state-text">当前连接的服务端还没有开放账号等级、礼物或风纪排行，开放后这里会自动出现。</p>
          </div>
        )}
      </div>
      <div ref={setPinnedSlot} className="klv-m-foot" />
    </section>
  );
}
