/**
 * QQ Bot SDK 客户端
 * 提供简洁的消息收发接口
 */

import type {
  QQBotSDKOptions,
  MessageEvent,
  InteractionEvent,
  SendMessageResult,
  SendMessageOptions,
  InlineKeyboard,
  StreamMessageRequest,
  Logger,
  TokenStatus,
} from "./types.js";
import {
  getAccessToken,
  sendC2CMessage,
  sendGroupMessage,
  sendProactiveC2CMessage,
  sendProactiveGroupMessage,
  clearTokenCache,
  getTokenStatus as apiGetTokenStatus,
  startBackgroundTokenRefresh,
  stopBackgroundTokenRefresh,
  sendC2CMessageWithInlineKeyboard,
  sendGroupMessageWithInlineKeyboard,
  sendC2CMarkdownMessage,
  sendC2CStreamMessage,
  acknowledgeInteraction as apiAcknowledgeInteraction,
  sendC2CInputNotify,
  sendChannelMessage,
  sendDmMessage,
  // 富媒体
  sendC2CImageMessage,
  sendGroupImageMessage,
  sendC2CVoiceMessage,
  sendGroupVoiceMessage,
  sendC2CVideoMessage,
  sendGroupVideoMessage,
  sendC2CFileMessage,
  sendGroupFileMessage,
} from "./api.js";
import { createGateway, type Gateway } from "./gateway.js";

/** 消息处理器类型 */
export type MessageHandler = (event: MessageEvent) => void | Promise<void>;

/** 交互处理器类型 */
export type InteractionHandler = (event: InteractionEvent) => void | Promise<void>;

