import { describePenaltyCode } from '@/api/moderation';
import type { ModerationRules } from '@/types/moderation';
import { useJury } from '../context';
import { maxBanText } from '../data/growth';
import { errorText, useModerationRules } from '../data/queries';
import { LEVEL_NAME } from '../labels';
import { Card, Loading, LoadError } from '../widgets/Frame';

function Categories({ rules }: { rules: ModerationRules }): JSX.Element {
  const levelOf = (level: number) => rules.levels.find((item) => item.level === level);
  return (
    <Card title="违规类别" aside={<span className="kjr-meta">每个类别有一个默认等级，评审时可以按情节调整</span>}>
      <div className="kjr-table kjr-table--rules" role="table" aria-label="违规类别">
        <div className="kjr-tr kjr-th" role="row"><span role="columnheader">类别</span><span role="columnheader">默认等级</span><span role="columnheader">记分</span><span role="columnheader">单次的基础处置</span></div>
        {rules.categories.map((category) => {
          const level = levelOf(category.level);
          return (
            <div key={category.key} className="kjr-tr" role="row">
              <span role="cell"><b>{category.label}</b></span>
              <span role="cell">L{category.level} {LEVEL_NAME[category.level] ?? ''}</span>
              <span role="cell">{level ? `${level.points} 分` : '—'}</span>
              <span role="cell">{level ? describePenaltyCode(level.penalty) : '—'}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Levels({ rules }: { rules: ModerationRules }): JSX.Element {
  const maxPoints = Math.max(...rules.levels.map((level) => level.points), 1);
  return (
    <Card title="违规等级" aside={<span className="kjr-meta">等级决定这一次记几分、当场怎么处置</span>}>
      <ul className="kjr-levels">
        {rules.levels.map((level) => (
          <li key={level.level}>
            <span className="kjr-levels-name"><b>L{level.level}</b>{LEVEL_NAME[level.level] ?? ''}</span>
            <span className="kjr-levels-bar"><i style={{ width: `${(level.points / maxPoints) * 100}%` }} /></span>
            <span className="kjr-levels-points">记 {level.points} 分</span>
            <span className="kjr-levels-penalty">{describePenaltyCode(level.penalty)}</span>
          </li>
        ))}
      </ul>
      <p className="kjr-quiet">风纪委员评审时可以选 L1–L3。更重的等级只能由管理员认定。</p>
    </Card>
  );
}

/** 累计记分的阶梯：一条从 0 往上走的刻度，每个门槛对应一档处置。 */
function Ladder({ rules }: { rules: ModerationRules }): JSX.Element {
  const maxBan = maxBanText(useJury().config.config);
  return (
    <Card title="累计记分的阶梯处置" aside={<span className="kjr-meta">近 {rules.point_window_days} 天内的记分加起来</span>}>
      <ol className="kjr-ladder">
        {rules.ladder.map((step) => (
          <li key={step.threshold}>
            <span className="kjr-ladder-dot" />
            <strong>{step.threshold}<small>分</small></strong>
            <span>{describePenaltyCode(step.penalty)}</span>
          </li>
        ))}
      </ol>
      <ul className="kjr-doc-list">
        <li>记分在 <b>{rules.point_window_days} 天</b>的滚动窗口内累计，满 {rules.point_window_days} 天的记分自动失效。</li>
        <li>累计分数<b>跨过</b>一个门槛时才触发那一档的处置；没有跨过新门槛，就只执行这一次违规本身的基础处置。</li>
        <li>机器和风纪委员给出的封禁<b>最长 {maxBan}</b>。按阶梯算出来更重时先封 {maxBan}，等管理员确认最终处置。</li>
        <li>同一条内容只罚一次。机器拿不准的内容不会自动处理，也不记分，只进人工队列。</li>
        <li>被处罚的人可以对每条处罚申诉一次。申诉通过后记分清零，由它触发的禁言、封禁同步解除。</li>
      </ul>
    </Card>
  );
}

/** 规则手册 · 处罚规则。全部来自 GET /moderation/rules，处置编码翻成人话。 */
export function RulesChapter(): JSX.Element {
  const query = useModerationRules();
  if (query.isLoading) {
    return <Loading />;
  }
  if (!query.data) {
    return <LoadError message={errorText(query.error, '处罚规则加载失败，请稍后再试。')} onRetry={() => void query.refetch()} />;
  }
  return (
    <>
      <Categories rules={query.data} />
      <div className="kjr-two">
        <Levels rules={query.data} />
        <Ladder rules={query.data} />
      </div>
    </>
  );
}
