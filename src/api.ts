/**
 * QQ Bot API 封装
 * 处理 Token 获取、消息发送、富媒体上传
 */

import os from "node:os";
import type { SendMessageResult, Logger, MediaFileType, UploadMediaResponse } from "./types.js";
import { computeFileHash, getCachedFileInfo, setCachedFileInfo } from "./utils/upload-cache.js";
import { sanitizeFileName, extractBase64FromDataUrl } from "./utils/platform.js";

const API_BASE = "https://api.sgroup.qq.com";
const TOKEN_URL = "https://bots.qq.com/app/getAppAccessToken";

// ============ User-Agent ============
const PLUGIN_VERSION = "1.0.0";
const PLUGIN_USER_AGENT = `QQBotSDK/${PLUGIN_VERSION} (Node/${process.versions.node}; ${os.platform()})`;

// API 请求超时配置
const DEFAULT_API_TIMEOUT = 30000;

// ============ Token 管理 ============
interface TokenCache {
  token: string;
  expiresAt: number;
}

const tokenCacheMap = new Map<string, TokenCache>();
const tokenFetchPromises = new Map<string, Promise<string>>();

/**
 * 获取 AccessToken（带缓存 + singleflight 并发安全）
 */
export async function getAccessToken(
  appId: string,
  clientSecret: string,
  log?: Logger
): Promise<string> {
  const normalizedAppId = String(appId).trim();
  const cached = tokenCacheMap.get(normalizedAppId);

  // 检查缓存：未过期时复用（提前 5 分钟刷新）
  if (cached && Date.now() < cached.expiresAt - 5 * 60 * 1000) {
    return cached.token;
  }

  // Singleflight: 如果当前 appId 已有进行中的 Token 获取请求，复用它
  let fetchPromise = tokenFetchPromises.get(normalizedAppId);
  if (fetchPromise) {
    log?.debug?.(`[qqbot-api:${normalizedAppId}] Token fetch in progress, waiting...`);
    return fetchPromise;
  }

  // 创建新的 Token 获取 Promise
  fetchPromise = (async () => {
    try {
      return await doFetchToken(normalizedAppId, clientSecret, log);
    } finally {
      tokenFetchPromises.delete(normalizedAppId);
    }
  })();

  tokenFetchPromises.set(normalizedAppId, fetchPromise);
  return fetchPromise;
}

/**
 * 实际执行 Token 获取
 */
