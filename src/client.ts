/**
 * QQ Bot SDK 客户端
 * 提供简洁的消息收发接口
 */

import type {
  QQBotSDKOptions,
  MessageEvent,
  SendMessageResult,
  Logger,
} from "./types.js";
import {
  getAccessToken,
  sendC2CMessage,
  sendGroupMessage,
  sendProactiveC2CMessage,
  sendProactiveGroupMessage,
  clearTokenCache,
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
  private started = false;

  constructor(options: QQBotSDKOptions) {
    this.appId = options.appId;
    this.clientSecret = options.clientSecret;
    this.log = options.logger ?? defaultLogger;
  }

  /**
   * 启动客户端，开始接收消息
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
      logger: this.log,
    });

    await this.gateway.start();
    this.started = true;
    this.log.info("QQ Bot client started");
  }

  /**
   * 停止客户端
   */
  stop(): void {
    if (!this.started) {
      return;
    }

    this.gateway?.stop();
    this.started = false;
    this.log.info("QQ Bot client stopped");
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.gateway?.isConnected() ?? false;
  }

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
    const index = this.messageHandlers.indexOf(handler);
    if (index !== -1) {
      this.messageHandlers.splice(index, 1);
    }
  }

  /**
   * 处理收到的消息
   */
  private async handleMessage(event: MessageEvent): Promise<void> {
    this.log.debug?.(`Received message from ${event.senderId}: ${event.content.slice(0, 50)}`);

    for (const handler of this.messageHandlers) {
      try {
        await handler(event);
      } catch (err) {
        this.log.error(`Message handler error: ${err}`);
      }
    }
  }

  /**
   * 发送私聊消息（被动回复）
   * @param openid 用户 OpenID
   * @param content 消息内容
   * @param msgId 要回复的消息ID（被动回复必填）
   */
  async sendPrivateMessage(openid: string, content: string, msgId?: string): Promise<SendMessageResult> {
    this.log.info(`Sending private message to ${openid}: ${content.slice(0, 50)}...`);

    try {
      const token = await getAccessToken(this.appId, this.clientSecret, this.log);
      return await sendC2CMessage(token, openid, content, msgId, this.log);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.log.error(`Failed to send private message: ${error}`);
      return { success: false, error };
    }
  }

  /**
   * 发送私聊消息（主动消息，无需 msgId）
   * @param openid 用户 OpenID
   * @param content 消息内容
   */
  async sendPrivateMessageProactive(openid: string, content: string): Promise<SendMessageResult> {
    this.log.info(`Sending proactive private message to ${openid}: ${content.slice(0, 50)}...`);

    try {
      const token = await getAccessToken(this.appId, this.clientSecret, this.log);
      return await sendProactiveC2CMessage(token, openid, content, this.log);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.log.error(`Failed to send proactive private message: ${error}`);
      return { success: false, error };
    }
  }

  /**
   * 发送群聊消息（被动回复）
   * @param groupOpenid 群 OpenID
   * @param content 消息内容
   * @param msgId 要回复的消息ID（被动回复必填）
   */
  async sendGroupMessage(groupOpenid: string, content: string, msgId?: string): Promise<SendMessageResult> {
    this.log.info(`Sending group message to ${groupOpenid}: ${content.slice(0, 50)}...`);

    try {
      const token = await getAccessToken(this.appId, this.clientSecret, this.log);
      return await sendGroupMessage(token, groupOpenid, content, msgId, this.log);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.log.error(`Failed to send group message: ${error}`);
      return { success: false, error };
    }
  }

  /**
   * 发送群聊消息（主动消息，无需 msgId）
   * @param groupOpenid 群 OpenID
   * @param content 消息内容
   */
  async sendGroupMessageProactive(groupOpenid: string, content: string): Promise<SendMessageResult> {
    this.log.info(`Sending proactive group message to ${groupOpenid}: ${content.slice(0, 50)}...`);

    try {
      const token = await getAccessToken(this.appId, this.clientSecret, this.log);
      return await sendProactiveGroupMessage(token, groupOpenid, content, this.log);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.log.error(`Failed to send proactive group message: ${error}`);
      return { success: false, error };
    }
  }

  /**
   * 回复消息（根据消息类型自动选择发送方式）
   * @param event 收到的消息事件
   * @param content 回复内容
   * @param useProactive 是否使用主动消息（默认 false，被动回复）
   */
  async reply(event: MessageEvent, content: string, useProactive = false): Promise<SendMessageResult> {
    if (event.type === "group" && event.groupOpenid) {
      if (useProactive) {
        return this.sendGroupMessageProactive(event.groupOpenid, content);
      }
      return this.sendGroupMessage(event.groupOpenid, content, event.messageId);
    }

    // c2c 或 dm 都使用 C2C 接口
    if (useProactive) {
      return this.sendPrivateMessageProactive(event.senderId, content);
    }
    return this.sendPrivateMessage(event.senderId, content, event.messageId);
  }

  /**
   * 强制刷新 Token
   */
  refreshToken(): void {
    clearTokenCache(this.appId);
    this.log.info("Token cache cleared, will refresh on next request");
  }

  // ============ 富媒体消息发送 ============

  /**
   * 发送私聊图片消息
   * @param openid 用户 OpenID
   * @param imageUrl 图片 URL 或 Data URL (data:image/png;base64,...)
   * @param msgId 要回复的消息ID（被动回复时必填）
   * @param content 附带的文本内容（可选）
   */
  async sendPrivateImage(openid: string, imageUrl: string, msgId?: string, content?: string): Promise<SendMessageResult> {
    this.log.info(`Sending private image to ${openid}...`);
    const token = await getAccessToken(this.appId, this.clientSecret, this.log);
    return sendC2CImageMessage(token, openid, imageUrl, msgId, content, this.log);
  }

  /**
   * 发送群聊图片消息
   * @param groupOpenid 群 OpenID
   * @param imageUrl 图片 URL 或 Data URL
   * @param msgId 要回复的消息ID（被动回复时必填）
   * @param content 附带的文本内容（可选）
   */
  async sendGroupImage(groupOpenid: string, imageUrl: string, msgId?: string, content?: string): Promise<SendMessageResult> {
    this.log.info(`Sending group image to ${groupOpenid}...`);
    const token = await getAccessToken(this.appId, this.clientSecret, this.log);
    return sendGroupImageMessage(token, groupOpenid, imageUrl, msgId, content, this.log);
  }

  /**
   * 发送私聊语音消息
   * @param openid 用户 OpenID
   * @param voiceBase64 语音 Base64 数据（与 voiceUrl 二选一）
   * @param voiceUrl 语音 URL（与 voiceBase64 二选一）
   * @param msgId 要回复的消息ID（被动回复时必填）
   */
  async sendPrivateVoice(openid: string, voiceBase64?: string, voiceUrl?: string, msgId?: string): Promise<SendMessageResult> {
    this.log.info(`Sending private voice to ${openid}...`);
    const token = await getAccessToken(this.appId, this.clientSecret, this.log);
    return sendC2CVoiceMessage(token, openid, voiceBase64, voiceUrl, msgId, this.log);
  }

  /**
   * 发送群聊语音消息
   * @param groupOpenid 群 OpenID
   * @param voiceBase64 语音 Base64 数据（与 voiceUrl 二选一）
   * @param voiceUrl 语音 URL（与 voiceBase64 二选一）
   * @param msgId 要回复的消息ID（被动回复时必填）
   */
  async sendGroupVoice(groupOpenid: string, voiceBase64?: string, voiceUrl?: string, msgId?: string): Promise<SendMessageResult> {
    this.log.info(`Sending group voice to ${groupOpenid}...`);
    const token = await getAccessToken(this.appId, this.clientSecret, this.log);
    return sendGroupVoiceMessage(token, groupOpenid, voiceBase64, voiceUrl, msgId, this.log);
  }

  /**
   * 发送私聊视频消息
   * @param openid 用户 OpenID
   * @param videoUrl 视频 URL（与 videoBase64 二选一）
   * @param videoBase64 视频 Base64 数据（与 videoUrl 二选一）
   * @param msgId 要回复的消息ID（被动回复时必填）
   * @param content 附带的文本内容（可选）
   */
  async sendPrivateVideo(openid: string, videoUrl?: string, videoBase64?: string, msgId?: string, content?: string): Promise<SendMessageResult> {
    this.log.info(`Sending private video to ${openid}...`);
    const token = await getAccessToken(this.appId, this.clientSecret, this.log);
    return sendC2CVideoMessage(token, openid, videoUrl, videoBase64, msgId, content, this.log);
  }

  /**
   * 发送群聊视频消息
   * @param groupOpenid 群 OpenID
   * @param videoUrl 视频 URL（与 videoBase64 二选一）
   * @param videoBase64 视频 Base64 数据（与 videoUrl 二选一）
   * @param msgId 要回复的消息ID（被动回复时必填）
   * @param content 附带的文本内容（可选）
   */
  async sendGroupVideo(groupOpenid: string, videoUrl?: string, videoBase64?: string, msgId?: string, content?: string): Promise<SendMessageResult> {
    this.log.info(`Sending group video to ${groupOpenid}...`);
    const token = await getAccessToken(this.appId, this.clientSecret, this.log);
    return sendGroupVideoMessage(token, groupOpenid, videoUrl, videoBase64, msgId, content, this.log);
  }

  /**
   * 发送私聊文件消息
   * @param openid 用户 OpenID
   * @param fileBase64 文件 Base64 数据（与 fileUrl 二选一）
   * @param fileUrl 文件 URL（与 fileBase64 二选一）
   * @param fileName 文件名（建议提供）
   * @param msgId 要回复的消息ID（被动回复时必填）
   */
  async sendPrivateFile(openid: string, fileBase64?: string, fileUrl?: string, fileName?: string, msgId?: string): Promise<SendMessageResult> {
    this.log.info(`Sending private file to ${openid}...`);
    const token = await getAccessToken(this.appId, this.clientSecret, this.log);
    return sendC2CFileMessage(token, openid, fileBase64, fileUrl, msgId, fileName, this.log);
  }

  /**
   * 发送群聊文件消息
   * @param groupOpenid 群 OpenID
   * @param fileBase64 文件 Base64 数据（与 fileUrl 二选一）
   * @param fileUrl 文件 URL（与 fileBase64 二选一）
   * @param fileName 文件名（建议提供）
   * @param msgId 要回复的消息ID（被动回复时必填）
   */
  async sendGroupFile(groupOpenid: string, fileBase64?: string, fileUrl?: string, fileName?: string, msgId?: string): Promise<SendMessageResult> {
    this.log.info(`Sending group file to ${groupOpenid}...`);
    const token = await getAccessToken(this.appId, this.clientSecret, this.log);
    return sendGroupFileMessage(token, groupOpenid, fileBase64, fileUrl, msgId, fileName, this.log);
  }
}
