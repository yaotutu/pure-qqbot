/**
 * 跨平台兼容工具
 */

/**
 * 规范化文件名为 QQ Bot API 要求的 UTF-8 编码格式
 *
 * 处理:
 * 1. Unicode NFC 规范化（将 NFD 分解形式合并为 NFC 组合形式）
 * 2. 去除 ASCII 控制字符（0x00-0x1F, 0x7F）
 * 3. 去除首尾空白
 * 4. 对 percent-encoded 的文件名尝试 URI 解码
 */
export function sanitizeFileName(name: string): string {
  if (!name) return name;

  let result = name.trim();

  // 尝试 URI 解码（处理 URL 中 percent-encoded 的中文文件名）
  if (result.includes("%")) {
    try {
      result = decodeURIComponent(result);
    } catch {
      // 解码失败（非合法 percent-encoding），保留原始值
    }
  }

  // Unicode NFC 规范化：将 macOS NFD 分解形式合并为标准 NFC 组合形式
  result = result.normalize("NFC");

  // 去除 ASCII 控制字符
  result = result.replace(/[\x00-\x1F\x7F]/g, "");

  return result;
}

/**
 * 判断字符串是否为本地文件路径（非 URL）
 */
export function isLocalPath(p: string): boolean {
  if (!p) return false;
  if (p.startsWith("file://")) return true;
  if (p === "~" || p.startsWith("~/") || p.startsWith("~\\")) return true;
  if (p.startsWith("/")) return true;
  if (/^[a-zA-Z]:[\\/]/.test(p)) return true;
  if (p.startsWith("\\\\")) return true;
  if (p.startsWith("./") || p.startsWith("../")) return true;
  if (p.startsWith(".\\") || p.startsWith("..\\")) return true;
  return false;
}

/**
 * 从 Data URL 中提取 Base64 数据
 * @param dataUrl - Data URL (e.g., "data:image/png;base64,iVBORw0KGgo...")
 * @returns Base64 数据或 null
 */
export function extractBase64FromDataUrl(dataUrl: string): string | null {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  return matches ? matches[2] : null;
}
