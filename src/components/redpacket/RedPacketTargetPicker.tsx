import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getConversationMembersPage, searchConversationMembers } from '@/api/conversations';
import { cx } from '@/components/chat/desktop/runtime';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import type { ConversationMember, User } from '@/types/api';
import { RedPacketLayer } from './RedPacketLayer';

/** 专属红包选中的人：用户对象，加上在这个群里怎么称呼他（群昵称 > 昵称 > 用户名） */
export interface RedPacketTargetChoice {
  user: User;
  name: string;
}

/** 群昵称 > 昵称 > 用户名，和服务端写兜底文字时取名字的顺序一样 */
export function memberName(member: Pick<ConversationMember, 'nickname'> | null | undefined, user: User): string {
  return member?.nickname?.trim() || getDisplayName(user, `用户 ${user.id}`);
}

/** 能当专属红包目标的人：不是自己、不是机器人，去重 */
function eligible(members: ConversationMember[], meId: number): RedPacketTargetChoice[] {
  const seen = new Set<number>();
  const result: RedPacketTargetChoice[] = [];
  for (const member of members) {
    const user = member.user;
    if (!user || user.id === meId || user.is_bot || seen.has(user.id)) {
      continue;
    }
    seen.add(user.id);
    result.push({ user, name: memberName(member, user) });
  }
  return result;
}

function matches(choice: RedPacketTargetChoice, needle: string): boolean {
  return [choice.name, choice.user.nickname ?? '', choice.user.username].some((value) => value.toLowerCase().includes(needle));
}

/**
 * 专属红包「给谁」：群成员搜索选择器，样子和送礼的「送给谁」一样。
 * 不输入时列手头的成员（外面给的 members，加上这里自己拉的第一页）；输入了就按名字过滤，同时向服务端搜（大群的成员不会全在手头）。
 * 自己、机器人不在列表里（服务端也不让：invalid_target 的 self / bot）。
 */
export function RedPacketTargetPicker({ conversationId, meId, members, selectedId, onPick, onBack, onClose }: { conversationId: number; meId: number; members: ConversationMember[]; selectedId: number | null; onPick: (choice: RedPacketTargetChoice) => void; onBack: () => void; onClose: () => void }): JSX.Element {
  const [keyword, setKeyword] = useState('');
  const [searched, setSearched] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setSearched(keyword.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  const firstPage = useQuery({
    queryKey: ['conversation-members-page', conversationId, '', 'red-packet-target'],
    queryFn: () => getConversationMembersPage(conversationId, { limit: 50 }),
    staleTime: 30_000,
    retry: false
  });
  const search = useQuery({
    queryKey: ['conversation-members', conversationId, 'red-packet-target-search', searched],
    queryFn: () => searchConversationMembers(conversationId, searched, 20),
    enabled: searched.length > 0,
    staleTime: 15_000,
    retry: false
  });

  const known = useMemo(() => eligible([...members, ...(firstPage.data?.items ?? [])], meId), [firstPage.data, meId, members]);
  const needle = keyword.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!needle) {
      return known;
    }
    const local = known.filter((choice) => matches(choice, needle));
    const remote = eligible(search.data ?? [], meId).filter((choice) => !local.some((item) => item.user.id === choice.user.id));
    return [...local, ...remote];
  }, [known, meId, needle, search.data]);
  const loading = needle ? search.isFetching && shown.length === 0 : firstPage.isLoading && known.length === 0;

  return (
    <RedPacketLayer label="选择专属红包的领取人" onClose={onClose}>
      <section className="krp-panel krp-panel--tall" data-red-packet-view="pick-target">
        <header className="krp-panel-head">
          <button type="button" className="kui-icon-btn" aria-label="返回" onClick={onBack}><Icon name="chevronLeft" className="h-4 w-4" /></button>
          <h2>发给谁</h2>
          <button type="button" className="kui-icon-btn" aria-label="关闭" onClick={onClose}><Icon name="close" className="h-4 w-4" /></button>
        </header>
        <div className="krp-pick-search">
          <Icon name="search" className="h-4 w-4" />
          <input value={keyword} placeholder="搜索群成员" aria-label="搜索群成员" autoFocus onChange={(event) => setKeyword(event.target.value)} />
        </div>
        <p className="krp-pick-note">只有选中的人能领这个红包</p>
        <div className="krp-panel-body krp-panel-body--flush kui-scroll">
          {shown.length === 0 ? (
            <p className="krp-empty" role="status">{loading ? '正在找…' : needle ? '没有找到这个人。' : '这个群里还没有可以选的人。'}</p>
          ) : (
            <ul className="krp-pick" data-red-packet="target-candidates">
              {shown.map((choice) => (
                <li key={choice.user.id}>
                  <button type="button" className={cx('krp-pick-row', selectedId === choice.user.id && 'is-active')} data-user={choice.user.id} onClick={() => onPick(choice)}>
                    <Avatar user={choice.user} size="message" />
                    <span className="krp-pick-name">{choice.name}</span>
                    {selectedId === choice.user.id ? <Icon name="check" className="h-4 w-4 krp-pick-go" /> : <Icon name="chevron" className="h-3.5 w-3.5 krp-pick-go" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </RedPacketLayer>
  );
}
