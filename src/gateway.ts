/**
 * QQ Bot WebSocket Gateway
 * 连接管理、事件分发、会话持久化、Typing keep-alive
 */

import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";
import type {
  MessageEvent,
  InteractionEvent,
  WSPayload,
  Logger,
  MessageScene,
  MsgElement,
  Mention,
} from "./types.js";
import { getAccessToken, getGatewayUrl, clearTokenCache, sendC2CInputNotify } from "./api.js";
import { parseFaceEmojis } from "./utils/text-parsing.js";

// QQ Bot intents
const INTENTS = {
  PUBLIC_GUILD_MESSAGES: 1 << 30,
  DIRECT_MESSAGE: 1 << 12,
  GROUP_AND_C2C: 1 << 25,
  INTERACTION: 1 << 26,
};

const FULL_INTENTS = INTENTS.PUBLIC_GUILD_MESSAGES | INTENTS.DIRECT_MESSAGE | INTENTS.GROUP_AND_C2C | INTENTS.INTERACTION;

// 重连配置
const DEFAULT_RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000, 60000];
const MAX_RECONNECT_ATTEMPTS = 100;
const TYPING_INTERVAL = 8000;

export interface GatewayOptions {
  appId: string;
  clientSecret: string;
  onMessage: (event: MessageEvent) => void | Promise<void>;
  onInteraction?: (event: InteractionEvent) => void | Promise<void>;
  logger?: Logger;
  reconnectDelays?: number[];
  maxReconnectAttempts?: number;
  /** 会话持久化目录 */
  sessionDir?: string;
  /** 处理消息期间发送"正在输入"提示 */
  typingKeepAlive?: boolean;
  /** 解析 QQ 表情标签 */
  parseFaceEmoji?: boolean;
}

export interface Gateway {
  start: () => Promise<void>;
  stop: () => void;
  isConnected: () => boolean;
}

/**
 * 创建 WebSocket Gateway
 */
