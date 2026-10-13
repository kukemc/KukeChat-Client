import { EMOJIS } from '../../message/constants';

/**
 * 系统 Emoji 的分类和中文关键词。
 * 每行一个：字符在前，后面是空格分开的关键词，第一个关键词同时当名称用。
 * 只收 Emoji 12 及更早的字符，再新的在 Windows 10 上是方框。
 */
const SOURCE: Array<[id: string, title: string, lines: string]> = [
  ['smileys', '表情', `
😀 笑 开心 嘿嘿
😃 大笑 开心 哈哈
😄 开心 笑 高兴
😁 呲牙 笑 嘻嘻
😆 哈哈 笑 眯眼
😅 苦笑 汗 尴尬
😂 笑哭 哭笑 笑死
🤣 笑翻 打滚 笑死
🙂 微笑 呵呵
🙃 倒脸 无语 呵呵
😉 眨眼 调皮
😊 害羞 微笑 开心
😇 天使 乖 光环
🥰 喜欢 爱 爱心
😍 花痴 喜欢 爱 色
🤩 星星眼 崇拜 哇
😘 飞吻 亲亲 么么哒
😗 亲亲 吹口哨
😚 亲亲 害羞
😋 好吃 馋 吐舌
😛 吐舌 调皮
😜 鬼脸 调皮 眨眼
🤪 搞怪 疯 鬼脸
😝 吐舌 鬼脸
🤑 发财 钱
🤗 抱抱 拥抱
🤭 偷笑 捂嘴
🤫 嘘 安静
🤔 思考 想想 疑问
🤐 闭嘴 拉链
🤨 怀疑 挑眉
😐 无语 面无表情
😑 无语 呆
😶 沉默 无言
😏 坏笑 得意 斜眼
😒 嫌弃 不屑 无语
🙄 白眼 无语
😬 尴尬 龇牙
😌 欣慰 松口气 满足
😔 失落 沮丧 难过
😪 困 瞌睡
🤤 流口水 馋
😴 睡觉 晚安 困
😷 口罩 生病
🤒 发烧 生病
🤕 受伤 头疼
🤢 恶心 想吐
🤮 吐 呕
🤧 喷嚏 感冒
🥵 热 脸红
🥶 冷 冻
🥴 晕 醉
😵 晕 懵
🤯 裂开 爆炸 震惊
🤠 牛仔
🥳 庆祝 派对 生日
😎 酷 墨镜 帅
🤓 学霸 书呆子 眼镜
🧐 审视 观察
😕 困惑 疑惑
😟 担心 忧虑
🙁 不开心 难过
😮 惊讶 哇 啊
😯 吃惊 惊讶
😲 震惊 惊呆
😳 脸红 害羞 尴尬
🥺 可怜 求求 委屈
😨 害怕 恐惧
😰 冷汗 紧张 焦虑
😥 失望 难过 汗
😢 流泪 哭 难过
😭 大哭 哭 呜呜
😱 尖叫 吓 惊恐
😖 纠结 难受
😣 忍 痛苦
😞 失望 难过
😓 汗 无奈
😩 崩溃 累
😫 抓狂 累
🥱 哈欠 困 无聊
😤 哼 生气 傲娇
😡 生气 愤怒 怒
😠 生气 怒
🤬 骂 爆粗 愤怒
😈 恶魔 坏笑
💀 骷髅 死 笑死
💩 便便 屎
🤡 小丑
👻 鬼 幽灵
👽 外星人
🤖 机器人
😺 笑脸猫 猫 笑
😹 笑哭猫 猫 笑哭
😻 花痴猫 猫 喜欢
🙈 不看 捂眼 猴子
🙉 不听 猴子
🙊 不说 捂嘴 猴子
`],
  ['gestures', '手势', `
👍 赞 点赞 好 棒 强
👎 踩 差 不行 弱
👌 好的 OK 可以 收到
✌️ 耶 胜利 剪刀手
🤞 好运 祈祷
🤟 爱你 手势
🤘 摇滚
🤙 打电话 六
👈 左 指
👉 右 指
👆 上 指
👇 下 指
☝️ 注意 一 指
✋ 停 手掌 举手
🖐️ 手掌 五
👋 挥手 你好 再见 拜拜
🤝 握手 合作 成交
👏 鼓掌 拍手 棒
🙌 欢呼 举手 万岁
🤲 捧 祈求
🙏 拜托 谢谢 祈祷 求
✍️ 写 记笔记
💪 加油 肌肉 强壮 努力
👊 拳头 碰拳
✊ 举拳 拳头 加油
🙇 鞠躬 抱歉 跪
🤦 捂脸 无语
🤷 摊手 不知道
🙋 举手 我 提问
🙅 不行 拒绝 禁止
🙆 可以 好的 OK
👀 围观 看 眼睛 吃瓜
👂 耳朵 听
👄 嘴唇 嘴
🧠 脑子 大脑
🤳 自拍
`],
  ['symbols', '爱心与符号', `
❤️ 爱心 红心 爱 喜欢
🧡 橙心 爱心
💛 黄心 爱心
💚 绿心 爱心
💙 蓝心 爱心
💜 紫心 爱心
🖤 黑心 爱心
🤍 白心 爱心
💔 心碎 伤心 分手
💕 两颗心 爱心 喜欢
💞 爱心环绕 爱心
💓 心跳 爱心
💗 心动 爱心
💖 闪亮的心 爱心
💘 丘比特 爱心 箭
💝 爱心礼物 爱心
💯 满分 一百 完美
💢 怒 生气
💥 爆炸 碰撞
💫 晕 星星 转
💦 汗 水
💨 溜了 跑 风
💤 睡觉 困 zzz
💬 聊天 气泡 消息 说话
💭 想 思考 气泡
🔥 火 热 厉害
✨ 闪亮 星星 闪 好看
⭐ 星星 收藏
🌟 闪耀 星星
⚡ 闪电 快 电
🎵 音符 音乐
🎶 音乐 音符 唱歌
✅ 对 完成 勾 好
❌ 错 叉 不行 取消
❓ 问号 疑问 什么
❔ 问号 疑问
❗ 感叹号 注意 重要
‼️ 双感叹号 重要
⭕ 圈 对
🚫 禁止 不行
⚠️ 警告 注意
🔔 铃铛 提醒 通知
🔕 静音 免打扰
♻️ 循环 回收
🆗 OK 好的
🆕 新
🔝 置顶 顶
`],
  ['nature', '动物与自然', `
🐶 狗 狗狗 汪 狗头
🐱 猫 猫咪 喵
🐭 老鼠 鼠
🐹 仓鼠
🐰 兔子 兔
🦊 狐狸
🐻 熊
🐼 熊猫
🐨 考拉
🐯 老虎 虎
🦁 狮子
🐮 牛
🐷 猪
🐸 青蛙 蛙
🐵 猴子 猴
🐔 鸡
🐧 企鹅
🐦 鸟
🐤 小鸡
🦆 鸭子 鸭
🦉 猫头鹰
🦄 独角兽
🐴 马
🐝 蜜蜂
🦋 蝴蝶
🐛 虫 bug
🐌 蜗牛 慢
🐢 乌龟 龟 慢
🐍 蛇
🐙 章鱼
🦀 螃蟹
🐟 鱼
🐬 海豚
🐳 鲸鱼
🦈 鲨鱼
🐘 大象
🐑 羊
🐉 龙
🦖 恐龙
🌸 樱花 花
🌹 玫瑰 花
🌻 向日葵 花
🌷 郁金香 花
💐 花束 花
🌱 发芽 小苗 种草
🌲 松树 树
🌳 树
🌵 仙人掌
🍀 四叶草 幸运 好运
🍁 枫叶 秋天
🍂 落叶 秋天
🌈 彩虹
☀️ 太阳 晴天 早安
☁️ 云 阴天
🌧️ 下雨 雨
⛈️ 雷雨 打雷
❄️ 雪花 冷 下雪
⛄ 雪人 冬天
🌙 月亮 晚安 夜
🌊 海浪 浪
🌍 地球 世界
`],
  ['food', '食物', `
🍎 苹果
🍊 橘子 橙子
🍋 柠檬 酸
🍌 香蕉
🍉 西瓜 吃瓜
🍇 葡萄
🍓 草莓
🍑 桃子
🍒 樱桃
🍍 菠萝
🥝 猕猴桃
🍅 番茄 西红柿
🥑 牛油果
🌽 玉米
🥕 胡萝卜
🌶️ 辣椒 辣
🍞 面包
🥐 牛角包
🧀 奶酪 芝士
🍳 煎蛋 鸡蛋 早餐
🍔 汉堡
🍟 薯条
🍕 披萨
🌭 热狗
🍜 面条 拉面 吃饭
🍝 意面
🍚 米饭 吃饭 干饭
🍛 咖喱
🍣 寿司
🍱 便当 盒饭
🥟 饺子
🍤 炸虾
🍙 饭团
🍢 关东煮 串
🍡 团子
🍦 冰淇淋
🍩 甜甜圈
🍪 饼干
🎂 生日蛋糕 蛋糕 生日
🍰 蛋糕 甜点
🍫 巧克力
🍬 糖果 糖
🍭 棒棒糖
🍮 布丁
🥛 牛奶
☕ 咖啡 热饮
🍵 茶 喝茶
🥤 饮料 可乐 奶茶
🍺 啤酒 干杯
🍻 干杯 啤酒
🥂 碰杯 干杯 香槟
🍷 红酒 酒
🍿 爆米花 吃瓜 看戏
`],
  ['objects', '活动与物品', `
🎉 庆祝 撒花 恭喜 礼花
🎊 彩球 庆祝 恭喜
🎈 气球 生日
🎁 礼物
🎀 蝴蝶结
🏆 奖杯 冠军 第一
🥇 金牌 第一
🥈 银牌 第二
🥉 铜牌 第三
⚽ 足球
🏀 篮球
🏐 排球
🎾 网球
🏓 乒乓球
🏸 羽毛球
🎯 靶子 目标 命中
🎮 游戏 手柄 打游戏
🕹️ 摇杆 游戏
🎲 骰子 随机
🧩 拼图 积木
🎨 调色盘 画画 美术
🎬 电影 开拍
🎤 麦克风 唱歌
🎧 耳机 听歌
🎸 吉他
🎹 钢琴
🥁 鼓
📷 相机 拍照 照片
📸 拍照 相机 闪光
🎥 摄像机 视频
📱 手机
💻 电脑 笔记本 写代码
⌨️ 键盘 打字
🖱️ 鼠标
🖥️ 显示器 电脑
💡 灯泡 想法 点子
📚 书 学习 读书
📖 看书 书
📝 笔记 写 作业
✏️ 铅笔 写
📌 图钉 置顶 标记
📎 回形针 附件
🔗 链接
🔒 锁 上锁
🔑 钥匙
🔨 锤子 修
🔧 扳手 修理 修复
⚙️ 齿轮 设置
💣 炸弹
🛒 购物车 买
💰 钱袋 钱 发财
💎 钻石 宝石
⏰ 闹钟 时间 起床
⏳ 沙漏 等待
📅 日历 日期
📢 喇叭 公告 通知
✉️ 信 邮件
📦 包裹 快递 箱子
🚀 火箭 起飞 冲
✈️ 飞机 出发
🚗 汽车 车
🚲 自行车 骑车
🏠 家 房子 回家
🏫 学校 上学
🎓 毕业 学士帽
👑 皇冠 王
🎃 南瓜 万圣节
🎄 圣诞树 圣诞
🧧 红包 新年
🏮 灯笼 新年
🎆 烟花 新年
🧨 鞭炮 新年
`]
];

