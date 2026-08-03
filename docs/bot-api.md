# KukeChat Bot API

> 文档中的 `chat.example.com` / `files.example.com` 是占位域名。
> 请替换成你实际部署的后端地址；客户端内的「如何接入机器人」弹窗会直接显示
> 当前这份构建所连接的真实地址。

## 基础信息

API Base URL：

```txt
https://chat.example.com/api/v1
```

WebSocket：

```txt
wss://chat.example.com/bot/ws?key=<机器人Key>
```

机器人运行接口使用 Bot Key 鉴权：

```http
Authorization: Bot <机器人Key>
```

备用请求头：

```http
X-Kuke-Bot-Key: <机器人Key>
```

机器人 Key 只会在创建或重置时显示一次。不要把 Key 放进公开仓库、网页源码、客户端包或公开作品中；如果泄露，请立即重置密钥。

常用运行接口：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/bot-api/users/{user_id}` | 获取用户公开信息和在线状态 |
| `GET` | `/bot-api/conversations/{conversation_id}` | 获取群信息和机器人启用状态 |
| `GET` | `/bot-api/users/online` | 获取当前在线人数和在线用户公开列表 |
| `POST` | `/bot-api/conversations/{conversation_id}/messages` | 向群聊或已存在私聊发送消息 |
| `POST` | `/bot-api/users/{user_id}/messages` | 创建临时私聊并给用户发送私信 |

## 机器人管理 API

这些接口给已登录用户使用，鉴权方式是普通用户 `Bearer Token`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/bots` | 创建机器人，响应会返回一次性完整 Key |
| `GET` | `/bots/mine` | 获取我创建的机器人 |
| `GET` | `/bots/square?q=&limit=30&offset=0` | 获取公开机器人广场 |
| `GET` | `/bots/{bot_id}` | 获取机器人详情 |
| `PATCH` | `/bots/{bot_id}` | 修改机器人资料、公开状态或状态 |
| `POST` | `/bots/{bot_id}/rotate-key` | 重置机器人 Key |
| `POST` | `/bots/{bot_id}/install` | 添加机器人到群聊 |
| `GET` | `/bots/conversations/{conversation_id}/bots` | 获取群内机器人 |
| `PATCH` | `/bots/{bot_id}/installations/{conversation_id}` | 修改群内机器人配置 |
| `DELETE` | `/bots/{bot_id}/installations/{conversation_id}` | 从群移出机器人 |

创建机器人请求示例：

```json
{
  "name": "答疑机器人",
  "avatar_url": "https://files.example.com/avatars/bot.webp",
  "description": "自动回答群内常见问题",
  "functions": "FAQ、欢迎新人、关键词回复",
  "commands": "/help 查看帮助",
  "is_public": true
}
```

添加机器人到群请求示例：

```json
{
  "conversation_id": 1001,
  "receive_messages": true,
  "receive_member_events": true
}
```

## 机器人运行 API

