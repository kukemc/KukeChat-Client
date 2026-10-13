# 风纪（桌面端）

导航栏的一级页面，只有桌面布局。契约：`KukeChat-Server/docs/moderation-v2.md` 第 3 节、`docs/jury-v2.md`。
预览页：`dev/jury-harness.html`（假数据在 `dev/jury-mock.ts`，地址参数见文件头）。

## 目录

```
JuryPage.tsx     外框：板块导航 + 当前板块。SECTION_VIEWS 登记已经做出来的板块
sections.ts      板块登记表：名称、图标、分组、依赖的后端能力、谁看得到
identity.ts      「我是谁」：在任 / 当过委员 / 层级 / 能否申请。所有身份判断都从这里出
route.ts         当前板块 + 板块内打开的案件 / 页签；记住上次的板块；接住从别处来的直达
context.ts       useJury()：nav、status、identity、config、openPenalties
labels.ts        枚举值的文字、数字和时间的写法
ComingSoon.tsx   「即将开放」占位页和它们的文案
data/            queries.ts（缓存 key + useXxx）、opinions.ts（观点区的写操作）、defaults.ts（旧后端的兜底配置）
widgets/         Frame（SectionFrame / Card / StateBlock …）、Charts、Tags、Evidence（匿名证据）、Pager
overview/ desk/ detail/ mine/ bulletin/ handbook/    各板块；detail 是「我投过的案件」，评审台的投后视图和我的评审共用
```

接口函数在 `src/api/jury.ts`，类型在 `src/types/jury.ts`，样式在 `src/styles/desktop-jury.css`（前缀 `kjr-`）。

### 二期（docs/jury-v2.md 第 2 节）

```
exam/            入门考试：ExamSection（规则手册的页签；说明页 / 进行中 / 刚交卷三种画面）、ExamRunner（答题 + 倒计时 + 到点自动交卷）、
                 ExamResultView、ExamStep（申请流程里的那一步）、clock（考试时钟：服务端时间校正，预览页可以拨）、draft（本机的作答草稿）
practice/        练习场：PracticeSection、PracticeIdle（没题可做的各种状态）、Ballots（四个判断选项 + 标准结论 + 讲解，考试也用）
growth/          「我的评审 · 成长」：GrowthView、TierCard（层级与晋升进度）、PointsCards（风纪值与明细）、Achievements、Insignia（层级徽记和
                 成就徽章的 SVG）、BadgeSetting（公开身份）、JuryBadge（聊天 / 资料卡里的委员徽章）、RewardNote（投票后的加分）、
                 GrowthToasts（实时事件的轻提示）、guide（委员须知里二期的条目）
leaderboard/     排行榜
overview/DailyTrend.tsx    总览里每天的趋势图
data/growth.ts   这几块的查询、实时事件的处理（handleJuryGrowthEvent）、maxBanText
```

接口函数在 `src/api/juryGrowth.ts`，类型在 `src/types/juryGrowth.ts`（一期类型上新增的可选字段仍在 `types/jury.ts`），
样式在 `src/styles/desktop-jury-growth.css`。各块各看各的能力（`exam` / `practice` / `votes_v2` / `points` / `tiers` / `achievements` /
`leaderboard` / `badge`），没有的不显示、不发请求。评审台的二期内容（上下文不足、主动回避、违规类别、加分、暂停发案）在 `desk/` 里。
预览页的二期场景见 `dev/jury-harness-growth.tsx` 的文件头。

### 三期（docs/jury-v2.md 第 3 节）

```
senior/          资深工作台：PanelDesk（合议，表决面板复用 desk/VotePanel）、AppealDesk + AppealVotePanel（申诉复审 / 举报复议）、
                 AppealHistory、OriginReview（原审的分布和观点，只读）、caseOrigin（机器来源的标记和说明，评审台也用）
precedents/      判例：PrecedentsTab（规则手册的页签）、PrecedentDetail、PrecedentEditor、PrecedentLinks（案件详情 / 公示栏里的入口）
hall/            议事厅（实名的公开讨论区，可以用 Avatar —— 和案件里的匿名正相反）
data/senior.ts、data/precedents.ts、data/hall.ts    这三块的查询和写操作
```

