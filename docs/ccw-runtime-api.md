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

以下 24 个成员是在 CCW 编辑器（`/gandi/project/...`）里实测 dump 出来的完整列表。
官方 Kontakt 扩展只用到其中一部分，剩下的没有公开文档，语义按名称与参数个数推断。

| 方法 | 参数 | 说明 | 需用户确认 |
| --- | :---: | --- | :---: |
| `getUserInfo()` | 0 | 当前访客的社区账号信息 | |
| `getProjectUUID()` | 0 | **当前作品 UUID** | |
| `getProjectSb3Id()` | 0 | **当前作品的 sb3 资源 ID** | |
| `getProjectStats()` | 0 | 评论 / 点赞 / 收藏 / 投币统计 | |
| `getProjectDonateRanking()` | 0 | 投币排行 | |
| `getCoinCount()` | 0 | 当前访客给本作品投了多少币 | |
| `isMyFans()` | 0 | 访客是否是作者粉丝 | |
| `isLiked()` | 0 | 访客是否已点赞本作品 | |
| `isFollowed(userId)` | 1 | 是否关注了某人 | |
| `isLikedProject(oid)` | 1 | 是否点赞了某作品 | |
| `isFavoriteProject(oid)` | 1 | 是否收藏了某作品 | |
| `getDeviceType()` | 0 | 设备类型 | |
| `getOnlineExtensionsConfig()` | 0 | 在线扩展配置 | |
| `getExtensionURLById(id)` | 1 | 按 ID 取扩展文件地址 | |
| `getOpenVM()` | 0 | 语义不明，谨慎调用 | |
| `preActionInterceptor()` | 0 | 语义不明，疑似操作前置拦截 | |
| `redirect(path)` | 1 | 站内跳转 | |
| `sendPlayEventCode(code)` | 1 | 上报游玩事件 | |
| `uploadAssetToCloud(a, b)` | 2 | 上传资源到云端 | |
| `setAvatar(...)` | 0* | 用舞台截图设为头像 | ✅ |
| `insertCoin(count)` | — | 投币（Kontakt 调用，本次 dump 未出现） | ✅ |
| `requestCoins(count)` | 0* | 请求投币 | ✅ |
| `requestFollow()` | 0 | 请求关注作者 | ✅ |
| `commentWithStageSnapshot(content, screenshot)` | 0* | 代发评论 | ✅ |
| `showShare(encodedData, desc)` | 2 | 弹出分享 UI | ✅ |

> `0*` 表示函数声明的形参个数为 0（用了 rest 参数或运行时取参），实际仍需传值。
> `insertCoin` 出现在 Kontakt 源码里但不在本次 dump 中，可能是版本差异。

## 用户信息

```ts
runtime.ccwAPI.getUserInfo(): Promise<CcwUser | null>

interface CcwUser {
  userId: string;            // 社区用户 ID，例如 '203910367'
  userName: string;          // 用户名，例如 '酷可mc'
  uuid: string;              // 24 位十六进制，与 oid 相同
  oid: string;               // 24 位十六进制 —— 即 KukeChat 的 ccw_student_oid
  avatar: string;            // 头像 URL
  constellation: string;     // 星座
  following: number;         // 关注数
  followers: number;         // 粉丝数
  liked: number;             // 获赞数
  gender: string;            // 性别
}
```

实测返回中 `uuid` 与 `oid` 取值相同，都是社区主页地址 `/student/<oid>` 里的那个
标识 —— 也就是 KukeChat `User.ccw_student_oid` 存的值。

未登录时返回 falsy 值。

> ### 🚨 返回值不可信，永远不能当身份凭据
>
> `getUserInfo()` 运行在作品所在的浏览器页面里。作品脚本、用户脚本、浏览器扩展
> 都可以覆写它：
>
> ```js
> runtime.ccwAPI.getUserInfo = () => Promise.resolve({ userId: '别人的ID' });
> ```
>
> 所以它**只能用于渲染界面文案**。禁止据此判断玩家是谁、跳过授权流程，或把
> `userId` / `uuid` 发给后端换取任何权限。
>
> KukeChat 里唯一有效的身份来源是安全登录换取的令牌 —— 由后端签发、后端校验，
> 页面无法伪造。
>
> 本项目的封装在 `src/extension/gameMode/ccwIdentity.ts`：返回类型叫
> `UntrustedCcwIdentity` 且只保留 `displayName` / `avatarUrl` 两个展示字段，
> **刻意不暴露 userId 与 uuid**，从结构上杜绝误用。

