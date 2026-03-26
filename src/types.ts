/**
 * QQ Bot SDK 类型定义
 */

/** 媒体文件类型 */
export enum MediaFileType {
  IMAGE = 1,
  VIDEO = 2,
  VOICE = 3,
  FILE = 4,
}

/** 媒体上传响应 */
export interface UploadMediaResponse {
  file_uuid: string;
  file_info: string;
  ttl: number;
  id?: string;
}

/** SDK 配置 */
export interface QQBotConfig {
  appId: string;
  clientSecret: string;
}

/** 解析后的账户信息 */
export interface ResolvedQQBotAccount {
  accountId: string;
  appId: string;
  clientSecret: string;
}

/** 消息事件类型 */
export interface MessageEvent {
  /** 消息类型 */
  type: "c2c" | "group" | "guild" | "dm";
  /** 发送者ID */
  senderId: string;
  /** 发送者名称（如果有） */
  senderName?: string;
  /** 消息内容 */
  content: string;
  /** 消息ID */
  messageId: string;
  /** 消息时间戳 */
  timestamp: string;
  /** 频道ID（频道消息时有） */
  channelId?: string;
  /** 服务器ID（频道消息时有） */
  guildId?: string;
  /** 群OpenID（群消息时有） */
  groupOpenid?: string;
  /** 附件列表 */
  attachments?: MessageAttachment[];
}

/** 富媒体附件 */
export interface MessageAttachment {
  content_type: string;
  filename?: string;
  height?: number;
  width?: number;
  size?: number;
  url: string;
}

/** WebSocket 事件负载 */
export interface WSPayload {
  op: number;
  d?: unknown;
  s?: number;
  t?: string;
}

/** C2C 消息事件（QQ 私聊） */
export interface C2CMessageEvent {
  author: {
    id: string;
    union_openid: string;
    user_openid: string;
  };
  content: string;
  id: string;
  timestamp: string;
  attachments?: MessageAttachment[];
}

/** 群聊消息事件 */
export interface GroupMessageEvent {
  author: {
    id: string;
    member_openid: string;
  };
  content: string;
  id: string;
  timestamp: string;
  group_id: string;
  group_openid: string;
  attachments?: MessageAttachment[];
}

/** 发送消息结果 */
export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  timestamp?: string;
  error?: string;
}

/** 消息处理器类型 */
export type MessageHandler = (event: MessageEvent) => void | Promise<void>;

/** 日志接口 */
export interface Logger {
  info: (msg: string) => void;
  error: (msg: string) => void;
  debug?: (msg: string) => void;
}

/** SDK 选项 */
export interface QQBotSDKOptions {
  /** 应用ID */
  appId: string;
  /** 应用密钥 */
  clientSecret: string;
  /** 可选：自定义日志器 */
  logger?: Logger;
  /** 可选：重连延迟配置（毫秒） */
  reconnectDelays?: number[];
  /** 可选：最大重连次数 */
  maxReconnectAttempts?: number;
}
