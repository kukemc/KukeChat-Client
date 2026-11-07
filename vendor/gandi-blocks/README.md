# gandi-blocks（积木渲染库，Apache-2.0）

scratch-blocks 的 Gandi 分支，编译好的成品，聊天里画积木用。**不要手改**。

- 来源：`E:\scratch\gandi3\gandi-blocks\`（gandi3 仓库，同步时提交 `049fd8f`）
- 许可：Apache-2.0，见同目录 `LICENSE`
- 文件：`blockly_compressed_vertical.js`、`blocks_compressed.js`、`blocks_compressed_vertical.js`、
  `msg/messages.js`、`msg/scratch_msgs.js`、`media/` 下的 svg / gif

桌面端、网页、安卓渲染页的构建会原样拷进产物的 `gandi-blocks/`；社区扩展不带它，部署方式见 `docs/gandi-dsl-blocks.md`。

重新同步：

```bash
G=/e/scratch/gandi3/gandi-blocks; D=vendor/gandi-blocks
cp $G/{blockly_compressed_vertical.js,blocks_compressed.js,blocks_compressed_vertical.js,LICENSE} $D/
cp $G/msg/{messages.js,scratch_msgs.js} $D/msg/
cp $G/media/*.svg $G/media/1x1.gif $D/media/; cp $G/media/extensions/*.svg $D/media/extensions/; cp $G/media/icons/*.svg $D/media/icons/
```
