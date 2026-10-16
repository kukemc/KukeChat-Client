import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import { copyText } from '@/components/chat/message/chatDom';
import { JuryBadge } from '@/components/jury/growth/JuryBadge';
import { formatDays, formatRank } from '@/components/level/labels';
import { LevelIcons } from '@/components/level/LevelIcons';
import { LikedByList } from '@/components/likes/LikedByList';
import { BirthdayToday, useBirthdayFact } from '@/components/birthday/BirthdayBits';
import { useMyBirthday } from '@/components/birthday/data';
import { useCharmFact } from '@/components/gifts/data';
import { MyLikesButton } from '@/components/likes/ProfileLikeButton';
import { useKukeStore } from '@/store/kukeStore';
import type { User } from '@/types/api';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';
import { SELF_CARD_IMAGE_LIMIT, useSelfCardData, useSelfCardPosts, type SelfCardSkin } from '../selfCardData';
import { formatCompactCount } from '../userCardData';
import { useEscapeLayer } from './Modal';

const EDGE = 12;
/** 卡片上沿离头像下沿多远 */
const GAP = 6;
/** 窗口再矮，卡片也至少留这么高（里面可以滚） */
const MIN_HEIGHT = 160;

interface SelfCardDesktopProps {
  user: User;
  /** 标题栏上那个头像按钮：卡片贴着它的下沿弹出，点它不算「点了卡片外面」 */
  anchorRef: RefObject<HTMLElement | null>;
  /** 卡片的 id，按钮的 aria-controls 指着它 */
  id: string;
  /** restoreFocus：是键盘关掉的（Esc），焦点要还给头像按钮 */
  onClose: (restoreFocus?: boolean) => void;
}

/**
 * 「我的资料卡」：点标题栏上自己的头像弹出来，样子和别人的资料卡（UserCardDesktop）是一家，内容换成自己用得上的。
 * 等级、徽章、动态这几行没有数据时整行不出现。
 *
 * 头部右侧是我收到的赞（大拇指 + 总数，今天收到过赞时带一个红色的 +N），点它把下面的资料行换成「谁赞了我」的名单，
 * 再点一次（或点「收起」）换回来。服务端没有资料点赞时那里是空的。在线状态在头像右下角的点和名字下面的第三行。
 *
 * 外面那层浮层铺满它挂上去的容器（扩展浮窗的外框 / 桌面端的根），自己不接鼠标 —— 点卡片外面的那一下照常落到下面的东西上，
 * 关卡片靠的是 window 上的 pointerdown。浮层带 data-window-action：卡片是从标题栏里用 portal 渲染出来的，
 * React 的事件会沿组件树冒到标题栏上，标题栏看到这个标记就不会把卡片上的按下当成拖动窗口。
 */
