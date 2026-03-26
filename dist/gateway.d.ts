/**
 * QQ Bot WebSocket Gateway
 * 处理消息接收和连接管理
 */
import type { MessageEvent, Logger } from "./types.js";
export interface GatewayOptions {
    appId: string;
    clientSecret: string;
    onMessage: (event: MessageEvent) => void | Promise<void>;
    logger?: Logger;
    reconnectDelays?: number[];
    maxReconnectAttempts?: number;
}
export interface Gateway {
    start: () => Promise<void>;
    stop: () => void;
    isConnected: () => boolean;
}
/**
 * 创建 WebSocket Gateway
 */
export declare function createGateway(options: GatewayOptions): Gateway;
//# sourceMappingURL=gateway.d.ts.map