接口函数在 `src/api/jurySenior.ts`、`src/api/juryHall.ts`，类型在 `src/types/jurySenior.ts`、`src/types/juryHall.ts`，
样式在 `src/styles/desktop-jury-senior.css`（它再引入 `desktop-jury-hall.css`）。板块内除案件以外的条目（帖子、判例）用路由里的 `itemId`。
散在风纪页之外的三期界面：申诉进度 `components/moderation/AppealProgress.tsx`、举报复议 `components/settings/desktop/ReportReconsider.tsx`、
重复举报的提示在 `components/chat/reportForm.ts` + `desktop/dialogs/ReportDialog.tsx`。预览页的三期场景见 `dev/jury-harness-senior.tsx` 的文件头。

## 约定

- **加一个板块**：`store/kukeStore.ts` 的 `JurySection` 加 id → `sections.ts` 加一行 → `JuryPage.tsx` 的 `SECTION_VIEWS` 登记组件。
  组件不收 props，用 `useJury()` 取上下文，最外层用 `SectionFrame`。
- **把「即将开放」的板块做出来**：写好组件后在 `SECTION_VIEWS` 登记，删掉 `ComingSoon.tsx` 里对应的文案。
  板块在后端下发了 `sections.ts` 里写的 `capability` 时才显示成可用，否则仍是「即将开放」。
- **后端能力**：`useJury().config.has('…')`（来自 `GET /jury/config` 的 `capabilities`）。旧后端没有这个接口，
  能力列表为空，新接口一个都不会去调；页面按「只有旧能力」降级，不报错。规则数字一律读 `config.config.rules`，不要写死。
- **身份 / 层级**：只用 `useJury().identity`，不要在组件里直接比 `status.status`、`status.tier`。
- **加接口**：`api/jury.ts` 加函数 → `types/jury.ts` 加类型 → `data/queries.ts` 的 `juryKeys` 加 key、加 `useXxx`。
  key 都挂在 `['jury']` 下；实时事件的失效写在 `src/realtime/client.ts`。
- **匿名边界**：案件内容和观点区只展示服务端给的代称 / 代号，不显示、不推断、不补全任何身份信息，不用 `Avatar`。
- **从别处直达**：`useKukeStore.getState().openJury({ section, caseId?, tab? })`。移动布局下它什么都不做。
- **浮层**：页面最外层是容器查询的基准，`position: fixed` 的后代会被圈在里面，对话框要用 portal 挂到
  `getDesktopPortalRoot()`（见 `detail/ReportOpinionModal.tsx`）。
- **评审台的快捷键**只在焦点位于评审台内部时生效（扩展嵌在别人的页面里）。数字键按配置里的顺序对应每个选项，
  `C` / `Shift+C` 换违规类别。`desk/VotePanel.tsx` 的 `KNOWN_KINDS` 决定显示哪些种类；「上下文不足」的 kind 也是 abstain，靠取值区分。
- **申请流程**是一串步骤（`overview/ApplyFlow.tsx`）：满足条件 → 入门考试（`exam_required` 为 false 时只是建议，不挡提交）→ 提交。
- **受限**：在任委员受处罚时 `identity.restricted` 为真（原因和到期时间在 `identity.restriction`）。评审、发观点、点赞之类会被服务端拒绝的操作，
  界面一律先看它，直接显示受限状态，不等提交后报错。暂停发案看 `identity.cooldownUntil`。
- **正在做的题不能被换掉**：实时事件会让 `['jury']` 整棵失效。练习题、进行中的考试由页面自己攥着（见 `PracticeSection` / `ExamSection`），不直接渲染查询结果。
