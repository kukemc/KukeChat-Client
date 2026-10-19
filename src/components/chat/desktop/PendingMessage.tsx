import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ContextMenuItem, ContextMenuSurface, MenuLayer } from '@/components/ui/ContextMenu';
import type { Message } from '@/types/api';
import { clampOverlayPosition } from '../message/chatDom';
import { useGroupFileUploads } from '@/components/groupPlus/uploads';
import { chatUploadTaskIdOf } from '../message/chatUploads';
import { cancelSelfTransfer, dismissSelfTransfer, retrySelfTransfer, selfTransferTaskIdOf, useSelfTransfers } from '@/components/selfChat/transfers';
import { discardPending, pendingNonceOf, retrySend, usePendingEntry, type PendingEntry } from '../message/pendingSend';

/** 文字消息发送超过这么久还没确认，才在气泡旁边出转圈（大多数时候一闪就过，不必打扰） */
const TEXT_SPINNER_DELAY_MS = 1000;

function useLate(entry: PendingEntry | null): boolean {
  const sending = entry?.status === 'sending';
  const startedAt = entry?.startedAt ?? 0;
  const [late, setLate] = useState(() => sending && Date.now() - startedAt >= TEXT_SPINNER_DELAY_MS);
  useEffect(() => {
    if (!sending) {
      setLate(false);
      return undefined;
    }
    const remaining = TEXT_SPINNER_DELAY_MS - (Date.now() - startedAt);
    if (remaining <= 0) {
      setLate(true);
      return undefined;
    }
    setLate(false);
    const timer = window.setTimeout(() => setLate(true), remaining);
    return () => window.clearTimeout(timer);
  }, [sending, startedAt]);
  return late;
}

/** 有图要传的消息：转圈画在图上，气泡旁边不再重复 */
function hasImageUpload(entry: PendingEntry): boolean {
  return entry.variables.type !== 'voice' && (entry.variables.files?.length ?? 0) > 0;
}

/** 气泡旁边的发送状态：发送中的小转圈，或者失败后的红色感叹号（点一下重发）。 */
export function PendingSideStatus({ message }: { message: Message }): JSX.Element | null {
  const entry = usePendingEntry(message);
  const queryClient = useQueryClient();
  const late = useLate(entry);
  if (!entry) {
    return null;
  }
  if (entry.status === 'failed') {
    return (
      <button
        type="button"
        className="kcd-send-failed"
        title={entry.error ?? '发送失败'}
        onClick={(event) => {
          event.stopPropagation();
          retrySend(queryClient, entry.conversationId, entry.nonce);
        }}
      >
        <span className="kcd-send-failed-mark" aria-hidden="true">!</span>
        <span>发送失败，点击重发</span>
      </button>
    );
  }
  if (entry.status === 'sending' && !hasImageUpload(entry) && (late || entry.variables.type === 'voice')) {
    return <span className="kcd-send-spinner" role="status" aria-label="发送中" />;
  }
  return null;
}

/** 图片上叠的小转圈：发出去就没了。 */
export function PendingImageSpinner({ message }: { message: Message }): JSX.Element | null {
  const entry = usePendingEntry(message);
  if (!entry || entry.status !== 'sending' || !hasImageUpload(entry)) {
    return null;
  }
  return <span className="kcd-media-pending" role="status" aria-label="正在发送图片"><span className="kcd-send-spinner" /></span>;
}

export interface PendingMenuState {
  message: Message;
  left: number;
  top: number;
}

/** 本地消息的右键菜单：只有「重发」和「删除」。正在上传的文件换成「取消上传」/「重试」「删除」。 */
export function PendingMessageMenu({ menu, overlayRoot, onClose }: { menu: PendingMenuState; overlayRoot: HTMLElement | null; onClose: () => void }): JSX.Element {
  const selfTaskId = selfTransferTaskIdOf(menu.message);
  if (selfTaskId !== null) {
    return <SelfTransferMenu taskId={selfTaskId} menu={menu} overlayRoot={overlayRoot} onClose={onClose} />;
  }
  const uploadTaskId = chatUploadTaskIdOf(menu.message);
  return uploadTaskId !== null
    ? <UploadMenu taskId={uploadTaskId} menu={menu} overlayRoot={overlayRoot} onClose={onClose} />
    : <SendMenu menu={menu} overlayRoot={overlayRoot} onClose={onClose} />;
}