以下接口使用 `Authorization: Bot <机器人Key>` 或 `X-Kuke-Bot-Key`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/bot-api/me` | 获取机器人自身信息 |
| `GET` | `/bot-api/conversations` | 获取机器人所在群聊和私聊 |
| `GET` | `/bot-api/users/online` | 获取当前在线人数和在线用户公开列表 |
| `GET` | `/bot-api/users/{user_id}` | 获取用户公开信息和在线状态 |
| `GET` | `/bot-api/conversations/{conversation_id}` | 获取群信息和机器人启用状态 |
| `GET` | `/bot-api/conversations/{conversation_id}/members` | 获取群成员公开信息 |
| `GET` | `/bot-api/conversations/{conversation_id}/messages?limit=50` | 获取最近消息 |
| `GET` | `/bot-api/conversations/{conversation_id}/messages?before_id=1000&limit=50` | 向前翻页 |
| `GET` | `/bot-api/conversations/{conversation_id}/messages?after_id=1000&limit=50` | 获取指定消息后的消息 |
| `POST` | `/bot-api/conversations/{conversation_id}/messages` | 向群聊或已存在私聊发送消息 |
| `POST` | `/bot-api/users/{user_id}/messages` | 创建临时私聊并给用户发送私信 |
| `POST` | `/bot-api/direct/messages` | 创建临时私聊并给 `user_id` 发送私信 |
| `POST` | `/bot-api/conversations/{conversation_id}/messages/{message_id}/recall` | 撤回消息 |
| `PATCH` | `/bot-api/conversations/{conversation_id}/messages/{message_id}/components/{component_id}` | 更新机器人消息按钮状态 |
| `POST` | `/bot-api/conversations/{conversation_id}/messages/{message_id}/reactions` | 添加或取消表情回应 |
| `DELETE` | `/bot-api/conversations/{conversation_id}/messages/{message_id}/reactions/{emoji}` | 删除指定表情回应 |
| `POST` | `/bot-api/uploads/image` | 上传消息图片 |
| `POST` | `/bot-api/uploads/voice` | 上传语音 |

`limit` 范围是 `1-100`。

## 发送消息

推荐使用 `message` 字符串。它同时支持普通文本、Markdown 和消息元素。

```http
POST /bot-api/conversations/{conversation_id}/messages
Content-Type: application/json
```

普通文本：

```json
{
  "message": "大家好，我是机器人"
}
```

给用户发送私信会自动创建机器人和该用户的临时会话，用户端可以像普通临时会话一样关闭、屏蔽、免打扰或继续回复：

```http
POST /bot-api/users/{user_id}/messages
Content-Type: application/json
```

```json
{
  "message": "你好，我是机器人助手。"
}
```

也可以把 `user_id` 放在请求体中：

```http
POST /bot-api/direct/messages
Content-Type: application/json
```

```json
{
  "user_id": 12,
  "message": "你好，我是机器人助手。"
}
```

Markdown：

```json
{
  "message": "<markdown># 今日公告\n**请注意：** 18:00 开始活动。\n- 奖励一\n- 奖励二</markdown>"
}
```

Markdown 混合按钮：

```json
{
  "message": "<markdown>## 菜单\n<button action=\"input\" value=\"/help \">帮助</button>\n<button action=\"callback\" action_id=\"checkin\">签到</button></markdown>"
}
```

@ 用户、引用、图片混合消息：

```json
{
  "message": "<quote id=\"1001\"/> 欢迎 <at id=\"12\"/> <img src=\"https://files.example.com/messages/82880700bae84154b28f7222374f5abe.jpg\"/>"
}
```

语音：

```json
{
  "message": "<audio src=\"https://files.example.com/messages/voice-example.webm\" duration_ms=\"3000\"/>"
}
```

表情包：

```json
{
  "message": "<sticker src=\"https://files.example.com/stickers/sticker-example.webp\"/>"
}
```

@ 全体：

```json
{
  "message": "<at_all/> 请注意活动时间"
}
```

机器人必须拥有群内 `@全体` 权限，否则返回 `403`。

图片、语音和表情包 URL 应使用上传接口返回的 `url`，例如 `https://files.example.com/messages/82880700bae84154b28f7222374f5abe.jpg`。

## 消息元素

支持的元素：

| 元素 | 说明 | 示例 |
| --- | --- | --- |
| `at` | @指定用户 | `<at id="12"/>` |
| `at_all` | @全体 | `<at_all/>` |
| `quote` | 引用消息 | `<quote id="1001" preview="原消息"/>` |
| `img` | 图片 | `<img src="https://files.example.com/messages/82880700bae84154b28f7222374f5abe.jpg"/>` |
| `audio` | 语音 | `<audio src="https://files.example.com/messages/voice-example.webm" duration_ms="3000"/>` |
| `sticker` | 表情包 | `<sticker src="https://files.example.com/stickers/sticker-example.webp"/>` |
| `br` | 换行 | `<br/>` |
| `markdown` | Markdown 内容 | `<markdown># 标题</markdown>` |
| `button` | 可点击按钮，`action="input"` 填入输入框，`action="callback"` 回调机器人；需要后续更新状态时设置 `id` | `<button id="checkin" action="callback" action_id="checkin">签到</button>` |
| `link` | 可点击链接，默认打开网页；也支持 `input` 和 `callback` | `<link href="https://example.com">官网</link>` |

