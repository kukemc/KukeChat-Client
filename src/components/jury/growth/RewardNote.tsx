import { cx } from '@/components/chat/desktop/runtime';
import type { JuryReward } from '@/types/juryGrowth';
import { useJury } from '../context';
import { signed } from './labels';

/**
 * 投票之后当场结算的风纪值（质控题、今日首票）。只是一行反馈，不是庆祝动画 ——
 * 案件定案后的加分要等结论出来，那时走实时事件的轻提示。
 */
export function RewardNote({ reward }: { reward: JuryReward }): JSX.Element {
  const { nav, config } = useJury();
  // 质控题投完就结算完了；普通案件还有一笔要等定案
  const agreed = reward.items.some((item) => item.kind.startsWith('quality')) ? null : config.config.points?.vote_agreed;
  return (
    <section className={cx('kjr-reward', reward.points < 0 && 'is-loss')} role="status" data-reward={reward.points}>
      <p className="kjr-reward-sum"><strong>{signed(reward.points)}</strong><span>风纪值</span></p>
      <ul className="kjr-reward-items">
        {reward.items.map((item, index) => <li key={`${item.kind}-${index}`}>{item.label}<b className={item.points < 0 ? 'kjr-no' : undefined}>{signed(item.points)}</b></li>)}
      </ul>
      <p className="kjr-reward-total">
        现在共 <b>{reward.total}</b>
        {agreed ? <span>案件定案后，判断与结论一致再 {signed(agreed)}</span> : null}
        <button type="button" className="kui-link" onClick={() => nav.goSection('mine', { tab: 'growth' })}>查看明细</button>
      </p>
    </section>
  );
}