function UploadMenu({ taskId, menu, overlayRoot, onClose }: { taskId: number; menu: PendingMenuState; overlayRoot: HTMLElement | null; onClose: () => void }): JSX.Element {
  const queryClient = useQueryClient();
  const status = useGroupFileUploads((state) => state.tasks.find((item) => item.id === taskId)?.status ?? null);
  const { cancel, dismiss, retry } = useGroupFileUploads.getState();
  const position = clampOverlayPosition(menu, 160, 96, overlayRoot);
  return (
    <MenuLayer onClose={onClose}>
      <ContextMenuSurface onMouseDown={(event) => event.stopPropagation()} style={position} className="absolute w-[160px]">
        {status === 'failed' ? (
          <>
            <ContextMenuItem label="重试" icon="refresh" onClick={() => {
              retry(queryClient, taskId);
              onClose();
            }} />
            <ContextMenuItem label="删除" icon="trash" danger onClick={() => {
              dismiss(taskId);
              onClose();
            }} />
          </>
        ) : (
          <ContextMenuItem label="取消上传" icon="close" danger disabled={status !== 'uploading'} onClick={() => {
            cancel(taskId);
            dismiss(taskId);
            onClose();
          }} />
        )}
      </ContextMenuSurface>
    </MenuLayer>
  );
}

/** 「我的设备」里正在发的临时文件：取消；失败了重试 / 删除 */
function SelfTransferMenu({ taskId, menu, overlayRoot, onClose }: { taskId: number; menu: PendingMenuState; overlayRoot: HTMLElement | null; onClose: () => void }): JSX.Element {
  const queryClient = useQueryClient();
  const status = useSelfTransfers((state) => state.tasks.find((item) => item.id === taskId)?.status ?? null);
  const position = clampOverlayPosition(menu, 160, 96, overlayRoot);
  return (
    <MenuLayer onClose={onClose}>
      <ContextMenuSurface onMouseDown={(event) => event.stopPropagation()} style={position} className="absolute w-[160px]">
        {status === 'failed' ? (
          <>
            <ContextMenuItem label="重试" icon="refresh" onClick={() => {
              retrySelfTransfer(queryClient, taskId);
              onClose();
            }} />
            <ContextMenuItem label="删除" icon="trash" danger onClick={() => {
              dismissSelfTransfer(taskId);
              onClose();
            }} />
          </>
        ) : (
          <ContextMenuItem label="取消发送" icon="close" danger disabled={status !== 'uploading'} onClick={() => {
            cancelSelfTransfer(taskId);
            onClose();
          }} />
        )}
      </ContextMenuSurface>
    </MenuLayer>
  );
}

function SendMenu({ menu, overlayRoot, onClose }: { menu: PendingMenuState; overlayRoot: HTMLElement | null; onClose: () => void }): JSX.Element {
  const queryClient = useQueryClient();
  const entry = usePendingEntry(menu.message);
  const nonce = pendingNonceOf(menu.message);
  const position = clampOverlayPosition(menu, 160, 96, overlayRoot);
  const failed = entry?.status === 'failed';
  return (
    <MenuLayer onClose={onClose}>
      <ContextMenuSurface onMouseDown={(event) => event.stopPropagation()} style={position} className="absolute w-[160px]">
        <ContextMenuItem label="重发" icon="refresh" disabled={!failed} onClick={() => {
          if (nonce) {
            retrySend(queryClient, menu.message.conversation_id, nonce);
          }
          onClose();
        }} />
        <ContextMenuItem label="删除" icon="trash" danger disabled={!failed} onClick={() => {
          if (nonce) {
            discardPending(menu.message.conversation_id, nonce);
          }
          onClose();
        }} />
      </ContextMenuSurface>
    </MenuLayer>
  );
}