/** 默认日志器 */
const defaultLogger: Logger = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`),
  debug: (msg: string) => console.debug(`[DEBUG] ${msg}`),
};

/**
 * QQ Bot 客户端
 */
export class QQBotClient {
  private appId: string;
  private clientSecret: string;
  private log: Logger;
  private gateway?: Gateway;
  private messageHandlers: MessageHandler[] = [];
  private interactionHandlers: InteractionHandler[] = [];
  private started = false;
  private sessionDir?: string;
  private typingKeepAlive: boolean;
  private parseFaceEmoji: boolean;

  constructor(options: QQBotSDKOptions) {
    this.appId = options.appId;
    this.clientSecret = options.clientSecret;
    this.log = options.logger ?? defaultLogger;
    this.sessionDir = options.sessionDir;
    this.typingKeepAlive = options.typingKeepAlive ?? false;
    this.parseFaceEmoji = options.parseFaceEmoji ?? false;
  }

  // ============ 生命周期 ============

  /**
   * 启动客户端
   */
  async start(): Promise<void> {
    if (this.started) {
      this.log.info("Client already started");
      return;
    }

    this.log.info("Starting QQ Bot client...");

    this.gateway = createGateway({
      appId: this.appId,
      clientSecret: this.clientSecret,
      onMessage: (event) => this.handleMessage(event),
      onInteraction: (event) => this.handleInteraction(event),
      logger: this.log,
      sessionDir: this.sessionDir,
      typingKeepAlive: this.typingKeepAlive,
      parseFaceEmoji: this.parseFaceEmoji,
    });

    await this.gateway.start();
    this.started = true;
    this.log.info("QQ Bot client started");
  }

  /**
   * 停止客户端
   */
  stop(): void {
    if (!this.started) return;
    stopBackgroundTokenRefresh();
    this.gateway?.stop();
    this.started = false;
    this.log.info("QQ Bot client stopped");
  }

  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this.gateway?.isConnected() ?? false;
  }

  // ============ 事件注册 ============

  /**
   * 注册消息处理器
   */
  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  /**
   * 移除消息处理器
   */
  offMessage(handler: MessageHandler): void {
    const i = this.messageHandlers.indexOf(handler);
    if (i !== -1) this.messageHandlers.splice(i, 1);
  }

  /**
   * 注册交互处理器（按钮点击）
   */
  onInteraction(handler: InteractionHandler): void {
    this.interactionHandlers.push(handler);
  }

  /**
   * 移除交互处理器
   */
  offInteraction(handler: InteractionHandler): void {
    const i = this.interactionHandlers.indexOf(handler);
    if (i !== -1) this.interactionHandlers.splice(i, 1);
  }

  // ============ 内部分发 ============

  private async handleMessage(event: MessageEvent): Promise<void> {
    this.log.debug?.(`Message from ${event.senderId}: ${event.content.slice(0, 50)}`);
    for (const handler of this.messageHandlers) {
      try {
        await handler(event);
      } catch (err) {
        this.log.error(`Message handler error: ${err}`);
      }
    }
  }

  private async handleInteraction(event: InteractionEvent): Promise<void> {
    this.log.debug?.(`Interaction from ${event.user_openid}`);
    for (const handler of this.interactionHandlers) {
      try {
        await handler(event);
      } catch (err) {
        this.log.error(`Interaction handler error: ${err}`);
      }
    }
  }

  // ============ Token 管理 ============

  private async getToken(): Promise<string> {
    return getAccessToken(this.appId, this.clientSecret, this.log);
  }

  /**
   * 强制刷新 Token
   */
  refreshToken(): void {
    clearTokenCache(this.appId);
    this.log.info("Token cache cleared");
  }

  /**
   * 获取 Token 状态
   */
  getTokenStatus(): TokenStatus {
    return apiGetTokenStatus(this.appId);
  }

  /**
   * 启动后台 Token 刷新
   */
  startBackgroundRefresh(): void {
    startBackgroundTokenRefresh(this.appId, this.clientSecret, this.log);
  }

  /**
   * 停止后台 Token 刷新
   */
  stopBackgroundRefresh(): void {
    stopBackgroundTokenRefresh();
  }

  // ============ 文本消息 ============

  /**
   * 发送私聊消息（被动回复）
   */
  async sendPrivateMessage(openid: string, content: string, msgId?: string, options?: SendMessageOptions): Promise<SendMessageResult> {
    try {
      const token = await this.getToken();
      return sendC2CMessage(token, openid, content, msgId, this.log, options);
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * 发送私聊消息（主动）
   */
  async sendPrivateMessageProactive(openid: string, content: string): Promise<SendMessageResult> {
    try {
      const token = await this.getToken();
      return sendProactiveC2CMessage(token, openid, content, this.log);
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * 发送群聊消息（被动回复）
   */
  async sendGroupMessage(groupOpenid: string, content: string, msgId?: string, options?: SendMessageOptions): Promise<SendMessageResult> {
    try {
      const token = await this.getToken();
      return sendGroupMessage(token, groupOpenid, content, msgId, this.log, options);
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * 发送群聊消息（主动）
   */
  async sendGroupMessageProactive(groupOpenid: string, content: string): Promise<SendMessageResult> {
    try {
      const token = await this.getToken();
      return sendProactiveGroupMessage(token, groupOpenid, content, this.log);
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * 回复消息
   */
  async reply(event: MessageEvent, content: string, options?: SendMessageOptions): Promise<SendMessageResult> {
    if (event.type === "group" && event.groupOpenid) {
      return this.sendGroupMessage(event.groupOpenid, content, event.messageId, options);
    }
    return this.sendPrivateMessage(event.senderId, content, event.messageId, options);
  }

  // ============ Inline Keyboard ============

  /**
   * 发送私聊 Inline Keyboard 消息
   */
  async sendPrivateInlineKeyboard(openid: string, content: string, keyboard: InlineKeyboard, msgId?: string): Promise<SendMessageResult> {
    try {
      const token = await this.getToken();
      return sendC2CMessageWithInlineKeyboard(token, openid, content, keyboard, msgId, this.log);
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * 发送群聊 Inline Keyboard 消息
   */
  async sendGroupInlineKeyboard(groupOpenid: string, content: string, keyboard: InlineKeyboard, msgId?: string): Promise<SendMessageResult> {
    try {
      const token = await this.getToken();
      return sendGroupMessageWithInlineKeyboard(token, groupOpenid, content, keyboard, msgId, this.log);
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // ============ Markdown ============

  /**
   * 发送 Markdown 消息（私聊）
   */
  async sendPrivateMarkdown(openid: string, content: string, msgId?: string): Promise<SendMessageResult> {
    try {
      const token = await this.getToken();
      return sendC2CMarkdownMessage(token, openid, content, msgId, this.log);
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // ============ 流式消息 ============

  /**
   * 发送流式消息（私聊，打字机效果）
   */
  async sendStreamMessage(openid: string, request: StreamMessageRequest): Promise<SendMessageResult> {
    try {
      const token = await this.getToken();
      return sendC2CStreamMessage(token, openid, request, this.log);
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // ============ 交互确认 ============

  /**
   * 确认交互事件
   */
  async acknowledgeInteraction(interactionId: string, code = 0): Promise<void> {
    const token = await this.getToken();
    return apiAcknowledgeInteraction(token, interactionId, code, this.log);
  }

  // ============ 输入状态 ============

  /**
   * 发送"正在输入"提示
   */
  async sendTypingIndicator(openid: string, msgId?: string): Promise<void> {
    const token = await this.getToken();
    return sendC2CInputNotify(token, openid, msgId, 60, this.log);
  }

  // ============ 频道消息 ============

  /**
   * 发送频道消息
   */
  async sendChannelMessage(channelId: string, content: string, msgId?: string): Promise<SendMessageResult> {
    try {
      const token = await this.getToken();
      return sendChannelMessage(token, channelId, content, msgId, this.log);
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * 发送频道私信
   */
  async sendDmMessage(guildId: string, content: string, msgId?: string): Promise<SendMessageResult> {
    try {
      const token = await this.getToken();
      return sendDmMessage(token, guildId, content, msgId, this.log);
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // ============ 富媒体消息 ============

  /**
   * 发送私聊图片
   */
  async sendPrivateImage(openid: string, imageUrl: string, msgId?: string, content?: string): Promise<SendMessageResult> {
    const token = await this.getToken();
    return sendC2CImageMessage(token, openid, imageUrl, msgId, content, this.log);
  }

  /**
   * 发送群聊图片
   */
  async sendGroupImage(groupOpenid: string, imageUrl: string, msgId?: string, content?: string): Promise<SendMessageResult> {
    const token = await this.getToken();
    return sendGroupImageMessage(token, groupOpenid, imageUrl, msgId, content, this.log);
  }

  /**
   * 发送私聊语音
   */
  async sendPrivateVoice(openid: string, voiceBase64?: string, voiceUrl?: string, msgId?: string): Promise<SendMessageResult> {
    const token = await this.getToken();
    return sendC2CVoiceMessage(token, openid, voiceBase64, voiceUrl, msgId, this.log);
  }

  /**
   * 发送群聊语音
   */
  async sendGroupVoice(groupOpenid: string, voiceBase64?: string, voiceUrl?: string, msgId?: string): Promise<SendMessageResult> {
    const token = await this.getToken();
    return sendGroupVoiceMessage(token, groupOpenid, voiceBase64, voiceUrl, msgId, this.log);
  }

  /**
   * 发送私聊视频
   */
  async sendPrivateVideo(openid: string, videoUrl?: string, videoBase64?: string, msgId?: string, content?: string): Promise<SendMessageResult> {
    const token = await this.getToken();
    return sendC2CVideoMessage(token, openid, videoUrl, videoBase64, msgId, content, this.log);
  }

  /**
   * 发送群聊视频
   */
  async sendGroupVideo(groupOpenid: string, videoUrl?: string, videoBase64?: string, msgId?: string, content?: string): Promise<SendMessageResult> {
    const token = await this.getToken();
    return sendGroupVideoMessage(token, groupOpenid, videoUrl, videoBase64, msgId, content, this.log);
  }

  /**
   * 发送私聊文件
   */
  async sendPrivateFile(openid: string, fileBase64?: string, fileUrl?: string, fileName?: string, msgId?: string): Promise<SendMessageResult> {
    const token = await this.getToken();
    return sendC2CFileMessage(token, openid, fileBase64, fileUrl, msgId, fileName, this.log);
  }

  /**
   * 发送群聊文件
   */
  async sendGroupFile(groupOpenid: string, fileBase64?: string, fileUrl?: string, fileName?: string, msgId?: string): Promise<SendMessageResult> {
    const token = await this.getToken();
    return sendGroupFileMessage(token, groupOpenid, fileBase64, fileUrl, msgId, fileName, this.log);
  }
}
