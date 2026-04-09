/**
 * QQ Bot SDK 全功能自动化测试
 *
 * 启动后给机器人发任意消息，自动跑完全部测试。
 *
 * 环境变量:
 *   QQBOT_APP_ID       - 机器人 AppID
 *   QQBOT_APP_SECRET   - 机器人 AppSecret
 *
 * 运行:
 *   npm run build
 *   QQBOT_APP_ID=xxx QQBOT_APP_SECRET=yyy node dist/example.js
 *
 * 使用:
 *   1. 启动后给机器人发任意消息
 *   2. 机器人自动发送所有测试消息给你
 *   3. 点击 Inline Keyboard 按钮验证交互
 */

import {
  QQBotClient,
  MessageEvent,
  InteractionEvent,
  KeyboardActionType,
  SendMessageResult,
  InlineKeyboard,
} from "./index.js";

// ============ 配置 ============

const appId = process.env.QQBOT_APP_ID ?? "";
const clientSecret = process.env.QQBOT_APP_SECRET ?? "";

if (!appId || !clientSecret) {
  console.error("请设置 QQBOT_APP_ID 和 QQBOT_APP_SECRET");
  process.exit(1);
}

// ============ 测试框架 ============

let passed = 0;
let failed = 0;
let testsRunning = false;

function check(name: string, result: SendMessageResult): void {
  if (result.success) {
    passed++;
    console.log(`  [PASS] ${name} — messageId: ${result.messageId}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${name} — ${result.error}`);
  }
}

async function checkVoid(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failed++;
    console.error(`  [FAIL] ${name} — ${err instanceof Error ? err.message : String(err)}`);
  }
}

function section(title: string): void {
  console.log(`\n${"=".repeat(50)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(50)}`);
}

// ============ 自动化测试 ============

async function runTests(openid: string): Promise<void> {
  if (testsRunning) return;
  testsRunning = true;
  passed = 0;
  failed = 0;

  console.log(`\n测试目标: ${openid}\n`);

  // 1. Token
  section("1. Token 管理");
  const status = client.getTokenStatus();
  passed++;
  console.log(`  [PASS] Token 状态: ${status}`);

  // 2. 文本消息
  section("2. 文本消息");
  check("主动文本消息", await client.sendPrivateMessageProactive(openid, "测试1: 主动文本消息"));

  // 3. Markdown
  section("3. Markdown 消息");
  check("Markdown 消息", await client.sendPrivateMarkdown(openid, "**加粗** *斜体* `代码`"));

  // 4. 消息引用
  section("4. 消息引用");
  const msgForQuote = await client.sendPrivateMessageProactive(openid, "测试4: ↑ 这条消息将被引用");
  if (msgForQuote.success && msgForQuote.messageId) {
    await new Promise(r => setTimeout(r, 1000));
    check("消息引用", await client.sendPrivateMessage(openid, "测试4: ↓ 引用了上面的消息", undefined, {
      message_reference: { message_id: msgForQuote.messageId },
    }));
  } else {
    failed++;
    console.error(`  [FAIL] 消息引用 — 前置消息发送失败: ${msgForQuote.error}`);
  }

  // 5. Inline Keyboard
  section("5. Inline Keyboard");
  const keyboard: InlineKeyboard = {
    content: {
      rows: [
        {
          buttons: [
            {
              render_data: { label: "按钮A", style: 1 },
              action: { type: KeyboardActionType.CALLBACK, data: "btn_a" },
            },
            {
              render_data: { label: "按钮B", style: 2 },
              action: { type: KeyboardActionType.CALLBACK, data: "btn_b" },
            },
          ],
        },
        {
          buttons: [
            {
              render_data: { label: "访问 GitHub", style: 0 },
              action: {
                type: KeyboardActionType.LINK,
                data: "https://github.com/yaotutu/pure-qqbot",
              },
            },
          ],
        },
      ],
    },
  };
  check("Inline Keyboard", await client.sendPrivateInlineKeyboard(openid, "测试5: 请点击按钮 →", keyboard));

  // 6. 输入状态
  section("6. 输入状态");
  await checkVoid("输入状态通知", async () => {
    await client.sendTypingIndicator(openid);
    await new Promise(r => setTimeout(r, 3000));
    await client.sendTypingIndicator(openid);
    await new Promise(r => setTimeout(r, 2000));
  });

  // 7. 流式消息（被动回复场景，由 /stream 命令触发）
  section("7. 流式消息");
  console.log("  [SKIP] 发送 /stream 命令触发流式消息测试");

  // 8. 图片消息
  section("8. 图片消息");
  check("图片消息", await client.sendPrivateImage(
    openid,
    "https://httpbin.org/image/png",
    undefined,
    "测试8: 示例图片",
  ));

  // 汇总
  section("测试结果");
  console.log(`  通过: ${passed}`);
  console.log(`  失败: ${failed}`);

  if (failed === 0) {
    await client.sendPrivateMessageProactive(openid, `全部测试通过 (${passed}/${passed})`);
  } else {
    await client.sendPrivateMessageProactive(openid, `测试完成: ${passed} 通过, ${failed} 失败`);
  }

  console.log(`\n  手动测试: 点击上面的 Inline Keyboard 按钮，验证交互回调`);
  testsRunning = false;
}

