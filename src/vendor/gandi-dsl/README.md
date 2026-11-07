# gandi-dsl（拷来的 Gandi 3.0 积木文本编译器）

聊天里把积木文本（Gandi 3.0 DSL）画成积木用的编译器。**这里的文件不要手改**，要改就去上游改完再同步过来。

- 来源：`E:\scratch\gandi3\gandi-gui-3.0\src\dsl\`（gandi3 仓库）
- 同步时的提交：`049fd8f`（`git -C E:\scratch\gandi3 log -1 --format=%h`，2026-11-06）
- 依赖：`acorn`（package.json 里）
- 语法文档：上游 `gandi-gui-3.0/docs/features/dsl-syntax.md`

## 拷了哪些

`compileDsl` / `parseDsl` 用得到的那些，原样拷贝：

```
parser.ts compiler.ts blocks.ts dynamic.ts layout.ts menuRefs.ts safe.ts
extensionIds.ts comments.ts schema.ts core-schema.json
sugar/moreDataTypes.ts sugar/moreDataTypesParse.ts sugar/moreDataTypesSyntax.ts
```

`schema.ts`（`exportSchema`）用来把 CCW 宿主 VM 里装了的扩展换成 schema（`src/gandiDsl/hostExtensions.ts`）。

**不是拷来的、是生成的**：`extension-schemas.json`、`extension-blocks.json`（官方 + Gandi 内置扩展的快照），
由 `scripts/gandi-dsl/generate-extension-schemas.mjs` 从 gandi3 生成，见 `docs/gandi-dsl-blocks.md` 的「重新生成快照」。别手改。

**没拷**：printer / segments / selfcheck / help（聊天里不需要打印回文本）、
`runtimeSchema.ts` / `vmPage.ts` / `download.ts`（依赖编辑器的 VM 和积木库）、`sugar/moreDataTypesPrint.ts`、`__tests__`。

## 重新同步

```bash
S=/e/scratch/gandi3/gandi-gui-3.0/src/dsl
D=src/vendor/gandi-dsl
cp $S/{parser,compiler,blocks,dynamic,layout,menuRefs,safe,extensionIds,comments,schema}.ts $S/core-schema.json $D/
cp $S/sugar/{moreDataTypes,moreDataTypesParse,moreDataTypesSyntax}.ts $D/sugar/
npm run dsl:extensions && npm run typecheck && npm run test:gandi-dsl
```

同步后更新上面的提交号。如果上游新增了被这些文件 import 的模块，一并拷进来（`grep -h "from '\./" *.ts sugar/*.ts` 看一眼）；
如果新引入了 `@/` 开头的编辑器模块，说明那块逻辑依赖编辑器，需要先在上游拆开。

聊天这边的包装（自动补变量声明、识别规则、XML 转换）在 `src/gandiDsl/`，见 `docs/gandi-dsl-blocks.md`。
