import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { appealViolation, describePenaltyCode, getModerationStanding } from '@/api/moderation';
import { Icon } from '@/components/ui/Icon';
import type { ModerationStanding, ViolationRead } from '@/types/moderation';
import { formatChinaDateTime, parseApiDate } from '@/utils/dateTime';
import { AppealProgress } from './AppealProgress';

const APPEAL_MIN = 5;
const APPEAL_MAX = 2000;

const SOURCE_LABEL: Record<ViolationRead['source'], string> = { auto: '系统识别', report: '用户举报', jury: '风纪委员评审', admin: '管理员认定' };
const TARGET_LABEL: Record<string, string> = { message: '消息', post: '动态', post_comment: '动态评论', post_topic: '话题', teamup_profile: '组队名片', teamup_comment: '组队留言', profile_cover: '主页封面' };
const APPEAL_LABEL: Record<ViolationRead['appeal_status'], string> = { none: '', pending: '申诉处理中', accepted: '申诉已通过', rejected: '申诉未通过' };

function penaltyText(violation: ViolationRead): string {
  const period = violation.penalty_permanent ? '永久' : parseApiDate(violation.penalty_ends_at) ? `至 ${formatChinaDateTime(violation.penalty_ends_at)}` : '';
  switch (violation.penalty_kind) {
    case 'notice': return '提醒';
    case 'warning': return '警告';
    case 'mute': return `禁言${period ? `，${period}` : ''}`;
    case 'ban': return `封禁${period ? `，${period}` : ''}`;
    default: return '仅处理内容，不记分';
  }
}

function ViolationItem({ violation, onAppeal, pending, error }: { violation: ViolationRead; onAppeal: (text: string) => void; pending: boolean; error: string }): JSX.Element {
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState('');
  const revoked = violation.status === 'revoked';
  const length = text.trim().length;

  return (
    <article className={revoked ? 'kcm-section is-revoked' : 'kcm-section'}>
      <div className="kcm-heading">
        <span>{violation.category_label}</span>
        {revoked ? <span className="kui-tag">已撤销</span> : <span className="kui-tag kui-tag--danger">{violation.level > 0 ? `L${violation.level} · 记 ${violation.points} 分` : '不记分'}</span>}
        {violation.under_review ? <span className="kui-tag kui-tag--warn">管理员复核中</span> : null}
        {violation.appeal_status !== 'none' ? <span className="kui-tag kui-tag--accent">{APPEAL_LABEL[violation.appeal_status]}</span> : null}
        <time>{formatChinaDateTime(violation.created_at)}</time>
      </div>
      <div className="kcm-stack">
        {violation.summary ? <p className="kcm-quote">{violation.summary}</p> : null}
        <p className="kcm-meta">
          处理结果：<b>{penaltyText(violation)}</b>
          {' · '}来源：{SOURCE_LABEL[violation.source] ?? violation.source}{violation.target_type ? `（${TARGET_LABEL[violation.target_type] ?? violation.target_type}）` : ''}
          {!revoked && violation.points > 0 && violation.expires_at ? ` · 记分 ${formatChinaDateTime(violation.expires_at)} 失效` : ''}
        </p>
      </div>
      <AppealProgress violation={violation} />
      {violation.can_appeal && !writing ?<div className="kcm-actions"><button type="button" className="kui-btn kui-btn--sm" onClick={() => setWriting(true)}>申诉</button></div> : null}
      {violation.can_appeal && writing ? (
        <form className="kcm-stack" onSubmit={(event) => {
          event.preventDefault();
          if (length >= APPEAL_MIN && !pending) {
            onAppeal(text.trim());
          }
        }}>
          <textarea className="kui-textarea kui-scroll" value={text} onChange={(event) => setText(event.target.value.slice(0, APPEAL_MAX))} rows={4} autoFocus placeholder="说明你认为处理有误的理由。每条处罚只能申诉一次，请写清楚。" />
          {error ? <p className="kui-note kui-note--danger">{error}</p> : null}
          <div className="kcm-actions">
            <span className="kcm-meta">{length}/{APPEAL_MAX}，至少 {APPEAL_MIN} 个字</span>
            <span className="flex gap-2">
              <button type="button" className="kui-btn kui-btn--ghost" onClick={() => setWriting(false)}>取消</button>
              <button type="submit" className="kui-btn kui-btn--primary" disabled={length < APPEAL_MIN || pending}>{pending ? '提交中…' : '提交申诉'}</button>
            </span>
          </div>
        </form>
      ) : null}
    </article>
  );
}

