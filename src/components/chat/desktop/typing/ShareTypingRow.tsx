import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateMyProfile } from '@/api/users';
import { Row, Toggle } from '@/components/settings/desktop/settingsUi';
import { useKukeStore } from '@/store/kukeStore';

/** 设置里的隐私开关。只管自己的输入状态要不要上报，别人的照常能看到。 */
export function ShareTypingRow(): JSX.Element {
  const queryClient = useQueryClient();
  // 老版本服务端不返回这个字段，按默认值「开」处理
  const shareTyping = useKukeStore((state) => state.currentUser?.share_typing !== false);
  const setCurrentUser = useKukeStore((state) => state.setCurrentUser);
  const save = useMutation({
    mutationFn: (share_typing: boolean) => updateMyProfile({ share_typing }),
    onSuccess: (updated) => {
      setCurrentUser(updated);
      void queryClient.invalidateQueries({ queryKey: ['me'] });
    }
  });
  return (
    <Row icon="edit" title="向他人显示我正在输入" description={save.isError ? '保存失败，请重试。' : '关闭后别人看不到你正在输入，你仍然能看到别人的。'}>
      <Toggle label="向他人显示我正在输入" checked={save.isPending ? save.variables : shareTyping} disabled={save.isPending} onChange={(on) => save.mutate(on)} />
    </Row>
  );
}
