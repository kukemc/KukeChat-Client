import { Icon } from '@/components/ui/Icon';
import { useKukeStore } from '@/store/kukeStore';
import { useLevelRules } from '../data';
import { LevelBody } from '../LevelBody';

/**
 * 账号等级：桌面端的页面。它是一个工作区（和商店、风纪并列），但导航栏里没有它的入口 ——
 * 从自己的等级图标、个人主页、设置里进来，标题栏左边的箭头回到进来之前的那一页。活跃榜在排行榜页（导航栏里的奖杯），这里的入口跳过去。
 * 外框（标题栏、滚动区、空状态）沿用商店页的那一套（ksp-），内容在 LevelBody。
 * 契约：KukeChat-Server 的 docs/account-level.md。预览页：dev/level-harness.html。样式在 src/styles/level.css（前缀 klv-）。
 */
export function LevelPage(): JSX.Element {
  const closeLevel = useKukeStore((state) => state.closeLevel);
  const query = useLevelRules();
  const rules = query.data;

  return (
    <section className="ksp-root" aria-label="账号等级">
      <div className="ksp klv-page" data-level-page="me">
        <header className="ksp-head">
          <button type="button" className="kui-icon-btn" aria-label="返回" title="返回" data-action="level-back" onClick={closeLevel}><Icon name="chevronLeft" className="h-4 w-4" /></button>
          <h1 className="ksp-head-title">账号等级</h1>
          <p className="ksp-head-sub">在 KukeChat 待了多久、有多活跃</p>
        </header>
        <div className="ksp-body kui-scroll">
          <div className="ksp-wrap klv-wrap">
            {rules ? <LevelBody rules={rules} layout="desktop" />
              : rules === null ? (
                <div className="ksp-state" data-level="unavailable">
                  <span className="ksp-state-icon"><Icon name="clock" className="h-5 w-5" /></span>
                  <p className="ksp-state-title">账号等级即将开放</p>
                  <div className="ksp-state-text">当前连接的服务端还没有开放账号等级。开放后这里会自动出现，不需要更新客户端。</div>
                </div>
              ) : query.error ? (
                <div className="ksp-state is-danger" role="alert" data-level="error">
                  <span className="ksp-state-icon"><Icon name="alert" className="h-5 w-5" /></span>
                  <p className="ksp-state-title">等级规则没有加载出来</p>
                  <div className="ksp-state-text">{query.error.message}</div>
                  <div className="ksp-state-actions"><button type="button" className="kui-btn kui-btn--sm" onClick={() => void query.refetch()}>重试</button></div>
                </div>
              ) : (
                <div className="klv-grid" role="status" aria-label="正在加载等级">
                  <span className="kcr-bone klv-bone" />
                  <span className="kcr-bone klv-bone" />
                </div>
              )}
          </div>
        </div>
      </div>
    </section>
  );
}