export function createGateway(options: GatewayOptions): Gateway {
  const {
    appId,
    clientSecret,
    onMessage,
    onInteraction,
    logger: log,
    reconnectDelays = DEFAULT_RECONNECT_DELAYS,
    maxReconnectAttempts = MAX_RECONNECT_ATTEMPTS,
    sessionDir,
    typingKeepAlive = false,
    parseFaceEmoji = false,
  } = options;

  let ws: WebSocket | null = null;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let typingInterval: ReturnType<typeof setInterval> | null = null;
  let sessionId: string | null = null;
  let lastSeq: number | null = null;
  let reconnectAttempts = 0;
  let isAborted = false;
  let isConnecting = false;
  let connected = false;
  let shouldRefreshToken = false;
  let currentAccessToken: string | null = null;

  // ============ 会话持久化 ============

  const sessionFilePath = sessionDir
    ? path.join(sessionDir, `session-${appId}.json`)
    : null;

  function loadPersistedSession(): void {
    if (!sessionFilePath) return;
    try {
      if (fs.existsSync(sessionFilePath)) {
        const data = JSON.parse(fs.readFileSync(sessionFilePath, "utf-8")) as {
          sessionId?: string;
          lastSeq?: number;
        };
        sessionId = data.sessionId ?? null;
        lastSeq = data.lastSeq ?? null;
        log?.debug?.(`[qqbot-gateway] Loaded persisted session: ${sessionId}`);
      }
    } catch {
      log?.debug?.(`[qqbot-gateway] Failed to load session, starting fresh`);
    }
  }

  function persistSession(): void {
    if (!sessionFilePath || !sessionId) return;
    try {
      fs.mkdirSync(path.dirname(sessionFilePath), { recursive: true });
      fs.writeFileSync(sessionFilePath, JSON.stringify({ sessionId, lastSeq, savedAt: Date.now() }));
    } catch (err) {
      log?.debug?.(`[qqbot-gateway] Failed to persist session: ${err}`);
    }
  }

  // ============ Typing keep-alive ============

  function startTyping(openid: string): void {
    stopTyping();
    if (!typingKeepAlive || !currentAccessToken) return;

    // 立即发送一次
    sendC2CInputNotify(currentAccessToken, openid, undefined, 60, log).catch(() => {});

    typingInterval = setInterval(() => {
      sendC2CInputNotify(currentAccessToken!, openid, undefined, 60, log).catch(() => {});
    }, TYPING_INTERVAL);
  }

  function stopTyping(): void {
    if (typingInterval) {
      clearInterval(typingInterval);
      typingInterval = null;
    }
  }

  // ============ 连接管理 ============

  const cleanup = () => {
    stopTyping();
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close();
    }
    ws = null;
    connected = false;
  };

  const getReconnectDelay = () => {
    const idx = Math.min(reconnectAttempts, reconnectDelays.length - 1);
    return reconnectDelays[idx];
  };

  const scheduleReconnect = (customDelay?: number) => {
    if (isAborted || reconnectAttempts >= maxReconnectAttempts) {
      log?.error(`[qqbot-gateway] Max reconnect attempts reached or aborted`);
      return;
    }

    if (reconnectTimer) clearTimeout(reconnectTimer);

    const delay = customDelay ?? getReconnectDelay();
    reconnectAttempts++;
    log?.info(`[qqbot-gateway] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (!isAborted) connect();
    }, delay);
  };

  const sendHeartbeat = () => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ op: 1, d: lastSeq }));
      log?.debug?.(`[qqbot-gateway] Heartbeat sent, seq: ${lastSeq}`);
    }
  };

  const startHeartbeat = (intervalMs: number) => {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(sendHeartbeat, intervalMs);
  };

  // ============ 事件分发 ============

  function processContent(text: string): string {
    return parseFaceEmoji ? parseFaceEmojis(text) : text;
  }

  const handleDispatch = (payload: WSPayload) => {
    const eventType = payload.t;
    const eventData = payload.d as Record<string, unknown>;
    if (!eventType || !eventData) return;

    log?.debug?.(`[qqbot-gateway] Event: ${eventType}`);

    switch (eventType) {
      case "C2C_MESSAGE_CREATE": {
        const data = eventData as {
          author: { id: string; user_openid: string };
          content: string;
          id: string;
          timestamp: string;
          attachments?: Array<{ content_type: string; url: string; filename?: string; voice_wav_url?: string; asr_refer_text?: string; height?: number; width?: number; size?: number }>;
          message_scene?: MessageScene;
          message_type?: number;
          msg_elements?: MsgElement[];
        };
        const event: MessageEvent = {
          type: "c2c",
          senderId: data.author.user_openid,
          content: processContent(data.content),
          messageId: data.id,
          timestamp: data.timestamp,
          attachments: data.attachments,
          message_scene: data.message_scene,
          message_type: data.message_type,
          msg_elements: data.msg_elements,
        };

        if (typingKeepAlive) startTyping(data.author.user_openid);
        onMessage(event);
        break;
      }

      case "GROUP_AT_MESSAGE_CREATE": {
        const data = eventData as {
          author: { id: string; member_openid: string };
          content: string;
          id: string;
          timestamp: string;
          group_openid: string;
          attachments?: Array<{ content_type: string; url: string; filename?: string; voice_wav_url?: string; asr_refer_text?: string; height?: number; width?: number; size?: number }>;
          message_scene?: MessageScene;
          message_type?: number;
          msg_elements?: MsgElement[];
          mentions?: Mention[];
        };
        onMessage({
          type: "group",
          senderId: data.author.member_openid,
          content: processContent(data.content),
          messageId: data.id,
          timestamp: data.timestamp,
          groupOpenid: data.group_openid,
          attachments: data.attachments,
          message_scene: data.message_scene,
          message_type: data.message_type,
          msg_elements: data.msg_elements,
          mentions: data.mentions,
        });
        break;
      }

      case "DIRECT_MESSAGE_CREATE": {
        const data = eventData as {
          author: { id: string; username?: string };
          content: string;
          id: string;
          timestamp: string;
          guild_id: string;
          attachments?: Array<{ content_type: string; url: string; filename?: string }>;
        };
        onMessage({
          type: "dm",
          senderId: data.author.id,
          senderName: data.author.username,
          content: processContent(data.content),
          messageId: data.id,
          timestamp: data.timestamp,
          guildId: data.guild_id,
          attachments: data.attachments,
        });
        break;
      }

      case "MESSAGE_CREATE": {
        const data = eventData as {
          author: { id: string; username?: string };
          content: string;
          id: string;
          timestamp: string;
          channel_id: string;
          guild_id: string;
          attachments?: Array<{ content_type: string; url: string; filename?: string }>;
        };
        onMessage({
          type: "guild",
          senderId: data.author.id,
          senderName: data.author.username,
          content: processContent(data.content),
          messageId: data.id,
          timestamp: data.timestamp,
          channelId: data.channel_id,
          guildId: data.guild_id,
          attachments: data.attachments,
        });
        break;
      }

      case "INTERACTION_CREATE": {
        if (!onInteraction) return;
        const data = eventData as {
          id: string;
          appid: string;
          user_openid?: string;
          group_openid?: string;
          related_message_id?: string;
          data?: string;
          [key: string]: unknown;
        };
        onInteraction({
          type: "interaction",
          id: data.id,
          appid: data.appid,
          user_openid: data.user_openid ?? "",
          group_openid: data.group_openid,
          related_message_id: data.related_message_id,
          data: data.data,
          raw: data as Record<string, unknown>,
        });
        break;
      }

      default:
        log?.debug?.(`[qqbot-gateway] Unhandled event: ${eventType}`);
    }
  };

  // ============ 连接流程 ============

  const connect = async () => {
    if (isConnecting) return;
    isConnecting = true;

    try {
      cleanup();
      loadPersistedSession();

      if (shouldRefreshToken) {
        clearTokenCache(appId);
        shouldRefreshToken = false;
      }

      log?.info(`[qqbot-gateway] Getting access token...`);
      const accessToken = await getAccessToken(appId, clientSecret, log);
      currentAccessToken = accessToken;

      log?.info(`[qqbot-gateway] Getting gateway URL...`);
      const gatewayUrl = await getGatewayUrl(accessToken, log);

      log?.info(`[qqbot-gateway] Connecting to ${gatewayUrl}...`);

      ws = new WebSocket(gatewayUrl, {
        headers: { "User-Agent": "QQBotSDK/1.0.0" },
      });

      ws.on("open", () => {
        log?.info(`[qqbot-gateway] WebSocket connected`);
      });

      ws.on("message", (raw: Buffer) => {
        try {
          const payload = JSON.parse(raw.toString()) as WSPayload;

          switch (payload.op) {
            case 10: { // Hello
              const heartbeatMs = (payload.d as { heartbeat_interval: number })?.heartbeat_interval ?? 41250;
              startHeartbeat(heartbeatMs);

              if (sessionId && lastSeq) {
                log?.info(`[qqbot-gateway] Resuming session ${sessionId}...`);
                ws?.send(JSON.stringify({
                  op: 6,
                  d: { token: `QQBot ${accessToken}`, session_id: sessionId, seq: lastSeq },
                }));
              } else {
                log?.info(`[qqbot-gateway] Identifying...`);
                ws?.send(JSON.stringify({
                  op: 2,
                  d: {
                    token: `QQBot ${accessToken}`,
                    intents: FULL_INTENTS,
                    shard: [0, 1],
                    properties: {
                      os: process.platform,
                      browser: "qqbot-sdk",
                      device: "qqbot-sdk",
                    },
                  },
                }));
              }
              break;
            }

            case 11: // Heartbeat ACK
              log?.debug?.(`[qqbot-gateway] Heartbeat ACK`);
              break;

            case 0: { // Dispatch
              if (payload.s) lastSeq = payload.s;

              if (payload.t === "READY") {
                const d = payload.d as { session_id: string };
                sessionId = d.session_id;
                reconnectAttempts = 0;
                connected = true;
                persistSession();
                log?.info(`[qqbot-gateway] Session ready: ${sessionId}`);
              } else if (payload.t === "RESUMED") {
                reconnectAttempts = 0;
                connected = true;
                persistSession();
                log?.info(`[qqbot-gateway] Session resumed`);
              } else {
                handleDispatch(payload);
              }
              break;
            }

            case 7: // Reconnect
              log?.info(`[qqbot-gateway] Server requested reconnect`);
              shouldRefreshToken = true;
              scheduleReconnect(1000);
              break;

            case 9: // Invalid Session
              log?.error(`[qqbot-gateway] Invalid session, reconnecting...`);
              sessionId = null;
              lastSeq = null;
              shouldRefreshToken = true;
              scheduleReconnect(5000);
              break;

            default:
              log?.debug?.(`[qqbot-gateway] Unknown op: ${payload.op}`);
          }
        } catch (err) {
          log?.error(`[qqbot-gateway] Error handling message: ${err}`);
        }
      });

      ws.on("close", (code: number, reason: Buffer) => {
        log?.info(`[qqbot-gateway] Closed: ${code} ${reason.toString()}`);
        connected = false;
        cleanup();
        scheduleReconnect();
      });

      ws.on("error", (err: Error) => {
        log?.error(`[qqbot-gateway] Error: ${err.message}`);
        connected = false;
      });

    } catch (err) {
      log?.error(`[qqbot-gateway] Connection failed: ${err}`);
      isConnecting = false;
      scheduleReconnect();
      return;
    }

    isConnecting = false;
  };

  return {
    start: connect,
    stop: () => {
      isAborted = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      cleanup();
      log?.info(`[qqbot-gateway] Gateway stopped`);
    },
    isConnected: () => connected,
  };
}
