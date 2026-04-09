/**
 * QQ Bot API 封装
 * Token 管理、消息发送、富媒体上传、分块上传、流式消息、Inline Keyboard
 */

import os from "node:os";
import type {
  SendMessageResult,
  SendMessageOptions,
  Logger,
  MediaFileType,
  UploadMediaResponse,
  UploadPrepareResponse,
  UploadPart,
  InlineKeyboard,
  StreamMessageRequest,
  TokenStatus,
} from "./types.js";
import { MSG_TYPE_TEXT, MSG_TYPE_MARKDOWN, MSG_TYPE_INLINE_KEYBOARD, MSG_TYPE_MEDIA, MSG_TYPE_INPUT_NOTIFY } from "./types.js";
import { computeFileHash, getCachedFileInfo, setCachedFileInfo } from "./utils/upload-cache.js";
import { sanitizeFileName, extractBase64FromDataUrl } from "./utils/platform.js";

// ============ 常量 ============

const API_BASE = "https://api.sgroup.qq.com";
const TOKEN_URL = "https://bots.qq.com/app/getAppAccessToken";
const PLUGIN_VERSION = "1.0.0";
const PLUGIN_USER_AGENT = `QQBotSDK/${PLUGIN_VERSION} (Node/${process.versions.node}; ${os.platform()})`;
const DEFAULT_API_TIMEOUT = 30000;
const FILE_UPLOAD_TIMEOUT = 120000;

// ============ 模块级配置 ============

let moduleLogger: Logger | undefined;
let markdownSupport = false;

export function setApiLogger(logger: Logger | undefined): void {
  moduleLogger = logger;
}

export function initApiConfig(options: { markdownSupport?: boolean }): void {
  markdownSupport = options.markdownSupport ?? false;
}

export function isMarkdownSupport(): boolean {
  return markdownSupport;
}

// ============ ApiError ============

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly bizCode?: string,
    public readonly bizMessage?: string,
    public readonly traceId?: string,
  ) {
    super(`API Error ${status}: ${bizMessage ?? bizCode ?? "unknown"}`);
    this.name = "ApiError";
  }
}

// ============ Token 管理 ============

interface TokenCache {
  token: string;
  expiresAt: number;
}

const tokenCacheMap = new Map<string, TokenCache>();
const tokenFetchPromises = new Map<string, Promise<string>>();

let refreshAbortController: AbortController | null = null;

function getRefreshBuffer(expiresAt: number): number {
  const remainingMs = expiresAt - Date.now();
  return Math.min(5 * 60 * 1000, Math.floor(remainingMs / 3));
}

/**
 * 获取 AccessToken（带缓存 + singleflight）
 */
export async function getAccessToken(
  appId: string,
  clientSecret: string,
  log?: Logger,
): Promise<string> {
  const effectiveLog = log ?? moduleLogger;
  const normalizedAppId = String(appId).trim();
  const cached = tokenCacheMap.get(normalizedAppId);

  if (cached && Date.now() < cached.expiresAt - getRefreshBuffer(cached.expiresAt)) {
    return cached.token;
  }

  let fetchPromise = tokenFetchPromises.get(normalizedAppId);
  if (fetchPromise) {
    effectiveLog?.debug?.(`[qqbot-api:${normalizedAppId}] Token fetch in progress, waiting...`);
    return fetchPromise;
  }

  fetchPromise = (async () => {
    try {
      return await doFetchToken(normalizedAppId, clientSecret, effectiveLog);
    } finally {
      tokenFetchPromises.delete(normalizedAppId);
    }
  })();

  tokenFetchPromises.set(normalizedAppId, fetchPromise);
  return fetchPromise;
}

