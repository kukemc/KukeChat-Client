import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getConversationMember, removeConversationMember, updateConversationMemberMute, updateConversationMemberRole, updateConversationMemberTitle } from '@/api/conversations';
import { ContextMenuItem, ContextMenuSeparator, ContextMenuSurface, MenuLayer } from '@/components/ui/ContextMenu';
import { getDisplayName } from '@/components/ui/Avatar';
import { toast } from '@/components/ui/toast';
import { useCanGift } from '@/components/gifts/GiftEntry';
import type { ConversationMember, MemberRole, User } from '@/types/api';
import { parseApiDate } from '@/utils/dateTime';
import { clampOverlayPosition } from '../message/chatDom';
import { MUTE_MENU_OPTIONS } from '../message/constants';
import { memberUserId } from '../message/messageMeta';
import type { ConversationMembersPageData, CustomMuteState, MessagesInfiniteData, MuteMenuOption, OverlayPosition } from '../message/types';
import { PokeActionMenu } from './poke/PokeActionMenu';

export interface MemberMenuTarget extends OverlayPosition {
  member: ConversationMember;
}

interface MemberMenuProps {
  target: MemberMenuTarget | null;
  conversationId: number;
  isGroup: boolean;
  currentUser: User;
  currentRole: MemberRole;
  overlayRoot: HTMLElement | null;
  directPending: boolean;
  pokePending: boolean;
  isFriend: (userId?: number | null) => boolean;
  isPendingFriend: (userId?: number | null) => boolean;
  canRequestFriend: (userId?: number | null) => boolean;
  onClose: () => void;
  /** 送礼物（礼物功能开着、对方不是自己和机器人时菜单里才有这一项） */
  onGift: (member: ConversationMember) => void;
  onSendMessage: (member: ConversationMember) => void;
  onAddFriend: (member: ConversationMember) => void;
  onMention: (member: ConversationMember) => void;
  /** 戳一戳；action 是从「互动」里选的动作 */
  onPoke: (member: ConversationMember, action?: string) => void;
  onViewProfile: (member: ConversationMember, anchor: OverlayPosition) => void;
  onReport: (member: ConversationMember) => void;
  setError: (message: string) => void;
}

const MEMBER_MENU_WIDTH = 188;
const MEMBER_MENU_HEIGHT = 320;
/** 菜单项的行高（.kui-menu-item） */
const MENU_ROW_HEIGHT = 28;
const MUTE_SUBMENU_WIDTH = 124;
const MUTE_SUBMENU_HEIGHT = 168;

function customMuteMinutes(state: CustomMuteState): number | null {
  const value = Number(state.value);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  if (state.unit === 'days') return Math.round(value * 24 * 60);
  if (state.unit === 'hours') return Math.round(value * 60);
  return Math.round(value);
}