// ============ 创建客户端 ============

const client = new QQBotClient({
  appId,
  clientSecret,
  sessionDir: "./session",
  typingKeepAlive: true,
  parseFaceEmoji: true,
  logger: {
    info: () => {},
    error: (msg) => console.error(`  [SDK-ERR] ${msg}`),
    debug: () => {},
  },
});

client.onMessage(async (event: MessageEvent) => {
  console.log(`[消息] ${event.type} ${event.senderId}: ${event.content.slice(0, 50)}`);

  const cmd = event.content.trim();

  // /stream 命令：触发流式消息测试
  if (cmd === "/stream") {
    if (event.type === "group") {
      await client.reply(event, "流式消息仅支持私聊");
      return;
    }
    await demoStreamMessage(event);
    return;
  }

  if (event.type === "group" && event.groupOpenid) {
    await client.reply(event, "收到，正在私聊你发送测试消息...");
    await runTests(event.senderId);
  } else {
    await runTests(event.senderId);
  }
});

client.onInteraction(async (event: InteractionEvent) => {
  console.log(`[交互] data=${event.data} from=${event.user_openid}`);
  try {
    await client.acknowledgeInteraction(event.id);
    console.log("  [PASS] 交互确认 (acknowledgeInteraction)");
    // 给用户发一条回复，让点击效果可见
    await client.sendPrivateMessageProactive(event.user_openid, `你点击了按钮: ${event.data ?? "(空)"}`);
    console.log("  [PASS] 按钮点击回复");
  } catch (err) {
    console.error(`  [FAIL] 交互处理 — ${err}`);
  }
});

/**
 * 流式消息演示 — 必须作为被动回复触发
 * eventId 和 msg_id 都用用户发来的 messageId
 */
async function demoStreamMessage(event: MessageEvent): Promise<void> {
  const openid = event.senderId;
  const msgId = event.messageId;
  const text = "这是一条流式消息，文字会逐字显示出来。";
  let streamMsgId: string | undefined;
  let msgSeq = 1;
  const chunkSize = 3;

  console.log(`\n[流式消息] 开始 — eventId=${msgId}`);

  for (let i = 0; i < text.length; i += chunkSize) {
    const index = Math.floor(i / chunkSize);
    const isLast = i + chunkSize >= text.length;
    const fragment = text.slice(0, i + chunkSize);

    const result = await client.sendStreamMessage(openid, {
      event_id: msgId,
      input_mode: "replace",
      input_state: isLast ? 10 : 1,
      content_type: "markdown",
      content_raw: fragment,
      msg_id: msgId,
      stream_msg_id: streamMsgId,
      msg_seq: msgSeq++,
      index,
    });

    console.log(`  分片 ${index}: success=${result.success} streamMsgId=${result.streamMsgId} error=${result.error ?? "none"}`);

    if (!result.success) {
      console.error(`  [FAIL] 流式消息分片 ${index} — ${result.error}`);
      return;
    }
    if (result.streamMsgId) streamMsgId = result.streamMsgId;
    if (!isLast) await new Promise(r => setTimeout(r, 300));
  }

  console.log(`  [PASS] 流式消息完成 — streamMsgId: ${streamMsgId}`);
}

// ============ 启动 ============

async function main(): Promise<void> {
  await client.start();
  console.log("\n机器人已启动，给机器人发任意消息开始自动测试。Ctrl+C 退出。\n");

  process.on("SIGINT", () => {
    console.log("\n停止中...");
    client.stop();
    process.exit(0);
  });
}

main().catch(err => {
  console.error("启动失败:", err);
  process.exit(1);
});