`message` 是推荐格式；兼容接口也接受 `elements` 数组。图片、语音和表情包地址必须来自 KukeChat 上传接口。

按钮和交互链接字段：

| 字段 | 说明 |
| --- | --- |
| `action="input"` | 点击后把 `value` 插入用户输入框开头，例如 `/help ` |
| `action="callback"` | 点击后通过机器人 WebSocket 推送 `message.interaction` 事件 |
| `action="open"` | 仅 `link` 使用，打开 `href` 指向的 HTTP/HTTPS 页面 |
| `action_id` | 回调按钮或链接的业务 ID |
| `id` | 按钮组件 ID，用于后续更新这个按钮的文案、样式或禁用状态。允许字母、数字、`_`、`-`，最长 64 字符 |
| `value` | 输入框预设文本，或回调附加值 |
| `href` | 普通链接地址 |

## 更新按钮状态

机器人可以更新自己发送消息里的按钮状态。默认 `scope` 是 `global`，会写入消息 metadata 并实时刷新会话内所有客户端；`scope="user"` 只实时推送给指定用户，不落库，适合“只有点击者看到成功/失败”的反馈。

```http
PATCH /bot-api/conversations/{conversation_id}/messages/{message_id}/components/{component_id}
Content-Type: application/json
```

全局更新：

```json
{
  "label": "已签到",
  "variant": "success",
  "disabled": true
}
```

仅点击者更新：

```json
{
  "label": "签到失败",
  "variant": "danger",
  "scope": "user",
  "user_id": 88
}
```

支持字段：

| 字段 | 说明 |
| --- | --- |
| `label` | 新文案，最长 32 字符 |
| `variant` | `default`、`success`、`danger`、`warning`、`primary` |
| `disabled` | 是否禁用按钮 |
| `border_color` | 自定义边框色，格式 `#RRGGBB` |
| `text_color` | 自定义文字色，格式 `#RRGGBB` |
| `background_color` | 自定义背景色，格式 `#RRGGBB` |
| `scope` | `global` 或 `user`，默认 `global` |
| `user_id` | `scope="user"` 时必填，通常使用 `message.interaction` 里的 `user_id` |

限制：只能更新当前机器人自己发送的消息；只能更新该消息里真实存在的 `<button id="...">`；不能更新普通用户消息或不存在的按钮。

## Markdown 支持范围

机器人 Markdown 是安全子集，不支持原始 HTML。

支持：

- `#`、`##`、`###` 标题
- `**加粗**`
- 行内代码和代码块
- 引用 `>`
- 无序列表、有序列表、任务列表
- 分割线 `---`
- 表格
- 链接 `[文字](https://example.com)`
- 交互按钮 `<button action="callback" action_id="checkin">签到</button>`
- 输入框预设 `<button action="input" value="/help ">帮助</button>`
- @用户 `<at id="88"/>`，会按群成员昵称解析显示
- @全体 `<at_all/>`
- 图片标签 `<img src="https://files.example.com/messages/82880700bae84154b28f7222374f5abe.jpg"/>`
- 图片 `![描述](https://files.example.com/messages/82880700bae84154b28f7222374f5abe.jpg)`

限制：

- Markdown 最长 `8000` 字符。
- 链接只允许 `http://` 和 `https://`。
- Markdown 中只允许 `<button>`、`<btn>`、`<link>`、`<at>`、`<mention>`、`<at_all>`、`<mention_all>`、`<img>`、`<image>` 这些安全标签；其它原始 HTML 不会渲染。
- Markdown 图片地址必须来自 KukeChat 上传接口，扩展名必须是 `.png`、`.jpg`、`.jpeg`、`.webp`、`.gif`。

