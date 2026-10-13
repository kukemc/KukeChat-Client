import type { JuryConfigState } from '../data/queries';
import { percent, signed, tierName } from './labels';

interface GuideItem {
  title: string;
  body: string;
}

/**
 * 「委员须知」里二期带来的内容：新投票选项、严重违规的票数要求、弃权率、风纪值与层级。
 * 后端没有对应能力时各项为空，手册保持一期的样子。数字全部来自 GET /jury/config。
 */
export function phase2Guide(state: JuryConfigState): { recuse: string; needContext: string; voting: GuideItem[]; standing: GuideItem[]; growth: { title: string; items: GuideItem[] } | null } {
  const config = state.config;
  const votesV2 = state.has('votes_v2');
  const recuse = config.recuse;
  const abstain = config.abstain;
  const voting: GuideItem[] = [];
  const standing: GuideItem[] = [];
  if (votesV2 && config.rules.severe_min_votes) {
    voting.push({ title: '严重违规要更多票', body: `按现有的票会定为「严重」时，至少要有 ${config.rules.severe_min_votes} 张有效票才定案；不够就继续收票。越重的处置，越需要更多人看过。` });
  }
  if (votesV2 && (config.categories?.length ?? 0) > 0) {
    voting.push({ title: '违规类别', body: '投违规票时可以顺手选它属于哪一类，默认按举报理由预选。最终类别取违规票里的多数；类别只影响记录和公示的归类，记分和处置由等级决定。' });
  }
  if (votesV2 && abstain) {
    standing.push({ title: '弃权太多', body: `弃权是负责的选择，但不能成为习惯：最近 ${abstain.window} 张票里（不足 ${abstain.min_votes} 张不算）「拿不准」和「上下文不足」超过 ${percent(abstain.warn_rate)} 会收到提示，超过 ${percent(abstain.cooldown_rate)} 会暂停发案 ${abstain.cooldown_hours} 小时。这不是处罚，恢复之前可以在练习场校准尺度。` });
  }

  const items: GuideItem[] = [];
  const points = state.has('points') ? config.points : undefined;
  if (points) {
    items.push({ title: '风纪值', body: `记录你为评审出的力：案件定案时，票与结论一致 ${signed(points.vote_agreed ?? 0)}、不一致也有 ${signed(points.vote_disagreed ?? 0)}；质控题答对 ${signed(points.quality_correct ?? 0)}、答错 ${signed(points.quality_wrong ?? 0)}。弃权、回避和练习不给分。它只用于排行榜和成就，不能兑换任何东西，也不决定层级。` });
  }
  if (state.has('tiers')) {
    const regular = config.tiers.find((tier) => tier.key === 'regular')?.requirements;
    const senior = config.tiers.find((tier) => tier.key === 'senior');
    if (regular) {
      items.push({ title: '层级', body: `见习 → 正式 → 资深，条件满足时自动晋升，不需要申请。晋升${tierName(config, 'regular')}要已结 ${regular.votes_settled} 票、一致率 ${percent(regular.agreement_rate)}、在任 ${regular.days_served} 天${senior?.requirements ? `；晋升${tierName(config, 'senior')}要已结 ${senior.requirements.votes_settled} 票、一致率 ${percent(senior.requirements.agreement_rate)}、在任 ${senior.requirements.days_served} 天` : ''}。质控正确率在答够一定数量后也会计入。` });
    }
    const demote = senior?.demote_below;
    if (demote) {
      items.push({ title: '降级', body: `降级只看一致率，不看数量：最近 ${demote.window} 张已出结论的票（不足 ${demote.min_votes} 张不判断）一致率低于降级线，就降一级。管理员直接任命的层级同样适用。` });
    }
  }
  if (state.has('badge')) {
    items.push({ title: '公开身份', body: '是否让别人看到你是风纪委员，由你自己决定，默认不公开。公开后聊天里的昵称旁和资料卡上会有层级徽章，排行榜上显示昵称；案件和观点区里始终是匿名代号，不受影响。' });
  }

  return {
    recuse: votesV2 ? `系统查不到的关系 —— 比如你从内容里认出了当事人，或者这件事和你有利害关系 —— 请选「主动回避」：案件会改派给别人，不计入你的评审数和一致率${recuse ? `，24 小时内最多 ${recuse.daily_limit} 次` : ''}。回避之后不能再查看这个案件。` : '',
    needContext: votesV2 && config.votes.some((vote) => vote.value === 'need_context') ? `如果是把全部上下文都展开看完、仍然判断不了，选「上下文不足」${config.rules.need_context_votes ? `：同一个案件累计 ${config.rules.need_context_votes} 张这样的票会转给${state.has('panel') ? '资深合议' : '管理员'}处理` : ''}。` : '',
    voting,
    standing,
    growth: items.length > 0 ? { title: '风纪值与层级', items } : null
  };
}
