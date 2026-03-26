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
export declare function sanitizeFileName(name: string): string;
/**
 * 判断字符串是否为本地文件路径（非 URL）
 */
export declare function isLocalPath(p: string): boolean;
/**
 * 从 Data URL 中提取 Base64 数据
 * @param dataUrl - Data URL (e.g., "data:image/png;base64,iVBORw0KGgo...")
 * @returns Base64 数据或 null
 */
export declare function extractBase64FromDataUrl(dataUrl: string): string | null;
//# sourceMappingURL=platform.d.ts.map