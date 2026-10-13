import type { JuryStatus } from '@/types/jury';
import { useJury } from '../context';
import { useBadgeVisibility } from '../data/growth';
import { errorCode, errorText } from '../data/queries';
import { Card } from '../widgets/Frame';
import { JuryBadge } from './JuryBadge';

/**
 * 公开展示委员身份的开关（PUT /jury/me/settings）。默认不展示。
 * 要讲清两件事：打开后别人在哪里看到什么；以及案件里的匿名不受它影响。
 */
export function BadgeSetting({ status }: { status: JuryStatus }): JSX.Element {
  const { identity } = useJury();
  const mutation = useBadgeVisibility();
  const visible = Boolean(status.badge_visible);
  const tier = identity.tier ?? 'trainee';
  return (
    <Card title="公开展示委员身份" aside={<span className="kjr-meta">{visible ? '已公开' : '未公开（默认）'}</span>} className="kjr-badge-setting">
      <label className="kjr-badge-switch">
        <input type="checkbox" className="kui-switch" role="switch" data-action="badge-visible" checked={visible} disabled={mutation.isPending} onChange={(event) => mutation.mutate(event.target.checked)} />
        <span>
          <b>让别人看到我是风纪委员</b>
          <small>{identity.isJuror ? '随时可以关掉。关掉后不再对外展示，别人已经打开的画面要等刷新才会消失。' : '只有在任期间徽章才会展示；现在打开，下次任职时生效。'}</small>
        </span>
      </label>
      {mutation.error ? (
        <p className="kui-note kui-note--danger" role="alert" data-badge-error={errorCode(mutation.error) ?? 'error'}>
          {errorCode(mutation.error) === 'not_juror' ? '这一项只有当过风纪委员的人才能设置。成为委员之后再来打开它。' : errorText(mutation.error, '设置没有保存，请稍后再试。')}
        </p>
      ) : null}
      <dl className="kjr-guide">
        <div>
          <dt>打开后会显示在</dt>
          <dd>
            聊天里你的昵称旁边和你的资料卡上，会多一个层级徽章：<span className="kjr-badge-sample"><JuryBadge tier={tier} variant="card" /></span>；
            排行榜上显示你的昵称和头像（不公开时显示为「匿名委员」）。
          </dd>
        </div>
        <div>
          <dt>永远不会公开的</dt>
          <dd>你评审过哪些案件、投了什么票、在观点区说过什么。案件和观点区里用的始终是案件内的匿名代号，和这个徽章对不上号。</dd>
        </div>
        <div>
          <dt>公开之前想一想</dt>
          <dd>公开身份意味着群里的人知道你在参与评审，可能有人来打听案件或求情。遇到这种情况不要回应；和你有关系的案件请用「主动回避」。</dd>
        </div>
      </dl>
    </Card>
  );
}
