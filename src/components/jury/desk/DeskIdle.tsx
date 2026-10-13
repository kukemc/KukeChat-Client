import { Icon } from '@/components/ui/Icon';
import { useJury } from '../context';
import { percent, restrictionReason, restrictionUntil, slotResetText } from '../growth/labels';
import { formatDateTime, formatRemaining } from '../labels';
import { Card, LoadError, StateBlock } from '../widgets/Frame';

export type DeskIdleReason = 'empty' | 'limit' | 'restricted' | 'cooldown' | 'not_juror' | 'error';

/** 评审台没有案件可审时的画面。上线初期案件很少，「没有案件」是委员最常看到的状态，所以要说清楚接下来会怎样、现在能做什么。 */
export function DeskIdle({ reason, until, resetsAt, message, onRetry }: { reason: DeskIdleReason; /** 暂停发案到什么时候（cooldown） */ until?: string | null; /** 评审额度下一个名额释放的时间（limit）；后端没给时为空 */ resetsAt?: string | null; message?: string; onRetry: () => void }): JSX.Element {
  const { status, identity, config, nav, openPenalties, refetchStatus } = useJury();
  const rules = config.config.rules;
  const bulletinOpen = config.has('public_cases');
  const practiceOpen = config.has('practice');

  if (reason === 'error') {
    return <LoadError message={message ?? '案件领取失败，请稍后再试。'} onRetry={onRetry} />;
  }
  if (reason === 'not_juror') {
    return (
      <StateBlock icon="scale" title="评审台只对在任委员开放" actions={<button type="button" className="kui-btn kui-btn--primary" onClick={() => nav.goSection('overview')}>查看我的身份</button>}>
        你现在不是在任的风纪委员，所以领不到案件。申请条件、当前的申请状态都在「总览」里。
      </StateBlock>
    );
  }
  if (reason === 'restricted') {
    const restriction = identity.restriction;
    return (
      <StateBlock icon="lock" title="受处罚期间暂时不能评审" actions={<button type="button" className="kui-btn" onClick={openPenalties}>处罚与申诉</button>}>
        {restriction
          ? `${restrictionReason(restriction)}，${restrictionUntil(restriction)}。这期间不能评审、发表观点和点赞；你投过的案件仍然可以在「我的评审」里回看。处罚结束后评审资格自动恢复，认为处罚有误可以提出申诉。`
          : '你的账号目前有生效中的处罚。处罚结束后评审资格自动恢复；如果认为处罚有误，可以提出申诉。'}
      </StateBlock>
    );
  }

  const cooldown = reason === 'cooldown';
  const limit = reason === 'limit';
  const abstain = config.config.abstain;
  const wait = formatRemaining(until);
  // 「今天 14:32 恢复一个名额」；后端没给恢复时间时是 null，退回「满 24 小时后」的写法
  const reset = limit ? slotResetText(resetsAt) : null;
  return (
    <div className="kjr-idle">
      {cooldown ? (
        <StateBlock icon="clock" title="暂时不给你发新案件" actions={<button type="button" className="kui-btn" data-action="refresh-standing" onClick={() => {
          // 身份里还标着暂停时只重拉身份（它解除后评审台会自己去领案件）；否则是领案件时被拒的，再领一次
          refetchStatus();
          if (!identity.cooldownUntil) onRetry();
        }}>看看恢复了没有</button>}>
          {abstain
            ? `最近 ${abstain.window} 张票里，「拿不准」和「上下文不足」超过了 ${percent(abstain.cooldown_rate)}，所以暂停发案 ${abstain.cooldown_hours} 小时。`
            : '最近的票里「拿不准」和「上下文不足」太多，所以暂停发案一段时间。'}
          {until ? `${formatDateTime(until)} 恢复${wait ? `（还有 ${wait}）` : ''}。` : '稍后自动恢复。'}
          这不是处罚，也不影响层级；恢复之前可以去练习场找找判断的手感。
        </StateBlock>
      ) : (
        <StateBlock icon={limit ? 'check' : 'scale'} title={limit ? '评审额度用完了' : '现在没有等你评审的案件'} actions={limit ? undefined : <button type="button" className="kui-btn" data-action="refresh-queue" onClick={onRetry}>再看一眼</button>}>
          {limit
            ? `每位委员 24 小时内最多评 ${status?.daily_limit ?? rules.daily_votes} 件，避免疲劳判断。额度按最近 24 小时滚动计算，不在零点清零：${reset ? `${reset}，到时就能再评一件。` : '最早投的那一票满 24 小时后，就能再评一件。'}`
            : '案件来自用户的举报，目前每天只有几件，而且和你有关联的案件会被自动回避。有新案件时，导航栏的「风纪」入口上会出现数字，不需要守在这里。'}
        </StateBlock>
      )}
      <Card title="这段时间可以做什么">
        <ul className="kjr-todo">
          {practiceOpen ? (
            <li>
              <button type="button" className="kui-row" data-action="idle-practice" onClick={() => nav.goSection('practice')}><span className="kui-row-label">去练习场做几题<span className="kui-row-hint">已有结论的案例，答完立刻对答案，不影响任何人</span></span><Icon name="chevron" className="h-4 w-4" /></button>
            </li>
          ) : null}
          <li>
            <button type="button" className="kui-row" onClick={() => nav.goSection('handbook')}><span className="kui-row-label">读一遍规则手册<span className="kui-row-hint">违规类别、等级和处置，以及委员须知</span></span><Icon name="chevron" className="h-4 w-4" /></button>
          </li>
          <li>
            <button type="button" className="kui-row" onClick={() => nav.goSection('mine')}><span className="kui-row-label">回看我的评审<span className="kui-row-hint">看看之前投过的案件有没有结论，其他委员怎么想</span></span><Icon name="chevron" className="h-4 w-4" /></button>
          </li>
          {bulletinOpen ? (
            <li>
              <button type="button" className="kui-row" onClick={() => nav.goSection('bulletin')}><span className="kui-row-label">看看公示栏<span className="kui-row-hint">已定案的案件和票数分布，帮助校准自己的尺度</span></span><Icon name="chevron" className="h-4 w-4" /></button>
            </li>
          ) : null}
          {practiceOpen ? null : (
            <li>
              <button type="button" className="kui-row" onClick={() => nav.goSection('practice')}><span className="kui-row-label">练习场<span className="kui-row-hint">即将开放：用已有结论的案例练手，不影响任何人</span></span><Icon name="chevron" className="h-4 w-4" /></button>
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}
