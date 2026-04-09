/**
 * SSRF 防护 — 阻止对内网 IP 的请求
 */

import dns from "node:dns/promises";
import net from "node:net";

/** 已知的内网 IP 段 */
const PRIVATE_RANGES: Array<{ start: number; end: number }> = [
  // 10.0.0.0/8
  { start: ipToNum("10.0.0.0"), end: ipToNum("10.255.255.255") },
  // 172.16.0.0/12
  { start: ipToNum("172.16.0.0"), end: ipToNum("172.31.255.255") },
  // 192.168.0.0/16
  { start: ipToNum("192.168.0.0"), end: ipToNum("192.168.255.255") },
  // 127.0.0.0/8
  { start: ipToNum("127.0.0.0"), end: ipToNum("127.255.255.255") },
  // 0.0.0.0/8
  { start: ipToNum("0.0.0.0"), end: ipToNum("0.255.255.255") },
  // 169.254.0.0/16 (link-local)
  { start: ipToNum("169.254.0.0"), end: ipToNum("169.254.255.255") },
  // 100.64.0.0/10 (CGNAT)
  { start: ipToNum("100.64.0.0"), end: ipToNum("100.127.255.255") },
  // 192.0.2.0/24 (documentation)
  { start: ipToNum("192.0.2.0"), end: ipToNum("192.0.2.255") },
  // 198.51.100.0/24 (documentation)
  { start: ipToNum("198.51.100.0"), end: ipToNum("198.51.100.255") },
  // 203.0.113.0/24 (documentation)
  { start: ipToNum("203.0.113.0"), end: ipToNum("203.0.113.255") },
];

/** DNS 缓存（60 秒 TTL） */
const dnsCache = new Map<string, { ips: string[]; expiresAt: number }>();
const DNS_CACHE_TTL = 60_000;

function ipToNum(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

/**
 * 判断 IP 是否为内网地址
 */
export function isPrivateIp(ip: string): boolean {
  if (!net.isIPv4(ip)) {
    // IPv6 回环地址
    if (ip === "::1" || ip === "::") return true;
    // IPv6 私有地址 fc00::/7
    if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("FC") || ip.startsWith("FD")) return true;
    return false;
  }

  const num = ipToNum(ip);
  return PRIVATE_RANGES.some(r => num >= r.start && num <= r.end);
}

/**
 * 解析域名为 IP 列表（带缓存）
 */
async function resolveHost(hostname: string): Promise<string[]> {
  const cached = dnsCache.get(hostname);
  if (cached && Date.now() < cached.expiresAt) return cached.ips;

  try {
    const ips = await dns.resolve4(hostname);
    dnsCache.set(hostname, { ips, expiresAt: Date.now() + DNS_CACHE_TTL });
    return ips;
  } catch {
    // IPv4 失败，尝试 IPv6
    try {
      const v6 = await dns.resolve6(hostname);
      dnsCache.set(hostname, { ips: v6, expiresAt: Date.now() + DNS_CACHE_TTL });
      return v6;
    } catch {
      return [];
    }
  }
}

/**
 * 验证 URL 是否安全（非内网地址）
 */
export async function validateUrl(url: string): Promise<{ safe: boolean; reason?: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { safe: false, reason: "Invalid URL" };
  }

  const hostname = parsed.hostname;

  // 如果已经是 IP，直接检查
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      return { safe: false, reason: `Private IP: ${hostname}` };
    }
    return { safe: true };
  }

  // 解析域名
  const ips = await resolveHost(hostname);
  if (ips.length === 0) {
    return { safe: false, reason: `Cannot resolve: ${hostname}` };
  }

  for (const ip of ips) {
    if (isPrivateIp(ip)) {
      return { safe: false, reason: `Private IP resolved: ${hostname} -> ${ip}` };
    }
  }

  return { safe: true };
}
