import { useJury } from '../context';
import { maxBanText } from '../data/growth';
import { consensusRuleText } from '../labels';
import { Card, SectionFrame } from '../widgets/Frame';
import { CommunityStats } from './CommunityStats';
import { MyStatusCard } from './MyStatusCard';

/** 这套制度是怎么运转的：写给第一次点进来的普通用户看。数字来自配置，不写死。 */
function HowItWorks(): JSX.Element {
  const { config, nav } = useJury();
  const rules = config.config.rules;
  const bulletinOpen = config.has('public_cases');
  const hasPanel = config.has('panel');
  const steps = [
    { title: '举报', text: '任何人都可以举报群聊消息或公开动态。针对同一条内容的举报会并成一个案件，只审一次。' },
    { title: '匿名评审', text: '案件分给几位风纪委员。内容经过匿名处理：看不到是谁说的、在哪个群；和当事人有关系的委员会被自动回避。' },
    { title: '表决', text: `${consensusRuleText(rules, hasPanel)}${rules.timeout_hours} 小时没有结论的案件同样转出。` },
    { title: '处置与申诉', text: `认定违规的按规则记分和处置，委员给出的封禁最长 ${maxBanText(config.config)}。被处罚的人可以申诉，管理员保留终审权。` }
  ];
  return (
    <Card title="这套制度怎么运转" aside={(
      <span className="kjr-btn-row">
        <button type="button" className="kui-btn kui-btn--ghost kui-btn--sm" onClick={() => nav.goSection('handbook')}>阅读规则手册</button>
        {bulletinOpen ? <button type="button" className="kui-btn kui-btn--ghost kui-btn--sm" onClick={() => nav.goSection('bulletin')}>查看公示栏</button> : null}
      </span>
    )}>
      <ol className="kjr-steps">
        {steps.map((step, index) => (
          <li key={step.title}>
            <span className="kjr-steps-no">{index + 1}</span>
            <p className="kjr-steps-title">{step.title}</p>
            <p className="kjr-steps-text">{step.text}</p>
          </li>
        ))}
      </ol>
      <p className="kjr-quiet">涉及私聊的内容永远不会交给风纪委员，只由管理员处理。</p>
    </Card>
  );
}

/** 总览：我的身份、社区层面的数字、制度说明。所有登录用户可读。 */
export function OverviewSection(): JSX.Element {
  return (
    <SectionFrame title="总览" subtitle="社区自己管理自己：由用户担任的风纪委员匿名评审被举报的内容">
      <div className="kjr-overview">
        <MyStatusCard />
        <CommunityStats />
      </div>
      <HowItWorks />
    </SectionFrame>
  );
}
