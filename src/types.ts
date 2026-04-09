/**
 * QQ Bot SDK 类型定义
 */

// ============ 消息类型常量 ============

export const MSG_TYPE_TEXT = 0;
export const MSG_TYPE_MARKDOWN = 2;
export const MSG_TYPE_INLINE_KEYBOARD = 3;
export const MSG_TYPE_MEDIA = 7;
export const MSG_TYPE_INPUT_NOTIFY = 6;

// ============ 枚举 ============

/** 媒体文件类型 */
export enum MediaFileType {
  IMAGE = 1,
  VIDEO = 2,
  VOICE = 3,
  FILE = 4,
}

/** 键盘按钮动作类型 */
export enum KeyboardActionType {
  LINK = 0,
  CALLBACK = 1,
  COMMAND = 2,
}

// ============ 基础配置 ============

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

// ============ 消息场景 ============

/** 消息场景元数据 */
export interface MessageScene {
  ext?: MessageSceneExt[];
}

export interface MessageSceneExt {
  key: string;
  value: string;
}

/** 递归消息元素 */
export interface MsgElement {
  msg_idx: string;
  message_type: number;
  content?: string;
  attachments?: MessageAttachment[];
  msg_elements?: MsgElement[];
}

/** 群消息提及 */
export interface Mention {
  key: string;
  uin_openid?: string;
}

// ============ 消息事件 ============

/** 消息事件 */
export interface MessageEvent {
  type: "c2c" | "group" | "guild" | "dm";
  senderId: string;
  senderName?: string;
  content: string;
  messageId: string;
  timestamp: string;
  channelId?: string;
  guildId?: string;
  groupOpenid?: string;
  attachments?: MessageAttachment[];
  message_scene?: MessageScene;
  message_type?: number;
  msg_elements?: MsgElement[];
  mentions?: Mention[];
}

/** 富媒体附件 */
export interface MessageAttachment {
  content_type: string;
  filename?: string;
  height?: number;
  width?: number;
  size?: number;
  url: string;
  voice_wav_url?: string;
  asr_refer_text?: string;
}

// ============ WebSocket ============

/** WebSocket 事件负载 */
export interface WSPayload {
  op: number;
  d?: unknown;
  s?: number;
  t?: string;
}

// ============ 原始事件类型（Gateway 下行） ============

/** C2C 消息事件 */
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
  message_scene?: MessageScene;
  message_type?: number;
  msg_elements?: MsgElement[];
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
  message_scene?: MessageScene;
  mentions?: Mention[];
  message_type?: number;
  msg_elements?: MsgElement[];
}

// ============ 交互事件 ============

/** 按钮交互事件 */
export interface InteractionEvent {
  type: "interaction";
  id: string;
  appid: string;
  user_openid: string;
  group_openid?: string;
  related_message_id?: string;
  data?: string;
  raw: Record<string, unknown>;
}

export type InteractionHandler = (event: InteractionEvent) => void | Promise<void>;

// ============ 消息发送结果 ============

/** 发送消息结果 */
export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  timestamp?: string;
  error?: string;
  /** 流式消息返回的 stream_msg_id，后续片段需要携带 */
  streamMsgId?: string;
}

// ============ 消息引用选项 ============

export interface MessageReference {
  message_id: string;
  ignore_get_message_error?: boolean;
}

export interface SendMessageOptions {
  /** 消息引用（回复） */
  message_reference?: MessageReference;
}

// ============ 键盘/按钮 ============

export interface KeyboardButton {
  id?: string;
  render_data?: {
    label: string;
    visited_label?: string;
    style?: number;
  };
  action: {
    type: KeyboardActionType;
    permission?: {
      type: number;
      specify_role_ids?: string[];
      specify_user_ids?: string[];
    };
    data?: string;
    reply?: boolean;
    enter?: boolean;
    anchor?: number;
  };
}

export interface KeyboardRow {
  buttons: KeyboardButton[];
}

/** 自定义键盘内容 */
export interface CustomKeyboard {
  rows: KeyboardRow[];
}

/** Inline Keyboard（消息内嵌按钮）
 * JSON: { "keyboard": { "content": { "rows": [...] } } }
 */
export interface InlineKeyboard {
  id?: string;
  content?: CustomKeyboard;
}

// ============ 流式消息 ============

export interface StreamMessageRequest {
  /** 唯一事件 ID，同一次流式会话内保持不变 */
  event_id: string;
  /** 输入模式，固定 "replace" */
  input_mode?: "replace";
  /** 输入状态：1=生成中，10=完成 */
  input_state?: 1 | 10;
  /** 内容类型，固定 "markdown" */
  content_type?: "markdown";
  /** 实际内容 */
  content_raw?: string;
  /** 要回复的消息 ID */
  msg_id?: string;
  /** 上一次调用返回的 stream_msg_id */
  stream_msg_id?: string;
  /** 递增序号 */
  msg_seq?: number;
  /** 递增索引 */
  index?: number;
}

// ============ 分块上传 ============

export interface UploadPrepareResponse {
  upload_url?: string;
  upload_parts_urls?: string[];
  file_uuid?: string;
  file_info?: string;
  ttl?: number;
  upload_state?: string;
}

export interface UploadPart {
  part_number: number;
  etag?: string;
}

export interface UploadMediaResponse {
  file_uuid: string;
  file_info: string;
  ttl: number;
  id?: string;
}

// ============ Token 状态 ============

export type TokenStatus = "valid" | "expired" | "refreshing" | "none";

// ============ 处理器与日志 ============

export type MessageHandler = (event: MessageEvent) => void | Promise<void>;

export interface Logger {
  info: (msg: string) => void;
  error: (msg: string) => void;
  debug?: (msg: string) => void;
}

// ============ SDK 选项 ============

export interface QQBotSDKOptions {
  appId: string;
  clientSecret: string;
  logger?: Logger;
  reconnectDelays?: number[];
  maxReconnectAttempts?: number;
  /** 会话持久化目录（启用后跨重启可恢复连接） */
  sessionDir?: string;
  /** 处理消息期间发送"正在输入"提示 */
  typingKeepAlive?: boolean;
  /** 是否解析 QQ 表情标签为可读文本 */
  parseFaceEmoji?: boolean;
}
