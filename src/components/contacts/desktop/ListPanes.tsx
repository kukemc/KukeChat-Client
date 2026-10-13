import { UserLevelIcons } from '@/components/level/LevelIcons';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import type { User } from '@/types/api';
import { parseApiDate } from '@/utils/dateTime';
import type { ContactsData } from '../useContactsData';
import { Pane } from './Pane';

/** 临时会话屏蔽名单：被屏蔽的人不能再从群聊向你发起临时会话，在这里解除。 */
export function BlocksPane({ data }: { data: ContactsData }): JSX.Element {
  const { temporaryBlocksQuery, temporaryBlocks, unblockMutation } = data;
  return (
    <Pane title="临时会话屏蔽" meta={`${temporaryBlocks.length} 位已屏蔽`}>
      <p className="kui-note">这里是被你屏蔽的临时会话发起人。解除后，对方可以再次从群聊向你发起临时会话。</p>
      <div className="kcc-card">
        {temporaryBlocksQuery.isLoading ? <p className="kui-empty">正在加载屏蔽列表…</p> : null}
        {!temporaryBlocksQuery.isLoading && temporaryBlocks.length === 0 ? <p className="kui-empty"><Icon name="shield" />还没有屏蔽任何临时会话</p> : null}
        {temporaryBlocks.map((block) => (
          <div key={block.id} className="kcc-row">
            <Avatar user={block.blocked_user} />
            <div className="kcc-row-main">
              <p className="kcc-row-title">{getDisplayName(block.blocked_user, `用户 ${block.blocked_user_id}`)}</p>
              <p className="kcc-row-sub">已屏蔽临时会话{block.created_at ? ` · ${parseApiDate(block.created_at)?.toLocaleDateString('zh-CN') ?? ''}` : ''}</p>
            </div>
            <div className="kcc-row-actions">
              <button type="button" className="kui-btn kui-btn--sm" disabled={unblockMutation.isPending} onClick={() => unblockMutation.mutate(block.id)}>解除屏蔽</button>
            </div>
          </div>
        ))}
      </div>
    </Pane>
  );
}

/** 找人：按用户名或邮箱搜全站用户，发好友申请。搜索词来自列表栏顶上的输入框。 */
export function SearchPane({ data, currentUser }: { data: ContactsData; currentUser: User }): JSX.Element {
  const { cleanQuery, usersQuery, searchResults, friendIds, pendingOutgoingIds, sendRequestMutation } = data;
  const ready = cleanQuery.length >= 2;
  return (
    <Pane title="找人" meta={ready && !usersQuery.isLoading && !usersQuery.error ? `「${cleanQuery}」找到 ${searchResults.length} 位用户` : undefined}>
      <div className="kcc-card">
        {!ready ? <p className="kui-empty"><Icon name="search" />{cleanQuery ? '至少输入 2 个字符' : <>在左上角的搜索框里输入用户名或邮箱<br />至少 2 个字符，找到后可以直接发好友申请</>}</p> : null}
        {ready && usersQuery.isLoading ? <p className="kui-empty">正在搜索…</p> : null}
        {ready && usersQuery.error ? <p className="kui-empty kcc-error">搜索失败，请稍后重试</p> : null}
        {ready && !usersQuery.isLoading && !usersQuery.error && searchResults.length === 0 ? <p className="kui-empty"><Icon name="search" />没有找到匹配的用户</p> : null}
        {ready ? searchResults.map((user) => {
          const isSelf = user.id === currentUser.id;
          const isFriend = friendIds.has(user.id);
          const isPending = pendingOutgoingIds.has(user.id);
          const available = !isSelf && !isFriend && !isPending;
          return (
            <div key={user.id} className="kcc-row">
              <Avatar user={user} />
              <div className="kcc-row-main">
                <p className="kcc-row-title">{getDisplayName(user)}{isSelf ? '（我）' : ''} <UserLevelIcons user={user} self={isSelf} /></p>
                <p className="kcc-row-sub">{user.bio || user.email || `@${user.username}`}</p>
              </div>
              <div className="kcc-row-actions">
                <button type="button" className={available ? 'kui-btn kui-btn--sm kui-btn--primary' : 'kui-btn kui-btn--sm'} disabled={!available || sendRequestMutation.isPending} onClick={() => sendRequestMutation.mutate(user.id)}>
                  {isSelf ? '我' : isFriend ? '已是好友' : isPending ? '已申请' : '加好友'}
                </button>
              </div>
            </div>
          );
        }) : null}
      </div>
    </Pane>
  );
}
