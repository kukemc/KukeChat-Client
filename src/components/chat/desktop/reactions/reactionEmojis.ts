/**
 * 表情回应面板的表情数据（精选常用，按分类排）。
 *
 * 安卓端有一份一模一样的列表：KukeChat-Android/app/src/main/java/ink/kuke/chat/feature/chat/ReactionEmojis.kt
 * 两边必须同步改 —— 增删、调顺序、改分类名都一起改，保证两端看到的面板一致。
 *
 * 只收 Emoji 12 及更早的字符（Unicode 13 起的 🥲 🤌 🧋 之类在 Windows 10 和老安卓上是方框）。
 * 后端 validate_reaction_emoji 接受任意单个 emoji（含肤色、ZWJ、国旗、keycap），这里不用迁就后端。
 * 每个分类一行行写，空格分开，读的时候拆开。
 */

export interface ReactionCategory {
  id: string;
  title: string;
  /** 页签上的代表表情 */
  icon: string;
  emojis: string[];
}

/** 没有最近使用记录时「常用」页显示的默认表情（两端原来的快捷回应合在一起）。 */
export const DEFAULT_FREQUENT_REACTIONS: string[] = '👍 ❤️ 😂 🎉 🤔 😭 😘 🙏 🔥 😮 😢 👏 😍 🤣 👀 💯 😎 🥳 😅 🤝 💪 😡 ❔ ✨'.split(' ');

/** 最近使用最多记几个。 */
export const MAX_RECENT_REACTIONS = 16;

function split(source: string): string[] {
  return source.trim().split(/\s+/);
}

export const REACTION_CATEGORIES: ReactionCategory[] = [
  { id: 'smileys', title: '笑脸与情绪', icon: '😀', emojis: split(`
    😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😚 😋 😛 😜 🤪 😝 🤑
    🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧
    🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😨 😰 😥 😢 😭
    😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 💀 💩 🤡 👻 👽 🤖 😺 😹 😻 🙈 🙊
  `) },
  { id: 'people', title: '手势与人物', icon: '👋', emojis: split(`
    👋 🤚 🖐️ ✋ 👌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌
    👐 🤲 🤝 🙏 ✍️ 💅 🤳 💪 🧠 👀 👅 👄 💋 👶 👦 👧 🧑 👨 👩 👴 👵 🙋 🙅 🙆
    💁 🤷 🤦 🙇 💃 🕺 🏃 🧘 👫 👼 🎅 🦸 🧙 🧚
  `) },
  { id: 'symbols', title: '爱心与符号', icon: '❤️', emojis: split(`
    ❤️ 🧡 💛 💚 💙 💜 🤎 🖤 🤍 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 💌 💯 💢 💥 💫
    💦 💨 💬 💭 💤 ✨ ⭐ 🌟 ⚡ 🔥 ✅ ✔️ ❌ ⭕ 🚫 ⛔ ❓ ❔ ❗ ‼️ ⁉️ ⚠️ ♻️ 🆗
    🆒 🆕 🆘 🔝 🔴 🟡 🟢 🔵 ➕ ➖ 🎵 🎶 🔔 1️⃣ 2️⃣ 3️⃣ 6️⃣ 🔟 ㊗️ 🉐
  `) },
  { id: 'nature', title: '动物与自然', icon: '🐱', emojis: split(`
    🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐤 🦆 🦉 🐺 🦄 🐝 🦋
    🐌 🐞 🐢 🐍 🐙 🦀 🐠 🐬 🐳 🦈 🐘 🦒 🐑 🦌 🐾 🌵 🎄 🌳 🌱 🍀 🍁 🍂 🍄 🌷
    🌹 🥀 🌸 🌻 🌞 🌝 🌚 🌙 🌎 🪐 ☀️ ⛅ ☁️ 🌧️ ⛈️ ❄️ ☃️ 🌈 🌊 💧 ☔ 🌪️
  `) },
  { id: 'food', title: '食物', icon: '🍉', emojis: split(`
    🍎 🍊 🍋 🍌 🍉 🍇 🍓 🍒 🍑 🥭 🍍 🥝 🍅 🥑 🍆 🌽 🌶️ 🥦 🍞 🥐 🧀 🍳 🍗 🍖
    🌭 🍔 🍟 🍕 🌮 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🍤 🍙 🍚 🍢 🍡 🍧 🍦 🧁 🍰 🎂 🍮 🍭
    🍬 🍫 🍿 🍩 🍪 🥛 ☕ 🍵 🧃 🥤 🍺 🍻 🥂 🍷 🍸 🍹 🍾 🥢
  `) },
  { id: 'activity', title: '活动与庆祝', icon: '🎉', emojis: split(`
    🎉 🎊 🎈 🎁 🎀 🎆 🎇 🧨 🎃 🏮 🧧 🏆 🥇 🥈 🥉 🏅 ⚽ 🏀 🏈 ⚾ 🎾 🏐 🏓 🏸
    🥊 🎳 🎯 🎱 🎮 🕹️ 🎲 🧩 🀄 🃏 🎨 🎭 🎤 🎧 🎹 🥁 🎷 🎸 🎻 🎬 🏊 🚴 🏂 🏋️
  `) },
  { id: 'objects', title: '物品', icon: '💡', emojis: split(`
    📱 💻 ⌨️ 🖥️ 📷 📹 📺 ⏰ ⌛ 🔋 💡 🕯️ 💰 💵 💎 🔧 🔨 ⚙️ 💣 🔮 💊 💉 🧸 🛒
    🎒 👓 🕶️ 👑 🎩 👗 👟 💍 💄 ☂️ 📦 ✉️ 📝 📖 📚 📌 📎 ✂️ 🔒 🔑 🚪 🛁 🚗 🚲
    ✈️ 🚀 🛸 🚢 🏠 🏫 🏰 🗼 ⛺ 🌃 🎪 🧭
  `) },
  { id: 'flags', title: '国旗', icon: '🚩', emojis: split(`
    🇨🇳 🇭🇰 🇲🇴 🇯🇵 🇰🇷 🇸🇬 🇺🇸 🇬🇧 🇫🇷 🇩🇪 🇮🇹 🇷🇺 🏁 🚩 🏳️ 🏴
  `) },
];
