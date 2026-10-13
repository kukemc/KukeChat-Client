import { cx } from '@/components/chat/desktop/runtime';
import type { JuryMembership, JuryStatus } from '@/types/jury';
import { useJury } from '../context';
import { errorText } from '../data/queries';
import { StandingNotices } from '../growth/GrowthView';
import { slotResetText } from '../growth/labels';
import { TierProgressCompact } from '../growth/TierCard';
import { formatDateTime, formatRate, formatRemaining, MEMBERSHIP_LABEL, MEMBERSHIP_TONE, TIER_LABEL } from '../labels';
import { Meter } from '../widgets/Charts';
import { Card, Loading, LoadError } from '../widgets/Frame';
import { ApplyFlow } from './ApplyFlow';

const HEADLINE: Record<JuryMembership, string> = {
  none: '你还不是风纪委员',
  applied: '申请已提交，等待管理员审批',
  active: '你是在任的风纪委员',
  expired: '你的任期已满',
  rejected: '上一次申请没有通过',
  suspended: '你的委员资格已被暂停',
  retired: '你已卸任'
};

function ActiveBody({ status }: { status: JuryStatus }): JSX.Element {
  const { nav, identity, config } = useJury();
  const remaining = formatRemaining(status.term_ends_at);
  const paused = identity.restricted || identity.cooldownUntil !== null;
  const reachedLimit = status.voted_today >= status.daily_limit;
  const available = status.available_cases;
  const stats = status.stats;
  return (
    <>
      <dl className="kjr-facts">
        <div>
          <dt>任期</dt>
          <dd>至 {formatDateTime(status.term_ends_at)}{remaining ? <small>还剩 {remaining}</small> : null}</dd>
        </div>
        <div>
          {/* 评审上限按最近 24 小时滚动计算，不是自然日 */}
          <dt>24 小时内已评</dt>
          <dd>{status.voted_today} / {status.daily_limit}<Meter value={status.voted_today} max={status.daily_limit} label="最近 24 小时的评审数" /></dd>
        </div>
        {available !== null && available !== undefined ? (
          <div>
            <dt>等你评审</dt>
            <dd>{available} 件</dd>
          </div>
        ) : null}
        {stats ? (
          <div>
            <dt>与结论一致</dt>
            <dd>{formatRate(stats.votes_settled > 0 ? stats.agreement_rate : null)}<small>{stats.votes_settled > 0 ? `已结 ${stats.votes_settled} 票` : '还没有已定案的票'}</small></dd>
          </div>
        ) : null}
        {config.has('points') ? (
          <div>
            <dt>风纪值</dt>
            <dd data-me-points={status.points ?? 0}>{status.points ?? 0}</dd>
          </div>
        ) : null}
      </dl>
      {config.has('tiers') && identity.tier && status.tier_progress ? <TierProgressCompact progress={status.tier_progress} tier={identity.tier} /> : null}
      <div className="kjr-card-actions">
        <span className="kjr-meta">{paused ? '现在暂时领不到案件，原因见上面的说明。' : reachedLimit ? `评审额度用完了：${slotResetText(status.daily_resets_at) ?? '最早投的那一票满 24 小时后恢复'}。` : available === 0 ? '现在没有等你评审的案件。' : '案件一次发一件，投票后才发下一件。'}</span>
        <span className="kjr-btn-row">
          <button type="button" className="kui-btn" onClick={() => nav.goSection('mine')}>我的评审</button>
          <button type="button" className="kui-btn kui-btn--primary" data-action="enter-desk" onClick={() => nav.goSection('desk')}>进入评审台</button>
        </span>
      </div>
    </>
  );
}

/** 总览里的「我的身份」：现在是什么状态、接下来能做什么。 */
export function MyStatusCard(): JSX.Element {
  const { status, statusError, refetchStatus, identity, config, nav, openPenalties } = useJury();
  if (!status) {
    return <Card title="我的身份">{identity.loading ? <Loading compact /> : <LoadError compact message={errorText(statusError, '身份信息加载失败，请稍后再试。')} onRetry={refetchStatus} />}</Card>;
  }
  const membership = status.status;
  const termDays = config.config.rules.term_days;
  const tag = identity.isJuror && identity.tier ? `在任 · ${TIER_LABEL[identity.tier]}` : MEMBERSHIP_LABEL[membership];

  return (
    <Card title="我的身份" aside={<span className={cx('kui-tag', MEMBERSHIP_TONE[membership])}>{tag}</span>} className="kjr-me">
      <p className="kjr-me-headline">{identity.isJuror && identity.tier ? `你是在任的${TIER_LABEL[identity.tier]}委员` : HEADLINE[membership]}</p>
      <p className="kjr-me-text">
        {membership === 'none' ? '风纪委员匿名评审被举报的群聊消息和公开动态，几位委员判断一致就形成结论。这是社区自己管理自己的方式，满足条件的用户都可以申请。'
          : membership === 'applied' ? `管理员通过后你会成为委员，任期 ${termDays} 天。审批有结果时这里会自动更新，不需要一直守着。`
          : membership === 'active' ? '感谢你为社区秩序出力。请只根据内容本身判断；拿不准就弃权，比随手投一票更负责。'
          : membership === 'expired' ? '条件仍然满足的话，续任立即生效，不需要再次审批。'
          : membership === 'rejected' ? '可以在满足条件后重新申请。'
          : membership === 'suspended' ? '暂停期间不能评审，也不能重新申请；你投过的案件仍然可以在「我的评审」里回看。'
          : '感谢你之前的付出。想回来的话可以重新申请。'}
      </p>
      {/* review_note 不一定是管理员写的：系统自动暂停资格时也用它说明原因 */}
      {status.review_note ? <p className="kui-note kui-note--warn">说明：{status.review_note}</p> : null}
      {membership === 'active' ? <StandingNotices status={status} /> : null}
      {membership === 'active' ? <ActiveBody status={status} /> : null}
      {!identity.isJuror && identity.canPractice && config.has('practice') ? (
        <div className="kjr-card-actions kjr-me-practice">
          <span className="kjr-meta">想先看看评审是怎么回事？练习场用已经有结论的真实案例练手，不需要先成为委员。</span>
          <button type="button" className="kui-btn" data-action="me-practice" onClick={() => nav.goSection('practice')}>去练习场</button>
        </div>
      ) : null}
      {membership === 'applied' ? <p className="kui-note">在等待的时候，可以先读一读「规则手册」，了解处罚规则和委员须知。</p> : null}
      {membership === 'suspended' ? (
        <div className="kjr-card-actions">
          <span className="kjr-meta">如果暂停与你受到的处罚有关，可以对处罚提出申诉。</span>
          <button type="button" className="kui-btn" onClick={openPenalties}>处罚与申诉</button>
        </div>
      ) : null}
      {identity.canApply ? <ApplyFlow status={status} /> : null}
    </Card>
  );
}