**当前用法**：游戏模式在玩家未授权时，把 CCW 昵称显示在授权按钮上
（「以 XXX 的身份授权发言」），让提示更亲切。拿不到就回落到默认文案，
授权流程本身完全不受影响。

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

### 当前作品标识

```ts
runtime.ccwAPI.getProjectUUID(): Promise<string>    // 24 位十六进制，作品标识
runtime.ccwAPI.getProjectSb3Id(): Promise<string>   // 32 位十六进制，sb3 资源哈希
```

编辑器 `/gandi/project/6a81252691223874330c5c7c` 下实测：

```
getProjectUUID()  → '6a81252691223874330c5c7c'   ← 与 URL 中的作品 ID 一致
getProjectSb3Id() → '40f8fdf9e84b6f723d8ee03b05d3882c'
```

**只能用 `getProjectUUID()` 做绑定标识。** `getProjectSb3Id()` 是 sb3 文件的内容
哈希，每次保存作品都会变，拿它绑定会在下一次保存后立刻失效。

> **这两个接口 Kontakt 扩展没有使用**，是 dump `ccwAPI` 才发现的，因此没有官方
> 文档，稳定性需自行验证。
>
> 它们的价值在于：URL 解析只在作品播放页（`/detail/<oid>`）有效，编辑器
> （`/gandi/project/<id>`）里拿不到；而这两个接口在编辑器里同样可用，
> 意味着游戏模式可以在编辑器内直接调试。
>
> ⚠️ **待验证**：编辑器地址里的作品 ID 与发布后播放页 `/detail/<oid>` 的 oid
> 是否为同一个值，尚未在同一个作品上比对过。若两者不同，开发者在播放页复制
> 的 oid 与编辑器里 `getProjectUUID()` 的返回就对不上，服务端绑定校验会失败。
> 验证方法见 [`ccw-api-probe.js`](ccw-api-probe.js) 顶部注释。
>
> **注意仍然不可信**：返回值来自页面，可被篡改。它只能作为「客户端声称自己是
> 哪个作品」的输入，服务端据此校验群的绑定关系 —— 与之前用 URL 解析时的信任
> 模型完全一致，没有变好也没有变坏。

### 其他实测返回

```
getDeviceType()             → 'PC'
getProjectStats()           → { commentCount: 0, favoriteCount: 0, likeCount: 0, totalBucks: 0 }
getProjectDonateRanking()   → { curUserDonatedRecord: {...}, rankingList: [] }
getOnlineExtensionsConfig() → { fileSrc: '', hosts: {...}, GandiMedia: {...}, ... }
getCoinCount()              → 0
isLiked() / isMyFans()      → false
```

`getOpenVM()` 与 `preActionInterceptor()` 语义不明，未试调 —— 名称看不出是否有
副作用，接入前建议先在测试作品里确认。

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

## 如何拿到 vm / runtime

扩展类的构造函数会收到 `runtime`，但要反查 VM（例如为了 patch `vm.toJSON`）时，
挂载位置在不同版本的编辑器 / 播放器里不一致。经过验证的解析顺序：

```js
const vm =
  runtime?.extensionManager?.vm ??   // 最可靠，本项目 extensionUrlUpdater.ts 也用这条
  runtime?.vm ??
  runtime?._vm ??
  window.Scratch?.vm ??
  window.vm ??
  null;
```

**关键在于按能力判断，而不是盲信引用** —— 不同挂载点可能给到半成品对象，
所以取到候选后要验证它确实有你需要的方法：

```js
const usable = candidates.find((c) =>
  c && typeof c === "object" && typeof c.toJSON === "function"
);
```

从控制台侧（没有 `this.runtime`）探测时，用
[`docs/ccw-api-probe.js`](ccw-api-probe.js)：它按上面的链路找 runtime，
列出 `ccwAPI` 全部成员，并在 runtime / vm / 已加载扩展实例上搜索疑似作品 ID
的字段，只试调不会弹窗的只读方法。

## 运行时事件

```ts
runtime.on('PROJECT_RUN_STOP', handler)
```

作品停止运行时触发，用于清理每轮运行的状态（官方扩展用它重置 redirect 计数）。

## 与 KukeChat 现有实现的关系

| 需求 | 现状 |
| --- | --- |
| 当前作品 oid | `ccwAPI` 不提供，`src/extension/gameMode/session.ts` 从 URL 解析 |
| CCW 用户身份 | `gameMode/ccwIdentity.ts` 封装，仅用于授权按钮的展示文案 |
| 作品数据（点赞/评论/投币） | 尚未使用，可作为游戏模式之外的积木扩展 |
| 编辑器内检测 | `src/extension/gandiToolbar.ts` 按 `/gandi/<id>` 路径判断 |