export function SelfCardDesktop({ user, anchorRef, id, onClose }: SelfCardDesktopProps): JSX.Element {
  const openUserSpace = useKukeStore((state) => state.openUserSpace);
  const openSettingsTab = useKukeStore((state) => state.openSettingsTab);
  const openLevel = useKukeStore((state) => state.openLevel);
  const openShop = useKukeStore((state) => state.openShop);
  const data = useSelfCardData(user);
  const charmFact = useCharmFact(user);
  const cardRef = useRef<HTMLElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number; maxWidth: number; maxHeight: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [likesOpen, setLikesOpen] = useState(false);
  const likesId = useId();
  useEscapeLayer(() => onClose(true));

  // 每次渲染后都重新量一遍：字号、窗口大小变了位置要跟着变
  useLayoutEffect(() => {
    const layer = cardRef.current?.parentElement;
    // 卡片要收在窗口根里面。浮层通常正好铺满它；窗口根不是定位元素时（桌面端没开整窗背景）浮层铺满的是更外面的容器，
    // 所以位置按窗口根来算，最后再换成浮层里的坐标
    const root = layer?.parentElement;
    function measure(): void {
      const card = cardRef.current;
      const anchor = anchorRef.current;
      if (!card || !layer || !root || !anchor) {
        return;
      }
      const bounds = root.getBoundingClientRect();
      const layerBounds = layer.getBoundingClientRect();
      // 扩展浮窗比视口大时外框是整体缩小的：屏幕上量到的距离要换回外框自己的坐标
      const scale = root.offsetWidth > 0 && bounds.width > 0 ? bounds.width / root.offsetWidth : 1;
      const anchorRect = anchor.getBoundingClientRect();
      const maxLeft = Math.max(EDGE, root.clientWidth - card.offsetWidth - EDGE);
      const inRootLeft = Math.min(Math.max((anchorRect.left - bounds.left) / scale, EDGE), maxLeft);
      const inRootTop = Math.max(EDGE, Math.min((anchorRect.bottom - bounds.top) / scale + GAP, root.clientHeight - MIN_HEIGHT - EDGE));
      const left = Math.round(inRootLeft + (bounds.left - layerBounds.left) / scale);
      const top = Math.round(inRootTop + (bounds.top - layerBounds.top) / scale);
      const maxWidth = Math.max(0, root.clientWidth - EDGE * 2);
      const maxHeight = Math.round(Math.max(MIN_HEIGHT, root.clientHeight - inRootTop - EDGE));
      setPlace((current) => (current && current.left === left && current.top === top && current.maxWidth === maxWidth && current.maxHeight === maxHeight ? current : { left, top, maxWidth, maxHeight }));
    }
    measure();
    window.addEventListener('resize', measure);
    const observer = root && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (root) {
      observer?.observe(root);
    }
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  });

  // 点卡片和头像按钮以外的地方、或者窗口失去焦点（切到别的程序、点进了宿主页面里的 iframe）就关。
  // 用 composedPath：扩展形态下界面在 Shadow DOM 里，window 上看到的 target 是外面的宿主节点。
  useEffect(() => {
    function onPointerDown(event: PointerEvent): void {
      const path = event.composedPath();
      const card = cardRef.current;
      const anchor = anchorRef.current;
      if ((card && path.includes(card)) || (anchor && path.includes(anchor))) {
        return;
      }
      onClose();
    }
    function onBlur(): void {
      onClose();
    }
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [anchorRef, onClose]);

  // 打开后把焦点放进卡片：它挂在容器末尾，不这样 Tab 键要走完整个界面才到得了。
  // 等位置算好（卡片可见）之后再放：还藏着的元素接不住焦点
  const placed = place !== null;
  useEffect(() => {
    if (placed) {
      cardRef.current?.focus({ preventScroll: true });
    }
  }, [placed]);

  useEffect(() => {
    if (!copied) {
      return undefined;
    }
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  /** 先关卡片再跳走 */
  const leave = (action: () => void) => (): void => {
    onClose();
    action();
  };
  const editProfile = leave(() => openSettingsTab('account'));
  const openSpace = leave(() => openUserSpace(user.id));
  const bio = user.bio?.trim();
  const admin = user.platform_role === 'admin';
  const hasBadges = Boolean(user.jury_badge || user.ccw_student_oid || admin || data.skin);
  // 等级下面那一行统计，和别人的资料卡（UserLevelCard）同一套：连续活跃、全站名次、注册天数，再加心意值
  const levelFacts: Array<{ label: string; value: string; title?: string }> = data.levelCard ? [
    { label: '连续活跃', value: `${data.levelCard.streak} 天` },
    { label: '全站名次', value: formatRank(data.levelCard.rank) },
    { label: '注册', value: `${data.levelCard.registered_days.toLocaleString('zh-CN')} 天` }
  ] : [];
  if (charmFact && (data.levelCard || !data.levelLoading)) {
    levelFacts.push(charmFact);
  }
  const ccwStats = [
    typeof user.ccw_follower_count === 'number' ? `粉丝 ${formatCompactCount(user.ccw_follower_count)}` : null,
    typeof user.ccw_creation_count === 'number' ? `作品 ${formatCompactCount(user.ccw_creation_count)}` : null
  ].filter(Boolean).join(' · ');

  return (
    <div className="ksc-layer" data-window-action>
      <section
        ref={cardRef}
        id={id}
        role="dialog"
        aria-label="我的资料卡"
        tabIndex={-1}
        className="kmd-card ksc-card kui-scroll"
        style={place ?? { visibility: 'hidden' }}
      >
        <header className="kmd-card-head">
          <span className="kmd-card-avatar">
            <Avatar user={user} label={data.name} size="lg" frame />
            <i className={data.online ? 'is-online' : undefined} />
          </span>
          <div className="kmd-card-id">
            <h3>{data.name}</h3>
            <p className="ksc-handle">
              <span>{user.username ? `@${user.username}` : '未设置用户名'}</span>
              <i aria-hidden="true">·</i>
              <button type="button" className={cx('ksc-id', copied && 'is-copied')} title={copied ? '已复制' : '点击复制 ID'} aria-label={copied ? `ID ${user.id}，已复制` : `ID ${user.id}，点击复制`} onClick={() => {
                copyText(String(user.id));
                setCopied(true);
              }}>
                ID {user.id}
                <Icon name={copied ? 'check' : 'copy'} className="h-3 w-3" />
              </button>
            </p>
            <p className={cx('kmd-card-status', data.online && 'is-online')} title={data.statusLabel}>{data.statusLabel}</p>
          </div>
          <MyLikesButton user={user} open={likesOpen} popup="inline" controls={likesId} className="ksc-likes" onPress={() => setLikesOpen((value) => !value)} />
        </header>

        {likesOpen ? (
          <div id={likesId} className="ksc-liked" role="region" aria-label="谁赞了我">
            <div className="ksc-liked-head">
              <h4>谁赞了我</h4>
              <button type="button" className="kui-btn kui-btn--sm kui-btn--ghost" onClick={() => setLikesOpen(false)}>收起</button>
            </div>
            <div className="ksc-liked-scroll kui-scroll">
              <LikedByList user={user} onOpenUser={(target) => leave(() => openUserSpace(target.id))()} />
            </div>
          </div>
        ) : null}

        <dl className="ksc-rows" hidden={likesOpen}>
          {data.levelAvailable ? (
            <div className="ksc-row" data-row="level">
              <dt>等级</dt>
              <dd className="ksc-stack">
                <button type="button" className="ksc-link ksc-level" title="查看我的等级" onClick={leave(() => openLevel('me'))}>
                  {data.level > 0 ? <LevelIcons level={data.level} variant="full" plain /> : null}
                  <b>Lv.{data.level}</b>
                  {data.activeDays !== null ? <span className="ksc-level-days">累计活跃 {formatDays(data.activeDays)} 天</span> : data.levelLoading ? <span className="ksc-bone ksc-level-days" aria-hidden="true" /> : null}
                  <Icon name="chevron" className="ksc-arrow h-3.5 w-3.5" />
                </button>
                {levelFacts.length > 0 ? (
                  <span className="klv-user-facts ksc-facts">
                    {levelFacts.map((fact) => <span key={fact.label} title={fact.title}><i>{fact.label}</i>{fact.value}</span>)}
                  </span>
                ) : null}
              </dd>
            </div>
          ) : charmFact ? (
            // 服务端没有账号等级：心意值自己占一行，样子和其它资料行一样
            <div className="ksc-row" data-row="charm">
              <dt>{charmFact.label}</dt>
              <dd title={charmFact.title}>{charmFact.value}</dd>
            </div>
          ) : null}

          {hasBadges ? (
            <div className="ksc-row" data-row="badges">
              <dt>徽章</dt>
              <dd className="ksc-badges">
                <JuryBadge tier={user.jury_badge} variant="card" />
                {admin ? <span className="kui-tag kui-tag--warn" title="KukeChat 平台管理员"><Icon name="shieldCheck" className="h-3 w-3" />平台管理员</span> : null}
                {user.ccw_student_oid ? <span className="kui-tag kui-tag--accent" title={`已绑定 CCW 账号${user.ccw_name ? `「${user.ccw_name}」` : ''}`}><Icon name="ccw" className="h-3 w-3" />CCW 已绑定</span> : null}
                {data.skin ? <SkinBadge skin={data.skin} onOpenShop={leave(openShop)} /> : null}
              </dd>
            </div>
          ) : null}

          <div className="ksc-row" data-row="bio">
            <dt>签名</dt>
            <dd>
              {bio
                ? <p className="ksc-bio" title={bio}>{bio}</p>
                : <button type="button" className="ksc-link ksc-empty" onClick={editProfile}>还没有写签名，点这里写一句<Icon name="edit" className="h-3 w-3" /></button>}
            </dd>
          </div>

          <BirthdayRow user={user} onEdit={editProfile} />

          <div className="ksc-row" data-row="ccw">
            <dt>CCW</dt>
            <dd>
              {data.ccwProfileUrl ? (
                <button type="button" className="ksc-link kmd-card-ccw" title="打开我的 CCW 主页" onClick={() => {
                  const url = data.ccwProfileUrl;
                  if (url) {
                    void openExternalUrl(url);
                  }
                }}>
                  {data.ccwAvatarUrl ? <img src={data.ccwAvatarUrl} alt="" draggable={false} /> : <Icon name="ccw" className="h-4 w-4" />}
                  <span>{user.ccw_name || 'CCW 账号'}</span>
                  <small>{ccwStats}</small>
                  <Icon name="external" className="h-3.5 w-3.5" />
                </button>
              ) : (
                <p className="ksc-unbound">
                  <span>未绑定</span>
                  <button type="button" className="kui-link" onClick={leave(() => openSettingsTab('ccw'))}>去绑定</button>
                </p>
              )}
            </dd>
          </div>

          <PostsRow userId={user.id} onOpen={openSpace} />
        </dl>

        <footer className="kmd-card-actions" hidden={likesOpen}>
          <button type="button" className="kui-btn" onClick={editProfile}>编辑资料</button>
          <button type="button" className="kui-btn kui-btn--primary" onClick={openSpace}>我的主页</button>
        </footer>
      </section>
    </div>
  );
}

/** 正在用的气泡皮肤：一小块皮肤本身的底色 + 名字。服务端有商店时点了过去。 */
function SkinBadge({ skin, onOpenShop }: { skin: SelfCardSkin; onOpenShop: () => void }): JSX.Element {
  const label = skin.name ?? '气泡皮肤';
  // 底色是解析皮肤时校验过的（bubbleSkin.ts），浅色、深色各一份，由样式按主题挑
  const swatch = { '--ksc-skin-light': skin.skin.light.background, '--ksc-skin-dark': skin.skin.dark.background } as CSSProperties;
  const content = <><i style={swatch} />{label}</>;
  const title = skin.name ? `正在使用的气泡皮肤「${skin.name}」` : '正在使用气泡皮肤';
  return skin.shopAvailable
    ? <button type="button" className="kui-tag ksc-skin" title={`${title} · 点击去商店`} onClick={onOpenShop}>{content}</button>
    : <span className="kui-tag ksc-skin" title={title}>{content}</span>;
}

/**
 * 「动态」那一行：最近动态里的图，最多四张；没有带图的就写条数；一条动态都没有、或者没取到，整行不出现。
 * 这一行不管处在哪种状态高度都一样（骨架、图片、条数），数据到了卡片不会跳一下。
 */
function PostsRow({ userId, onOpen }: { userId: number; onOpen: () => void }): JSX.Element | null {
  const query = useSelfCardPosts(userId);
  // 加载不出来的图（缩略图还没生成、文件没了）直接不要
  const [broken, setBroken] = useState<readonly string[]>([]);

  if (query.isPending) {
    return (
      <div className="ksc-row" data-row="posts" data-state="loading">
        <dt>动态</dt>
        <dd><div className="ksc-posts" aria-hidden="true">{Array.from({ length: SELF_CARD_IMAGE_LIMIT }, (_, index) => <span key={index} className="ksc-bone ksc-thumb" />)}</div></dd>
      </div>
    );
  }
  const posts = query.data;
  if (!posts) {
    return null;
  }
  const images = posts.images.filter((url) => !broken.includes(url));
  if (images.length === 0 && posts.count <= 0) {
    return null;
  }
  const count = `${posts.count.toLocaleString('zh-CN')}${posts.countIsFloor ? '+' : ''}`;
  // 图不满四张时，空出来的几格并成一块写条数
  const free = SELF_CARD_IMAGE_LIMIT - images.length;
  return (
    <div className="ksc-row" data-row="posts" data-state={images.length > 0 ? 'images' : 'count'}>
      <dt>动态</dt>
      <dd>
        <button type="button" className="ksc-posts" title="去我的主页看全部动态" aria-label={`我的动态，共 ${count} 条，去我的主页`} onClick={onOpen}>
          {images.map((url) => <img key={url} className="ksc-thumb" src={url} alt="" decoding="async" draggable={false} onError={() => setBroken((current) => (current.includes(url) ? current : [...current, url]))} />)}
          {free > 0 ? (
            <span className={cx('ksc-posts-more', free > 1 && 'is-wide')} style={{ gridColumn: `span ${free}` }}>
              <span><b>{count}</b><small>条动态</small></span>
              {free > 1 ? <Icon name="chevron" className="h-3.5 w-3.5" /> : null}
            </span>
          ) : null}
        </button>
      </dd>
    </div>
  );
}

/**
 * 「生日」那一行：填了就一直显示（「5 月 7 日」，公开了年份带年份），生日当天后面跟一个「今天生日」。
 * 没填的话给一个去填的入口（设置 → 我的资料）；服务端没有生日功能时整行不出现。
 */
function BirthdayRow({ user, onEdit }: { user: User; onEdit: () => void }): JSX.Element | null {
  const text = useBirthdayFact(user);
  const available = Boolean(useMyBirthday().data);
  if (!text && !available) {
    return null;
  }
  return (
    <div className="ksc-row" data-row="birthday" data-birthday="fact">
      <dt>生日</dt>
      <dd className="ksc-birthday">
        {text ? <>{text}<BirthdayToday user={user} /></> : <button type="button" className="ksc-link ksc-empty" onClick={onEdit}>还没有填生日，点这里填<Icon name="edit" className="h-3 w-3" /></button>}
      </dd>
    </div>
  );
}
