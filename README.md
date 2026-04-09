# pure-qqbot

纯净水 QQ Bot SDK — 从 `openclaw-qqbot` 提取核心功能，完全独立运行，不绑定 OpenClaw 框架。

## 安装

```bash
npm install pure-qqbot
```

## 快速开始

```typescript
import { QQBotClient } from "pure-qqbot";

const client = new QQBotClient({
  appId: process.env.QQBOT_APP_ID!,
  clientSecret: process.env.QQBOT_APP_SECRET!,
});

client.onMessage(async (event) => {
  await client.reply(event, `你说: ${event.content}`);
});

await client.start();
```

```bash
QQBOT_APP_ID=xxx QQBOT_APP_SECRET=yyy node bot.js
```

## 功能

- 文本消息（被动回复 / 主动消息）
- Markdown 消息
- Inline Keyboard 按钮 + 交互回调
- 消息引用回复
- 流式消息（打字机效果）
- 输入状态（"正在输入"）
- 频道消息 / 频道私信
- 媒体消息（图片、语音、视频、文件）
- 分块上传（大文件）
- Token 自动管理（缓存、后台刷新、动态过期策略）
- 会话持久化（跨重启恢复连接）
- Typing keep-alive
- QQ 表情解析
- SSRF 防护
- 上传缓存（避免重复上传相同文件）

## 完整示例

参见 [src/example.ts](src/example.ts)，启动后发任意消息自动跑完全部功能测试。

## API

### QQBotClient

| 方法 | 说明 |
|------|------|
| `start()` / `stop()` | 启动 / 停止 |
| `isConnected()` | 连接状态 |
| `onMessage(handler)` / `offMessage(handler)` | 消息处理器 |
| `onInteraction(handler)` / `offInteraction(handler)` | 交互处理器 |
| `reply(event, content, options?)` | 智能回复 |
| `sendPrivateMessage(openid, content, msgId?, options?)` | 私聊消息 |
| `sendPrivateMessageProactive(openid, content)` | 主动私聊 |
| `sendGroupMessage(groupOpenid, content, msgId?, options?)` | 群聊消息 |
| `sendGroupMessageProactive(groupOpenid, content)` | 主动群聊 |
| `sendPrivateInlineKeyboard(openid, content, keyboard, msgId?)` | Inline Keyboard |
| `sendGroupInlineKeyboard(groupOpenid, content, keyboard, msgId?)` | 群聊 Keyboard |
| `sendPrivateMarkdown(openid, content, msgId?)` | Markdown 消息 |
| `sendStreamMessage(openid, request)` | 流式消息 |
| `acknowledgeInteraction(interactionId)` | 确认交互 |
| `sendTypingIndicator(openid)` | "正在输入" |
| `sendChannelMessage(channelId, content, msgId?)` | 频道消息 |
| `sendDmMessage(guildId, content, msgId?)` | 频道私信 |
| `sendPrivateImage/Voice/Video/File(...)` | 媒体消息 |
| `sendGroupImage/Voice/Video/File(...)` | 群聊媒体 |
| `getTokenStatus()` | Token 状态 |
| `startBackgroundRefresh()` / `stopBackgroundRefresh()` | 后台刷新 |
| `refreshToken()` | 强制刷新 |

### 配置选项

```typescript
new QQBotClient({
  appId: string,              // 必填
  clientSecret: string,       // 必填
  logger?: Logger,            // 自定义日志器
  sessionDir?: string,        // 会话持久化目录
  typingKeepAlive?: boolean,  // 处理消息时发送"正在输入"
  parseFaceEmoji?: boolean,   // 解析 QQ 表情标签
  reconnectDelays?: number[], // 重连延迟配置
  maxReconnectAttempts?: number, // 最大重连次数
});
```

<details>
<summary>Changelog v2.0.0</summary>

### 破坏性变更

- `reply()` 第 3 个参数从 `useProactive: boolean` 改为 `options?: SendMessageOptions`
- `InlineKeyboard` 结构从 `{ rows: [...] }` 改为 `{ content?: { rows: [...] } }`
- `Logger.debug` 改为必填
- API 错误抛出 `ApiError`（含 `status`, `bizCode`, `bizMessage`）
- Token 刷新策略改为动态计算

### 新增

Markdown、Inline Keyboard、消息引用、流式消息、输入状态、频道消息、交互确认、分块上传、会话持久化、SSRF 防护、后台 Token 刷新等全部功能。

</details>

## License

MIT
