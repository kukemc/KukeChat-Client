import { Icon } from '@/components/ui/Icon';
import type { JuryPracticeStats } from '@/types/juryGrowth';
import { useJury } from '../context';
import { restrictionReason, restrictionUntil, slotResetText } from '../growth/labels';
import { formatRate } from '../labels';
import { Ring, Stat } from '../widgets/Charts';
import { Card, LoadError, NotOpenYet, StateBlock } from '../widgets/Frame';

/** round_done：题库里能练的题都做过一遍了（区别于 empty：题库里一道题都没有） */
export type PracticeIdleReason = 'not_eligible' | 'restricted' | 'limit' | 'empty' | 'round_done' | 'unavailable' | 'error';

/** 练习累计成绩：练习额度用完、或者题库空了的时候给人看一眼自己的水平。 */
function PracticeRecord({ stats, session }: { stats: JuryPracticeStats; session: { answered: number; correct: number } }): JSX.Element {
  const rate = stats.answered > 0 ? stats.correct / stats.answered : null;
  return (
    <Card title="我的练习成绩" className="kjr-pq-record">
      <div className="kjr-stats">
        <div className="kjr-stat kjr-stat--ring">
          <Ring value={rate} />
          <span className="kjr-stat-label">累计正确率</span>
          <span className="kjr-stat-hint">{stats.answered > 0 ? `${stats.correct} / ${stats.answered} 题` : '还没有做过题'}</span>
        </div>
        <Stat label="累计练习" value={stats.answered} unit="题" />
        {session.answered > 0 ? <Stat label="这次练习" value={`${session.correct}/${session.answered}`} hint={`正确率 ${formatRate(session.correct / session.answered)}`} /> : null}
      </div>
      <p className="kjr-quiet">练习成绩只有你自己看得到，不计入一致率，也不影响申请和层级。</p>
    </Card>
  );
}

