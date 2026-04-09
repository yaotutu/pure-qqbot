/**
 * 分块上传 — 大文件分块上传协调器
 */

import crypto from "node:crypto";
import type { Logger, MediaFileType, UploadMediaResponse, UploadPart, UploadPrepareResponse } from "../types.js";
import { computeFileHash, getCachedFileInfo, setCachedFileInfo } from "./upload-cache.js";

/** 分块大小：4MB */
const DEFAULT_PART_SIZE = 4 * 1024 * 1024;

/** 单分块最大重试次数 */
const MAX_PART_RETRIES = 3;

/** 并行上传数 */
const PARALLEL_UPLOADS = 3;

export interface ChunkedUploadParams {
  accessToken: string;
  targetId: string;
  scope: "c2c" | "group";
  fileType: MediaFileType;
  fileData: Buffer | string;
  fileName?: string;
  log?: Logger;
  onProgress?: (uploaded: number, total: number) => void;
  /** 底层 API 函数（由 api.ts 注入，避免循环依赖） */
  api: {
    prepare: (accessToken: string, targetId: string, fileType: MediaFileType, fileSize: number, fileName: string, fileHash: string, log?: Logger) => Promise<UploadPrepareResponse>;
    uploadPart: (accessToken: string, targetId: string, fileUuid: string, partNumber: number, partData: Buffer, log?: Logger) => Promise<string>;
    partFinish: (accessToken: string, targetId: string, fileUuid: string, partNumber: number, etag: string, log?: Logger) => Promise<void>;
    complete: (accessToken: string, targetId: string, fileUuid: string, parts: UploadPart[], log?: Logger) => Promise<UploadMediaResponse>;
  };
}

/**
 * 分块上传大文件
 */
export async function chunkedUpload(params: ChunkedUploadParams): Promise<UploadMediaResponse> {
  const { accessToken, targetId, scope, fileType, fileName, log, onProgress, api } = params;
  const data = typeof params.fileData === "string" ? Buffer.from(params.fileData, "base64") : params.fileData;
  const totalSize = data.length;

  // 检查缓存
  const contentHash = computeFileHash(data);
  const cached = getCachedFileInfo(contentHash, scope, targetId, fileType);
  if (cached) {
    log?.debug?.(`[chunked-upload] Cache hit for ${contentHash.slice(0, 8)}`);
    return { file_uuid: "", file_info: cached, ttl: 0 };
  }

  const name = fileName ?? `file_${Date.now()}`;
  const fileHash = computeFileHash(data);

  log?.info?.(`[chunked-upload] Starting: ${totalSize} bytes, ${name}`);

  // Step 1: Prepare
  const prepare = await api.prepare(accessToken, targetId, fileType, totalSize, name, fileHash, log);

  // 已存在完整文件（秒传）
  if (prepare.file_info) {
    log?.info?.(`[chunked-upload] File already exists (instant upload)`);
    if (prepare.ttl && prepare.ttl > 0) {
      setCachedFileInfo(contentHash, scope, targetId, fileType, prepare.file_info, prepare.file_uuid ?? "", prepare.ttl);
    }
    return { file_uuid: prepare.file_uuid ?? "", file_info: prepare.file_info, ttl: prepare.ttl ?? 0 };
  }

  const fileUuid = prepare.file_uuid!;
  const uploadPartsUrls = prepare.upload_parts_urls ?? [];

  // Step 2: Split into parts
  const parts: UploadPart[] = [];
  const partBuffers = splitIntoParts(data, DEFAULT_PART_SIZE);

  log?.info?.(`[chunked-upload] Uploading ${partBuffers.length} parts`);

  // Step 3: Upload parts in parallel
  let uploadedBytes = 0;

  const uploadQueue = partBuffers.map((partData, index) => async () => {
    const partNumber = index + 1;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < MAX_PART_RETRIES; attempt++) {
      try {
        const uploadUrl = uploadPartsUrls[index];
        let etag: string;

        if (uploadUrl) {
          // 使用预签名 URL 上传
          etag = await uploadToPresignedUrl(uploadUrl, partData);
        } else {
          // 使用 API 上传
          etag = await api.uploadPart(accessToken, targetId, fileUuid, partNumber, partData, log);
        }

        // 通知完成
        await api.partFinish(accessToken, targetId, fileUuid, partNumber, etag, log);

        uploadedBytes += partData.length;
        onProgress?.(uploadedBytes, totalSize);
        parts.push({ part_number: partNumber, etag });
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        log?.debug?.(`[chunked-upload] Part ${partNumber} attempt ${attempt + 1} failed: ${lastError.message}`);
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        await new Promise(r => setTimeout(r, delay));
      }
    }
    throw lastError ?? new Error(`Part ${partNumber} failed after ${MAX_PART_RETRIES} retries`);
  });

  // 并行执行，限制并发数
  await runParallel(uploadQueue, PARALLEL_UPLOADS);

  // Step 4: Complete
  parts.sort((a, b) => a.part_number - b.part_number);
  const result = await api.complete(accessToken, targetId, fileUuid, parts, log);

  log?.info?.(`[chunked-upload] Complete: ${result.file_info.slice(0, 20)}...`);

  // 缓存
  if (result.ttl > 0) {
    setCachedFileInfo(contentHash, scope, targetId, fileType, result.file_info, result.file_uuid, result.ttl);
  }

  return result;
}

function splitIntoParts(data: Buffer, partSize: number): Buffer[] {
  const parts: Buffer[] = [];
  for (let offset = 0; offset < data.length; offset += partSize) {
    parts.push(data.subarray(offset, Math.min(offset + partSize, data.length)));
  }
  return parts;
}

async function uploadToPresignedUrl(url: string, data: Buffer): Promise<string> {
  const res = await fetch(url, {
    method: "PUT",
    body: data,
    headers: { "Content-Type": "application/octet-stream" },
  });

  if (!res.ok) {
    throw new Error(`Upload part failed: HTTP ${res.status}`);
  }

  const etag = res.headers.get("ETag")?.replace(/"/g, "") ?? "";
  return etag;
}

async function runParallel<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  const next = async (): Promise<void> => {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]!();
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => next()));
  return results;
}
