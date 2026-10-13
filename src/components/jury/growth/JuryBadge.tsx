import { cx } from '@/components/chat/desktop/runtime';

/** 用户对象上的 jury_badge：在任、且本人选择公开时才有值（docs/jury-v2.md 2.9）。 */
export type JuryBadgeTier = 'trainee' | 'regular' | 'senior';

const BADGE_TEXT: Record<JuryBadgeTier, string> = { trainee: '见习风纪', regular: '风纪委员', senior: '资深风纪' };
const BADGE_TITLE: Record<JuryBadgeTier, string> = { trainee: '见习风纪委员', regular: '正式风纪委员', senior: '资深风纪委员' };

function isBadgeTier(value: unknown): value is JuryBadgeTier {
  return value === 'trainee' || value === 'regular' || value === 'senior';
}

/**
 * 公开展示的委员徽章：聊天里昵称旁（chat）、资料卡的标签行（card）、成员列表里只放一个小标记（icon）。
 * 和等级 / 头衔标签是一家：不描边，淡底色 + 同色字。只有本人选择公开的在任委员才有，
 * 而且它只说明「这个人是委员」—— 案件和观点区里委员永远是匿名代号，和这个徽章对不上号。
 */
export function JuryBadge({ tier, variant = 'chat' }: { tier: string | null | undefined; variant?: 'chat' | 'card' | 'icon' }): JSX.Element | null {
  if (!isBadgeTier(tier)) {
    return null;
  }
  return (
    <span className={cx(variant === 'card' ? 'kui-tag' : variant === 'chat' ? 'kcd-tag' : null, 'kjr-badge', `kjr-badge--${variant}`, `is-${tier}`)} title={`${BADGE_TITLE[tier]} · 参与社区的匿名评审`} data-jury-badge={tier}>
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <path className="kjr-badge-shield" d="M6 1 10.2 2.6v3.3c0 2.5-1.7 4.3-4.2 5.1-2.5-.8-4.2-2.6-4.2-5.1V2.6Z" />
        {tier === 'trainee' ? null : <path className="kjr-badge-mark" d={tier === 'senior' ? 'M4 5.3 6 4l2 1.3M4 7.5 6 6.2l2 1.3' : 'M4 6.6 6 5.2l2 1.4'} />}
      </svg>
      {variant === 'icon' ? <span className="kjr-badge-sr">{BADGE_TITLE[tier]}</span> : BADGE_TEXT[tier]}
    </span>
  );
}