## 上传

上传图片：

```http
POST /bot-api/uploads/image
Content-Type: multipart/form-data

file=<图片文件>
```

响应：

```json
{
  "url": "https://files.example.com/messages/xxx.webp",
  "filename": "xxx.webp",
  "content_type": "image/webp"
}
```

上传语音：

```http
POST /bot-api/uploads/voice
Content-Type: multipart/form-data

file=<音频文件>
```

## 表情回应

添加或取消表情回应：

```http
POST /bot-api/conversations/{conversation_id}/messages/{message_id}/reactions
Content-Type: application/json
```

```json
{
  "emoji": "👍"
}
```

该接口是 toggle 行为：已有则取消，没有则添加。

`emoji` 必须是真正的 emoji 符号，不能是普通文本、HTML、脚本或长字符串。无效内容返回 `422`。

## WebSocket 事件

连接成功：

```json
{
  "type": "bot.connection.ready",
  "data": {
    "bot_id": 1,
    "user_id": 203
  }
}
```

收到消息。群聊消息和私聊消息都使用 `message.created`，私聊消息的 `conversation_id` 是机器人与用户的 direct 会话 ID：

```json
{
  "type": "message.created",
  "data": {
    "id": 1001,
    "conversation_id": 123,
    "sender_id": 88,
    "sender_display_name": "Alice",
    "type": "text",
    "content": "你好",
    "metadata": {},
    "created_at": "2026-05-26T00:00:00Z"
  }
}
```

其他事件：

| 事件 | 说明 |
| --- | --- |
| `message.recalled` | 消息被撤回 |
| `message.reaction.updated` | 消息表情回应变化 |
| `message.interaction` | 用户点击机器人按钮或交互链接 |
| `bot.installed` | 机器人被添加到群 |
| `bot.removed` | 机器人被移出群 |
| `group.member.joined` | 群成员加入 |
| `group.member.left` | 群成员主动退出 |
| `group.member.removed` | 群成员被移出 |
| `group.member.role_updated` | 群成员角色变化 |
| `group.member.mute_updated` | 群成员禁言状态变化 |

客户端可以定期发送文本 `ping`，服务端会返回 `pong`。

`message.interaction` 示例：

```json
{
  "type": "message.interaction",
  "data": {
    "conversation_id": 123,
    "message_id": 1001,
    "user_id": 88,
    "user_name": "Alice",
    "kind": "button",
    "action": "callback",
    "component_id": "checkin",
    "action_id": "checkin",
    "value": null,
    "label": "签到"
  }
}
```

## 错误码

| 状态码 | 说明 |
| --- | --- |
| `401` | 缺少 Bot Key、Key 无效或鉴权格式错误 |
| `403` | 机器人被停用、未启用、权限不足、被禁言或没有 `@全体` 权限 |
| `404` | 群聊、私聊、用户、消息或安装记录不存在 |
| `422` | 请求参数不合法，例如消息为空、Markdown 超长、URL 不合法、emoji 非法 |

## Python 示例

安装依赖：

```bash
pip install requests websocket-client
```

基础配置：

```python
import json

import requests

BASE_URL = "https://chat.example.com/api/v1"
BOT_KEY = "替换为你的机器人Key"
GROUP_ID = 123456
IMAGE_URL = "https://files.example.com/messages/82880700bae84154b28f7222374f5abe.jpg"

HEADERS = {
    "Authorization": f"Bot {BOT_KEY}",
    "X-Kuke-Client": "kukechat-bot/python-example",
}


def request_json(method, path, **kwargs):
    headers = dict(HEADERS)
    if "json" in kwargs:
        headers["Content-Type"] = "application/json"
    response = requests.request(method, f"{BASE_URL}{path}", headers=headers, timeout=20, **kwargs)
    if response.status_code >= 400:
        raise RuntimeError(f"{response.status_code} {response.text}")
    return response.json() if response.text else None
```

