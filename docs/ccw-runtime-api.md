# CCW / Gandi 运行时 API 参考

社区平台通过 `runtime.ccwAPI` 向扩展开放了一批能力。这份文档整理自官方「社区连接
Kontakt」扩展（`scratch3_ccw_community`）的源码，供本项目开发扩展功能时查阅。

> 平台官方文档：<https://getgandi.com/cn/extensions/kontakt>
>
> 下面的返回结构是从调用点反推的 —— 只记录了被实际读取过的字段，真实对象可能
> 还有更多属性。**每次调用前都要做特性检测**，官方扩展自身也是这么写的：
>
> ```js
> if (runtime.ccwAPI.getUserInfo) { /* ... */ }
> ```
>
> 这说明 `ccwAPI` 及其成员**并非在所有环境下都存在**（编辑器 / 播放器 /
> 离线运行时的可用集合不同），缺失时必须优雅降级。

## 快速索引

| 方法 | 返回 | 是否需要用户确认 |
| --- | --- | :---: |
| `getUserInfo()` | `Promise<CcwUser \| null>` | |
| `getProjectStats()` | `Promise<ProjectStats>` | |
| `isMyFans()` | `Promise<boolean>` | |
| `isLiked()` | `Promise<boolean>` | |
| `getCoinCount()` | `Promise<number>` | |
| `isFollowed(userId)` | `Promise<boolean>` | |
| `isLikedProject(oid)` | `Promise<boolean>` | |
| `isFavoriteProject(oid)` | `Promise<boolean>` | |
| `redirect(path)` | — | |
| `setAvatar(...)` | `Promise<boolean>` | ✅ |
| `insertCoin(count)` | — | ✅ |
| `requestCoins(count)` | `Promise<boolean>` | ✅ |
| `requestFollow()` | `Promise<boolean>` | ✅ |
| `commentWithStageSnapshot(content, screenshot)` | `Promise<boolean>` | ✅ |
| `showShare(encodedData, desc)` | `Promise<unknown>` | ✅ |

## 用户信息

```ts
runtime.ccwAPI.getUserInfo(): Promise<CcwUser | null>

interface CcwUser {
  userId: string | number;   // 社区用户 ID
  userName: string;          // 用户名
  uuid: string;              // 用户 uuid
  avatar: string;            // 头像 URL
  constellation: string;     // 星座
  following: number;         // 关注数
  followers: number;         // 粉丝数
  liked: number;             // 获赞数
  gender: string;            // 性别
}
```

未登录时返回 falsy 值。

**对 KukeChat 的意义**：这是在作品内识别 CCW 身份的唯一官方途径。KukeChat 的
`User.ccw_student_oid` 正是 CCW 身份绑定字段，两者可以对应起来 —— 例如在游戏
模式里提示「检测到你的 CCW 账号已绑定 KukeChat，点击授权即可发言」。

## 当前作品

```ts
runtime.ccwAPI.getProjectStats(): Promise<ProjectStats>

interface ProjectStats {
  commentCount: number;
  likeCount: number;
  favoriteCount: number;
  totalBucks: number;   // 累计投币数
}
```

```ts
runtime.ccwAPI.isMyFans(): Promise<boolean>      // 当前访客是否是作者的粉丝
runtime.ccwAPI.isLiked(): Promise<boolean>       // 当前访客是否已点赞本作品
runtime.ccwAPI.getCoinCount(): Promise<number>   // 当前访客给本作品投了多少币
```

> ### ⚠️ 拿不到当前作品的 oid
>
> `ccwAPI` **没有**提供获取当前作品标识的方法。已核对官方扩展全部 30 处调用，
> 无一暴露 projectId / oid。作品相关的调用要么隐含「当前作品」（如
> `getProjectStats()`），要么要求调用方自己传 oid（如 `isLikedProject(oid)`）。
>
> 官方扩展自己也在用 `window.location` 兜底（见其 `getShareCode()`）。
>
> 所以 KukeChat 游戏模式从 URL 解析作品 oid（`/detail/<24 位十六进制>`）是目前
> 唯一可行的做法，代价是**编辑器预览中不可用**（编辑器路径为 `/gandi/<id>`）。

## 他人 / 其他作品

```ts
runtime.ccwAPI.isFollowed(userId: string): Promise<boolean>       // 是否关注了某人
runtime.ccwAPI.isLikedProject(oid: string): Promise<boolean>      // 是否点赞了某作品
runtime.ccwAPI.isFavoriteProject(oid: string): Promise<boolean>   // 是否收藏了某作品
```

## 需要用户确认的操作

以下调用会弹出社区的确认 UI，用户可以拒绝。

```ts
runtime.ccwAPI.requestFollow(): Promise<boolean>          // 请求关注作者
runtime.ccwAPI.requestCoins(count: number): Promise<boolean>  // 请求投币
runtime.ccwAPI.insertCoin(count: number): void            // 投币（无返回，官方源码标注 todo）
runtime.ccwAPI.setAvatar(...args): Promise<boolean>       // 用舞台截图设为头像
runtime.ccwAPI.commentWithStageSnapshot(
  content: string,
  withScreenshot: boolean
): Promise<boolean>                                        // 代发评论，可附舞台截图
```

### 平台约定的自我限流

官方扩展对上述「会打扰用户」的调用实现了客户端限流，值得沿用：

```
60 秒窗口内最多 5 次请求；用户同意一次后计数清零。
超限时不再发起调用，而是等待 1 秒后返回 false。
```

用意是防止作品用循环反复弹窗骚扰玩家。**如果 KukeChat 将来调用这类接口，
应当遵守同样的节奏**，否则可能被平台限制。

## 跳转与分享

```ts
runtime.ccwAPI.redirect(path: string): void
```

只能跳转到 `ccw.site` 站内 —— 官方扩展会先剥掉协议与域名部分再传入。
另外它限制「一次循环内只允许一次 redirect」，防止作品把用户困在跳转里。

```ts
runtime.ccwAPI.showShare(encodedData: string, desc: string): Promise<unknown>
```

弹出分享 UI。`encodedData` 是 `encodeURIComponent(Base64.encode(原始数据))`，
官方扩展限制原始数据不超过 50 字符。分享链接会带上 `?kontakt=<data>` 参数，
被分享者打开作品后可从 `window.location.search` 取回。

## 运行时事件

```ts
runtime.on('PROJECT_RUN_STOP', handler)
```

作品停止运行时触发，用于清理每轮运行的状态（官方扩展用它重置 redirect 计数）。

## 与 KukeChat 现有实现的关系

| 需求 | 现状 |
| --- | --- |
| 当前作品 oid | `ccwAPI` 不提供，`src/extension/gameMode/session.ts` 从 URL 解析 |
| CCW 用户身份 | 尚未使用 `getUserInfo()`，可用于优化游戏模式授权引导 |
| 作品数据（点赞/评论/投币） | 尚未使用，可作为游戏模式之外的积木扩展 |
| 编辑器内检测 | `src/extension/gandiToolbar.ts` 按 `/gandi/<id>` 路径判断 |
