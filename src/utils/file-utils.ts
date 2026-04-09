/**
 * 文件工具 — 大小验证、MIME 检测、文件下载
 */

import { validateUrl } from "./ssrf-guard.js";
import type { Logger } from "../types.js";

/** QQ Bot 各类型文件大小限制（字节） */
export const FILE_SIZE_LIMITS = {
  [1]: 10 * 1024 * 1024,   // 图片 10MB
  [2]: 100 * 1024 * 1024,  // 视频 100MB
  [3]: 20 * 1024 * 1024,   // 语音 20MB
  [4]: 100 * 1024 * 1024,  // 文件 100MB
} as const;

/** 魔数 → MIME 类型映射 */
const MAGIC_NUMBERS: Array<{ bytes: number[]; mask?: number[]; mime: string }> = [
  { bytes: [0x89, 0x50, 0x4E, 0x47], mime: "image/png" },
  { bytes: [0xFF, 0xD8, 0xFF], mime: "image/jpeg" },
  { bytes: [0x47, 0x49, 0x46, 0x38], mime: "image/gif" },
  { bytes: [0x52, 0x49, 0x46, 0x46], mime: "image/webp" }, // RIFF...WEBP
  { bytes: [0x49, 0x44, 0x33], mime: "audio/mpeg" },        // ID3 (MP3)
  { bytes: [0xFF, 0xFB], mime: "audio/mpeg" },               // MP3 frame
  { bytes: [0x66, 0x74, 0x79, 0x70], mime: "video/mp4", mask: [0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF] },
];

/**
 * 从 Buffer 头部字节检测 MIME 类型
 */
export function detectMimeFromBuffer(buffer: Buffer): string {
  if (buffer.length < 4) return "application/octet-stream";

  for (const { bytes, mask, mime } of MAGIC_NUMBERS) {
    let match = true;
    for (let i = 0; i < bytes.length; i++) {
      const bufByte = buffer[i] ?? 0;
      const maskByte = mask?.[i] ?? 0xFF;
      if ((bufByte & maskByte) !== bytes[i]) {
        match = false;
        break;
      }
    }
    if (match) return mime;
  }

  // WebP: RIFF....WEBP
  if (buffer.length >= 12) {
    const tag = buffer.toString("ascii", 8, 12);
    if (tag === "WEBP") return "image/webp";
  }

  // ftyp (MP4/MOV): offset 4-8 = "ftyp"
  if (buffer.length >= 8) {
    const tag = buffer.toString("ascii", 4, 8);
    if (tag === "ftyp") return "video/mp4";
  }

  return "application/octet-stream";
}

/**
 * 验证文件大小是否在限制内
 */
export function validateFileSize(size: number, fileType: number): boolean {
  const limit = FILE_SIZE_LIMITS[fileType as keyof typeof FILE_SIZE_LIMITS];
  if (!limit) return true;
  return size <= limit;
}

/**
 * 下载文件到 Buffer
 */
export async function downloadToBuffer(
  url: string,
  options?: { timeout?: number; log?: Logger },
): Promise<{ buffer: Buffer; contentType: string; filename?: string }> {
  const { timeout = 30_000, log } = options ?? {};

  // SSRF 检查
  const check = await validateUrl(url);
  if (!check.safe) {
    throw new Error(`SSRF blocked: ${check.reason}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    log?.debug?.(`[file-utils] Downloading: ${url}`);
    const res = await fetch(url, { signal: controller.signal });

    if (!res.ok) {
      throw new Error(`Download failed: HTTP ${res.status}`);
    }

    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    const contentDisposition = res.headers.get("content-disposition");
    const filename = contentDisposition?.match(/filename="?(.+?)"?$/)?.[1];

    const arrayBuffer = await res.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType,
      filename,
    };
  } finally {
    clearTimeout(timer);
  }
}
