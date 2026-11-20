# KukeChat for CCW（油猴脚本）

装在浏览器里的油猴脚本，跑在 `www.ccw.site` 上：

- 重做共创世界网页版的**消息中心**（`/notice`）和**动态页**（`/feed`）；
- 把 KukeChat 接进共创世界，像共创世界自带的功能一样：
  - 消息中心里的「私信 / 好友」：中栏和右栏换成停靠进来的 KukeChat（`/notice/chat`、`/notice/friends`，
    `?c=<会话 id>` 打开会话，`?u=<用户 id>` 和这个人私聊）；
  - 顶栏信封红点 = 共创世界未读 + KukeChat 私信未读（不另加图标）；
  - 任何页面收到私信时右下角提醒，能直接回复；
  - 实时「正在玩 / 正在创作」，好友在 KukeChat 和共创世界上都看得到；
  - 个人主页的 KukeChat 名片（在线、正在玩、共同好友和群、礼物、最近动态、加好友 / 私信），关注按钮旁的「加好友 / 私信」；
  - 评论区：有 KukeChat 的作者头像上的在线点、等级、「私信」；
  - 作品页：作品群（游戏模式绑定了这个作品的公开群）、正在玩的好友、邀请好友一起玩；
  - 动态页：并进好友和关注的人发的 KukeChat 动态、发动态的输入框、右栏「好友在玩」；
  - 消息中心顶上：共创世界互关、也在用 KukeChat 但还不是好友的人，一键全部加好友。

后端接口见 KukeChat-Server 的 `docs/ccw-social.md`。

## 构建与发布

在仓库根目录：

```bash
npm run build:userscript      # → dist-userscript/kukechat-ccw.user.js 和只有头部的 kukechat-ccw.meta.js
npm run build                 # → dist/KukeChat.js：消息中心「私信」按需加载的界面包（带 embed 接口）
```

版本号在 `userscript/package.json`。头部注释（`@match`、`@updateURL` 等）在根目录的 `vite.userscript.config.ts` 里。
发布：三个文件复制到 KukeChat-Server 的 `app/static/ccw/`（`ccw.user.js`、`ccw.meta.js`、`kukechat.js`）随后端部署，
地址是 `https://chat-api.kuke.ink/ccw.user.js`；Greasy Fork 上传同一个 `.user.js`。

**和旧版「CCW 消息中心」脚本不能同时装**：两边都用 `#ccwn-root`，会互相覆盖。装这个之前先删掉旧的。

## 目录

```text
src/
  main.js            入口：所有页面都装的常驻层 + 消息中心 / 动态页
  core/
    config.js        CCW 接口地址等常量
    sign.js          MD5 / HMAC-MD5，与 CCW 站点请求库的签名算法一致
    api.js           带签名的 CCW 请求、ApiError
    dom.js           h() 建节点
    icons.js         线性图标、原版消息中心的像素图标（PIX）、KukeChat 图标
    links.js         站内链接、评论锚点
    time.js          相对时间、日期分段
    rich.js          表情、图片、链接、系统消息 HTML 的安全渲染
    router.js        接管 history，按路由启用 / 停用各页面
    sticky.js        跟随 CCW 顶栏的吸顶位置
    style.js         注入 styles/app.css
  notice/            消息中心：数据模型、加载与标已读、界面
  feed/              动态页
  kukechat/
    client.js        KukeChat 请求（cookie 换令牌、请求证明头）、kcIso() 时间补时区
    realtime.js      每个页面一条 WebSocket
    unread.js        私信未读（会话列表求和 + 实时增减）
    badge.js         信封红点合计
    toast.js         新消息提醒和快速回复
    presence.js      上报「正在玩 / 正在创作」
    embed.js         按需加载界面包、停靠、往 Shadow DOM 注入共创世界配色
    chatView.js      消息中心的「私信 / 好友」视图
    ccwGraph.js      自己的 CCW oid、关注列表（带是否互关）
    pages.js         往 CCW 原有页面插东西的调度（DOM 变化时重跑各页面的幂等注入）
    profile.js       个人主页名片
    comments.js      评论区
    work.js          作品页
    feed.js          动态页里的 KukeChat 动态、输入框、好友在玩
    mutuals.js       互关好友邀请横幅
  styles/app.css     全部样式（.ccwn-app 为公共根类，KukeChat 部分是 .ccwk-*）
```

## 约定

- **CCW 接口以 hub 源码为准**（`fee/community/hub` 的 `src/api/`）。请求要带签名头 `a` / `b`，统一走 `core/api.js` 的 `post()`。
- `/students/self/detail` 会返回实名、证件号等敏感字段，只取用户 ID，不要展示或上报其他字段。
- 页面上新加的元素尽量复用 CCW 的视觉语言；不要做悬浮在页面上的窗口。
- 往 CCW 原有页面里插东西时，注入函数要幂等（React 随时重画，`pages.js` 会反复调用）。
  CCW 的 DOM 类名带哈希后缀，用 `[class*="selfDoc-"]` 这种前缀匹配。评论作者 oid 在评论组件 props 的 `data.commenter.accountOid`。
- KukeChat 接口返回的时间不带时区（是 UTC），一律先过 `kcIso()`。
- 模块之间不能给对方导出的 `let` 变量赋值（ES 模块规定），需要改状态时由所属模块提供函数。

## 对着本地后端联调

两个只读 localStorage 的开发开关（正式使用时不要设）：

- `kukechat-ccw:api`：KukeChat 后端地址，默认 `https://chat-api.kuke.ink`；
- `kukechat-ccw:token`：直接用这个令牌，不走 `chat-api.kuke.ink` 的 cookie 会话。

浏览器会拦下 https 页面对 `http://127.0.0.1` 的请求（本地网络访问），所以更省事的办法是保持默认地址，
用 Playwright 的 `page.route` 把 `https://chat-api.kuke.ink/**` 转发到本地后端，再配合 `kukechat-ccw:token`。
本地后端要在 `CORS_ORIGINS` 里加上 `https://www.ccw.site`。界面包自己走 `/auth/session` 的 cookie，
联调时在 route 里把这个请求直接答成测试账号的令牌。WebSocket 不经过 `page.route`，联调时收不到实时事件。

## 本地试跑

把 `dist-userscript/kukechat-ccw.user.js` 的内容粘进 Tampermonkey 新建脚本；或在已打开的 CCW 页面控制台里执行整段内容（会接管当前页面）。