const VARIATION_SELECTOR = '️';

export interface EmojiEntry {
  glyph: string;
  name: string;
  /** 小写、空格分隔，搜索时整串匹配 */
  keywords: string;
}

export interface EmojiSection {
  id: string;
  title: string;
  emojis: EmojiEntry[];
}

function entryKey(glyph: string): string {
  return glyph.split(VARIATION_SELECTOR).join('');
}

function parseLine(line: string): EmojiEntry {
  const [raw, ...words] = line.split(/\s+/);
  // 基本平面里的单个字符（❤ ☀ ✌ 这些）不带变体选择符时会被画成黑白的文字符号
  const glyph = raw.length === 1 ? raw + VARIATION_SELECTOR : raw;
  return { glyph, name: words[0] ?? '', keywords: words.join(' ').toLowerCase() };
}

const CATEGORY_SECTIONS: EmojiSection[] = SOURCE.map(([id, title, lines]) => ({
  id,
  title,
  emojis: lines.split('\n').map((line) => line.trim()).filter(Boolean).map(parseLine)
}));

const ENTRY_BY_GLYPH = new Map<string, EmojiEntry>();
for (const section of CATEGORY_SECTIONS) {
  for (const entry of section.emojis) {
    if (!ENTRY_BY_GLYPH.has(entryKey(entry.glyph))) {
      ENTRY_BY_GLYPH.set(entryKey(entry.glyph), entry);
    }
  }
}