async function doFetchToken(
  appId: string,
  clientSecret: string,
  log?: Logger
): Promise<string> {
  log?.info(`[qqbot-api:${appId}] Fetching access token...`);

  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": PLUGIN_USER_AGENT,
      },
      body: JSON.stringify({ appId, clientSecret }),
    });
  } catch (err) {
    log?.error(`[qqbot-api:${appId}] Network error: ${err}`);
    throw new Error(`Network error getting access_token: ${err instanceof Error ? err.message : String(err)}`);
  }

  const traceId = response.headers.get("x-tps-trace-id") ?? "";
  log?.info(`[qqbot-api:${appId}] Token response: ${response.status} ${traceId ? `| TraceId: ${traceId}` : ""}`);

  let data: { access_token?: string; expires_in?: number };
  try {
    const rawBody = await response.text();
    data = JSON.parse(rawBody) as { access_token?: string; expires_in?: number };
  } catch (err) {
    throw new Error(`Failed to parse token response: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!data.access_token) {
    throw new Error(`Failed to get access_token: ${JSON.stringify(data)}`);
  }

  const expiresAt = Date.now() + (data.expires_in ?? 7200) * 1000;
  tokenCacheMap.set(appId, { token: data.access_token, expiresAt });

  log?.info(`[qqbot-api:${appId}] Token cached, expires at: ${new Date(expiresAt).toISOString()}`);
  return data.access_token;
}

/**
 * 清除 Token 缓存
 */
export function clearTokenCache(appId?: string): void {
  if (appId) {
    tokenCacheMap.delete(String(appId).trim());
  } else {
    tokenCacheMap.clear();
  }
}

/**
 * API 请求封装
 */
async function apiRequest<T = unknown>(
  accessToken: string,
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = DEFAULT_API_TIMEOUT,
  log?: Logger
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      Authorization: `QQBot ${accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": PLUGIN_USER_AGENT,
    };

    log?.debug?.(`[qqbot-api] >>> ${method} ${url}`);

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const traceId = res.headers.get("x-tps-trace-id") ?? "";
    log?.debug?.(`[qqbot-api] <<< ${res.status} ${traceId ? `| TraceId: ${traceId}` : ""}`);

    const rawBody = await res.text();

    if (!res.ok) {
      // HTML 响应 = 网关错误
      if (rawBody.trimStart().startsWith("<")) {
        throw new Error(`Gateway error ${res.status}, please retry later`);
      }
      try {
        const error = JSON.parse(rawBody) as { message?: string };
        throw new Error(`API Error: ${error.message ?? rawBody}`);
      } catch {
        throw new Error(`API Error ${res.status}: ${rawBody.slice(0, 200)}`);
      }
    }

    return JSON.parse(rawBody) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 获取 Gateway URL
 */
export async function getGatewayUrl(accessToken: string, log?: Logger): Promise<string> {
  const data = await apiRequest<{ url: string }>(accessToken, "GET", "/gateway", undefined, DEFAULT_API_TIMEOUT, log);
  return data.url;
}

// ============ 消息发送接口 ============

interface MessageResponse {
  id: string;
  timestamp: number | string;
}

/**
 * 发送 C2C 私聊消息
 */
export async function sendC2CMessage(
  accessToken: string,
  openid: string,
  content: string,
  msgId?: string,
  log?: Logger
): Promise<SendMessageResult> {
  try {
    const body: Record<string, unknown> = {
      content,
      msg_type: 0,
      msg_seq: getNextMsgSeq(msgId ?? ""),
    };
    if (msgId) body.msg_id = msgId;

    const res = await apiRequest<MessageResponse>(
      accessToken, "POST", `/v2/users/${openid}/messages`, body, DEFAULT_API_TIMEOUT, log
    );

    return {
      success: true,
      messageId: res.id,
      timestamp: String(res.timestamp),
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 发送群聊消息
 */
export async function sendGroupMessage(
  accessToken: string,
  groupOpenid: string,
  content: string,
  msgId?: string,
  log?: Logger
): Promise<SendMessageResult> {
  try {
    const body: Record<string, unknown> = {
      content,
      msg_type: 0,
      msg_seq: getNextMsgSeq(msgId ?? ""),
    };
    if (msgId) body.msg_id = msgId;

    const res = await apiRequest<MessageResponse>(
      accessToken, "POST", `/v2/groups/${groupOpenid}/messages`, body, DEFAULT_API_TIMEOUT, log
    );

    return {
      success: true,
      messageId: res.id,
      timestamp: String(res.timestamp),
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 发送主动消息（C2C，无需 msg_id）
 */
export async function sendProactiveC2CMessage(
  accessToken: string,
  openid: string,
  content: string,
  log?: Logger
): Promise<SendMessageResult> {
  try {
    const body = {
      content,
      msg_type: 0,
    };

    const res = await apiRequest<MessageResponse>(
      accessToken, "POST", `/v2/users/${openid}/messages`, body, DEFAULT_API_TIMEOUT, log
    );

    return {
      success: true,
      messageId: res.id,
      timestamp: String(res.timestamp),
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 发送主动消息（群聊，无需 msg_id）
 */
export async function sendProactiveGroupMessage(
  accessToken: string,
  groupOpenid: string,
  content: string,
  log?: Logger
): Promise<SendMessageResult> {
  try {
    const body = {
      content,
      msg_type: 0,
    };

    const res = await apiRequest<MessageResponse>(
      accessToken, "POST", `/v2/groups/${groupOpenid}/messages`, body, DEFAULT_API_TIMEOUT, log
    );

    return {
      success: true,
      messageId: res.id,
      timestamp: String(res.timestamp),
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============ 工具函数 ============

/**
 * 获取全局唯一的消息序号（范围 0 ~ 65535）
 */
function getNextMsgSeq(_msgId: string): number {
  const timePart = Date.now() % 100000000;
  const random = Math.floor(Math.random() * 65536);
  return (timePart ^ random) % 65536;
}

// ============ 富媒体消息支持 ============

const FILE_UPLOAD_TIMEOUT = 120000; // 文件上传 120 秒

interface MessageResponse {
  id: string;
  timestamp: number | string;
}

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
export async function uploadC2CMedia(
  accessToken: string,
  openid: string,
  fileType: MediaFileType,
  url?: string,
  fileData?: string,
  srvSendMsg = false,
  fileName?: string,
  log?: Logger,
): Promise<UploadMediaResponse> {
  if (!url && !fileData) throw new Error("uploadC2CMedia: url or fileData is required");

  // 检查缓存
  if (fileData) {
    const contentHash = computeFileHash(fileData);
    const cachedInfo = getCachedFileInfo(contentHash, "c2c", openid, fileType);
    if (cachedInfo) {
      return { file_uuid: "", file_info: cachedInfo, ttl: 0 };
    }
  }

  const body: Record<string, unknown> = { file_type: fileType, srv_send_msg: srvSendMsg };
  if (url) body.url = url;
  else if (fileData) body.file_data = fileData;
  if (fileType === 4 && fileName) body.file_name = sanitizeFileName(fileName);

  const result = await apiRequest<UploadMediaResponse>(
    accessToken, "POST", `/v2/users/${openid}/files`, body, FILE_UPLOAD_TIMEOUT, log
  );

  // 缓存结果
  if (fileData && result.file_info && result.ttl > 0) {
    const contentHash = computeFileHash(fileData);
    setCachedFileInfo(contentHash, "c2c", openid, fileType, result.file_info, result.file_uuid, result.ttl);
  }

  return result;
}

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
export async function uploadGroupMedia(
  accessToken: string,
  groupOpenid: string,
  fileType: MediaFileType,
  url?: string,
  fileData?: string,
  srvSendMsg = false,
  fileName?: string,
  log?: Logger,
): Promise<UploadMediaResponse> {
  if (!url && !fileData) throw new Error("uploadGroupMedia: url or fileData is required");

  // 检查缓存
  if (fileData) {
    const contentHash = computeFileHash(fileData);
    const cachedInfo = getCachedFileInfo(contentHash, "group", groupOpenid, fileType);
    if (cachedInfo) {
      return { file_uuid: "", file_info: cachedInfo, ttl: 0 };
    }
  }

  const body: Record<string, unknown> = { file_type: fileType, srv_send_msg: srvSendMsg };
  if (url) body.url = url;
  else if (fileData) body.file_data = fileData;
  if (fileType === 4 && fileName) body.file_name = sanitizeFileName(fileName);

  const result = await apiRequest<UploadMediaResponse>(
    accessToken, "POST", `/v2/groups/${groupOpenid}/files`, body, FILE_UPLOAD_TIMEOUT, log
  );

  // 缓存结果
  if (fileData && result.file_info && result.ttl > 0) {
    const contentHash = computeFileHash(fileData);
    setCachedFileInfo(contentHash, "group", groupOpenid, fileType, result.file_info, result.file_uuid, result.ttl);
  }

  return result;
}

/**
 * 发送 C2C 媒体消息
 */
export async function sendC2CMediaMessage(
  accessToken: string,
  openid: string,
  fileInfo: string,
  msgId?: string,
  content?: string,
  log?: Logger,
): Promise<SendMessageResult> {
  try {
    const msgSeq = msgId ? getNextMsgSeq(msgId) : 1;
    const body: Record<string, unknown> = {
      msg_type: 7,
      media: { file_info: fileInfo },
      msg_seq: msgSeq,
    };
    if (content) body.content = content;
    if (msgId) body.msg_id = msgId;

    const res = await apiRequest<MessageResponse>(
      accessToken, "POST", `/v2/users/${openid}/messages`, body, DEFAULT_API_TIMEOUT, log
    );

    return {
      success: true,
      messageId: res.id,
      timestamp: String(res.timestamp),
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 发送群聊媒体消息
 */
export async function sendGroupMediaMessage(
  accessToken: string,
  groupOpenid: string,
  fileInfo: string,
  msgId?: string,
  content?: string,
  log?: Logger,
): Promise<SendMessageResult> {
  try {
    const msgSeq = msgId ? getNextMsgSeq(msgId) : 1;
    const body: Record<string, unknown> = {
      msg_type: 7,
      media: { file_info: fileInfo },
      msg_seq: msgSeq,
    };
    if (content) body.content = content;
    if (msgId) body.msg_id = msgId;

    const res = await apiRequest<MessageResponse>(
      accessToken, "POST", `/v2/groups/${groupOpenid}/messages`, body, DEFAULT_API_TIMEOUT, log
    );

    return {
      success: true,
      messageId: res.id,
      timestamp: String(res.timestamp),
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 发送 C2C 图片消息
 * @param imageUrl - 图片 URL 或 Data URL (data:image/png;base64,...)
 * @param content -  accompanying text content (optional)
 */
export async function sendC2CImageMessage(
  accessToken: string,
  openid: string,
  imageUrl: string,
  msgId?: string,
  content?: string,
  log?: Logger,
): Promise<SendMessageResult> {
  try {
    let uploadResult: UploadMediaResponse;
    const base64Data = extractBase64FromDataUrl(imageUrl);

    if (base64Data) {
      // Base64 Data URL
      uploadResult = await uploadC2CMedia(accessToken, openid, 1, undefined, base64Data, false, undefined, log);
    } else {
      // 普通 URL
      uploadResult = await uploadC2CMedia(accessToken, openid, 1, imageUrl, undefined, false, undefined, log);
    }

    return sendC2CMediaMessage(accessToken, openid, uploadResult.file_info, msgId, content, log);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 发送群聊图片消息
 * @param imageUrl - 图片 URL 或 Data URL (data:image/png;base64,...)
 * @param content - accompanying text content (optional)
 */
export async function sendGroupImageMessage(
  accessToken: string,
  groupOpenid: string,
  imageUrl: string,
  msgId?: string,
  content?: string,
  log?: Logger,
): Promise<SendMessageResult> {
  try {
    let uploadResult: UploadMediaResponse;
    const base64Data = extractBase64FromDataUrl(imageUrl);

    if (base64Data) {
      uploadResult = await uploadGroupMedia(accessToken, groupOpenid, 1, undefined, base64Data, false, undefined, log);
    } else {
      uploadResult = await uploadGroupMedia(accessToken, groupOpenid, 1, imageUrl, undefined, false, undefined, log);
    }

    return sendGroupMediaMessage(accessToken, groupOpenid, uploadResult.file_info, msgId, content, log);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 发送 C2C 语音消息
 * @param voiceBase64 - 语音 Base64 数据（可选，与 voiceUrl 二选一）
 * @param voiceUrl - 语音 URL（可选，与 voiceBase64 二选一）
 */
export async function sendC2CVoiceMessage(
  accessToken: string,
  openid: string,
  voiceBase64?: string,
  voiceUrl?: string,
  msgId?: string,
  log?: Logger,
): Promise<SendMessageResult> {
  try {
    if (!voiceBase64 && !voiceUrl) {
      throw new Error("voiceBase64 or voiceUrl is required");
    }

    const uploadResult = await uploadC2CMedia(accessToken, openid, 3, voiceUrl, voiceBase64, false, undefined, log);
    return sendC2CMediaMessage(accessToken, openid, uploadResult.file_info, msgId, undefined, log);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 发送群聊语音消息
 * @param voiceBase64 - 语音 Base64 数据（可选，与 voiceUrl 二选一）
 * @param voiceUrl - 语音 URL（可选，与 voiceBase64 二选一）
 */
export async function sendGroupVoiceMessage(
  accessToken: string,
  groupOpenid: string,
  voiceBase64?: string,
  voiceUrl?: string,
  msgId?: string,
  log?: Logger,
): Promise<SendMessageResult> {
  try {
    if (!voiceBase64 && !voiceUrl) {
      throw new Error("voiceBase64 or voiceUrl is required");
    }

    const uploadResult = await uploadGroupMedia(accessToken, groupOpenid, 3, voiceUrl, voiceBase64, false, undefined, log);
    return sendGroupMediaMessage(accessToken, groupOpenid, uploadResult.file_info, msgId, undefined, log);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 发送 C2C 视频消息
 * @param videoUrl - 视频 URL（可选，与 videoBase64 二选一）
 * @param videoBase64 - 视频 Base64 数据（可选，与 videoUrl 二选一）
 * @param content - accompanying text content (optional)
 */
export async function sendC2CVideoMessage(
  accessToken: string,
  openid: string,
  videoUrl?: string,
  videoBase64?: string,
  msgId?: string,
  content?: string,
  log?: Logger,
): Promise<SendMessageResult> {
  try {
    if (!videoUrl && !videoBase64) {
      throw new Error("videoUrl or videoBase64 is required");
    }

    const uploadResult = await uploadC2CMedia(accessToken, openid, 2, videoUrl, videoBase64, false, undefined, log);
    return sendC2CMediaMessage(accessToken, openid, uploadResult.file_info, msgId, content, log);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 发送群聊视频消息
 * @param videoUrl - 视频 URL（可选，与 videoBase64 二选一）
 * @param videoBase64 - 视频 Base64 数据（可选，与 videoUrl 二选一）
 * @param content - accompanying text content (optional)
 */
export async function sendGroupVideoMessage(
  accessToken: string,
  groupOpenid: string,
  videoUrl?: string,
  videoBase64?: string,
  msgId?: string,
  content?: string,
  log?: Logger,
): Promise<SendMessageResult> {
  try {
    if (!videoUrl && !videoBase64) {
      throw new Error("videoUrl or videoBase64 is required");
    }

    const uploadResult = await uploadGroupMedia(accessToken, groupOpenid, 2, videoUrl, videoBase64, false, undefined, log);
    return sendGroupMediaMessage(accessToken, groupOpenid, uploadResult.file_info, msgId, content, log);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 发送 C2C 文件消息
 * @param fileBase64 - 文件 Base64 数据（可选，与 fileUrl 二选一）
 * @param fileUrl - 文件 URL（可选，与 fileBase64 二选一）
 * @param fileName - 文件名（发送文件时建议提供）
 */
export async function sendC2CFileMessage(
  accessToken: string,
  openid: string,
  fileBase64?: string,
  fileUrl?: string,
  msgId?: string,
  fileName?: string,
  log?: Logger,
): Promise<SendMessageResult> {
  try {
    if (!fileBase64 && !fileUrl) {
      throw new Error("fileBase64 or fileUrl is required");
    }

    const uploadResult = await uploadC2CMedia(accessToken, openid, 4, fileUrl, fileBase64, false, fileName, log);
    return sendC2CMediaMessage(accessToken, openid, uploadResult.file_info, msgId, undefined, log);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 发送群聊文件消息
 * @param fileBase64 - 文件 Base64 数据（可选，与 fileUrl 二选一）
 * @param fileUrl - 文件 URL（可选，与 fileBase64 二选一）
 * @param fileName - 文件名（发送文件时建议提供）
 */
export async function sendGroupFileMessage(
  accessToken: string,
  groupOpenid: string,
  fileBase64?: string,
  fileUrl?: string,
  msgId?: string,
  fileName?: string,
  log?: Logger,
): Promise<SendMessageResult> {
  try {
    if (!fileBase64 && !fileUrl) {
      throw new Error("fileBase64 or fileUrl is required");
    }

    const uploadResult = await uploadGroupMedia(accessToken, groupOpenid, 4, fileUrl, fileBase64, false, fileName, log);
    return sendGroupMediaMessage(accessToken, groupOpenid, uploadResult.file_info, msgId, undefined, log);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
