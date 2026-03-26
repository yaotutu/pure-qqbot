# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

pure-qqbot is a TypeScript SDK for building QQ bots. It connects to the QQ Bot API via WebSocket for real-time message reception and uses HTTP REST APIs for message sending. The SDK supports text, image, voice, video, and file messages for both private (C2C) and group chats.

## Build Commands

```bash
npm run build      # Compile TypeScript to dist/
npm run dev        # Watch mode for development
```

## Architecture

The SDK is organized into four main modules:

- **`client.ts`** - `QQBotClient` class providing the high-level API for users
- **`gateway.ts`** - WebSocket connection handling with auto-reconnect and session resume
- **`api.ts`** - REST API calls: token management, message sending, media upload
- **`types.ts`** - TypeScript type definitions

### Message Flow

1. `QQBotClient.start()` initiates WebSocket connection via `gateway.ts`
2. `gateway.ts` authenticates, receives events, and dispatches to `onMessage` handlers
3. User calls `client.reply()` or `sendPrivateMessage()` etc.
4. `api.ts` handles token caching and HTTP requests to QQ API

### Key Patterns

- **Token Management**: Access tokens are cached with 5-minute early refresh buffer and singleflight protection to prevent concurrent token fetches
- **Media Upload Caching**: Uploaded file_info is cached by content hash (MD5) to avoid re-uploading identical files within TTL
- **WebSocket Reconnect**: Exponential backoff with session resume support using stored `session_id` and `last_seq`
- **Message Types**: Four event types - `c2c` (private chat), `group` (group chat), `guild` (QQ频道), `dm` (频道私信)

## QQ Bot API Notes

- API Base: `https://api.sgroup.qq.com`
- Token endpoint: `https://bots.qq.com/app/getAppAccessToken`
- Passive replies require `msg_id` (must respond within 1 hour of receiving message)
- Proactive messages don't require `msg_id` but have rate limits
- Media files: upload first to get `file_info`, then send via `file_info`
