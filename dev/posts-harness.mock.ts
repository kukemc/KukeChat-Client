/**
 * 动态页预览用的假后端：一份内存里的数据，加上拦截 fetch 的处理函数。
 * 只给 dev/posts-harness.tsx 用，不进任何构建产物。
 */
import type { CcwCreationPreview, CcwCreator, Conversation, Friendship, Message, Post, PostComment, PostNotification, PostReference, PostTopic, User } from '@/types/api';

const now = Date.now();
const ago = (minutes: number): string => new Date(now - minutes * 60_000).toISOString();

export const me = {
  id: 1, username: 'kuke', nickname: '酷可mc', bio: '写点小工具，偶尔画画。周五晚上在创作接龙。',
  profile_title: '酷可的工作台', profile_tagline: '今天也在修 bug', profile_status: '在线摸鱼中', profile_location: '互联网角落', profile_interests: 'Scratch, 像素画, 独立游戏, 音乐',
  profile_layout: 'classic', profile_card_style: 'soft', profile_accent_color: '#168bff',
  ccw_student_oid: 'abc123', ccw_name: '酷可mc', ccw_bio: '共创世界创作者，做过 30 多个作品。', ccw_following_count: 128, ccw_follower_count: 23800, ccw_like_count: 512000, ccw_favorite_count: 8600, ccw_creation_count: 36, ccw_view_count: 3280000
} as User;

export const people: User[] = [
  me,
  { id: 2, username: 'aqua', nickname: '阿夸', bio: '碰撞检测爱好者', profile_tagline: '克隆体不掉帧', profile_accent_color: '#10b981' } as User,
  { id: 3, username: 'mint', nickname: '薄荷糖', bio: '画画的', profile_status: '赶稿中' } as User,
  { id: 4, username: 'sora', nickname: 'Sora' } as User,
  { id: 5, username: 'long', nickname: '一个名字特别特别长的群友用来测试截断效果到底会不会把布局撑坏' } as User,
  { id: 6, username: 'pixel', nickname: '像素工坊', bio: '每周更新一张像素画教程。', profile_title: '像素工坊', profile_layout: 'banner', profile_card_style: 'glass', profile_accent_color: '#7c3aed', profile_location: '成都', profile_interests: '像素画 动画' } as User
];
const user = (id: number): User => people.find((item) => item.id === id) ?? people[1];

const creation: CcwCreationPreview = { oid: '64f0c0ffee64f0c0ffee0001', url: 'https://www.ccw.site/detail/64f0c0ffee64f0c0ffee0001', title: '像素跑酷 · 第二章', description: '新增了三张地图和一个隐藏关卡，欢迎来挑战速通纪录。', author_name: '阿夸', view_count: 128400, like_count: 5210, comment_count: 386, version: '2.1' };

let commentSeq = 500;
function comment(postId: number, authorId: number, content: string, minutes: number, extra: Partial<PostComment> = {}): PostComment {
  commentSeq += 1;
  return { id: commentSeq, post_id: postId, author_id: authorId, author: user(authorId), content, moderation_status: 'approved', created_at: ago(minutes), like_count: 0, liked_by_me: false, ...extra };
}

function reference(post: Post): PostReference {
  const { like_count: _l, comment_count: _c, liked_by_me: _m, recent_likes: _r, recent_comments: _rc, repost_of: _o, repost_of_id: _i, ...rest } = post;
  return rest;
}

const longText = '说一下这周改碰撞检测的思路，写得比较长，给同样被克隆体掉帧困扰的人参考。\n\n先把所有角色的坐标存进列表，每帧只更新移动过的那几个，然后用「碰到颜色」做粗筛，命中了再做精确判断。这样 300 个克隆体也不会掉帧。之前的写法是每个克隆体每帧都和其他所有克隆体比一遍，复杂度是平方级的，数量一上去就卡成幻灯片。\n\n第二步是把地图切成 64×64 的格子，每个克隆体只登记在自己所在的格子里，查询的时候只看相邻的九格。这个改完以后帧率从 14 回到了 58。\n\n完整的工程放在这里 https://www.ccw.site/detail/abc ，有问题直接在评论区问。' + 'Averyveryverylongwordwithoutanyspacestoseehowthelayoutbreakslonglinesinsideapostbody'.repeat(2);

