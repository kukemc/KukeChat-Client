import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { getDesktopPortalRoot, Modal } from '@/components/ui/desktop/Modal';
import { toast } from '@/components/ui/toast';
import { renderLinkedPreview } from '@/components/chat/message/messageText';
import { registerNativeBackHandler } from '@/native/back';
import { useKukeStore } from '@/store/kukeStore';
import type { Conversation } from '@/types/api';
import type { GroupTodo } from '@/types/groupPlus';
import { resolveAssetUrl } from '@/utils/assetUrl';
import { formatMessageDateTime } from '@/utils/dateTime';
import { groupPlusErrorDetail, isGroupStaff, useClearGroupTodo } from '../data';
import { useGroupPlusUi } from '../ui';

function imagesOf(todo: GroupTodo): string[] {
  const snapshot = todo.snapshot;
  if (!snapshot) {
    return [];
  }
  const list = snapshot.metadata?.images;
  const fromMeta = Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : [];
  if (snapshot.type === 'image' && snapshot.content) {
    return [snapshot.content, ...fromMeta];
  }
  return fromMeta;
}

/** 全文内容。快照是设置待办那一刻固化的，所以和原消息有没有被清理无关。 */
function TodoContent({ todo }: { todo: GroupTodo }): JSX.Element {
  const snapshot = todo.snapshot;
  const images = imagesOf(todo);
  const isImageOnly = snapshot?.type === 'image';
  const text = isImageOnly ? '' : snapshot?.content || todo.summary;
  return (
    <div className="kgt-detail">
      <p className="kgt-detail-note">原消息已不在聊天记录中（超出云端保留条数被清理），以下是设置待办时保存的内容。</p>
      {todo.recalled ? <p className="kgt-detail-empty">原消息已被撤回，内容已隐藏。</p> : (
        <>
          <header className="kgt-detail-who">
            <Avatar label={snapshot?.sender?.display_name ?? '群成员'} avatarUrl={snapshot?.sender?.avatar_url} size="sm" toneKey={snapshot?.sender?.id} />
            <span>{snapshot?.sender?.display_name ?? '群成员'}</span>
            {snapshot?.created_at ? <time>{formatMessageDateTime(snapshot.created_at)}</time> : null}
          </header>
          {text ? <div className="kgt-detail-text">{renderLinkedPreview(text)}</div> : null}
          {snapshot && snapshot.type === 'voice' ? <p className="kgt-detail-empty">[语音]</p> : null}
          {snapshot && snapshot.type === 'forward_bundle' && !text ? <p className="kgt-detail-empty">[聊天记录]</p> : null}
          {images.map((url, index) => {
            const src = resolveAssetUrl(url);
            return src ? <img key={`${url}-${index}`} className="kgt-detail-image" src={src} alt="待办图片" loading="lazy" /> : null;
          })}
        </>
      )}
      {todo.set_by ? <p className="kgt-detail-by">{todo.set_by.display_name} 于 {formatMessageDateTime(todo.set_at)} 设为群待办</p> : null}
    </div>
  );
}

/** 「查看全文」：原消息已经不在了（被修剪）时，群待办条点开的面板。桌面是对话框，移动是整页。 */
export function GroupTodoDetailHost(): JSX.Element | null {
  const todo = useGroupPlusUi((state) => state.todoDetail);
  const close = useGroupPlusUi((state) => state.closeTodoDetail);
  const mobile = useKukeStore((state) => state.layoutMode === 'mobile');
  const queryClient = useQueryClient();
  const conversation = todo ? queryClient.getQueryData<Conversation[]>(['conversations'])?.find((item) => item.id === todo.conversation_id) : undefined;
  const staff = isGroupStaff(conversation);
  const clear = useClearGroupTodo(todo?.conversation_id ?? 0);
  const active = todo !== null;

  useEffect(() => {
    if (!active || !mobile) {
      return undefined;
    }
    return registerNativeBackHandler(() => {
      close();
      return true;
    }, 170);
  }, [active, close, mobile]);

  if (!todo) {
    return null;
  }
  const cancel = (): void => {
    clear.mutate(undefined, {
      onSuccess: () => {
        toast.info('已取消群待办');
        close();
      },
      onError: (error) => {
        const detail = groupPlusErrorDetail(error);
        toast.error(typeof detail.message === 'string' && detail.message ? detail.message : '取消失败，稍后再试。');
      }
    });
  };
  const cancelButton = staff ? (
    <button type="button" className={mobile ? 'kgt-m-danger' : 'kui-btn kui-btn--ghost kmd-danger'} disabled={clear.isPending} onClick={cancel}>{clear.isPending ? '取消中…' : '取消群待办'}</button>
  ) : null;

  if (!mobile) {
    return <Modal title="群待办" className="kmd-modal--md" footer={cancelButton} onClose={close}><TodoContent todo={todo} /></Modal>;
  }
  return createPortal(
    <div className="kgt-m-page">
      <header className="kgt-m-head">
        <button type="button" onClick={close} aria-label="返回聊天"><Icon name="chevronLeft" className="h-6 w-6" /></button>
        <h2>群待办</h2>
        <span />
      </header>
      <main className="scroll-soft kgt-m-main">
        <TodoContent todo={todo} />
        {cancelButton ? <div className="kgt-m-foot">{cancelButton}</div> : null}
      </main>
    </div>,
    getDesktopPortalRoot()
  );
}
