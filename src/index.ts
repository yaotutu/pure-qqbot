/**
 * QQ Bot SDK
 * 独立的 QQ Bot 消息收发 SDK
 */

// 主要类
export { QQBotClient } from "./client.js";

// 类型
export type {
  QQBotSDKOptions,
  QQBotConfig,
  ResolvedQQBotAccount,
  MessageEvent,
  MessageAttachment,
  MessageScene,
  MessageSceneExt,
  MsgElement,
  Mention,
  SendMessageResult,
  SendMessageOptions,
  MessageReference,
  Logger,
  WSPayload,
  C2CMessageEvent,
  GroupMessageEvent,
  InteractionEvent,
  InteractionHandler,
  InlineKeyboard,
  KeyboardButton,
  KeyboardRow,
  CustomKeyboard,
  StreamMessageRequest,
  UploadPrepareResponse,
  UploadPart,
  UploadMediaResponse,
  TokenStatus,
} from "./types.js";

export type { MessageHandler } from "./client.js";

// 枚举和常量
export {
  MediaFileType,
  KeyboardActionType,
  MSG_TYPE_TEXT,
  MSG_TYPE_MARKDOWN,
  MSG_TYPE_INLINE_KEYBOARD,
  MSG_TYPE_MEDIA,
  MSG_TYPE_INPUT_NOTIFY,
} from "./types.js";

// API 错误类
export { ApiError } from "./api.js";

// 底层 API
export {
  getAccessToken,
  getGatewayUrl,
  clearTokenCache,
  getTokenStatus,
  setApiLogger,
  initApiConfig,
  isMarkdownSupport,
  startBackgroundTokenRefresh,
  stopBackgroundTokenRefresh,
  // 文本消息
  sendC2CMessage,
  sendGroupMessage,
  sendProactiveC2CMessage,
  sendProactiveGroupMessage,
  // Inline Keyboard
  sendC2CMessageWithInlineKeyboard,
  sendGroupMessageWithInlineKeyboard,
  // Markdown
  sendC2CMarkdownMessage,
  // 流式消息
  sendC2CStreamMessage,
  // 交互
  acknowledgeInteraction,
  // 输入状态
  sendC2CInputNotify,
  // 频道
  sendChannelMessage,
  sendDmMessage,
  // 富媒体上传
  uploadC2CMedia,
  uploadGroupMedia,
  // 媒体消息
  sendC2CMediaMessage,
  sendGroupMediaMessage,
  sendC2CImageMessage,
  sendGroupImageMessage,
  sendC2CVoiceMessage,
  sendGroupVoiceMessage,
  sendC2CVideoMessage,
  sendGroupVideoMessage,
  sendC2CFileMessage,
  sendGroupFileMessage,
  // 分块上传
  c2cUploadPrepare,
  c2cUploadPart,
  c2cUploadPartFinish,
  c2cCompleteUpload,
  groupUploadPrepare,
  groupUploadPart,
  groupUploadPartFinish,
  groupCompleteUpload,
} from "./api.js";

// Gateway
export { createGateway, type Gateway, type GatewayOptions } from "./gateway.js";

// 工具
export { validateUrl, isPrivateIp } from "./utils/ssrf-guard.js";
export { chunkedUpload, type ChunkedUploadParams } from "./utils/chunked-upload.js";
export { parseFaceEmojis, buildAttachmentSummary } from "./utils/text-parsing.js";
export { detectMimeFromBuffer, validateFileSize, downloadToBuffer, FILE_SIZE_LIMITS } from "./utils/file-utils.js";
export { computeFileHash, getCachedFileInfo, setCachedFileInfo, clearUploadCache } from "./utils/upload-cache.js";
export { sanitizeFileName, isLocalPath, extractBase64FromDataUrl } from "./utils/platform.js";
