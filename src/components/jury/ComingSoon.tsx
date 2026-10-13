import { Icon, type IconName } from '@/components/ui/Icon';
import { SectionFrame } from './widgets/Frame';

export interface ComingSoonCopy {
  title: string;
  icon: IconName;
  /** 一句话说清这个板块将来是什么 */
  lead: string;
  points: string[];
}

/**
 * 还没开放的板块和页签的说明文字。只描述已经确定的产品方向，不放任何假数据、假按钮。
 * 板块做出来之后，从这里删掉对应的一项，并在 JuryPage.tsx 的 SECTION_VIEWS 里登记组件。
 */
export const COMING_SOON: Record<'practice' | 'ranking' | 'forum' | 'senior' | 'bulletin' | 'precedents' | 'exam', ComingSoonCopy> = {
  practice: {
    title: '练习场',
    icon: 'sparkles',
    lead: '用已经有结论的案例练手：流程和真实评审一样，投完立刻看到标准结论和要旨。',
    points: ['满足申请条件的用户都能做，不需要先成为委员', '练习不计入一致率，也不会对任何人产生处罚', '入门考试就是「计分的一轮练习」']
  },
  ranking: {
    title: '排行榜',
    icon: 'star',
    lead: '按风纪值排出的周榜、月榜和总榜，以及委员的层级和成就徽章。',
    points: ['风纪值来自已结案件里的投票、质控题和被认可的观点', '只有选择公开身份的委员显示昵称和头像，其余显示为匿名委员', '自己的名次随时能看到']
  },
  forum: {
    title: '议事厅',
    icon: 'announcement',
    lead: '委员和管理员公开讨论规则的地方：公告、规则提案和日常讨论。',
    points: ['正式及以上的委员可以发起规则提案，在任委员在限期内表决', '全站可读；这里是实名的，不讨论具体的未结案件', '通过的提案由管理员决定是否采纳并说明理由']
  },
  senior: {
    title: '资深工作台',
    icon: 'shieldCheck',
    lead: '资深委员处理更难的案件：普通评审没有共识的案件，以及对处罚的申诉复审。',
    points: ['三位资深委员合议，可以看到原审的票数分布和观点', '申诉复审可以维持、减轻或撤销原处罚', '管理员仍然保留终审权']
  },
  bulletin: {
    title: '公示栏',
    icon: 'list',
    lead: '委员评审并已定案的案件会在这里公示：举报理由、结论、等级、票数和用时。',
    points: ['所有登录用户都能看', '群聊消息类的案件不展示消息原文，认定不违规的只公示结论和票数', '定案后过了申诉期才会公示']
  },
  precedents: {
    title: '判例',
    icon: 'bookmark',
    lead: '被标为判例的已定案件，附一段裁判要旨，帮助大家对同类情况形成一致的尺度。',
    points: ['由资深委员和管理员标注', '全站可读要旨；案件内容的可见范围与公示栏相同']
  },
  exam: {
    title: '入门考试',
    icon: 'edit',
    lead: '申请成为委员前的一轮计分练习：先读规则手册，再判断一组已有结论的案例。',
    points: ['题目匿名，只判断「违规 / 不违规」', '答完会给出每一题的标准结论和说明', '未通过可以隔一段时间重考']
  }
};

/** 板块或页签的「即将开放」占位：说明它将来是什么。不做任何假功能。 */
export function ComingSoonBody({ copy, note }: { copy: ComingSoonCopy; note?: string }): JSX.Element {
  return (
    <div className="kjr-soon">
      <span className="kjr-soon-icon"><Icon name={copy.icon} className="h-6 w-6" /></span>
      <p className="kjr-soon-tag"><span className="kui-tag kui-tag--accent">即将开放</span></p>
      <h2>{copy.title}</h2>
      <p className="kjr-soon-lead">{copy.lead}</p>
      <ul>{copy.points.map((point) => <li key={point}>{point}</li>)}</ul>
      {note ? <p className="kjr-soon-note">{note}</p> : null}
    </div>
  );
}

export function ComingSoonSection({ copy, note }: { copy: ComingSoonCopy; note?: string }): JSX.Element {
  return <SectionFrame title={copy.title}><ComingSoonBody copy={copy} note={note} /></SectionFrame>;
}
