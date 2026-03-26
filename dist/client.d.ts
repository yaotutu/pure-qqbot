/**
 * QQ Bot SDK 客户端
 * 提供简洁的消息收发接口
 */
import type { QQBotSDKOptions, MessageEvent, SendMessageResult } from "./types.js";
/** 消息处理器类型 */
export type MessageHandler = (event: MessageEvent) => void | Promise<void>;
/**
 * QQ Bot 客户端
 */
export declare class QQBotClient {
    private appId;
    private clientSecret;
    private log;
    private gateway?;
    private messageHandlers;
    private started;
    constructor(options: QQBotSDKOptions);
    /**
     * 启动客户端，开始接收消息
     */
    start(): Promise<void>;
    /**
     * 停止客户端
     */
    stop(): void;
    /**
     * 检查是否已连接
     */
    isConnected(): boolean;
    /**
     * 注册消息处理器
     */
    onMessage(handler: MessageHandler): void;
    /**
     * 移除消息处理器
     */
    offMessage(handler: MessageHandler): void;
    /**
     * 处理收到的消息
     */
    private handleMessage;
    /**
     * 发送私聊消息（被动回复）
     * @param openid 用户 OpenID
     * @param content 消息内容
     * @param msgId 要回复的消息ID（被动回复必填）
     */
    sendPrivateMessage(openid: string, content: string, msgId?: string): Promise<SendMessageResult>;
    /**
     * 发送私聊消息（主动消息，无需 msgId）
     * @param openid 用户 OpenID
     * @param content 消息内容
     */
    sendPrivateMessageProactive(openid: string, content: string): Promise<SendMessageResult>;
    /**
     * 发送群聊消息（被动回复）
     * @param groupOpenid 群 OpenID
     * @param content 消息内容
     * @param msgId 要回复的消息ID（被动回复必填）
     */
    sendGroupMessage(groupOpenid: string, content: string, msgId?: string): Promise<SendMessageResult>;
    /**
     * 发送群聊消息（主动消息，无需 msgId）
     * @param groupOpenid 群 OpenID
     * @param content 消息内容
     */
    sendGroupMessageProactive(groupOpenid: string, content: string): Promise<SendMessageResult>;
    /**
     * 回复消息（根据消息类型自动选择发送方式）
     * @param event 收到的消息事件
     * @param content 回复内容
     * @param useProactive 是否使用主动消息（默认 false，被动回复）
     */
    reply(event: MessageEvent, content: string, useProactive?: boolean): Promise<SendMessageResult>;
    /**
     * 强制刷新 Token
     */
    refreshToken(): void;
    /**
     * 发送私聊图片消息
     * @param openid 用户 OpenID
     * @param imageUrl 图片 URL 或 Data URL (data:image/png;base64,...)
     * @param msgId 要回复的消息ID（被动回复时必填）
     * @param content 附带的文本内容（可选）
     */
    sendPrivateImage(openid: string, imageUrl: string, msgId?: string, content?: string): Promise<SendMessageResult>;
    /**
     * 发送群聊图片消息
     * @param groupOpenid 群 OpenID
     * @param imageUrl 图片 URL 或 Data URL
     * @param msgId 要回复的消息ID（被动回复时必填）
     * @param content 附带的文本内容（可选）
     */
    sendGroupImage(groupOpenid: string, imageUrl: string, msgId?: string, content?: string): Promise<SendMessageResult>;
    /**
     * 发送私聊语音消息
     * @param openid 用户 OpenID
     * @param voiceBase64 语音 Base64 数据（与 voiceUrl 二选一）
     * @param voiceUrl 语音 URL（与 voiceBase64 二选一）
     * @param msgId 要回复的消息ID（被动回复时必填）
     */
    sendPrivateVoice(openid: string, voiceBase64?: string, voiceUrl?: string, msgId?: string): Promise<SendMessageResult>;
    /**
     * 发送群聊语音消息
     * @param groupOpenid 群 OpenID
     * @param voiceBase64 语音 Base64 数据（与 voiceUrl 二选一）
     * @param voiceUrl 语音 URL（与 voiceBase64 二选一）
     * @param msgId 要回复的消息ID（被动回复时必填）
     */
    sendGroupVoice(groupOpenid: string, voiceBase64?: string, voiceUrl?: string, msgId?: string): Promise<SendMessageResult>;
    /**
     * 发送私聊视频消息
     * @param openid 用户 OpenID
     * @param videoUrl 视频 URL（与 videoBase64 二选一）
     * @param videoBase64 视频 Base64 数据（与 videoUrl 二选一）
     * @param msgId 要回复的消息ID（被动回复时必填）
     * @param content 附带的文本内容（可选）
     */
    sendPrivateVideo(openid: string, videoUrl?: string, videoBase64?: string, msgId?: string, content?: string): Promise<SendMessageResult>;
    /**
     * 发送群聊视频消息
     * @param groupOpenid 群 OpenID
     * @param videoUrl 视频 URL（与 videoBase64 二选一）
     * @param videoBase64 视频 Base64 数据（与 videoUrl 二选一）
     * @param msgId 要回复的消息ID（被动回复时必填）
     * @param content 附带的文本内容（可选）
     */
    sendGroupVideo(groupOpenid: string, videoUrl?: string, videoBase64?: string, msgId?: string, content?: string): Promise<SendMessageResult>;
    /**
     * 发送私聊文件消息
     * @param openid 用户 OpenID
     * @param fileBase64 文件 Base64 数据（与 fileUrl 二选一）
     * @param fileUrl 文件 URL（与 fileBase64 二选一）
     * @param fileName 文件名（建议提供）
     * @param msgId 要回复的消息ID（被动回复时必填）
     */
    sendPrivateFile(openid: string, fileBase64?: string, fileUrl?: string, fileName?: string, msgId?: string): Promise<SendMessageResult>;
    /**
     * 发送群聊文件消息
     * @param groupOpenid 群 OpenID
     * @param fileBase64 文件 Base64 数据（与 fileUrl 二选一）
     * @param fileUrl 文件 URL（与 fileBase64 二选一）
     * @param fileName 文件名（建议提供）
     * @param msgId 要回复的消息ID（被动回复时必填）
     */
    sendGroupFile(groupOpenid: string, fileBase64?: string, fileUrl?: string, fileName?: string, msgId?: string): Promise<SendMessageResult>;
}
//# sourceMappingURL=client.d.ts.map