/** 按字符查条目；表里没有的（比如别的版本存下来的最近使用）给一个没有名称的。 */
export function emojiEntry(glyph: string): EmojiEntry {
  return ENTRY_BY_GLYPH.get(entryKey(glyph)) ?? { glyph, name: '', keywords: '' };
}

/** 第一组「常用」就是重做之前面板里的那 32 个，顺序不变。 */
export const EMOJI_SECTIONS: EmojiSection[] = [
  { id: 'common', title: '常用', emojis: EMOJIS.map(emojiEntry) },
  ...CATEGORY_SECTIONS
];

/** 搜索框是空的时候给的几个常用词。 */
export const SEARCH_SUGGESTIONS = ['笑', '哭', '爱心', '赞', '庆祝', '无语', '猫', '吃瓜', '晚安', '加油'];

/** 按名称 / 关键词找 Emoji：空格分开的每个词都要命中。直接粘一个 Emoji 进来也能找到它。 */
export function searchEmojis(query: string): EmojiEntry[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return [];
  }
  const pasted = entryKey(query.trim());
  const matches = Array.from(ENTRY_BY_GLYPH.entries())
    .filter(([key, entry]) => key === pasted || terms.every((term) => entry.keywords.includes(term)))
    .map(([, entry]) => entry);
  // 名称正好是搜的词的排最前（搜「猫」先出 🐱，再是带猫的那几个笑脸），其余保持表里的顺序
  const rank = (entry: EmojiEntry): number => (entry.name === terms[0] ? 0 : entry.keywords.split(' ').includes(terms[0]) ? 1 : 2);
  return matches.sort((left, right) => rank(left) - rank(right));
}
