import { Icon } from '@/components/ui/Icon';
import { useJury } from '../context';
import { useHallRules } from '../data/hall';
import { formatDateTime } from '../labels';
import { Card } from '../widgets/Frame';
import { guidelineLines, proposalRuleText } from './labels';

/**
 * 我在议事厅里是什么角色。只用来决定界面上给不给入口、怎么说明；
 * 真正的权限以服务端为准（帖子上的 can_comment / can_edit / vote.can_vote，以及写接口的 403）。
 */
export type HallRole = 'guest' | 'restricted' | 'trainee' | 'member';

export function useHallRole(): HallRole {
  const { identity } = useJury();
  if (!identity.isJuror) return 'guest';
  if (identity.restricted) return 'restricted';
  return identity.tier === 'trainee' ? 'trainee' : 'member';
}

/** 议事厅是实名的 —— 这句话在列表、详情、发帖页都要出现，让人一眼分清它和案件里的匿名区不一样。 */
export function RealNameNotice(): JSX.Element {
  return (
    <p className="kjr-hall-realname">
      <Icon name="eye" className="h-4 w-4" />
      <span><b>这里是实名的公开讨论区。</b>帖子和评论会带着你的昵称和头像，全站登录用户都能看到 —— 和案件里的匿名评审正相反。</span>
    </p>
  );
}

const CAN: Record<HallRole, Array<{ text: string; ok: boolean }>> = {
  guest: [{ text: '阅读全部帖子和评论', ok: true }, { text: '评论、参与提案表决', ok: false }, { text: '发起提案和讨论', ok: false }],
  restricted: [{ text: '阅读全部帖子和评论', ok: true }, { text: '评论、参与提案表决', ok: false }, { text: '发起提案和讨论', ok: false }],
  trainee: [{ text: '阅读全部帖子和评论', ok: true }, { text: '评论、参与提案表决', ok: true }, { text: '发起提案和讨论', ok: false }],
  member: [{ text: '阅读全部帖子和评论', ok: true }, { text: '评论、参与提案表决', ok: true }, { text: '发起提案和讨论', ok: true }]
};

/** 侧栏：我能做什么、守则、提案怎么算。列表页和详情页共用。 */
export function HallGuide(): JSX.Element {
  const { identity, nav, openPenalties } = useJury();
  const rules = useHallRules();
  const role = useHallRole();
  const guidelines = guidelineLines(rules);

  return (
    <Card className="kjr-hall-guide">
      <section className="kjr-hall-guide-block" data-role={role}>
        <h3 className="kjr-h">我能做什么</h3>
        <ul className="kjr-hall-can">
          {CAN[role].map((item) => <li key={item.text} className={item.ok ? 'is-ok' : 'is-no'}><Icon name={item.ok ? 'check' : 'minus'} className="h-3.5 w-3.5" />{item.text}</li>)}
        </ul>
        {role === 'guest' ? (
          <>
            <p className="kjr-quiet">成为风纪委员后可以参与讨论和表决。</p>
            <button type="button" className="kui-btn kui-btn--sm" data-action="hall-join" onClick={() => nav.goSection('overview')}>看看怎样成为委员</button>
          </>
        ) : role === 'restricted' ? (
          <>
            <p className="kui-note kui-note--warn">你的账号正在受处罚，期间不能在议事厅发言和表决{identity.restriction?.until ? `，${formatDateTime(identity.restriction.until)} 恢复` : ''}。</p>
            <button type="button" className="kui-btn kui-btn--sm" onClick={openPenalties}>处罚与申诉</button>
          </>
        ) : role === 'trainee' ? (
          <p className="kjr-quiet">见习委员可以评论和表决；晋升为正式委员后可以发帖。</p>
        ) : (
          <p className="kjr-quiet">每人 24 小时内最多发 {rules.posts_per_day} 个帖子、{rules.comments_per_day} 条评论（滚动计算，不在零点清零）。</p>
        )}
      </section>
      <section className="kjr-hall-guide-block">
        <h3 className="kjr-h">议事厅守则</h3>
        <ul className="kjr-doc-list">
          <li><b>不要讨论具体的未结案件。</b>还在评审中的案件只能在它自己的观点区里说，而且要先投票。</li>
          {guidelines.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </section>
      <section className="kjr-hall-guide-block">
        <h3 className="kjr-h">提案怎么算</h3>
        <p className="kjr-quiet">{proposalRuleText(rules)}</p>
      </section>
    </Card>
  );
}
