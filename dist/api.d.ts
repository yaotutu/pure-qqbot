/**
 * QQ Bot API 封装
 * 处理 Token 获取、消息发送、富媒体上传
 */
import type { SendMessageResult, Logger, MediaFileType, UploadMediaResponse } from "./types.js";
/**
 * 获取 AccessToken（带缓存 + singleflight 并发安全）
 */
export declare function getAccessToken(appId: string, clientSecret: string, log?: Logger): Promise<string>;
/**
 * 清除 Token 缓存
 */
export declare function clearTokenCache(appId?: string): void;
/**
 * 获取 Gateway URL
 */
export declare function getGatewayUrl(accessToken: string, log?: Logger): Promise<string>;
/**
 * 发送 C2C 私聊消息
 */
export declare function sendC2CMessage(accessToken: string, openid: string, content: string, msgId?: string, log?: Logger): Promise<SendMessageResult>;
/**
 * 发送群聊消息
 */
export declare function sendGroupMessage(accessToken: string, groupOpenid: string, content: string, msgId?: string, log?: Logger): Promise<SendMessageResult>;
/**
 * 发送主动消息（C2C，无需 msg_id）
 */
export declare function sendProactiveC2CMessage(accessToken: string, openid: string, content: string, log?: Logger): Promise<SendMessageResult>;
/**
 * 发送主动消息（群聊，无需 msg_id）
 */
export declare function sendProactiveGroupMessage(accessToken: string, groupOpenid: string, content: string, log?: Logger): Promise<SendMessageResult>;
/**
 * 上传 C2C 私聊媒体文件
 * @param accessToken - 访问令牌
 * @param openid - 用户 OpenID
 * @param fileType - 文件类型 (1=图片, 2=视频, 3=语音, 4=文件)
 * @param url - 文件 URL（可选，与 fileData 二选一）
 * @param fileData - 文件 Base64 数据（可选，与 url 二选一）
 * @param srvSendMsg - 是否由服务端发送消息（默认 false）
 * @param fileName - 文件名（发送文件时必填）
 */
export declare function uploadC2CMedia(accessToken: string, openid: string, fileType: MediaFileType, url?: string, fileData?: string, srvSendMsg?: boolean, fileName?: string, log?: Logger): Promise<UploadMediaResponse>;
/**
 * 上传群聊媒体文件
 * @param accessToken - 访问令牌
 * @param groupOpenid - 群 OpenID
 * @param fileType - 文件类型 (1=图片, 2=视频, 3=语音, 4=文件)
 * @param url - 文件 URL（可选，与 fileData 二选一）
 * @param fileData - 文件 Base64 数据（可选，与 url 二选一）
 * @param srvSendMsg - 是否由服务端发送消息（默认 false）
 * @param fileName - 文件名（发送文件时必填）
 */
export declare function uploadGroupMedia(accessToken: string, groupOpenid: string, fileType: MediaFileType, url?: string, fileData?: string, srvSendMsg?: boolean, fileName?: string, log?: Logger): Promise<UploadMediaResponse>;
/**
 * 发送 C2C 媒体消息
 */
export declare function sendC2CMediaMessage(accessToken: string, openid: string, fileInfo: string, msgId?: string, content?: string, log?: Logger): Promise<SendMessageResult>;
/**
 * 发送群聊媒体消息
 */
export declare function sendGroupMediaMessage(accessToken: string, groupOpenid: string, fileInfo: string, msgId?: string, content?: string, log?: Logger): Promise<SendMessageResult>;
/**
 * 发送 C2C 图片消息
 * @param imageUrl - 图片 URL 或 Data URL (data:image/png;base64,...)
 * @param content -  accompanying text content (optional)
 */
export declare function sendC2CImageMessage(accessToken: string, openid: string, imageUrl: string, msgId?: string, content?: string, log?: Logger): Promise<SendMessageResult>;
/**
 * 发送群聊图片消息
 * @param imageUrl - 图片 URL 或 Data URL (data:image/png;base64,...)
 * @param content - accompanying text content (optional)
 */
export declare function sendGroupImageMessage(accessToken: string, groupOpenid: string, imageUrl: string, msgId?: string, content?: string, log?: Logger): Promise<SendMessageResult>;
/**
 * 发送 C2C 语音消息
 * @param voiceBase64 - 语音 Base64 数据（可选，与 voiceUrl 二选一）
 * @param voiceUrl - 语音 URL（可选，与 voiceBase64 二选一）
 */
export declare function sendC2CVoiceMessage(accessToken: string, openid: string, voiceBase64?: string, voiceUrl?: string, msgId?: string, log?: Logger): Promise<SendMessageResult>;
/**
 * 发送群聊语音消息
 * @param voiceBase64 - 语音 Base64 数据（可选，与 voiceUrl 二选一）
 * @param voiceUrl - 语音 URL（可选，与 voiceBase64 二选一）
 */
export declare function sendGroupVoiceMessage(accessToken: string, groupOpenid: string, voiceBase64?: string, voiceUrl?: string, msgId?: string, log?: Logger): Promise<SendMessageResult>;
/**
 * 发送 C2C 视频消息
 * @param videoUrl - 视频 URL（可选，与 videoBase64 二选一）
 * @param videoBase64 - 视频 Base64 数据（可选，与 videoUrl 二选一）
 * @param content - accompanying text content (optional)
 */
export declare function sendC2CVideoMessage(accessToken: string, openid: string, videoUrl?: string, videoBase64?: string, msgId?: string, content?: string, log?: Logger): Promise<SendMessageResult>;
/**
 * 发送群聊视频消息
 * @param videoUrl - 视频 URL（可选，与 videoBase64 二选一）
 * @param videoBase64 - 视频 Base64 数据（可选，与 videoUrl 二选一）
 * @param content - accompanying text content (optional)
 */
export declare function sendGroupVideoMessage(accessToken: string, groupOpenid: string, videoUrl?: string, videoBase64?: string, msgId?: string, content?: string, log?: Logger): Promise<SendMessageResult>;
/**
 * 发送 C2C 文件消息
 * @param fileBase64 - 文件 Base64 数据（可选，与 fileUrl 二选一）
 * @param fileUrl - 文件 URL（可选，与 fileBase64 二选一）
 * @param fileName - 文件名（发送文件时建议提供）
 */
export declare function sendC2CFileMessage(accessToken: string, openid: string, fileBase64?: string, fileUrl?: string, msgId?: string, fileName?: string, log?: Logger): Promise<SendMessageResult>;
/**
 * 发送群聊文件消息
 * @param fileBase64 - 文件 Base64 数据（可选，与 fileUrl 二选一）
 * @param fileUrl - 文件 URL（可选，与 fileBase64 二选一）
 * @param fileName - 文件名（发送文件时建议提供）
 */
export declare function sendGroupFileMessage(accessToken: string, groupOpenid: string, fileBase64?: string, fileUrl?: string, msgId?: string, fileName?: string, log?: Logger): Promise<SendMessageResult>;
//# sourceMappingURL=api.d.ts.map