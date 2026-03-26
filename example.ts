/**
 * QQ Bot SDK 完整功能测试示例 - 回声机器人
 *
 * 支持消息类型:
 * - 文字: 原样回复
 * - 图片: 下载并重新发送
 * - 语音: 下载并重新发送
 * - 视频: 下载并重新发送
 * - 文件: 下载并重新发送
 *
 * 环境变量:
 *   QQBOT_APP_ID      - 机器人 AppID
 *   QQBOT_APP_SECRET  - 机器人 AppSecret
 *
 * 运行方式:
 *   QQBOT_APP_ID=xxx QQBOT_APP_SECRET=yyy node dist/example.js
 */

import { QQBotClient, MessageEvent } from "./index.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// 从环境变量读取凭证
const appId = process.env.QQBOT_APP_ID;
const clientSecret = process.env.QQBOT_APP_SECRET;

// 检查环境变量
if (!appId || !clientSecret) {
  console.error("错误: 缺少环境变量");
  console.error("");
  console.error("请设置以下环境变量:");
  console.error("  export QQBOT_APP_ID=your_app_id");
  console.error("  export QQBOT_APP_SECRET=your_app_secret");
  console.error("");
  console.error("或者运行时指定:");
  console.error("  QQBOT_APP_ID=xxx QQBOT_APP_SECRET=yyy node dist/example.js");
  process.exit(1);
}