async function doFetchToken(
  appId: string,
  clientSecret: string,
  log?: Logger,
): Promise<string> {
  log?.info(`[qqbot-api:${appId}] Fetching access token...`);

  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": PLUGIN_USER_AGENT },
      body: JSON.stringify({ appId, clientSecret }),
    });
  } catch (err) {
    throw new Error(`Network error getting access_token: ${err instanceof Error ? err.message : String(err)}`);
  }

  const traceId = response.headers.get("x-tps-trace-id") ?? "";
  log?.info(`[qqbot-api:${appId}] Token response: ${response.status} ${traceId ? `| TraceId: ${traceId}` : ""}`);

  let data: { access_token?: string; expires_in?: number };
  try {
    data = JSON.parse(await response.text()) as { access_token?: string; expires_in?: number };
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
 * 获取 Token 状态
 */
export function getTokenStatus(appId: string): TokenStatus {
  const cached = tokenCacheMap.get(String(appId).trim());
  if (!cached) return "none";
  if (tokenFetchPromises.has(String(appId).trim())) return "refreshing";
  if (cached.expiresAt - Date.now() <= 0) return "expired";
  if (Date.now() >= cached.expiresAt - getRefreshBuffer(cached.expiresAt)) return "expired";
  return "valid";
}

/**
 * 启动后台 Token 刷新
 */
export function startBackgroundTokenRefresh(
  appId: string,
  clientSecret: string,
  log?: Logger,
): void {
  stopBackgroundTokenRefresh();
  const controller = new AbortController();
  refreshAbortController = controller;

  const run = async () => {
    while (!controller.signal.aborted) {
      const cached = tokenCacheMap.get(String(appId).trim());
      if (!cached) {
        // 首次没有缓存，立即获取一次
        try {
          await getAccessToken(appId, clientSecret, log);
        } catch (err) {
          log?.error(`[qqbot-api] Background token fetch failed: ${err}`);
          await new Promise<void>(r => {
            const timer = setTimeout(r, 5000);
            controller.signal.addEventListener("abort", () => { clearTimeout(timer); r(); }, { once: true });
          });
        }
        continue;
      }
      const remainingMs = cached.expiresAt - Date.now();
      const waitMs = Math.max(1000, remainingMs - getRefreshBuffer(cached.expiresAt));

      await new Promise<void>(r => {
        const timer = setTimeout(r, waitMs);
        controller.signal.addEventListener("abort", () => { clearTimeout(timer); r(); }, { once: true });
      });

      if (controller.signal.aborted) break;

      try {
        await getAccessToken(appId, clientSecret, log);
      } catch (err) {
        log?.error(`[qqbot-api] Background token refresh failed: ${err}`);
      }
    }
  };

  run();
}

/**
 * 停止后台 Token 刷新
 */
export function stopBackgroundTokenRefresh(): void {
  refreshAbortController?.abort();
  refreshAbortController = null;
}

// ============ 底层请求 ============

interface MessageResponse {
  id: string;
  timestamp: number | string;
}

function maskToken(token: string): string {
  if (token.length <= 8) return "***";
  return token.slice(0, 4) + "***" + token.slice(-4);
}

async function apiRequest<T = unknown>(
  accessToken: string,
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = DEFAULT_API_TIMEOUT,
  log?: Logger,
): Promise<T> {
  const effectiveLog = log ?? moduleLogger;
  const url = `${API_BASE}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      Authorization: `QQBot ${accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": PLUGIN_USER_AGENT,
    };

    effectiveLog?.debug?.(`[qqbot-api] >>> ${method} ${url} (token: ${maskToken(accessToken)})`);

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const traceId = res.headers.get("x-tps-trace-id") ?? "";
    effectiveLog?.debug?.(`[qqbot-api] <<< ${res.status} ${traceId ? `| TraceId: ${traceId}` : ""}`);

    const rawBody = await res.text();

    if (!res.ok) {
      if (rawBody.trimStart().startsWith("<")) {
        throw new ApiError(res.status, undefined, "Gateway error", traceId);
      }
      try {
        const err = JSON.parse(rawBody) as { code?: string; message?: string };
        throw new ApiError(res.status, err.code, err.message, traceId);
      } catch (e) {
        if (e instanceof ApiError) throw e;
        throw new ApiError(res.status, undefined, rawBody.slice(0, 200), traceId);
      }
    }

    return JSON.parse(rawBody) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 带重试的 API 请求
 */
async function apiRequestWithRetry<T = unknown>(
  accessToken: string,
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = DEFAULT_API_TIMEOUT,
  log?: Logger,
  maxRetries = 2,
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await apiRequest<T>(accessToken, method, path, body, timeoutMs, log);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries && isRetryableError(err)) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        log?.debug?.(`[qqbot-api] Retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof ApiError) return err.status >= 500 || err.status === 429;
  return true;
}

function getNextMsgSeq(_msgId: string): number {
  const timePart = Date.now() % 100000000;
  const random = Math.floor(Math.random() * 65536);
  return (timePart ^ random) % 65536;
}

function buildResult(res: MessageResponse): SendMessageResult {
  return { success: true, messageId: res.id, timestamp: String(res.timestamp) };
}

function buildErrorResult(err: unknown): SendMessageResult {
  return { success: false, error: err instanceof Error ? err.message : String(err) };
}

// ============ Gateway URL ============

export async function getGatewayUrl(accessToken: string, log?: Logger): Promise<string> {
  const data = await apiRequest<{ url: string }>(accessToken, "GET", "/gateway", undefined, DEFAULT_API_TIMEOUT, log);
  return data.url;
}

// ============ 消息发送 ============

/**
 * 发送 C2C 私聊消息
 */
export async function sendC2CMessage(
  accessToken: string,
  openid: string,
  content: string,
  msgId?: string,
  log?: Logger,
  options?: SendMessageOptions,
): Promise<SendMessageResult> {
  try {
    const msgType = markdownSupport ? MSG_TYPE_MARKDOWN : MSG_TYPE_TEXT;
    const body: Record<string, unknown> = {
      content,
      msg_type: msgType,
      msg_seq: getNextMsgSeq(msgId ?? ""),
    };
    if (msgId) body.msg_id = msgId;
    if (options?.message_reference) body.message_reference = options.message_reference;

    if (markdownSupport) {
      body.markdown = { content };
      delete body.content;
    }

    const res = await apiRequest<MessageResponse>(
      accessToken, "POST", `/v2/users/${openid}/messages`, body, DEFAULT_API_TIMEOUT, log,
    );
    return buildResult(res);
  } catch (err) {
    return buildErrorResult(err);
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
  log?: Logger,
  options?: SendMessageOptions,
): Promise<SendMessageResult> {
  try {
    const msgType = markdownSupport ? MSG_TYPE_MARKDOWN : MSG_TYPE_TEXT;
    const body: Record<string, unknown> = {
      content,
      msg_type: msgType,
      msg_seq: getNextMsgSeq(msgId ?? ""),
    };
    if (msgId) body.msg_id = msgId;
    if (options?.message_reference) body.message_reference = options.message_reference;

    if (markdownSupport) {
      body.markdown = { content };
      delete body.content;
    }

    const res = await apiRequest<MessageResponse>(
      accessToken, "POST", `/v2/groups/${groupOpenid}/messages`, body, DEFAULT_API_TIMEOUT, log,
    );
    return buildResult(res);
  } catch (err) {
    return buildErrorResult(err);
  }
}

/**
 * 发送主动 C2C 消息
 */
export async function sendProactiveC2CMessage(
  accessToken: string,
  openid: string,
  content: string,
  log?: Logger,
): Promise<SendMessageResult> {
  try {
    const body = { content, msg_type: MSG_TYPE_TEXT };
    const res = await apiRequest<MessageResponse>(
      accessToken, "POST", `/v2/users/${openid}/messages`, body, DEFAULT_API_TIMEOUT, log,
    );
    return buildResult(res);
  } catch (err) {
    return buildErrorResult(err);
  }
}

/**
 * 发送主动群聊消息
 */
export async function sendProactiveGroupMessage(
  accessToken: string,
  groupOpenid: string,
  content: string,
  log?: Logger,
): Promise<SendMessageResult> {
  try {
    const body = { content, msg_type: MSG_TYPE_TEXT };
    const res = await apiRequest<MessageResponse>(
      accessToken, "POST", `/v2/groups/${groupOpenid}/messages`, body, DEFAULT_API_TIMEOUT, log,
    );
    return buildResult(res);
  } catch (err) {
    return buildErrorResult(err);
  }
}

/**
 * 发送带 Inline Keyboard 的 C2C 消息
 */
export async function sendC2CMessageWithInlineKeyboard(
  accessToken: string,
  openid: string,
  content: string,
  keyboard: InlineKeyboard,
  msgId?: string,
  log?: Logger,
): Promise<SendMessageResult> {
  try {
    const body: Record<string, unknown> = {
      content,
      msg_type: MSG_TYPE_TEXT,
      keyboard,
      msg_seq: getNextMsgSeq(msgId ?? ""),
    };
    if (msgId) body.msg_id = msgId;

    const res = await apiRequest<MessageResponse>(
      accessToken, "POST", `/v2/users/${openid}/messages`, body, DEFAULT_API_TIMEOUT, log,
    );
    return buildResult(res);
  } catch (err) {
    return buildErrorResult(err);
  }
}

/**
 * 发送带 Inline Keyboard 的群聊消息
 */
export async function sendGroupMessageWithInlineKeyboard(
  accessToken: string,
  groupOpenid: string,
  content: string,
  keyboard: InlineKeyboard,
  msgId?: string,
  log?: Logger,
): Promise<SendMessageResult> {
  try {
    const body: Record<string, unknown> = {
      content,
      msg_type: MSG_TYPE_TEXT,
      keyboard,
      msg_seq: getNextMsgSeq(msgId ?? ""),
    };
    if (msgId) body.msg_id = msgId;

    const res = await apiRequest<MessageResponse>(
      accessToken, "POST", `/v2/groups/${groupOpenid}/messages`, body, DEFAULT_API_TIMEOUT, log,
    );
    return buildResult(res);
  } catch (err) {
    return buildErrorResult(err);
  }
}

/**
 * 发送 Markdown 消息（C2C）
 */
export async function sendC2CMarkdownMessage(
  accessToken: string,
  openid: string,
  content: string,
  msgId?: string,
  log?: Logger,
): Promise<SendMessageResult> {
  try {
    const body: Record<string, unknown> = {
      msg_type: MSG_TYPE_MARKDOWN,
      markdown: { content },
      msg_seq: getNextMsgSeq(msgId ?? ""),
    };
    if (msgId) body.msg_id = msgId;

    const res = await apiRequest<MessageResponse>(
      accessToken, "POST", `/v2/users/${openid}/messages`, body, DEFAULT_API_TIMEOUT, log,
    );
    return buildResult(res);
  } catch (err) {
    return buildErrorResult(err);
  }
}

// ============ 流式消息 ============

/**
 * 发送 C2C 流式消息（打字机效果）
 */
export async function sendC2CStreamMessage(
  accessToken: string,
  openid: string,
  request: StreamMessageRequest,
  log?: Logger,
): Promise<SendMessageResult> {
  try {
    const body: Record<string, unknown> = {
      input_mode: request.input_mode,
      input_state: request.input_state,
      content_type: request.content_type,
      content_raw: request.content_raw,
      event_id: request.event_id,
      msg_id: request.msg_id,
      msg_seq: request.msg_seq,
      index: request.index,
    };
    if (request.stream_msg_id) {
      body.stream_msg_id = request.stream_msg_id;
    }

    const res = await apiRequest<MessageResponse & { stream_msg_id?: string }>(
      accessToken, "POST", `/v2/users/${openid}/stream_messages`, body, DEFAULT_API_TIMEOUT, log,
    );
    const result = buildResult(res);
    // 上游从响应的 id 字段获取 stream_msg_id
    result.streamMsgId = res.stream_msg_id ?? res.id;
    return result;
  } catch (err) {
    return buildErrorResult(err);
  }
}

// ============ 交互确认 ============

/**
 * 确认交互事件（按钮点击后必须调用）
 */
export async function acknowledgeInteraction(
  accessToken: string,
  interactionId: string,
  code = 0,
  log?: Logger,
): Promise<void> {
  await apiRequest(accessToken, "PUT", `/interactions/${interactionId}`, { code }, DEFAULT_API_TIMEOUT, log);
}

// ============ 输入状态 ============

/**
 * 发送 C2C 输入状态通知（"正在输入"）
 */
export async function sendC2CInputNotify(
  accessToken: string,
  openid: string,
  msgId?: string,
  inputSecond = 60,
  log?: Logger,
): Promise<void> {
  const body: Record<string, unknown> = {
    msg_type: MSG_TYPE_INPUT_NOTIFY,
    input_notify: {
      input_type: 1,
      input_second: inputSecond,
    },
    msg_seq: msgId ? getNextMsgSeq(msgId) : 1,
  };
  if (msgId) body.msg_id = msgId;

  await apiRequest(
    accessToken, "POST", `/v2/users/${openid}/messages`, body, DEFAULT_API_TIMEOUT, log,
  );
}

// ============ 频道消息 ============

/**
 * 发送频道消息
 */
export async function sendChannelMessage(
  accessToken: string,
  channelId: string,
  content: string,
  msgId?: string,
  log?: Logger,
): Promise<SendMessageResult> {
  try {
    const body: Record<string, unknown> = { content, msg_type: MSG_TYPE_TEXT };
    if (msgId) body.msg_id = msgId;

    const res = await apiRequest<MessageResponse>(
      accessToken, "POST", `/channels/${channelId}/messages`, body, DEFAULT_API_TIMEOUT, log,
    );
    return buildResult(res);
  } catch (err) {
    return buildErrorResult(err);
  }
}

/**
 * 发送频道私信
 */
export async function sendDmMessage(
  accessToken: string,
  guildId: string,
  content: string,
  msgId?: string,
  log?: Logger,
): Promise<SendMessageResult> {
  try {
    const body: Record<string, unknown> = { content, msg_type: MSG_TYPE_TEXT };
    if (msgId) body.msg_id = msgId;

    const res = await apiRequest<MessageResponse>(
      accessToken, "POST", `/dms/${guildId}/messages`, body, DEFAULT_API_TIMEOUT, log,
    );
    return buildResult(res);
  } catch (err) {
    return buildErrorResult(err);
  }
}

// ============ 富媒体上传 ============

/**
 * 上传 C2C 私聊媒体文件
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

  if (fileData) {
    const contentHash = computeFileHash(fileData);
    const cachedInfo = getCachedFileInfo(contentHash, "c2c", openid, fileType);
    if (cachedInfo) return { file_uuid: "", file_info: cachedInfo, ttl: 0 };
  }

  const body: Record<string, unknown> = { file_type: fileType, srv_send_msg: srvSendMsg };
  if (url) body.url = url;
  else if (fileData) body.file_data = fileData;
  if (fileType === 4 && fileName) body.file_name = sanitizeFileName(fileName);

  const result = await apiRequestWithRetry<UploadMediaResponse>(
    accessToken, "POST", `/v2/users/${openid}/files`, body, FILE_UPLOAD_TIMEOUT, log,
  );

  if (fileData && result.file_info && result.ttl > 0) {
    const contentHash = computeFileHash(fileData);
    setCachedFileInfo(contentHash, "c2c", openid, fileType, result.file_info, result.file_uuid, result.ttl);
  }

  return result;
}

/**
 * 上传群聊媒体文件
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

  if (fileData) {
    const contentHash = computeFileHash(fileData);
    const cachedInfo = getCachedFileInfo(contentHash, "group", groupOpenid, fileType);
    if (cachedInfo) return { file_uuid: "", file_info: cachedInfo, ttl: 0 };
  }

  const body: Record<string, unknown> = { file_type: fileType, srv_send_msg: srvSendMsg };
  if (url) body.url = url;
  else if (fileData) body.file_data = fileData;
  if (fileType === 4 && fileName) body.file_name = sanitizeFileName(fileName);

  const result = await apiRequestWithRetry<UploadMediaResponse>(
    accessToken, "POST", `/v2/groups/${groupOpenid}/files`, body, FILE_UPLOAD_TIMEOUT, log,
  );

  if (fileData && result.file_info && result.ttl > 0) {
    const contentHash = computeFileHash(fileData);
    setCachedFileInfo(contentHash, "group", groupOpenid, fileType, result.file_info, result.file_uuid, result.ttl);
  }

  return result;
}

// ============ 媒体消息发送 ============

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
    const body: Record<string, unknown> = {
      msg_type: MSG_TYPE_MEDIA,
      media: { file_info: fileInfo },
      msg_seq: msgId ? getNextMsgSeq(msgId) : 1,
    };
    if (content) body.content = content;
    if (msgId) body.msg_id = msgId;

    const res = await apiRequest<MessageResponse>(
      accessToken, "POST", `/v2/users/${openid}/messages`, body, DEFAULT_API_TIMEOUT, log,
    );
    return buildResult(res);
  } catch (err) {
    return buildErrorResult(err);
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
    const body: Record<string, unknown> = {
      msg_type: MSG_TYPE_MEDIA,
      media: { file_info: fileInfo },
      msg_seq: msgId ? getNextMsgSeq(msgId) : 1,
    };
    if (content) body.content = content;
    if (msgId) body.msg_id = msgId;

    const res = await apiRequest<MessageResponse>(
      accessToken, "POST", `/v2/groups/${groupOpenid}/messages`, body, DEFAULT_API_TIMEOUT, log,
    );
    return buildResult(res);
  } catch (err) {
    return buildErrorResult(err);
  }
}

// ============ 便捷媒体发送函数 ============

/**
 * 发送 C2C 图片
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
    const base64 = extractBase64FromDataUrl(imageUrl);
    const upload = base64
      ? await uploadC2CMedia(accessToken, openid, 1, undefined, base64, false, undefined, log)
      : await uploadC2CMedia(accessToken, openid, 1, imageUrl, undefined, false, undefined, log);
    return sendC2CMediaMessage(accessToken, openid, upload.file_info, msgId, content, log);
  } catch (err) {
    return buildErrorResult(err);
  }
}

/**
 * 发送群聊图片
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
    const base64 = extractBase64FromDataUrl(imageUrl);
    const upload = base64
      ? await uploadGroupMedia(accessToken, groupOpenid, 1, undefined, base64, false, undefined, log)
      : await uploadGroupMedia(accessToken, groupOpenid, 1, imageUrl, undefined, false, undefined, log);
    return sendGroupMediaMessage(accessToken, groupOpenid, upload.file_info, msgId, content, log);
  } catch (err) {
    return buildErrorResult(err);
  }
}

/**
 * 发送 C2C 语音
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
    if (!voiceBase64 && !voiceUrl) throw new Error("voiceBase64 or voiceUrl is required");
    const upload = await uploadC2CMedia(accessToken, openid, 3, voiceUrl, voiceBase64, false, undefined, log);
    return sendC2CMediaMessage(accessToken, openid, upload.file_info, msgId, undefined, log);
  } catch (err) {
    return buildErrorResult(err);
  }
}

/**
 * 发送群聊语音
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
    if (!voiceBase64 && !voiceUrl) throw new Error("voiceBase64 or voiceUrl is required");
    const upload = await uploadGroupMedia(accessToken, groupOpenid, 3, voiceUrl, voiceBase64, false, undefined, log);
    return sendGroupMediaMessage(accessToken, groupOpenid, upload.file_info, msgId, undefined, log);
  } catch (err) {
    return buildErrorResult(err);
  }
}

/**
 * 发送 C2C 视频
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
    if (!videoUrl && !videoBase64) throw new Error("videoUrl or videoBase64 is required");
    const upload = await uploadC2CMedia(accessToken, openid, 2, videoUrl, videoBase64, false, undefined, log);
    return sendC2CMediaMessage(accessToken, openid, upload.file_info, msgId, content, log);
  } catch (err) {
    return buildErrorResult(err);
  }
}

/**
 * 发送群聊视频
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
    if (!videoUrl && !videoBase64) throw new Error("videoUrl or videoBase64 is required");
    const upload = await uploadGroupMedia(accessToken, groupOpenid, 2, videoUrl, videoBase64, false, undefined, log);
    return sendGroupMediaMessage(accessToken, groupOpenid, upload.file_info, msgId, content, log);
  } catch (err) {
    return buildErrorResult(err);
  }
}

/**
 * 发送 C2C 文件
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
    if (!fileBase64 && !fileUrl) throw new Error("fileBase64 or fileUrl is required");
    const upload = await uploadC2CMedia(accessToken, openid, 4, fileUrl, fileBase64, false, fileName, log);
    return sendC2CMediaMessage(accessToken, openid, upload.file_info, msgId, undefined, log);
  } catch (err) {
    return buildErrorResult(err);
  }
}

/**
 * 发送群聊文件
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
    if (!fileBase64 && !fileUrl) throw new Error("fileBase64 or fileUrl is required");
    const upload = await uploadGroupMedia(accessToken, groupOpenid, 4, fileUrl, fileBase64, false, fileName, log);
    return sendGroupMediaMessage(accessToken, groupOpenid, upload.file_info, msgId, undefined, log);
  } catch (err) {
    return buildErrorResult(err);
  }
}

// ============ 分块上传 API ============

/**
 * C2C 分块上传 - 准备
 */
export async function c2cUploadPrepare(
  accessToken: string,
  openid: string,
  fileType: MediaFileType,
  fileSize: number,
  fileName: string,
  fileHash: string,
  log?: Logger,
): Promise<UploadPrepareResponse> {
  return apiRequest<UploadPrepareResponse>(
    accessToken, "POST", `/v2/users/${openid}/files/upload-prepare`,
    { file_type: fileType, file_size: fileSize, file_name: fileName, file_hash: fileHash },
    DEFAULT_API_TIMEOUT, log,
  );
}

/**
 * C2C 分块上传 - 上传分片
 */
export async function c2cUploadPart(
  accessToken: string,
  openid: string,
  fileUuid: string,
  partNumber: number,
  partData: Buffer,
  log?: Logger,
): Promise<string> {
  // 使用内部接口上传分片数据
  const res = await apiRequest<{ etag?: string }>(
    accessToken, "POST", `/v2/users/${openid}/files/upload-part`,
    { file_uuid: fileUuid, part_number: partNumber, part_data: partData.toString("base64") },
    FILE_UPLOAD_TIMEOUT, log,
  );
  return res.etag ?? "";
}

/**
 * C2C 分块上传 - 分片完成确认
 */
export async function c2cUploadPartFinish(
  accessToken: string,
  openid: string,
  fileUuid: string,
  partNumber: number,
  etag: string,
  log?: Logger,
): Promise<void> {
  await apiRequest(
    accessToken, "POST", `/v2/users/${openid}/files/upload-part-finish`,
    { file_uuid: fileUuid, part_number: partNumber, etag },
    DEFAULT_API_TIMEOUT, log,
  );
}

/**
 * C2C 分块上传 - 完成上传
 */
export async function c2cCompleteUpload(
  accessToken: string,
  openid: string,
  fileUuid: string,
  parts: UploadPart[],
  log?: Logger,
): Promise<UploadMediaResponse> {
  return apiRequest<UploadMediaResponse>(
    accessToken, "POST", `/v2/users/${openid}/files/upload-complete`,
    { file_uuid: fileUuid, parts },
    DEFAULT_API_TIMEOUT, log,
  );
}

/**
 * 群聊分块上传 - 准备
 */
export async function groupUploadPrepare(
  accessToken: string,
  groupOpenid: string,
  fileType: MediaFileType,
  fileSize: number,
  fileName: string,
  fileHash: string,
  log?: Logger,
): Promise<UploadPrepareResponse> {
  return apiRequest<UploadPrepareResponse>(
    accessToken, "POST", `/v2/groups/${groupOpenid}/files/upload-prepare`,
    { file_type: fileType, file_size: fileSize, file_name: fileName, file_hash: fileHash },
    DEFAULT_API_TIMEOUT, log,
  );
}

/**
 * 群聊分块上传 - 上传分片
 */
export async function groupUploadPart(
  accessToken: string,
  groupOpenid: string,
  fileUuid: string,
  partNumber: number,
  partData: Buffer,
  log?: Logger,
): Promise<string> {
  const res = await apiRequest<{ etag?: string }>(
    accessToken, "POST", `/v2/groups/${groupOpenid}/files/upload-part`,
    { file_uuid: fileUuid, part_number: partNumber, part_data: partData.toString("base64") },
    FILE_UPLOAD_TIMEOUT, log,
  );
  return res.etag ?? "";
}

/**
 * 群聊分块上传 - 分片完成确认
 */
export async function groupUploadPartFinish(
  accessToken: string,
  groupOpenid: string,
  fileUuid: string,
  partNumber: number,
  etag: string,
  log?: Logger,
): Promise<void> {
  await apiRequest(
    accessToken, "POST", `/v2/groups/${groupOpenid}/files/upload-part-finish`,
    { file_uuid: fileUuid, part_number: partNumber, etag },
    DEFAULT_API_TIMEOUT, log,
  );
}

/**
 * 群聊分块上传 - 完成上传
 */
export async function groupCompleteUpload(
  accessToken: string,
  groupOpenid: string,
  fileUuid: string,
  parts: UploadPart[],
  log?: Logger,
): Promise<UploadMediaResponse> {
  return apiRequest<UploadMediaResponse>(
    accessToken, "POST", `/v2/groups/${groupOpenid}/files/upload-complete`,
    { file_uuid: fileUuid, parts },
    DEFAULT_API_TIMEOUT, log,
  );
}
