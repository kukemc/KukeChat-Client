import { useCallback } from 'react';
import { toast } from '@/components/ui/toast';
import type { Conversation, Message } from '@/types/api';
import { groupPlusErrorDetail, isGroupStaff, useClearGroupTodo, useGroupTodo, useSetGroupTodo } from '../data';

/** 可以设为群待办的消息类型（docs/group-plus.md 第 7 节）：系统消息、红包、礼物不行；文件消息本来就是文本。 */
const TODOABLE_TYPES: ReadonlySet<string> = new Set(['text', 'image', 'sticker', 'voice', 'forward_bundle', 'poll']);

export function isTodoable(message: Message): boolean {
  if (message.id <= 0 || message.recalled_at || !TODOABLE_TYPES.has(message.type)) {
    return false;
  }
  // 待办提醒消息本身（「[群待办] …」）再设成待办没有意义
  const reminder = message.metadata?.group_todo;
  return !(typeof reminder === 'object' && reminder !== null);
}

export interface TodoMenuAction {
  label: string;
  /** 是取消（走 DELETE）还是设置 */
  cancel: boolean;
  run: () => void;
}

function errorText(error: unknown): string {
  const detail = groupPlusErrorDetail(error);
  if (typeof detail.message === 'string' && detail.message) {
    return detail.message;
  }
  return error instanceof Error && error.message ? error.message : '操作没有成功，稍后再试。';
}

/**
 * 消息菜单里「设为群待办 / 取消群待办」那一项。桌面右键菜单和移动长按菜单共用：
 * 返回一个函数，按消息给出菜单项（不该出现时返回 null）。
 * 只有群主 / 管理员、群聊里、可设置的消息才有；已有待办时设置要二次确认（每群只能有一条，会替换）。
 */
export function useTodoMenu(conversation: Conversation | null | undefined): (message: Message) => TodoMenuAction | null {
  const conversationId = conversation?.id ?? 0;
  const todo = useGroupTodo(conversation);
  const setTodo = useSetGroupTodo(conversationId);
  const clearTodo = useClearGroupTodo(conversationId);
  const eligible = conversation?.type === 'group' && isGroupStaff(conversation);
  const mutateSet = setTodo.mutate;
  const mutateClear = clearTodo.mutate;
  const existingId = todo?.message_id ?? null;

  return useCallback((message: Message): TodoMenuAction | null => {
    if (!eligible) {
      return null;
    }
    if (existingId === message.id) {
      return {
        label: '取消群待办',
        cancel: true,
        run: () => mutateClear(undefined, {
          onSuccess: () => toast.info('已取消群待办'),
          onError: (error) => toast.error(errorText(error))
        })
      };
    }
    if (!isTodoable(message)) {
      return null;
    }
    return {
      label: '设为群待办',
      cancel: false,
      run: () => {
        if (existingId !== null && !window.confirm('当前已有一条群待办，是否替换？')) {
          return;
        }
        mutateSet(message.id, {
          onSuccess: () => toast.success('已设为群待办', { subtitle: '已通知全体成员' }),
          onError: (error) => toast.error(errorText(error))
        });
      }
    };
  }, [eligible, existingId, mutateClear, mutateSet]);
}
