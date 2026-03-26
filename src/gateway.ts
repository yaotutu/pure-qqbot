/**
 * QQ Bot WebSocket Gateway
 * 处理消息接收和连接管理
 */

import WebSocket from "ws";
import type { MessageEvent, WSPayload, Logger } from "./types.js";
import { getAccessToken, getGatewayUrl, clearTokenCache } from "./api.js";

// QQ Bot intents
const INTENTS = {
  PUBLIC_GUILD_MESSAGES: 1 << 30,    // 频道公开消息
  DIRECT_MESSAGE: 1 << 12,           // 频道私信
  GROUP_AND_C2C: 1 << 25,            // 群聊和 C2C 私聊
};

const FULL_INTENTS = INTENTS.PUBLIC_GUILD_MESSAGES | INTENTS.DIRECT_MESSAGE | INTENTS.GROUP_AND_C2C;

// 重连配置
const DEFAULT_RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000, 60000];
const MAX_RECONNECT_ATTEMPTS = 100;

export interface GatewayOptions {
  appId: string;
  clientSecret: string;
  onMessage: (event: MessageEvent) => void | Promise<void>;
  logger?: Logger;
  reconnectDelays?: number[];
  maxReconnectAttempts?: number;
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
    logger: log,
    reconnectDelays = DEFAULT_RECONNECT_DELAYS,
    maxReconnectAttempts = MAX_RECONNECT_ATTEMPTS,
  } = options;

  let ws: WebSocket | null = null;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let sessionId: string | null = null;
  let lastSeq: number | null = null;
  let reconnectAttempts = 0;
  let isAborted = false;
  let isConnecting = false;
  let connected = false;
  let shouldRefreshToken = false;

  const cleanup = () => {
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

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }

    const delay = customDelay ?? getReconnectDelay();
    reconnectAttempts++;
    log?.info(`[qqbot-gateway] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (!isAborted) {
        connect();
      }
    }, delay);
  };

  const sendHeartbeat = () => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ op: 1, d: lastSeq }));
      log?.debug?.(`[qqbot-gateway] Heartbeat sent, seq: ${lastSeq}`);
    }
  };

  const startHeartbeat = (intervalMs: number) => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }
    heartbeatInterval = setInterval(sendHeartbeat, intervalMs);
  };

  const handleDispatch = (payload: WSPayload) => {
    const eventType = payload.t;
    const eventData = payload.d as Record<string, unknown>;

    if (!eventType || !eventData) return;

    log?.debug?.(`[qqbot-gateway] Event received: ${eventType}`);

    switch (eventType) {
      case "C2C_MESSAGE_CREATE": {
        const data = eventData as {
          author: { id: string; user_openid: string };
          content: string;
          id: string;
          timestamp: string;
          attachments?: Array<{ content_type: string; url: string; filename?: string }>;
        };
        onMessage({
          type: "c2c",
          senderId: data.author.user_openid,
          content: data.content,
          messageId: data.id,
          timestamp: data.timestamp,
          attachments: data.attachments,
        });
        break;
      }

      case "GROUP_AT_MESSAGE_CREATE": {
        const data = eventData as {
          author: { id: string; member_openid: string };
          content: string;
          id: string;
          timestamp: string;
          group_openid: string;
          attachments?: Array<{ content_type: string; url: string; filename?: string }>;
        };
        onMessage({
          type: "group",
          senderId: data.author.member_openid,
          content: data.content,
          messageId: data.id,
          timestamp: data.timestamp,
          groupOpenid: data.group_openid,
          attachments: data.attachments,
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
          content: data.content,
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
          content: data.content,
          messageId: data.id,
          timestamp: data.timestamp,
          channelId: data.channel_id,
          guildId: data.guild_id,
          attachments: data.attachments,
        });
        break;
      }

      default:
        log?.debug?.(`[qqbot-gateway] Unhandled event type: ${eventType}`);
    }
  };

  const connect = async () => {
    if (isConnecting) {
      log?.debug?.(`[qqbot-gateway] Already connecting, skip`);
      return;
    }
    isConnecting = true;

    try {
      cleanup();

      if (shouldRefreshToken) {
        clearTokenCache(appId);
        shouldRefreshToken = false;
      }

      log?.info(`[qqbot-gateway] Getting access token...`);
      const accessToken = await getAccessToken(appId, clientSecret, log);

      log?.info(`[qqbot-gateway] Getting gateway URL...`);
      const gatewayUrl = await getGatewayUrl(accessToken, log);

      log?.info(`[qqbot-gateway] Connecting to ${gatewayUrl}...`);

      ws = new WebSocket(gatewayUrl, {
        headers: { "User-Agent": `QQBotSDK/1.0.0` },
      });

      ws.on("open", () => {
        log?.info(`[qqbot-gateway] WebSocket connected`);
      });

      ws.on("message", (data: Buffer) => {
        try {
          const payload = JSON.parse(data.toString()) as WSPayload;

          switch (payload.op) {
            case 10: // Hello
              const heartbeatIntervalMs = (payload.d as { heartbeat_interval: number })?.heartbeat_interval ?? 41250;
              startHeartbeat(heartbeatIntervalMs);

              // 发送 Identify 或 Resume
              if (sessionId && lastSeq) {
                log?.info(`[qqbot-gateway] Resuming session...`);
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

            case 11: // Heartbeat ACK
              log?.debug?.(`[qqbot-gateway] Heartbeat ACK`);
              break;

            case 0: // Dispatch
              if (payload.s) {
                lastSeq = payload.s;
              }

              if (payload.t === "READY") {
                const readyData = payload.d as { session_id: string };
                sessionId = readyData.session_id;
                reconnectAttempts = 0; // 重置重连计数
                connected = true;
                log?.info(`[qqbot-gateway] Session ready, sessionId: ${sessionId}`);
              } else if (payload.t === "RESUMED") {
                reconnectAttempts = 0;
                connected = true;
                log?.info(`[qqbot-gateway] Session resumed`);
              } else {
                handleDispatch(payload);
              }
              break;

            case 7: // Reconnect
              log?.info(`[qqbot-gateway] Server requested reconnect`);
              shouldRefreshToken = true;
              scheduleReconnect(1000);
              break;

            case 9: // Invalid Session
              log?.error(`[qqbot-gateway] Invalid session, clearing and reconnecting...`);
              sessionId = null;
              lastSeq = null;
              shouldRefreshToken = true;
              scheduleReconnect(5000);
              break;

            default:
              log?.debug?.(`[qqbot-gateway] Unknown op code: ${payload.op}`);
          }
        } catch (err) {
          log?.error(`[qqbot-gateway] Error handling message: ${err}`);
        }
      });

      ws.on("close", (code: number, reason: Buffer) => {
        log?.info(`[qqbot-gateway] Connection closed: ${code} ${reason.toString()}`);
        connected = false;
        cleanup();
        scheduleReconnect();
      });

      ws.on("error", (err: Error) => {
        log?.error(`[qqbot-gateway] WebSocket error: ${err.message}`);
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
