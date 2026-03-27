# pure-qqbot

Pure QQ Bot SDK - 纯净的 QQ Bot 开发包，从 `openclaw-qqbot` 提取核心功能，完全独立运行。

## 前置要求

1. 在 [QQ 开放平台](https://q.qq.com/qqbot/openclaw/login.html) 注册机器人应用
2. 获取 `AppID` 和 `ClientSecret`

## 安装

```bash
npm install pure-qqbot
```

## 快速开始

```bash
# 1. 创建项目
mkdir my-qqbot && cd my-qqbot
npm init -y
npm install pure-qqbot

# 2. 创建 bot.js
cat > bot.js << 'EOF'
import { QQBotClient } from "pure-qqbot";

const client = new QQBotClient({
  appId: process.env.QQBOT_APP_ID,
  clientSecret: process.env.QQBOT_APP_SECRET,
});

client.onMessage(async (event) => {
  console.log(`收到: ${event.content}`);
  await client.reply(event, `你说: ${event.content}`);
});

await client.start();
console.log("机器人已启动!");
EOF

# 3. 运行
QQBOT_APP_ID=xxx QQBOT_APP_SECRET=yyy node bot.js
```

## 使用

### 基础用法

```typescript
import { QQBotClient } from "pure-qqbot";

const client = new QQBotClient({
  appId: "YOUR_APP_ID",
  clientSecret: "YOUR_CLIENT_SECRET",
});

// 接收消息
client.onMessage(async (event) => {
  console.log(`收到: ${event.content}`);

  // 回复消息
  await client.reply(event, `收到: ${event.content}`);
});

// 启动
await client.start();
```

### 发送消息

```typescript
// 回复私聊消息（被动回复，必须在 1 小时内）
await client.sendPrivateMessage(openid, "内容", msgId);

// 发送主动私聊消息（无需 msgId，但有限制）
await client.sendPrivateMessageProactive(openid, "内容");

// 回复群聊消息
await client.sendGroupMessage(groupOpenid, "内容", msgId);

// 发送主动群聊消息
await client.sendGroupMessageProactive(groupOpenid, "内容");

// 智能回复（根据消息类型自动选择）
await client.reply(event, "内容");
```

### 发送图片

```typescript
// 发送图片（通过 URL）
await client.sendPrivateImage(openid, "https://example.com/image.png");

// 发送图片（通过 Base64 Data URL）
const base64Image = "data:image/png;base64,iVBORw0KGgo...";
await client.sendPrivateImage(openid, base64Image, msgId, "图片说明文字");

// 群聊图片
await client.sendGroupImage(groupOpenid, "https://example.com/image.png", msgId);
```

### 发送语音

```typescript
// 发送语音（通过 Base64）
await client.sendPrivateVoice(openid, voiceBase64Data, undefined, msgId);

// 发送语音（通过 URL）
await client.sendPrivateVoice(openid, undefined, "https://example.com/voice.mp3", msgId);

// 群聊语音
await client.sendGroupVoice(groupOpenid, voiceBase64Data, undefined, msgId);
```

### 发送视频

```typescript
// 私聊视频
await client.sendPrivateVideo(openid, "https://example.com/video.mp4", undefined, msgId, "视频描述");

// 群聊视频（通过 Base64）
await client.sendGroupVideo(groupOpenid, undefined, videoBase64Data, msgId);
```

### 发送文件

```typescript
// 私聊文件
await client.sendPrivateFile(openid, fileBase64Data, undefined, "document.pdf", msgId);

// 群聊文件（通过 URL）
await client.sendGroupFile(groupOpenid, undefined, "https://example.com/file.zip", "archive.zip", msgId);
```

### 底层媒体 API

如需更灵活的控制，可直接使用底层 API：

```typescript
import {
  uploadC2CMedia,
  uploadGroupMedia,
  sendC2CMediaMessage,
  sendGroupMediaMessage,
  MediaFileType,
} from "pure-qqbot";

// 上传媒体文件
const uploadResult = await uploadC2CMedia(
  accessToken,
  openid,
  MediaFileType.IMAGE,  // 1=图片, 2=视频, 3=语音, 4=文件
  "https://example.com/image.png"  // 或传入 base64 数据
);

// 使用返回的 file_info 发送消息
await sendC2CMediaMessage(accessToken, openid, uploadResult.file_info, msgId, "文字描述");
```

## 事件类型

| 事件类型 | 说明 |
|---------|------|
| `c2c` | 私聊消息 |
| `group` | 群聊消息 |
| `dm` | 频道私信 |
| `guild` | 频道消息 |

## 完整示例：回声机器人

```javascript
import { QQBotClient } from "pure-qqbot";

const client = new QQBotClient({
  appId: process.env.QQBOT_APP_ID,
  clientSecret: process.env.QQBOT_APP_SECRET,
});

// 处理所有消息
client.onMessage(async (event) => {
  console.log(`[${event.type}] ${event.senderId}: ${event.content || "(媒体)"}`);

  // 文字消息 - 原样回复
  if (event.content) {
    await client.reply(event, `你说: ${event.content}`);
  }

  // 图片消息
  if (event.attachments?.some(a => a.content_type.startsWith("image/"))) {
    const image = event.attachments.find(a => a.content_type.startsWith("image/"));
    await client.sendPrivateImage(event.senderId, image.url, event.messageId, "返还图片");
  }
});

// 启动
await client.start();
console.log("🤖 机器人已启动!");
```

运行：
```bash
QQBOT_APP_ID=xxx QQBOT_APP_SECRET=yyy node bot.js
```

## API 说明

### QQBotClient

| 方法 | 说明 |
|------|------|
| `start()` | 启动客户端，开始接收消息 |
| `stop()` | 停止客户端 |
| `isConnected()` | 检查是否已连接 |
| `onMessage(handler)` | 注册消息处理器 |
| `offMessage(handler)` | 移除消息处理器 |
| `sendPrivateMessage(openid, content, msgId)` | 发送私聊消息（被动） |
| `sendPrivateMessageProactive(openid, content)` | 发送私聊消息（主动） |
| `sendGroupMessage(groupOpenid, content, msgId)` | 发送群聊消息（被动） |
| `sendGroupMessageProactive(groupOpenid, content)` | 发送群聊消息（主动） |
| `reply(event, content, useProactive?)` | 智能回复 |
| `sendPrivateImage(openid, imageUrl, msgId?, content?)` | 发送私聊图片 |
| `sendGroupImage(groupOpenid, imageUrl, msgId?, content?)` | 发送群聊图片 |
| `sendPrivateVoice(openid, voiceBase64?, voiceUrl?, msgId?)` | 发送私聊语音 |
| `sendGroupVoice(groupOpenid, voiceBase64?, voiceUrl?, msgId?)` | 发送群聊语音 |
| `sendPrivateVideo(openid, videoUrl?, videoBase64?, msgId?, content?)` | 发送私聊视频 |
| `sendGroupVideo(groupOpenid, videoUrl?, videoBase64?, msgId?, content?)` | 发送群聊视频 |
| `sendPrivateFile(openid, fileBase64?, fileUrl?, fileName?, msgId?)` | 发送私聊文件 |
| `sendGroupFile(groupOpenid, fileBase64?, fileUrl?, fileName?, msgId?)` | 发送群聊文件 |
| `refreshToken()` | 强制刷新 Token |
