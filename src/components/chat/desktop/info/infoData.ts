import { useEffect, useState } from 'react';
import { useIsMutating, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { getIncomingGroupJoinRequests, updateGroupSettings, updateMyConversationSettings } from '@/api/conversations';
import type { Conversation, ConversationMember, GroupJoinRequest, UpdateGroupSettingsPayload, UpdateMyConversationSettingsPayload } from '@/types/api';
import { memberUserId } from '../../message/messageMeta';
import type { ConversationMembersPageData, MessagesInfiniteData } from '../../message/types';
import { useInfo } from './infoContext';

export function invalidateConversationData(queryClient: QueryClient, conversationId: number): void {
  void queryClient.invalidateQueries({ queryKey: ['conversation-members', conversationId] });
  void queryClient.invalidateQueries({ queryKey: ['conversation-members-page', conversationId] });
  void queryClient.invalidateQueries({ queryKey: ['conversations'] });
}

export async function cancelMemberQueries(queryClient: QueryClient, conversationId: number): Promise<void> {
  await queryClient.cancelQueries({ queryKey: ['conversation-members', conversationId] });
  await queryClient.cancelQueries({ queryKey: ['conversation-members-page', conversationId] });
}

/** 成员数据有整表和分页两份缓存，改一个成员要两边一起改。 */
export function patchMemberCache(queryClient: QueryClient, conversationId: number, userId: number, patch: Partial<ConversationMember>): void {
  queryClient.setQueryData<ConversationMember[] | undefined>(['conversation-members', conversationId], (current) => current?.map((member) => (
    memberUserId(member) === userId ? { ...member, ...patch } : member
  )));
  queryClient.setQueriesData<ConversationMembersPageData | undefined>({ queryKey: ['conversation-members-page', conversationId] }, (current) => current ? {
    ...current,
    pages: current.pages.map((page) => ({ ...page, items: page.items.map((member) => (memberUserId(member) === userId ? { ...member, ...patch } : member)) }))
  } : current);
}

/** 群昵称还印在已加载的消息上，一并改掉，否则要等下次拉消息才更新。 */
export function patchNicknameCache(queryClient: QueryClient, conversationId: number, userId: number, nickname: string | null): void {
  patchMemberCache(queryClient, conversationId, userId, { nickname });
  queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', conversationId], (current) => current ? {
    ...current,
    pages: current.pages.map((page) => page.map((message) => (message.sender_id === userId ? { ...message, sender_display_name: nickname } : message)))
  } : current);
}

/** 开关、下拉这类「点了立刻生效」的控件：先显示用户选的值，服务端数据变了再跟过去。 */
export function useDraft<T>(source: T): [T, (value: T) => void] {
  const [draft, setDraft] = useState(source);
  useEffect(() => setDraft(source), [source]);
  return [draft, setDraft];
}

/** 本群收到的入群申请。接口返回的是我管理的所有群的申请，这里筛出当前群的。 */
export function useJoinRequests(): { requests: GroupJoinRequest[]; pendingCount: number; loading: boolean } {
  const { conversation, canManage } = useInfo();
  const query = useQuery({
    queryKey: ['group-join-requests', 'incoming'],
    queryFn: getIncomingGroupJoinRequests,
    enabled: canManage
  });
  const requests = (query.data ?? []).filter((request) => request.conversation_id === conversation.id);
  return { requests, pendingCount: requests.filter((request) => request.status === 'pending').length, loading: query.isLoading };
}

interface SettingsSaver<Payload> {
  /** onError 用来把控件退回保存前的值；onSuccess 给需要等保存成功再收尾的地方（比如关对话框） */
  save: (payload: Payload, onError?: () => void, onSuccess?: () => void) => void;
  pending: boolean;
}

/** 群设置（禁言、限频、加群方式、任务）。多个区块各持一个实例，按 mutationKey 汇总成同一个「保存中」。 */
export function useGroupSettings(): SettingsSaver<UpdateGroupSettingsPayload> {
  const { conversation, notify } = useInfo();
  const queryClient = useQueryClient();
  const mutationKey = ['group-settings', conversation.id];
  const mutation = useMutation({
    mutationKey,
    mutationFn: ({ conversationId, payload }: { conversationId: number; payload: UpdateGroupSettingsPayload }) => updateGroupSettings(conversationId, payload),
    onSuccess: (_conversation, variables) => {
      notify('');
      invalidateConversationData(queryClient, variables.conversationId);
    },
    // 服务端校验不过时会给出可以直接展示的中文原因（比如头衔里有不合适的内容）
    onError: (error) => notify(error instanceof Error && /[\u4e00-\u9fa5]/.test(error.message) ? error.message : '群设置保存失败，请稍后重试。', 'error')
  });
  const pending = useIsMutating({ mutationKey }) > 0;
  return { save: (payload, onError, onSuccess) => mutation.mutate({ conversationId: conversation.id, payload }, { onError, onSuccess }), pending };
}

/** 我在这个会话里的个人设置（昵称、备注、置顶、免打扰）。 */
export function useMySettings(): SettingsSaver<UpdateMyConversationSettingsPayload> {
  const { conversation, currentUser, notify } = useInfo();
  const queryClient = useQueryClient();
  const mutationKey = ['my-conversation-settings', conversation.id];
  const mutation = useMutation({
    mutationKey,
    mutationFn: ({ conversationId, payload }: { conversationId: number; payload: UpdateMyConversationSettingsPayload }) => updateMyConversationSettings(conversationId, payload),
    onMutate: async ({ conversationId, payload }) => {
      if (Object.prototype.hasOwnProperty.call(payload, 'nickname')) {
        await cancelMemberQueries(queryClient, conversationId);
        await queryClient.cancelQueries({ queryKey: ['messages', conversationId] });
        patchNicknameCache(queryClient, conversationId, currentUser.id, payload.nickname?.trim() || null);
      }
    },
    onSuccess: (member, { conversationId, payload }) => {
      notify('');
      if (Object.prototype.hasOwnProperty.call(payload, 'nickname')) {
        patchNicknameCache(queryClient, conversationId, currentUser.id, member.nickname ?? null);
      }
      queryClient.setQueryData<Conversation[]>(['conversations'], (current) => current?.map((item) => (item.id === conversationId ? {
        ...item,
        my_nickname: member.nickname,
        my_do_not_disturb: member.do_not_disturb,
        my_message_setting: member.message_setting
      } : item)) ?? current);
      invalidateConversationData(queryClient, conversationId);
    },
    onError: (_error, { conversationId }) => {
      invalidateConversationData(queryClient, conversationId);
      void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      notify('个人设置保存失败，请稍后重试。', 'error');
    }
  });
  const pending = useIsMutating({ mutationKey }) > 0;
  return { save: (payload, onError) => mutation.mutate({ conversationId: conversation.id, payload }, { onError }), pending };
}