/** 成员右键菜单及其群管操作（管理员、头衔、禁言、移出）。禁言相关的乐观更新也收在这里。 */
export function MemberMenu({ target, conversationId, isGroup, currentUser, currentRole, overlayRoot, directPending, pokePending, isFriend, isPendingFriend, canRequestFriend, onClose, onGift, onSendMessage, onAddFriend, onMention, onPoke, onViewProfile, onReport, setError }: MemberMenuProps): JSX.Element | null {
  const queryClient = useQueryClient();
  const [freshMember, setFreshMember] = useState<ConversationMember | null>(null);
  const [loading, setLoading] = useState(false);
  const [submenu, setSubmenu] = useState<'mute' | 'poke' | null>(null);
  const [customMute, setCustomMute] = useState<CustomMuteState | null>(null);
  const [muteOverrides, setMuteOverrides] = useState<Record<number, { muted: boolean; muted_until: string | null }>>({});
  const submenuTimerRef = useRef<number | null>(null);
  const canGift = useCanGift(target?.member.user);

  const targetUserId = target ? memberUserId(target.member) : null;
  useEffect(() => {
    setFreshMember(null);
    setSubmenu(null);
    if (!target || !targetUserId) {
      setLoading(false);
      return;
    }
    // 菜单里的禁言、角色状态以服务端为准，打开时拉一次最新的
    let cancelled = false;
    setLoading(true);
    void getConversationMember(conversationId, targetUserId).then((member) => {
      if (cancelled) {
        return;
      }
      setFreshMember(member);
      setMuteOverrides((current) => ({ ...current, [targetUserId]: { muted: Boolean(member.muted), muted_until: member.muted_until ?? null } }));
    }).catch(() => undefined).finally(() => {
      if (!cancelled) {
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId, target?.left, target?.top, targetUserId]);

  useEffect(() => () => {
    if (submenuTimerRef.current !== null) {
      window.clearTimeout(submenuTimerRef.current);
    }
  }, []);

  const invalidateMembers = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['conversation-members', conversationId] });
    void queryClient.invalidateQueries({ queryKey: ['conversation-members-page', conversationId] });
  };

  const patchMembers = (userId: number, patch: Partial<ConversationMember>): void => {
    queryClient.setQueryData<ConversationMember[] | undefined>(['conversation-members', conversationId], (current) => current?.map((member) => (
      memberUserId(member) === userId ? { ...member, ...patch } : member
    )));
    queryClient.setQueriesData<ConversationMembersPageData | undefined>({ queryKey: ['conversation-members-page', conversationId] }, (current) => current ? {
      ...current,
      pages: current.pages.map((page) => ({ ...page, items: page.items.map((member) => (memberUserId(member) === userId ? { ...member, ...patch } : member)) }))
    } : current);
  };

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: MemberRole }) => updateConversationMemberRole(conversationId, userId, role),
    onSuccess: () => {
      setError('');
      invalidateMembers();
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: () => setError('成员角色更新失败，请稍后重试。')
  });

  const muteMutation = useMutation({
    mutationFn: ({ userId, muted, mutedUntil }: { userId: number; muted: boolean; mutedUntil: string | null }) => updateConversationMemberMute(conversationId, userId, muted, mutedUntil),
    onMutate: async ({ userId, muted, mutedUntil }) => {
      await queryClient.cancelQueries({ queryKey: ['conversation-members', conversationId] });
      await queryClient.cancelQueries({ queryKey: ['conversation-members-page', conversationId] });
      setMuteOverrides((current) => ({ ...current, [userId]: { muted, muted_until: mutedUntil } }));
      patchMembers(userId, { muted, muted_until: mutedUntil });
    },
    onSuccess: (member, { userId }) => {
      setError('');
      setMuteOverrides((current) => ({ ...current, [userId]: { muted: Boolean(member.muted), muted_until: member.muted_until ?? null } }));
      toast.info(member.muted ? '已禁言' : '已解除禁言');
    },
    onError: () => setError('成员禁言更新失败，请稍后重试。'),
    onSettled: invalidateMembers
  });

  const titleMutation = useMutation({
    mutationFn: ({ userId, title }: { userId: number; title: string | null }) => updateConversationMemberTitle(conversationId, userId, title),
    onMutate: async ({ userId, title }) => {
      await queryClient.cancelQueries({ queryKey: ['messages', conversationId] });
      patchMembers(userId, { title });
      queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', conversationId], (current) => current ? {
        ...current,
        pages: current.pages.map((page) => page.map((message) => (message.sender_id === userId ? { ...message, sender_title: title } : message)))
      } : current);
    },
    onSuccess: (_member, { title }) => {
      setError('');
      toast.info(title ? '群头衔已更新' : '群头衔已清除');
    },
    onError: () => setError('群头衔更新失败，请稍后重试。'),
    onSettled: invalidateMembers
  });

  const removeMutation = useMutation({
    mutationFn: (userId: number) => removeConversationMember(conversationId, userId),
    onSuccess: () => {
      setError('');
      invalidateMembers();
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: () => setError('移除成员失败，请稍后重试。')
  });

  function isMuted(member: ConversationMember): boolean {
    const userId = memberUserId(member);
    const override = userId ? muteOverrides[userId] : undefined;
    const muted = override?.muted ?? Boolean(member.muted);
    const mutedUntil = override ? override.muted_until : member.muted_until ?? null;
    if (!muted) {
      return false;
    }
    const until = parseApiDate(mutedUntil);
    return !mutedUntil || !until || until.getTime() > Date.now();
  }

  function applyMute(member: ConversationMember, minutes?: number): void {
    const userId = memberUserId(member);
    if (!userId || muteMutation.isPending) {
      return;
    }
    const muted = !isMuted(member);
    muteMutation.mutate({ userId, muted, mutedUntil: muted && minutes ? new Date(Date.now() + minutes * 60 * 1000).toISOString() : null });
    onClose();
  }

  function pickMuteOption(member: ConversationMember, option: MuteMenuOption): void {
    if (option.custom) {
      setCustomMute({ member, value: '', unit: 'minutes' });
      onClose();
      return;
    }
    if (option.minutes) {
      applyMute(member, option.minutes);
    }
  }

  function confirmCustomMute(): void {
    if (!customMute) {
      return;
    }
    const minutes = customMuteMinutes(customMute);
    if (!minutes) {
      toast.error('请输入有效的禁言时长');
      return;
    }
    if (minutes > 365 * 24 * 60) {
      toast.error('禁言时长不能超过365天');
      return;
    }
    applyMute(customMute.member, minutes);
    setCustomMute(null);
  }

  function openSubmenu(kind: 'mute' | 'poke'): void {
    if (submenuTimerRef.current !== null) {
      window.clearTimeout(submenuTimerRef.current);
      submenuTimerRef.current = null;
    }
    setSubmenu(kind);
  }

  function closeSubmenu(delayed: boolean): void {
    if (submenuTimerRef.current !== null) {
      window.clearTimeout(submenuTimerRef.current);
      submenuTimerRef.current = null;
    }
    if (!delayed) {
      setSubmenu(null);
      return;
    }
    // 给鼠标从主菜单移到子菜单留一点时间
    submenuTimerRef.current = window.setTimeout(() => {
      setSubmenu(null);
      submenuTimerRef.current = null;
    }, 220);
  }

  const customMuteDialog = customMute ? (
    <div className="kcd-dialog-backdrop" onMouseDown={() => setCustomMute(null)}>
      <div className="kcd-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <h3>自定义禁言时长</h3>
        <p>到期后会自动解除禁言，最长 365 天。</p>
        <div className="kcd-dialog-row">
          <input
            value={customMute.value}
            onChange={(event) => setCustomMute((state) => state ? { ...state, value: event.target.value.replace(/[^0-9.]/g, '') } : state)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                confirmCustomMute();
              }
            }}
            autoFocus
            inputMode="decimal"
            placeholder="输入数字"
            aria-label="禁言时长"
          />
          <select value={customMute.unit} aria-label="时长单位" onChange={(event) => setCustomMute((state) => state ? { ...state, unit: event.target.value as CustomMuteState['unit'] } : state)}>
            <option value="minutes">分钟</option>
            <option value="hours">小时</option>
            <option value="days">天</option>
          </select>
        </div>
        <div className="kcd-dialog-actions">
          <button type="button" className="kcd-button" onClick={() => setCustomMute(null)}>取消</button>
          <button type="button" className="kcd-button kcd-button--primary" disabled={muteMutation.isPending} onClick={confirmCustomMute}>确定</button>
        </div>
      </div>
    </div>
  ) : null;

  if (!target) {
    return customMuteDialog;
  }

  const member = freshMember ?? target.member;
  const userId = memberUserId(member);
  const isSelf = userId === currentUser.id;
  const manageable = Boolean(isGroup && userId && !isSelf);
  const canChangeRole = manageable && currentRole === 'owner' && member.role !== 'owner';
  const canSetTitle = canChangeRole;
  const canMute = manageable && currentRole !== 'member' && (currentRole === 'owner' ? member.role !== 'owner' : member.role === 'member');
  const canRemove = manageable && currentRole !== 'member' && member.role !== 'owner' && (currentRole === 'owner' || member.role === 'member');
  const muted = isMuted(member);
  const name = member.nickname?.trim() || getDisplayName(member.user, `用户 ${userId ?? ''}`);
  const position = clampOverlayPosition(target, MEMBER_MENU_WIDTH, MEMBER_MENU_HEIGHT, overlayRoot);
  const submenuVisible = submenu === 'mute' && canMute && !muted && !loading;
  // 「互动」那一行在自己的菜单里才有，它把下面的禁言项往下推了一行
  const submenuPosition = clampOverlayPosition({ left: position.left + MEMBER_MENU_WIDTH + 4, top: position.top + (isSelf ? 168 : 168 + MENU_ROW_HEIGHT) + (canGift ? MENU_ROW_HEIGHT : 0) }, MUTE_SUBMENU_WIDTH, MUTE_SUBMENU_HEIGHT, overlayRoot);
  const hideSubmenu = (): void => closeSubmenu(false);
  const showAddFriend = !isFriend(userId) && !isPendingFriend(userId);
  // 「互动」排在 发送消息 /（添加好友）/ @TA 之后，子菜单贴着这一行展开
  const pokeRowTop = position.top + 4 + MENU_ROW_HEIGHT * (showAddFriend ? 3 : 2);

  return (
    <>
      <MenuLayer onClose={onClose}>
        <ContextMenuSurface onMouseLeave={() => closeSubmenu(true)} onMouseDown={(event) => event.stopPropagation()} style={position} className="kui-scroll absolute z-10 max-h-[calc(100%-16px)] w-[188px]">
          <ContextMenuItem label="发送消息" icon="message" disabled={isSelf || directPending} onMouseEnter={hideSubmenu} onClick={() => {
            onSendMessage(member);
            onClose();
          }} />
          {showAddFriend ? <ContextMenuItem label="添加好友" icon="plus" disabled={!canRequestFriend(userId)} onMouseEnter={hideSubmenu} onClick={() => onAddFriend(member)} /> : null}
          <ContextMenuItem label="@TA" icon="atSign" disabled={!isGroup || isSelf} onMouseEnter={hideSubmenu} onClick={() => {
            onMention(member);
            onClose();
          }} />
          {userId && !isSelf ? <ContextMenuItem label="互动" icon="poke" suffix="›" onMouseEnter={() => openSubmenu('poke')} onClick={() => openSubmenu('poke')} /> : null}
          {canGift ? <ContextMenuItem label="送礼物" icon="gift" onMouseEnter={hideSubmenu} onClick={() => {
            onGift(member);
            onClose();
          }} /> : null}
          <ContextMenuItem label="查看资料" icon="profile" onMouseEnter={hideSubmenu} onClick={() => {
            onViewProfile(member, { left: target.left, top: target.top });
            onClose();
          }} />
          {canChangeRole || canSetTitle || canMute || canRemove ? <ContextMenuSeparator /> : null}
          {canChangeRole ? <ContextMenuItem label={member.role === 'admin' ? '取消管理员' : '设为管理员'} icon={member.role === 'admin' ? 'shield' : 'shieldCheck'} disabled={roleMutation.isPending} onMouseEnter={hideSubmenu} onClick={() => {
            if (userId) {
              roleMutation.mutate({ userId, role: member.role === 'admin' ? 'member' : 'admin' });
            }
            onClose();
          }} /> : null}
          {canSetTitle ? <ContextMenuItem label={member.title?.trim() ? '修改群头衔' : '设置群头衔'} icon="profile" disabled={titleMutation.isPending} onMouseEnter={hideSubmenu} onClick={() => {
            const nextTitle = window.prompt(`设置 ${name} 的群头衔（留空清除）`, member.title ?? '');
            if (nextTitle !== null && userId) {
              titleMutation.mutate({ userId, title: nextTitle.trim() || null });
            }
            onClose();
          }} /> : null}
          {canMute && loading ? <ContextMenuItem label="正在同步成员状态..." icon="clock" disabled onMouseEnter={hideSubmenu} onClick={() => undefined} /> : null}
          {canMute && !loading ? <ContextMenuItem label={muted ? '解除禁言' : '设置群内禁言'} icon={muted ? 'volume' : 'clock'} suffix={muted ? undefined : '›'} disabled={muteMutation.isPending} onMouseEnter={muted ? hideSubmenu : () => openSubmenu('mute')} onClick={() => {
            if (muted) {
              applyMute(member);
            } else {
              openSubmenu('mute');
            }
          }} /> : null}
          {canRemove ? <ContextMenuItem label="移出本群" icon="trash" danger disabled={removeMutation.isPending} onMouseEnter={hideSubmenu} onClick={() => {
            if (userId && window.confirm(`确定将 ${name} 移出群聊吗？`)) {
              removeMutation.mutate(userId);
            }
            onClose();
          }} /> : null}
          <ContextMenuSeparator />
          <ContextMenuItem label="举报" icon="flag" danger disabled={isSelf} onMouseEnter={hideSubmenu} onClick={() => {
            onReport(member);
            onClose();
          }} />
        </ContextMenuSurface>
        {submenuVisible ? (
          <ContextMenuSurface onMouseDown={(event) => event.stopPropagation()} onMouseEnter={() => openSubmenu('mute')} onMouseLeave={() => closeSubmenu(true)} style={submenuPosition} className="absolute z-20 w-[124px] min-w-0">
            {MUTE_MENU_OPTIONS.map((option) => <ContextMenuItem key={option.label} label={option.label} disabled={muteMutation.isPending} onClick={() => pickMuteOption(member, option)} />)}
          </ContextMenuSurface>
        ) : null}
        {submenu === 'poke' && userId && !isSelf ? (
          <PokeActionMenu
            beside={{ left: position.left, top: pokeRowTop, width: MEMBER_MENU_WIDTH }}
            overlayRoot={overlayRoot}
            targetAction={member.user?.poke_action}
            disabled={pokePending}
            onPick={(action) => {
              onPoke(member, action);
              onClose();
            }}
            onMouseEnter={() => openSubmenu('poke')}
            onMouseLeave={() => closeSubmenu(true)}
          />
        ) : null}
      </MenuLayer>
      {customMuteDialog}
    </>
  );
}
