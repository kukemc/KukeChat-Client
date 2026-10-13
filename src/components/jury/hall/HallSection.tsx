import { useCallback, useState } from 'react';
import { useJury } from '../context';
import { useHallPost } from '../data/hall';
import { errorText } from '../data/queries';
import { Loading, LoadError, SectionFrame, StateBlock } from '../widgets/Frame';
import { HallEditor } from './HallEditor';
import { HALL_LIST_INITIAL, HallList, type HallListState } from './HallList';
import { HallPostView } from './HallPostView';

/** 编辑前先拿到帖子的全文（列表里只有前 200 字）。 */
function EditPost({ postId, onDone, onCancel }: { postId: number; onDone: () => void; onCancel: () => void }): JSX.Element {
  const query = useHallPost(postId);
  // 能不能改以服务端的 can_edit 为准：提案有人表决 / 出了结果、帖子被折叠之后都不能再改
  if (query.data?.can_edit) {
    return <HallEditor post={query.data} onDone={onDone} onCancel={onCancel} />;
  }
  return (
    <SectionFrame title="编辑帖子" subtitle="议事厅" onBack={onCancel}>
      {query.isLoading ? <Loading />
        : query.data ? <StateBlock icon="lock" title="这个帖子现在不能修改" actions={<button type="button" className="kui-btn" onClick={onCancel}>回到帖子</button>}>提案有人表决之后不能再改，出结果后也不能撤回；被折叠的帖子要等管理员处理。</StateBlock>
        : <LoadError message={errorText(query.error, '帖子加载失败，请稍后再试。')} onRetry={() => void query.refetch()} />}
    </SectionFrame>
  );
}

/**
 * 议事厅：公告、规则提案和讨论。全站可读；实名（和案件里的匿名正相反）。
 *
 * 板块内的三个页面走风纪页的路由：itemId 是帖子，tab 为 new / edit 时是发帖页 / 编辑页。
 * 从别处直达某个帖子：openJury({ section: 'forum', itemId })。
 */
export function HallSection(): JSX.Element {
  const { nav } = useJury();
  // 筛选和页码放在这一层：点进帖子再返回，列表还在原来的位置
  const [list, setList] = useState<HallListState>(HALL_LIST_INITIAL);
  // 正看着的帖子被删掉时退回列表，在列表上留一句说明（下一次打开别的帖子时收掉）
  const [notice, setNotice] = useState<string | null>(null);
  const postId = nav.route.itemId ?? null;
  const tab = nav.route.tab;
  const patch = nav.patch;
  const handleGone = useCallback(() => {
    setNotice('你刚才在看的帖子已被删除。');
    patch({ itemId: null, tab: null });
  }, [patch]);

  if (tab === 'new') {
    return <HallEditor onDone={(post) => nav.patch({ tab: null, itemId: post.id })} onCancel={() => nav.patch({ tab: null })} />;
  }
  if (postId !== null) {
    return tab === 'edit'
      ? <EditPost postId={postId} onDone={() => nav.patch({ tab: null })} onCancel={() => nav.patch({ tab: null })} />
      : <HallPostView key={postId} postId={postId} onBack={() => nav.patch({ itemId: null, tab: null })} onEdit={() => nav.patch({ tab: 'edit' })} onGone={handleGone} />;
  }
  return <HallList list={list} notice={notice} onListChange={setList} onOpen={(id) => {
    setNotice(null);
    nav.patch({ itemId: id, tab: null });
  }} onCompose={() => nav.patch({ tab: 'new' })} />;
}
