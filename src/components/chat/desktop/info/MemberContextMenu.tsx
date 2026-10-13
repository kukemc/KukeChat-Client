import { Fragment } from 'react';
import { ContextMenuItem, ContextMenuSeparator, ContextMenuSurface, MenuLayer, type ContextMenuItemProps } from '@/components/ui/ContextMenu';
import type { ConversationMember } from '@/types/api';
import { memberMuted } from '../../info/shared';
import { clampOverlayPosition } from '../../message/chatDom';
import { memberUserId } from '../../message/messageMeta';
import type { OverlayPosition } from '../../message/types';
import type { MemberActions } from './useMemberActions';

export interface MemberMenuTarget extends OverlayPosition {
  member: ConversationMember;
}

const MENU_WIDTH = 168;
const MENU_ITEM_HEIGHT = 30;

type MenuEntry = ContextMenuItemProps & { group: 'social' | 'manage' };

/** 这个成员在右键菜单里能列出的操作。一项都没有时调用方就不必弹菜单。 */
export function memberMenuEntries(member: ConversationMember, actions: MemberActions): MenuEntry[] {
  const userId = memberUserId(member);
  const entries: MenuEntry[] = [];
  if (!actions.isFriend(userId) && !actions.isPendingFriend(userId)) {
    entries.push({ group: 'social', label: '添加好友', icon: 'userPlus', disabled: !actions.canRequestFriend(userId), onClick: () => actions.requestFriend(member) });
  }
  if (actions.canChangeRole(member)) {
    const isAdmin = member.role === 'admin';
    entries.push({ group: 'manage', label: isAdmin ? '取消管理员' : '设为管理员', icon: isAdmin ? 'shield' : 'shieldCheck', disabled: actions.busy.role, onClick: () => actions.toggleAdmin(member) });
  }
  if (actions.canMute(member)) {
    const muted = memberMuted(member);
    entries.push({ group: 'manage', label: muted ? '解除禁言' : '禁言成员', icon: muted ? 'volume' : 'muted', disabled: actions.busy.mute, onClick: () => actions.toggleMute(member) });
  }
  if (actions.canSetTitle(member)) {
    entries.push({ group: 'manage', label: member.title?.trim() ? '修改群头衔' : '设置群头衔', icon: 'star', disabled: actions.busy.title, onClick: () => actions.editTitle(member) });
  }
  if (actions.canRemove(member)) {
    entries.push({ group: 'manage', label: '移出群聊', icon: 'trash', danger: true, disabled: actions.busy.remove, onClick: () => actions.remove(member) });
  }
  return entries;
}

/** 侧栏里成员头像的右键菜单。聊天面板自己的成员菜单压在侧栏下面，够不着这里。 */
export function MemberContextMenu({ target, actions, overlayRoot, onClose }: { target: MemberMenuTarget; actions: MemberActions; overlayRoot: HTMLElement | null; onClose: () => void }): JSX.Element | null {
  const entries = memberMenuEntries(target.member, actions);
  if (entries.length === 0) {
    return null;
  }
  const position = clampOverlayPosition(target, MENU_WIDTH, entries.length * MENU_ITEM_HEIGHT + 20, overlayRoot);

  return (
    <MenuLayer onClose={onClose} className="kci-layer">
      <ContextMenuSurface style={position} className="absolute" onMouseDown={(event) => event.stopPropagation()}>
        {entries.map(({ group, ...item }, index) => (
          <Fragment key={item.label}>
            {index > 0 && entries[index - 1].group !== group ? <ContextMenuSeparator /> : null}
            <ContextMenuItem {...item} />
          </Fragment>
        ))}
      </ContextMenuSurface>
    </MenuLayer>
  );
}
