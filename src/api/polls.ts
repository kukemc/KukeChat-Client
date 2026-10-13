import { apiRequest } from './client';
import type { Message } from '@/types/api';
import type { CreatePollPayload, PollState, PollVotersPage } from '@/types/polls';

export async function createPoll(conversationId: number, payload: CreatePollPayload): Promise<Message> {
  return apiRequest<Message>(`/conversations/${conversationId}/polls`, { method: 'POST', body: payload });
}

export async function getPollState(conversationId: number, pollId: number): Promise<PollState> {
  return apiRequest<PollState>(`/conversations/${conversationId}/polls/${pollId}`);
}

/** 提交的是完整的选项集合，会替换之前的选择；空数组表示撤票。 */
export async function votePoll(conversationId: number, pollId: number, optionIds: number[]): Promise<PollState> {
  return apiRequest<PollState>(`/conversations/${conversationId}/polls/${pollId}/vote`, { method: 'PUT', body: { option_ids: optionIds } });
}

export async function closePoll(conversationId: number, pollId: number): Promise<PollState> {
  return apiRequest<PollState>(`/conversations/${conversationId}/polls/${pollId}/close`, { method: 'POST' });
}

export async function getPollVoters(conversationId: number, pollId: number, optionId: number, offset: number, limit: number): Promise<PollVotersPage> {
  return apiRequest<PollVotersPage>(`/conversations/${conversationId}/polls/${pollId}/options/${optionId}/voters?limit=${limit}&offset=${offset}`);
}
