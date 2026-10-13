import type { ReactNode } from 'react';
import { useJury } from '../context';
import { appealRules, panelRules } from '../data/senior';
import { phase2Guide } from '../growth/guide';
import { consensusRuleText } from '../labels';
import { Card } from '../widgets/Frame';

interface GuideItem {
  title: string;
  body: ReactNode;
}

/** 规则手册 · 委员须知。把契约文档里和委员有关的规则写成给人看的话；数字全部来自 GET /jury/config。 */
export function JurorGuide(): JSX.Element {
  const { config } = useJury();
  const rules = config.config.rules;
  const panel = panelRules(config.config);
  const opinions = config.config.opinions;
  const hasOpinions = config.has('opinions');
  const abstain = config.config.votes.find((vote) => vote.kind === 'abstain')?.label ?? '弃权';
  // 二期带来的内容（主动回避、上下文不足、严重违规的票数、弃权率、风纪值与层级）：后端没有对应能力时都是空的
  const phase2 = phase2Guide(config);

  const groups: Array<{ title: string; items: GuideItem[] }> = [
    {
      title: '评审的原则',
      items: [
        { title: '盲审', body: '案件内容是匿名的：没有用户名、头像和群名，发言人只显示为「被举报人」「成员A」这样的代称。请只根据内容本身判断，不要猜测、打听或在别处讨论当事人是谁。' },
        { title: '独立判断', body: '投票之前看不到其他委员投了什么，也看不到观点区。定案之前只能看到「已有几张有效票」，看不到分布。' },
        { title: '回避', body: `和案件有关系的委员不会被分到这个案件：当事人、举报人、被举报人的好友、对话里出现过的发言人，以及案发群的成员（大型公开群只回避前几种）。${phase2.recuse ? `这一部分由系统保证。${phase2.recuse}` : '这由系统保证，你不需要自己申报。'}` },
        // 配置里这个选项现在就叫「拿不准」，标题不能再写成「拿不准就选『拿不准』」
        { title: `判断不了就选「${abstain}」`, body: `看不懂、上下文不够、或者确实两可的时候，弃权比随手投一票更负责。弃权不计入表决，案件会交给别的委员。${phase2.needContext}` }
      ]
    },
    {
      title: '表决怎么算',
      items: [
        { title: '几票定案', body: `看的是有效票在「违规 / 不违规」上是否一致：${consensusRuleText(rules, config.has('panel'))}比如 ${rules.quick_consensus_votes} 比 1 不会定案，要等第 ${rules.seats_per_case} 张票。违规等级取违规票里偏低的中位数。` },
        // 三期：有资深合议时，定不下来的案件先进合议，再不行才到管理员
        { title: '没有共识', body: config.has('panel')
          ? `收满 ${rules.seats_per_case} 票仍达不到 ${rules.full_consensus_votes} 票一致、或者进入队列 ${rules.timeout_hours} 小时还没有结论的案件，先交给 ${panel.seats} 位资深委员合议（在原审里投过票的不参加）：他们能看到原审的票数分布和观点，${panel.consensus_votes} 票一致即定案，不能弃权。凑不齐资深委员、或者合议 ${panel.timeout_hours} 小时没有结果的，再转给管理员。`
          : `收满 ${rules.seats_per_case} 票仍达不到 ${rules.full_consensus_votes} 票一致、或者进入队列 ${rules.timeout_hours} 小时还没有结论的案件，转给管理员处理。` },
        ...(config.has('appeal_review') && config.config.switches.appeals ? [{ title: '申诉复审', body: `被处罚的人提出申诉后，符合条件的会先由 ${appealRules(config.config).seats} 位没有参加原审的资深委员复审：维持、减轻或撤销。撤销时原案件按改判处理，参与原审的委员「是否与结论一致」会跟着更新。管理员仍然可以复核。` }] : []),
        ...phase2.voting,
        { title: '时限', body: `分到手的案件请在 ${rules.assignment_ttl_hours} 小时内投票，超时会让给其他委员。每人 24 小时内最多评 ${rules.daily_votes} 件（按最近 24 小时滚动计算，不在零点清零）。` },
        { title: '投出去的票不能改', body: '提交后不能修改，并且会真实生效 —— 你的一票可能直接让一个人被禁言。所以提交前有一步确认。' }
      ]
    },
    {
      title: '质控与任期',
      items: [
        { title: '质控题', body: '案件里混有已经有标准结论的质控题，投票前和普通案件看起来一样。投完会立刻告诉你这是质控题，并给出标准结论，作为校准尺度的反馈。质控题不会对任何人产生处罚。准确率持续过低会被暂停资格。' },
        { title: '一致率', body: '你的票和最终结论一致的比例，只统计已经定案、且你没有弃权的票。它不是考核指标的全部：认真写理由、在拿不准时弃权，同样重要。案件被改判后，一致与否会跟着更新。' },
        { title: '任期', body: `每届任期 ${rules.term_days} 天。任期届满后条件仍然满足的，续任不需要重新审批。受到处罚期间不能评审。` },
        ...phase2.standing
      ]
    },
    ...(phase2.growth ? [phase2.growth] : []),
    {
      title: '观点区与公示',
      items: [
        ...(hasOpinions ? [
          { title: '观点区', body: `投票之后，可以在这个案件的观点区看到其他委员的理由并参与讨论；投票时写的理由会成为你的第一条观点。每条不超过 ${opinions.max_length} 字，大家都用案件内的匿名代号，不同案件之间代号不关联。` },
          { title: '讨论的规矩', body: `就事论事。不要人身攻击，不要泄露或猜测任何人的身份，不要整段照抄违规原文。不合适的观点可以举报，同一条被 ${opinions.auto_hide_reports} 位委员举报后会先折叠，交给管理员处理。` }
        ] : []),
        { title: '回看', body: `你投过的案件随时可以在「我的评审」里回看。案件内容保留 ${rules.content_retention_days} 天，从定案和你投票这两个时间里较晚的那个算起；之后只保留结论和票数。` },
        { title: '公示', body: `定案满 ${rules.publish_delay_hours} 小时、且没有待处理的申诉后，案件进入公示栏。只有被认定违规的公开动态会附上匿名的原文；群聊消息的内容、认定不违规的内容和所有图片都不公示。` },
        { title: '不进委员队列的内容', body: '涉及私聊的内容、色情低俗和涉及未成年人的内容，不会交给风纪委员，只由管理员处理。' }
      ]
    }
  ];

  return (
    <>
      {groups.map((group) => (
        <Card key={group.title} title={group.title}>
          <dl className="kjr-guide">
            {group.items.map((item) => <div key={item.title}><dt>{item.title}</dt><dd>{item.body}</dd></div>)}
          </dl>
        </Card>
      ))}
    </>
  );
}