/** 练习场没有题可做时的画面：额度用完了（按最近 24 小时滚动计算）、这一轮做完了、题库空了、没有资格、受限、接口不可用、出错。每一种都说清原因和接下来能做什么。 */
export function PracticeIdle({ reason, stats, limit, resetsAt, session, round = null, message, onRetry, onRepeat }: {
  reason: PracticeIdleReason;
  stats: JuryPracticeStats | null;
  limit: number | null;
  /** 下一个练习名额释放的时间（limit）；后端没给时为空 */
  resetsAt?: string | null;
  session: { answered: number; correct: number };
  round?: { total: number; done: number } | null;
  message?: string;
  onRetry: () => void;
  /** 这一轮做完之后，接着重做 */
  onRepeat?: () => void;
}): JSX.Element {
  const { status, identity, config, nav, openPenalties } = useJury();
  const examOpen = config.has('exam');

  if (reason === 'error') {
    return <LoadError message={message ?? '练习题没有加载出来，请稍后再试。'} onRetry={onRetry} />;
  }
  if (reason === 'unavailable') {
    return <NotOpenYet what="练习场" />;
  }
  if (reason === 'restricted' && identity.restriction) {
    return (
      <StateBlock icon="lock" title="受处罚期间暂时不能练习" actions={<button type="button" className="kui-btn" onClick={openPenalties}>处罚与申诉</button>}>
        {restrictionReason(identity.restriction)}，{restrictionUntil(identity.restriction)}。处罚结束后自动恢复。
      </StateBlock>
    );
  }
  if (reason === 'not_eligible' || reason === 'restricted') {
    const missing = (status?.requirements ?? []).filter((item) => !item.ok);
    return (
      <div className="kjr-idle">
        <StateBlock icon="lock" title="满足申请条件后才能进入练习场" actions={<button type="button" className="kui-btn kui-btn--primary" onClick={() => nav.goSection('overview')}>查看申请条件</button>}>
          练习题是真实的匿名案例，所以只对满足风纪委员申请条件的用户开放 —— 不需要先成为委员。
        </StateBlock>
        {missing.length > 0 ? (
          <Card title="还差这些条件">
            <ul className="kjr-reqs">
              {missing.map((item) => (
                <li key={item.key} className="is-missing">
                  <Icon name="close" className="h-3.5 w-3.5" />
                  <span>{item.text}</span>
                  {item.detail ? <small>{item.detail}</small> : null}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
        <Card title="现在可以先看看">
          <ul className="kjr-todo">
            <li><button type="button" className="kui-row" onClick={() => nav.goSection('handbook')}><span className="kui-row-label">规则手册<span className="kui-row-hint">什么算违规、分几个等级、怎么处置</span></span><Icon name="chevron" className="h-4 w-4" /></button></li>
            {config.has('public_cases') ? <li><button type="button" className="kui-row" onClick={() => nav.goSection('bulletin')}><span className="kui-row-label">公示栏<span className="kui-row-hint">委员已经定案的案件和票数分布</span></span><Icon name="chevron" className="h-4 w-4" /></button></li> : null}
          </ul>
        </Card>
      </div>
    );
  }

  const limitReached = reason === 'limit';
  // 「今天 14:32 恢复一个名额」；后端没给恢复时间时是 null，退回「满 24 小时后」的写法
  const reset = limitReached ? slotResetText(resetsAt) : null;
  const roundDone = reason === 'round_done';
  return (
    <div className="kjr-idle">
      {roundDone ? (
        <StateBlock icon="check" title="这一轮的题都做过了" actions={onRepeat ? <button type="button" className="kui-btn kui-btn--primary" data-action="practice-repeat" onClick={onRepeat}>再练一轮</button> : undefined}>
          练习场现在能出的{round?.total ? ` ${round.total} 道` : ''}题，你都做过一遍了。新定案的案件会陆续补进来；现在接着练的话，出的是你做过的题，从最久没做的开始。
        </StateBlock>
      ) : (
        <StateBlock icon={limitReached ? 'check' : 'sparkles'} title={limitReached ? '练习额度用完了' : '题库里暂时没有可以练的题'} actions={limitReached ? undefined : <button type="button" className="kui-btn" data-action="practice-retry" onClick={onRetry}>再看一眼</button>}>
          {limitReached
            ? `每人 24 小时内最多练 ${limit ?? '若干'} 题。额度按最近 24 小时滚动计算，不在零点清零：${reset ? `${reset}，到时就能再练一题。` : '最早做的那一题满 24 小时后，就能再练一题。'}练多了容易凭感觉点，隔一阵再练效果更好。`
            : '练习题来自已经有结论的案件。风纪委员会刚成立，题库还在积累；有新题时这里会直接出现。'}
        </StateBlock>
      )}
      {stats && stats.answered > 0 ? <PracticeRecord stats={stats} session={session} /> : null}
      <Card title="接下来可以做什么">
        <ul className="kjr-todo">
          {identity.isJuror ? <li><button type="button" className="kui-row" onClick={() => nav.goSection('desk')}><span className="kui-row-label">去评审台<span className="kui-row-hint">看看有没有等你评审的真实案件</span></span><Icon name="chevron" className="h-4 w-4" /></button></li> : null}
          {examOpen && identity.canApply && !status?.exam?.passed ? <li><button type="button" className="kui-row" onClick={() => nav.goSection('handbook', { tab: 'exam' })}><span className="kui-row-label">参加入门考试<span className="kui-row-hint">计分的一轮练习，通过后申请成为委员</span></span><Icon name="chevron" className="h-4 w-4" /></button></li> : null}
          <li><button type="button" className="kui-row" onClick={() => nav.goSection('handbook')}><span className="kui-row-label">读一遍规则手册<span className="kui-row-hint">对照刚才答错的题，看看类别和等级怎么划</span></span><Icon name="chevron" className="h-4 w-4" /></button></li>
          {config.has('public_cases') ? <li><button type="button" className="kui-row" onClick={() => nav.goSection('bulletin')}><span className="kui-row-label">看看公示栏<span className="kui-row-hint">已定案的案件和票数分布</span></span><Icon name="chevron" className="h-4 w-4" /></button></li> : null}
        </ul>
      </Card>
    </div>
  );
}
