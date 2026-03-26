/**
 * QQ Bot SDK
 * 独立的 QQ Bot 消息收发 SDK
 */
export { QQBotClient } from "./client.js";
export type { QQBotSDKOptions, MessageEvent, MessageAttachment, SendMessageResult, Logger, WSPayload, C2CMessageEvent, GroupMessageEvent, UploadMediaResponse, } from "./types.js";
export type { MessageHandler } from "./client.js";
export { getAccessToken, getGatewayUrl, sendC2CMessage, sendGroupMessage, sendProactiveC2CMessage, sendProactiveGroupMessage, clearTokenCache, uploadC2CMedia, uploadGroupMedia, sendC2CMediaMessage, sendGroupMediaMessage, sendC2CImageMessage, sendGroupImageMessage, sendC2CVoiceMessage, sendGroupVoiceMessage, sendC2CVideoMessage, sendGroupVideoMessage, sendC2CFileMessage, sendGroupFileMessage, } from "./api.js";
export { createGateway, type Gateway } from "./gateway.js";
export { MediaFileType } from "./types.js";
//# sourceMappingURL=index.d.ts.map