// 临时目录用于下载媒体文件
const TEMP_DIR = path.join(os.tmpdir(), "qqbot-sdk-example");
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// 下载文件并返回 Base64
async function downloadFileAsBase64(
  url: string,
  knownFilename?: string
): Promise<{ data: string; filename: string; contentType: string } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[下载失败] HTTP ${response.status}`);
      return null;
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";

    // 优先使用已知的文件名（从 event.attachments 传入）
    let filename = knownFilename;

    // 如果没有已知文件名，尝试从 Content-Disposition 解析
    if (!filename) {
      const contentDisposition = response.headers.get("content-disposition");
      if (contentDisposition) {
        const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (match) filename = match[1].replace(/['"]/g, "");
      }
    }

    // 最后尝试从 URL 解析
    if (!filename) {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split("/");
      const lastPart = pathParts[pathParts.length - 1];
      if (lastPart && lastPart.includes(".")) {
        filename = decodeURIComponent(lastPart);
      }
    }

    // 兜底
    if (!filename) {
      filename = "unknown";
    }

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    return { data: base64, filename, contentType };
  } catch (err) {
    console.error(`[下载失败] ${err}`);
    return null;
  }
}

// 判断附件类型
function getMediaType(attachment: { content_type: string; filename?: string }): "image" | "voice" | "video" | "file" {
  const ct = attachment.content_type.toLowerCase();
  const fn = (attachment.filename || "").toLowerCase();

  if (ct.startsWith("image/") || fn.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/)) return "image";
  if (ct.startsWith("audio/") || fn.match(/\.(mp3|wav|ogg|silk|amr)$/)) return "voice";
  if (ct.startsWith("video/") || fn.match(/\.(mp4|avi|mov|mkv)$/)) return "video";
  return "file";
}

// 创建客户端
const client = new QQBotClient({
  appId,
  clientSecret,
  logger: {
    info: (msg) => console.log(`[INFO] ${msg}`),
    error: (msg) => console.error(`[ERROR] ${msg}`),
    debug: (msg) => console.debug(`[DEBUG] ${msg}`),
  },
});

// 注册消息处理器
client.onMessage(async (event: MessageEvent) => {
  console.log("\n" + "=".repeat(50));
  console.log("收到消息:");
  console.log(`  类型: ${event.type}`);
  console.log(`  发送者: ${event.senderId}`);
  console.log(`  内容: ${event.content || "(空)"}`);
  console.log(`  消息ID: ${event.messageId}`);

  if (event.attachments && event.attachments.length > 0) {
    console.log(`  附件数量: ${event.attachments.length}`);
    event.attachments.forEach((att, i) => {
      console.log(`    [${i}] ${att.filename || "unnamed"} (${att.content_type}) - ${att.url.slice(0, 80)}...`);
    });
  }

  // 处理命令
  if (event.content === "/ping") {
    await client.reply(event, "pong!");
    return;
  }

  if (event.content === "/help") {
    const helpText = [
      "🤖 回声机器人功能说明:",
      "",
      "/ping - 测试连接",
      "/help - 显示帮助",
      "",
      "发送任何文字、图片、语音、视频或文件，",
      "我都会原样返还给你！",
    ].join("\n");
    await client.reply(event, helpText);
    return;
  }

  // 处理媒体消息（有附件）
  if (event.attachments && event.attachments.length > 0) {
    console.log("[处理] 检测到媒体消息，准备下载并返还...");

    for (const attachment of event.attachments) {
      const mediaType = getMediaType(attachment);
      console.log(`[处理] 媒体类型: ${mediaType}, 文件名: ${attachment.filename || "unnamed"}`);

      // 下载文件
      const downloaded = await downloadFileAsBase64(attachment.url, attachment.filename);
      if (!downloaded) {
        await client.reply(event, `❌ 下载文件失败: ${attachment.filename || "unnamed"}`);
        continue;
      }

      console.log(`[处理] 下载完成: ${downloaded.filename}, 大小: ${Math.round(downloaded.data.length / 1024)}KB`);

      // 根据消息类型和附件类型发送回去
      const isGroup = event.type === "group";
      const targetId = isGroup ? event.groupOpenid! : event.senderId;
      const msgId = event.messageId;

      try {
        let result;

        switch (mediaType) {
          case "image":
            console.log(`[发送] 返还图片...`);
            if (isGroup) {
              result = await client.sendGroupImage(targetId, attachment.url, msgId, "返还你的图片");
            } else {
              result = await client.sendPrivateImage(targetId, attachment.url, msgId, "返还你的图片");
            }
            break;

          case "voice":
            console.log(`[发送] 返还语音...`);
            if (isGroup) {
              result = await client.sendGroupVoice(targetId, downloaded.data, undefined, msgId);
            } else {
              result = await client.sendPrivateVoice(targetId, downloaded.data, undefined, msgId);
            }
            break;

          case "video":
            console.log(`[发送] 返还视频...`);
            if (isGroup) {
              result = await client.sendGroupVideo(targetId, attachment.url, undefined, msgId, "返还你的视频");
            } else {
              result = await client.sendPrivateVideo(targetId, attachment.url, undefined, msgId, "返还你的视频");
            }
            break;

          case "file":
          default:
            console.log(`[发送] 返还文件: ${downloaded.filename}`);
            if (isGroup) {
              result = await client.sendGroupFile(targetId, downloaded.data, undefined, downloaded.filename, msgId);
            } else {
              result = await client.sendPrivateFile(targetId, downloaded.data, undefined, downloaded.filename, msgId);
            }
            break;
        }

        if (result.success) {
          console.log(`[成功] 消息已返还: ${result.messageId}`);
        } else {
          console.error(`[失败] ${result.error}`);
          await client.reply(event, `❌ 发送失败: ${result.error}`);
        }
      } catch (err) {
        console.error(`[错误] ${err}`);
        await client.reply(event, `❌ 处理异常: ${err}`);
      }
    }

    // 如果同时有文字内容，也回复文字
    if (event.content && event.content.trim()) {
      await client.reply(event, `📎 收到附件，已返还。附带文字: ${event.content}`);
    }

    return;
  }

  // 纯文字消息 - 原样回复
  if (event.content && event.content.trim()) {
    console.log("[处理] 纯文字消息，直接回复...");
    await client.reply(event, `📨 你说: ${event.content}`);
    return;
  }

  // 空消息
  console.log("[处理] 收到空消息");
  await client.reply(event, "收到一条空消息");
});

// 启动客户端
async function main() {
  try {
    await client.start();
    console.log("\n" + "=".repeat(50));
    console.log("🤖 回声机器人已启动!");
    console.log("");
    console.log("功能:");
    console.log("  - 文字: 原样回复");
    console.log("  - 图片: 下载并重新发送");
    console.log("  - 语音: 下载并重新发送");
    console.log("  - 视频: 下载并重新发送");
    console.log("  - 文件: 下载并重新发送");
    console.log("");
    console.log("命令:");
    console.log("  /ping - 测试连接");
    console.log("  /help - 显示帮助");
    console.log("");
    console.log("按 Ctrl+C 停止");
    console.log("=".repeat(50) + "\n");

    // 优雅关闭
    process.on("SIGINT", () => {
      console.log("\n正在停止...");
      client.stop();
      process.exit(0);
    });
  } catch (err) {
    console.error("启动失败:", err);
    process.exit(1);
  }
}

main();
