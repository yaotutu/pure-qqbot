/**
 * QQ Bot SDK
 * 独立的 QQ Bot 消息收发 SDK
 */
// 主要类
export { QQBotClient } from "./client.js";
// 如果需要直接使用底层 API
export { getAccessToken, getGatewayUrl, sendC2CMessage, sendGroupMessage, sendProactiveC2CMessage, sendProactiveGroupMessage, clearTokenCache, 
// 富媒体消息
uploadC2CMedia, uploadGroupMedia, sendC2CMediaMessage, sendGroupMediaMessage, sendC2CImageMessage, sendGroupImageMessage, sendC2CVoiceMessage, sendGroupVoiceMessage, sendC2CVideoMessage, sendGroupVideoMessage, sendC2CFileMessage, sendGroupFileMessage, } from "./api.js";
export { createGateway } from "./gateway.js";
// 媒体类型
export { MediaFileType } from "./types.js";
//# sourceMappingURL=index.js.map