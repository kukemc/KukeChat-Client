import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createGroupConversation } from '@/api/conversations';
import { useKukeStore } from '@/store/kukeStore';
import type { Friendship } from '@/types/api';

export interface CreateGroupModalProps {
  friends: Friendship[];
  mobile?: boolean;
  onClose: () => void;
}

/** 创建群聊的表单状态和提交。建好后直接切到新群并关掉弹窗。 */
export function useCreateGroup(onClose: () => void) {
  const [title, setTitle] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const queryClient = useQueryClient();
  const setActiveConversationId = useKukeStore((state) => state.setActiveConversationId);

  const mutation = useMutation({
    mutationFn: createGroupConversation,
    onSuccess: (conversation) => {
      setActiveConversationId(conversation.id);
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      onClose();
    }
  });

  function toggle(friendId: number): void {
    setSelectedIds((current) => (current.includes(friendId) ? current.filter((id) => id !== friendId) : [...current, friendId]));
  }

  function submit(event?: React.FormEvent<HTMLFormElement>): void {
    event?.preventDefault();
    if (!title.trim()) {
      return;
    }
    mutation.mutate({ title: title.trim(), member_ids: selectedIds });
  }

  return { title, setTitle, selectedIds, toggle, submit, isPending: mutation.isPending, error: mutation.error };
}