/** 生成一张纯色渐变的占位图，返回 blob 地址。 */
function picture(width: number, height: number, hue: number): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, `hsl(${hue} 62% 70%)`);
    gradient.addColorStop(1, `hsl(${(hue + 50) % 360} 58% 46%)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.fillStyle = 'rgba(255,255,255,.85)';
    context.font = '600 26px sans-serif';
    context.fillText(`${width}×${height}`, 18, 40);
  }
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : ''), 'image/png'));
}

export interface PostsMock {
  posts: Post[];
  conversations: Conversation[];
  flags: { empty: boolean; slow: boolean; creatorsFail: boolean; friendOfAqua: boolean; /** 大佬名单多等这么多毫秒才回来，用来看片头的「等数据」那一段 */ creatorsDelay: number };
  handle: (request: { path: string; url: URL; method: string; body: unknown }) => unknown;
  /** 模拟别人发来一条新动态（实时事件到达后页面会重取） */
  receivePost: () => Post;
}

export async function createPostsMock(): Promise<PostsMock> {
  const pics = await Promise.all([picture(900, 520, 205), picture(520, 780, 330), picture(640, 640, 35), picture(1200, 420, 150), picture(600, 600, 265), picture(720, 480, 15), picture(480, 640, 95), picture(800, 800, 185), picture(640, 400, 300)]);
  const cover = await picture(1400, 420, 250);
  people[5].profile_cover_url = cover;

  function base(id: number, authorId: number, content: string, minutes: number, extra: Partial<Post> = {}): Post {
    return { id, author_id: authorId, author: user(authorId), content, visibility: 'public', moderation_status: 'approved', image_urls: [], created_at: ago(minutes), updated_at: ago(minutes), like_count: 0, comment_count: 0, liked_by_me: false, recent_likes: [], recent_comments: [], ...extra };
  }

  const p119 = base(119, 2, longText, 26, { image_urls: [pics[3]], like_count: 7, recent_likes: [user(3), user(4), me], liked_by_me: true });
  const threadRoot = comment(120, 2, '第三张的配色太舒服了，求色板 #像素画', 9, { like_count: 3, liked_by_me: true });
  const replyA = comment(120, 3, '晚点整理一份发出来', 8, { parent_id: threadRoot.id, parent_author: user(2) });
  const replyB = comment(120, 1, '@阿夸 我也想要 +1', 7, { parent_id: replyA.id, parent_author: user(3) });
  const replyC = comment(120, 5, '蹲一个，顺便问下画布尺寸是多大的？我自己画的时候总是把握不好比例，画出来的角色头特别大。', 6, { parent_id: threadRoot.id, parent_author: user(2), moderation_status: 'approved' });
  const posts: Post[] = [
    base(120, 3, '周末画的三张小图，参加 #像素画 接龙 @酷可mc 看看这个风格行不行\n下一张准备画夜景。', 12, { image_urls: [pics[0], pics[1], pics[2]], like_count: 12, recent_likes: [user(2), user(4), user(5), user(6), me], comment_count: 6, topics: [{ id: 1, name: '像素画', post_count: 42 }], recent_comments: [threadRoot, replyA, replyB, replyC, comment(120, 4, '好看', 5), comment(120, 1, '可以，周五接龙就用这个风格。这条是我自己发的，还在审核。', 2, { moderation_status: 'pending' })] }),
    p119,
    base(118, 1, '九宫格测试：把这周的草稿全发出来 #创作接龙', 44, { moderation_status: 'pending', visibility: 'friends', image_urls: pics.slice(0, 9) }),
    base(117, 5, '转一下，思路很清楚，尤其是分格子那段。', 58, { repost_of_id: 119, repost_of: reference(p119), like_count: 2, recent_likes: [me, user(2)] }),
    base(116, 1, '置顶说明：这里主要发作品更新和踩坑记录，约稿、合作请私聊。', 60 * 26, { pinned_at: ago(60 * 20), like_count: 23, recent_likes: [user(2), user(3), user(4), user(5), user(6)], comment_count: 1, recent_comments: [comment(116, 6, '收到', 60 * 25)] }),
    base(115, 2, '第二章终于更新了，新增三张地图。', 60 * 30, { ccw_creations: [creation], like_count: 31, recent_likes: [user(3)], comment_count: 0 }),
    base(114, 3, '两张对比图，左边是改之前，右边是改之后。', 60 * 49, { image_urls: [pics[4], pics[5]], visibility: 'friends' }),
    base(113, 1, '这条没过审。', 60 * 52, { moderation_status: 'rejected', visibility: 'private' }),
    base(112, 5, '', 60 * 70, { repost_of_id: 90, repost_of: null }),
    base(111, 6, '四张图的排法 #像素画', 60 * 75, { image_urls: [pics[6], pics[7], pics[8], pics[0]], like_count: 4, recent_likes: [] })
  ];
  for (let id = 110; id >= 62; id -= 1) {
    const authorId = [2, 3, 4, 6, 1][id % 5];
    posts.push(base(id, authorId, ['早', '今天把背景音乐换了，听起来顺多了。', '有人周五晚上一起接龙吗 #创作接龙', '修了一个存档读不出来的问题。', '新角色的行走图画完了，一共八个方向。'][id % 5], 60 * (80 + (110 - id) * 7), { like_count: id % 4, image_urls: id % 9 === 0 ? [pics[id % pics.length]] : [] }));
  }

  const topics: PostTopic[] = [
    { id: 1, name: '像素画', post_count: 42 }, { id: 2, name: '创作接龙', post_count: 31 }, { id: 3, name: '碰撞检测', post_count: 18 }, { id: 4, name: '一个特别特别长的话题名字用来测试截断', post_count: 9 }, { id: 5, name: '新手求助', post_count: 7 }
  ];
  let notifications: PostNotification[] = [
    { id: 1, recipient_id: 1, actor_id: 2, actor: user(2), post_id: 116, type: 'like', created_at: ago(3), post: reference(posts[4]) },
    { id: 2, recipient_id: 1, actor_id: 3, actor: user(3), post_id: 120, type: 'mention', created_at: ago(12), post: reference(posts[0]) },
    { id: 3, recipient_id: 1, actor_id: 5, actor: user(5), post_id: 116, comment_id: 1, type: 'comment', created_at: ago(40), post: reference(posts[4]), comment: comment(116, 5, '约稿怎么联系？这条评论写得很长很长，用来看通知列表里两行截断的效果，再多写一点点凑够长度。', 40) },
    { id: 4, recipient_id: 1, actor_id: 2, actor: user(2), post_id: 120, comment_id: 2, type: 'reply', read_at: ago(50), created_at: ago(55), comment: comment(120, 2, '晚点发你', 55) },
    { id: 5, recipient_id: 1, actor_id: 6, actor: user(6), post_id: 999, type: 'repost', read_at: ago(60 * 5), created_at: ago(60 * 6), post: null }
  ];
  const friends: Friendship[] = [2, 3, 5].map((id, index) => ({ id: index + 1, user_id: 1, friend_id: id, user: me, friend: user(id) }));
  const preview = (id: number, content: string): Message => ({ id, conversation_id: 0, sender_id: 2, sender: user(2), type: 'text', content, created_at: ago(5) }) as Message;
  const conversations = [
    { id: 1, type: 'group', title: 'Scratch 创作交流群', display_title: 'Scratch 创作交流群', member_count: 128, last_message: preview(1, '周五接龙谁开头') },
    { id: 2, type: 'direct', title: '阿夸', display_title: '阿夸', direct_user: user(2), last_message: preview(2, '好') },
    { id: 3, type: 'group', title: 'PICO PARK 开黑群名字很长很长很长很长很长很长很长很长', display_title: 'PICO PARK 开黑群名字很长很长很长很长很长很长很长很长', member_count: 227 },
    { id: 4, type: 'direct', title: '薄荷糖', display_title: '薄荷糖', direct_user: user(3) },
    { id: 5, type: 'group', title: 'KukeChat 官方交流群', display_title: 'KukeChat 官方交流群', member_count: 412 }
  ] as Conversation[];
  // 大佬入住：46 人。题图有的有、有的没有、有一张是坏链接；签名里混着 HTML；数字从一亿多到 0 都有
  const creatorNames = ['星野工作室', '代码猫', '一个名字非常非常长的创作者昵称用来测试截断', '木木', 'Kiri', '夜航船', 'Mio 的小黑屋', '阿尔法', '橘子汽水', '像素骑士'];
  const creatorBios = [
    '做平台跳跃和解谜，更新慢但是每一作都认真打磨，欢迎来玩来提意见。',
    '<img src="https://m.xiguacity.cn/activites/2024/banner-long-name-of-a-picture.png" alt="签名里塞了一张图',
    '周更像素动画',
    '<p>写 <b>引擎</b> 的，偶尔也画画 &amp; 做音乐。</p><br/>',
    null,
    '<img src="https://example.com/only-an-image.png">',
    '3 < 5 而且 a > b，这种不是标签的尖括号要原样留着',
    '入坑五年，做过四十多个作品。喜欢研究克隆体、物理引擎和各种奇怪的渲染技巧，文章都发在主页，这段简介故意写得很长用来看两行截断。'
  ];
  const creators: CcwCreator[] = Array.from({ length: 46 }, (_, index) => ({
    id: 200 + index, username: `creator${index + 1}`, nickname: creatorNames[index % creatorNames.length],
    ccw_student_oid: `oid${index}`, ccw_name: creatorNames[index % creatorNames.length],
    bio: creatorBios[index % creatorBios.length], profile_tagline: index % 9 === 4 ? '今天也在赶更新' : null,
    profile_cover_url: index === 6 ? 'https://127.0.0.1:9/broken-cover.png' : index % 5 === 3 ? null : pics[(index * 4) % pics.length],
    ccw_follower_count: index === 0 ? 128600000 : index === 45 ? 1000 : Math.round(2360000 / (index + 1) ** 1.15) + 1000,
    ccw_like_count: index === 4 ? 0 : Math.round(31600000 / (((index * 7) % 23) + 2)),
    ccw_creation_count: index === 9 ? 0 : ((index * 13) % 97) + 3, ccw_view_count: 1000
  }) as CcwCreator);

  const flags = { empty: false, slow: false, creatorsFail: false, friendOfAqua: true, creatorsDelay: 0 };
  let nextPostId = 400;
  let outgoing: Array<{ id: number; requester_id: number; receiver_id: number; status: string }> = [];

  function page(list: Post[], url: URL): Post[] {
    const beforeId = Number(url.searchParams.get('before_id') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? 20);
    const sort = url.searchParams.get('sort');
    const ordered = sort === 'hot' ? [...list].sort((a, b) => b.like_count + b.comment_count - (a.like_count + a.comment_count) || b.id - a.id) : list;
    const start = beforeId ? ordered.findIndex((post) => post.id === beforeId) + 1 : 0;
    return ordered.slice(start, start + limit);
  }

  function find(id: number): Post | undefined {
    return posts.find((post) => post.id === id);
  }

  function handle({ path, url, method, body }: { path: string; url: URL; method: string; body: unknown }): unknown {
    const payload = (body ?? {}) as Record<string, unknown>;
    let match: RegExpMatchArray | null;
    if (path === '/posts/feed') {
      if (flags.empty) {
        return [];
      }
      const scope = url.searchParams.get('scope');
      const topic = url.searchParams.get('topic');
      let list = scope === 'mine' ? posts.filter((post) => post.author_id === 1) : scope === 'square' ? posts.filter((post) => post.visibility === 'public' && post.moderation_status === 'approved') : posts;
      if (topic) {
        list = list.filter((post) => post.content.includes(`#${topic}`));
      }
      return page(list, url);
    }
    if (path === '/posts/topics/trending') {
      return flags.empty ? [] : topics;
    }
    if (path === '/posts/topics/search') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      return topics.filter((topic) => topic.name.toLowerCase().includes(q));
    }
    if (path === '/posts/notifications') {
      return flags.empty ? { items: [], unread_count: 0 } : { items: notifications, unread_count: notifications.filter((item) => !item.read_at).length };
    }
    if (path === '/posts/notifications/read') {
      notifications = notifications.map((item) => ({ ...item, read_at: item.read_at ?? ago(0) }));
      return { items: notifications, unread_count: 0 };
    }
    if ((match = path.match(/^\/posts\/notifications\/(\d+)\/read$/))) {
      notifications = notifications.map((item) => (item.id === Number(match?.[1]) ? { ...item, read_at: ago(0) } : item));
      return { items: notifications, unread_count: notifications.filter((item) => !item.read_at).length };
    }
    if ((match = path.match(/^\/posts\/users\/(\d+)\/stats$/))) {
      const mine = posts.filter((post) => post.author_id === Number(match?.[1]));
      return { post_count: mine.length, like_count: mine.reduce((sum, post) => sum + post.like_count, 0) + 1289, comment_count: mine.reduce((sum, post) => sum + post.comment_count, 0) + 76 };
    }
    if ((match = path.match(/^\/posts\/users\/(\d+)$/))) {
      const id = Number(match[1]);
      return id === 4 ? [] : page(posts.filter((post) => post.author_id === id), url);
    }
    if (path === '/posts' && method === 'POST') {
      nextPostId += 1;
      const original = payload.repost_of_id ? find(Number(payload.repost_of_id)) : undefined;
      const created = base(nextPostId, 1, String(payload.content ?? ''), 0, { visibility: payload.visibility as Post['visibility'], image_urls: (payload.image_urls as string[]) ?? [], moderation_status: 'pending', repost_of_id: original?.id ?? null, repost_of: original ? reference(original) : null });
      posts.unshift(created);
      return created;
    }
    if ((match = path.match(/^\/posts\/(\d+)\/like$/))) {
      const post = find(Number(match[1]));
      if (post) {
        post.liked_by_me = !post.liked_by_me;
        post.like_count += post.liked_by_me ? 1 : -1;
        post.recent_likes = post.liked_by_me ? [me, ...(post.recent_likes ?? [])] : (post.recent_likes ?? []).filter((item) => item.id !== 1);
      }
      return { liked: post?.liked_by_me ?? false, like_count: post?.like_count ?? 0 };
    }
    if ((match = path.match(/^\/posts\/(\d+)\/likes$/))) {
      const post = find(Number(match[1]));
      return (post?.recent_likes ?? []).map((item, index) => ({ id: index + 1, post_id: post?.id ?? 0, user_id: item.id, user: item, created_at: ago(index * 7 + 1) }));
    }
    if ((match = path.match(/^\/posts\/(\d+)\/pin$/))) {
      const post = find(Number(match[1]));
      if (post) {
        post.pinned_at = method === 'DELETE' ? null : ago(0);
      }
      return post;
    }
    if ((match = path.match(/^\/posts\/(\d+)\/comments\/(\d+)\/like$/))) {
      const target = find(Number(match[1]))?.recent_comments?.find((item) => item.id === Number(match?.[2]));
      if (target) {
        target.liked_by_me = !target.liked_by_me;
        target.like_count += target.liked_by_me ? 1 : -1;
      }
      return { liked: target?.liked_by_me ?? false, like_count: target?.like_count ?? 0 };
    }
    if ((match = path.match(/^\/posts\/(\d+)\/comments$/))) {
      const post = find(Number(match[1]));
      if (method !== 'POST') {
        return post?.recent_comments ?? [];
      }
      const parent = post?.recent_comments?.find((item) => item.id === payload.parent_id);
      const created = comment(Number(match[1]), 1, String(payload.content ?? ''), 0, { parent_id: (payload.parent_id as number | null) ?? null, parent_author: parent?.author ?? null });
      if (post) {
        post.recent_comments = [...(post.recent_comments ?? []), created];
        post.comment_count += 1;
      }
      return created;
    }
    if ((match = path.match(/^\/posts\/(\d+)$/))) {
      const id = Number(match[1]);
      const index = posts.findIndex((post) => post.id === id);
      if (method === 'DELETE') {
        if (index >= 0) {
          posts.splice(index, 1);
        }
        return {};
      }
      if (index < 0) {
        return new Response(JSON.stringify({ detail: '动态不存在' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      }
      if (method === 'PATCH') {
        posts[index] = { ...posts[index], content: String(payload.content ?? ''), visibility: payload.visibility as Post['visibility'], image_urls: (payload.image_urls as string[]) ?? [] };
      }
      return posts[index];
    }
    if (path === '/uploads/post-image' || path === '/uploads/profile-cover') {
      return { url: path.endsWith('cover') ? cover : pics[nextPostId % pics.length] };
    }
    if (path === '/friends') {
      return flags.friendOfAqua ? friends : friends.slice(1);
    }
    if (path === '/friends/requests/outgoing') {
      return outgoing;
    }
    if (path === '/friends/requests' && method === 'POST') {
      outgoing = [...outgoing, { id: outgoing.length + 1, requester_id: 1, receiver_id: Number(payload.receiver_id ?? 0), status: 'pending' }];
      return outgoing[outgoing.length - 1];
    }
    if (path === '/users/ccw-creators') {
      if (flags.creatorsFail) {
        return new Response(JSON.stringify({ detail: '服务暂时不可用' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 30);
      const list = flags.empty ? [] : creators;
      return { items: list.slice(offset, offset + limit), total: list.length, limit, offset, has_more: offset + limit < list.length };
    }
    if (path === '/users/me' && method !== 'GET') {
      Object.assign(me, payload, payload.profile_cover_url && payload.profile_cover_url !== me.profile_cover_url ? { profile_cover_pending_url: payload.profile_cover_url, profile_cover_moderation_status: 'pending', profile_cover_url: me.profile_cover_url } : {});
      return me;
    }
    if ((match = path.match(/^\/users\/(\d+)$/))) {
      return people.find((item) => item.id === Number(match?.[1])) ?? creators.find((item) => item.id === Number(match?.[1])) ?? new Response(JSON.stringify({ detail: '用户不存在' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
    if (path === '/conversations') {
      return conversations;
    }
    if (path === '/conversations/direct') {
      return conversations[1];
    }
    if (/^\/conversations\/\d+\/messages$/.test(path) && method === 'POST') {
      return { id: 9000, conversation_id: 1, sender_id: 1, sender: me, type: 'text', content: String(payload.content ?? ''), metadata: payload.metadata, created_at: ago(0) };
    }
    if (path === '/reports/options') {
      return { reasons: [...['垃圾广告', '辱骂骚扰', '色情低俗', '违法违规', '诈骗或钓鱼'].map((reason) => ({ reason, details_required: false })), { reason: '其他', details_required: true }], details_min_length: 10, max_evidence_messages: 10, max_attachments: 6 };
    }
    if (path === '/reports/quota') {
      return { score: 0, daily_quota: 10, used_today: 3, remaining_today: 7 };
    }
    if (path === '/reports' && method === 'POST') {
      return { id: 1 };
    }
    return [];
  }

  function receivePost(): Post {
    nextPostId += 1;
    const created = base(nextPostId, 4, `刚收到的一条新动态（#${nextPostId}），用来看实时刷新。`, 0, { like_count: 1, recent_likes: [user(2)] });
    posts.unshift(created);
    return created;
  }

  return { posts, conversations, flags, handle, receivePost };
}

/** 把假后端接到 window.fetch 上。上传走的是 FormData，这里按路径直接给结果。 */
export function installPostsMock(mock: PostsMock): void {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    if (!url.pathname.includes('/api/v1/')) {
      return realFetch(input, init);
    }
    const path = url.pathname.replace(/^.*\/api\/v1/, '');
    await new Promise((resolve) => window.setTimeout(resolve, mock.flags.slow ? 600_000 : path === '/users/ccw-creators' ? 120 + mock.flags.creatorsDelay : 120));
    let body: unknown;
    try {
      body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    } catch {
      body = undefined;
    }
    const result = mock.handle({ path, url, method: (init?.method ?? 'GET').toUpperCase(), body });
    return result instanceof Response ? result : new Response(JSON.stringify(result ?? null), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}
