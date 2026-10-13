import type { User } from './api';

export interface PollOption {
  id: number;
  text: string;
  votes: number;
}

/** 消息里的投票对象：`message.metadata.poll`。 */
export interface Poll {
  id: number;
  title: string;
  options: PollOption[];
  multiple: boolean;
  anonymous: boolean;
  /** 截止时间（ISO，UTC）；null 表示手动结束前一直有效 */
  closes_at: string | null;
  closed: boolean;
  closed_at: string | null;
  /** 参与人数；多选时不等于票数之和 */
  total_voters: number;
  my_option_ids: number[];
}

/** `poll.updated` 事件带的汇总。只有票数和状态，没有「我投了哪些」。 */
export interface PollSummary {
  conversation_id: number;
  message_id: number;
  poll_id: number;
  options: Array<Pick<PollOption, 'id' | 'votes'>>;
  total_voters: number;
  closed: boolean;
  closed_at: string | null;
}

/** 投票接口的返回：汇总加上自己的选择。 */
export interface PollState extends PollSummary {
  my_option_ids: number[];
}

export interface CreatePollPayload {
  title: string;
  options: string[];
  multiple: boolean;
  anonymous: boolean;
  closes_at: string | null;
}

export interface PollVotersPage {
  items: User[];
  total: number;
}