发送消息：

```python
def send_message(group_id, message):
    return request_json("POST", f"/bot-api/conversations/{group_id}/messages", json={"message": message})

def send_direct_message(user_id, message):
    return request_json("POST", f"/bot-api/users/{user_id}/messages", json={"message": message})

send_message(GROUP_ID, "大家好，我是机器人")
send_message(GROUP_ID, "<markdown># 公告\n**欢迎使用 KukeChat Bot API**</markdown>")
send_message(GROUP_ID, f'<img src="{IMAGE_URL}"/>')
send_message(GROUP_ID, '<at id="12"/> 你好')
send_message(GROUP_ID, '<quote id="1001"/> 我同意')
send_message(GROUP_ID, '<markdown>请选择：<button action="input" value="/help ">帮助</button> <button action="callback" action_id="checkin">签到</button></markdown>')
send_direct_message(12, "你好，我是机器人助手。")
```

获取在线用户列表：

```python
online = request_json("GET", "/bot-api/users/online")
print("在线人数：", online["online_count"])
for user in online["users"]:
    print(user["id"], user["nickname"] or user["username"])
```

获取用户和群信息：

```python
user_info = request_json("GET", "/bot-api/users/12")
print(user_info["user"]["nickname"] or user_info["user"]["username"], user_info["online"])

group_info = request_json("GET", f"/bot-api/conversations/{GROUP_ID}")
print(group_info["title"], group_info["member_count"], group_info["bot_enabled"])
```

上传图片后发送：

```python
def upload_image(path):
    with open(path, "rb") as file:
        return request_json("POST", "/bot-api/uploads/image", files={"file": file})

uploaded = upload_image("example.jpg")
send_message(GROUP_ID, f'<img src="{uploaded["url"]}"/>')
```

表情回应：

```python
def toggle_reaction(group_id, message_id, emoji="👍"):
    return request_json(
        "POST",
        f"/bot-api/conversations/{group_id}/messages/{message_id}/reactions",
        json={"emoji": emoji},
    )
```

实时接收消息：

```python
import websocket

WS_URL = "wss://chat.example.com/bot/ws"

def reply(group_id, message_id, content):
    return send_message(group_id, f'<quote id="{message_id}"/> {content}')

def is_mentioned(message, bot_user_id):
    metadata = message.get("metadata") or {}
    if metadata.get("mention_all"):
        return True
    return any(item.get("user_id") == bot_user_id for item in metadata.get("mentions") or [] if isinstance(item, dict))


def on_message(ws, raw):
    payload = json.loads(raw)
    event_type = payload.get("type")
    data = payload.get("data") or {}

    if event_type == "bot.connection.ready":
        ws.bot_user_id = data.get("user_id")
        print("机器人已连接")
        return

    if event_type == "message.interaction":
        if data.get("action_id") == "checkin":
            send_message(data.get("conversation_id"), f"用户 {data.get('user_name')} 已签到")
        return

    if event_type != "message.created":
        return

    if data.get("sender", {}).get("is_bot"):
        return

    group_id = data.get("conversation_id")
    message_id = data.get("id")
    content = data.get("content", "")

    if is_mentioned(data, getattr(ws, "bot_user_id", None)):
        reply(group_id, message_id, f"收到：{content}")
    if content.strip() == "/help":
        send_message(group_id, "<markdown># 帮助\n- @我 自动回复\n- `/help` 查看帮助</markdown>")


if __name__ == "__main__":
    print("机器人信息：", request_json("GET", "/bot-api/me"))
    ws = websocket.WebSocketApp(
        f"{WS_URL}?key={BOT_KEY}",
        on_message=on_message,
        on_error=lambda _ws, err: print("WebSocket 错误：", err),
        on_close=lambda *_args: print("WebSocket 已断开"),
    )
    ws.run_forever()
```
