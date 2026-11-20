# KukeChat for CCW（油猴脚本）

装在浏览器里的油猴脚本，跑在 `www.ccw.site` 上：

- 重做共创世界网页版的**消息中心**（`/notice`）和**动态页**（`/feed`）；
- 把 KukeChat 接进共创世界：私信、实时「正在玩」、主页名片等（进行中）。

## 构建

在仓库根目录：

```bash
npm run build:userscript      # → dist-userscript/kukechat-ccw.user.js
```

版本号在 `userscript/package.json`。头部注释（`@match`、`@updateURL` 等）在根目录的 `vite.userscript.config.ts` 里。

## 目录

```text
src/
  main.js            入口：页面识别、启动
  core/
    config.js        CCW 接口地址等常量
    sign.js          MD5 / HMAC-MD5，与 CCW 站点请求库的签名算法一致
    api.js           带签名的 CCW 请求、ApiError
    dom.js           h() 建节点
    icons.js         线性图标、原版消息中心的像素图标（PIX）
    links.js         站内链接、评论锚点
    time.js          相对时间、日期分段
    rich.js          表情、图片、链接、系统消息 HTML 的安全渲染
    router.js        接管 history，按路由启用 / 停用各页面
    sticky.js        跟随 CCW 顶栏的吸顶位置
    style.js         注入 styles/app.css
  notice/            消息中心：数据模型、加载与标已读、界面
  feed/              动态页
  styles/app.css     全部样式（.ccwn-app 为公共根类）
```

## 约定

- **CCW 接口以 hub 源码为准**（`fee/community/hub` 的 `src/api/`）。请求要带签名头 `a` / `b`，统一走 `core/api.js` 的 `post()`。
- `/students/self/detail` 会返回实名、证件号等敏感字段，只取用户 ID，不要展示或上报其他字段。
- 页面上新加的元素尽量复用 CCW 的视觉语言；不要做悬浮在页面上的窗口。
- 模块之间不能给对方导出的 `let` 变量赋值（ES 模块规定），需要改状态时由所属模块提供函数。

## 对着本地后端联调

两个只读 localStorage 的开发开关（正式使用时不要设）：

- `kukechat-ccw:api`：KukeChat 后端地址，默认 `https://chat-api.kuke.ink`；
- `kukechat-ccw:token`：直接用这个令牌，不走 `chat-api.kuke.ink` 的 cookie 会话。

浏览器会拦下 https 页面对 `http://127.0.0.1` 的请求（本地网络访问），所以更省事的办法是保持默认地址，
用 Playwright 的 `page.route` 把 `https://chat-api.kuke.ink/**` 转发到本地后端，再配合 `kukechat-ccw:token`。
本地后端要在 `CORS_ORIGINS` 里加上 `https://www.ccw.site`。

## 本地试跑

把 `dist-userscript/kukechat-ccw.user.js` 的内容粘进 Tampermonkey 新建脚本；或在已打开的 CCW 页面控制台里执行整段内容（会接管当前页面）。