function Summary({ standing }: { standing: ModerationStanding }): JSX.Element {
  const mutedUntil = parseApiDate(standing.muted_until);
  const muted = Boolean(mutedUntil && mutedUntil.getTime() > Date.now());
  const ban = standing.ban;
  return (
    <section className="kcm-section">
      <div className="kcm-score">
        <strong>{standing.points}<small>分</small></strong>
        <p className="kcm-meta">
          近 {standing.point_window_days} 天累计记分，满 {standing.point_window_days} 天自动失效。
          {standing.next_threshold !== null ? <>累计到 <b>{standing.next_threshold}</b> 分会触发：{describePenaltyCode(standing.next_penalty)}。</> : '已达到最高一档处置。'}
        </p>
      </div>
      {ban || muted ? (
        <div className="kcm-stack">
          {ban ? <p className="kui-note kui-note--danger">账号封禁中，{ban.permanent || !ban.banned_until ? '永久封禁' : `至 ${formatChinaDateTime(ban.banned_until)}`}。{ban.reason ? `原因：${ban.reason}` : ''}</p> : null}
          {muted ? <p className="kui-note kui-note--warn">禁言中，{formatChinaDateTime(standing.muted_until)} 解除。期间可以正常登录和查看，但不能发布内容。{standing.mute_reason ? `原因：${standing.mute_reason}` : ''}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

/**
 * 「我的处罚」：累计记分、当前禁言/封禁状态、处罚记录和申诉入口。
 *
 * @param token 被封禁的账号登录被拒时拿到的临时令牌。带上它就能在登录页里查看处罚并申诉。
 */
export function PenaltyCenter({ token }: { token?: string }): JSX.Element {
  const queryClient = useQueryClient();
  const queryKey = ['moderation', 'me', token ? 'appeal-token' : 'self'] as const;
  const standingQuery = useQuery({ queryKey, queryFn: () => getModerationStanding(token), retry: false });
  const [appealError, setAppealError] = useState<{ id: number; message: string } | null>(null);
  const appeal = useMutation({
    mutationFn: ({ id, text }: { id: number; text: string }) => appealViolation(id, text, token),
    onMutate: () => setAppealError(null),
    onSuccess: (updated) => {
      queryClient.setQueryData<ModerationStanding | undefined>(queryKey, (current) => current ? { ...current, violations: current.violations?.map((item) => (item.id === updated.id ? updated : item)) } : current);
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (error, variables) => setAppealError({ id: variables.id, message: error instanceof Error ? error.message : '申诉提交失败，请稍后重试。' })
  });

  if (standingQuery.isLoading) {
    return <p className="kui-empty">正在加载处罚记录…</p>;
  }
  if (!standingQuery.data) {
    return (
      <div className="kui-empty">
        {token ? '处罚记录加载失败，临时凭证可能已过期，请重新登录一次再试。' : '处罚记录加载失败，请稍后再试。'}
        <button type="button" className="kui-btn kui-btn--sm" onClick={() => void standingQuery.refetch()}>重试</button>
      </div>
    );
  }

  const violations = standingQuery.data.violations ?? [];
  return (
    <div className="kcm">
      <Summary standing={standingQuery.data} />
      {violations.length === 0 ? <p className="kcm-section kui-empty"><Icon name="shieldCheck" className="h-6 w-6" />没有处罚记录</p> : violations.map((violation) => (
        <ViolationItem
          key={violation.id}
          violation={violation}
          pending={appeal.isPending && appeal.variables?.id === violation.id}
          error={appealError?.id === violation.id ? appealError.message : ''}
          onAppeal={(text) => appeal.mutate({ id: violation.id, text })}
        />
      ))}
    </div>
  );
}

/** 把处罚中心放进对话框：从输入框的禁言提示、通知、封禁提示里点开时用。 */
export function PenaltyCenterModal({ token, onClose }: { token?: string; onClose: () => void }): JSX.Element {
  return (
    <div className="kui kui-backdrop" onMouseDown={onClose}>
      <section className="kui-dialog" style={{ maxWidth: 560 }} role="dialog" aria-modal="true" aria-label="处罚与申诉" onMouseDown={(event) => event.stopPropagation()}>
        <header className="kui-dialog-header">
          处罚与申诉
          <button type="button" className="kui-icon-btn" aria-label="关闭" onClick={onClose}><Icon name="close" className="h-4 w-4" /></button>
        </header>
        <div className="kui-dialog-body kui-scroll">
          <PenaltyCenter token={token} />
        </div>
      </section>
    </div>
  );
}
