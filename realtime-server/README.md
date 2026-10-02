# NEXORA Real-Time Service

Phase 4I real-time Socket.IO, Express, and MongoDB Chat Data Layer for the NEXORA workspace platform.

## Architecture

- **Runtime**: Node.js (ES Modules)
- **Framework**: Express & Socket.IO
- **Database**: MongoDB via Mongoose (`nexora_chat`)
- **Authentication**: Laravel Sanctum Bearer token validation against Laravel REST API (`GET /api/me`)

## Data Ownership: MySQL vs MongoDB

- **MySQL (Source of Truth)**:
  - Users, workspaces, workspace memberships, teams, projects, tasks, permissions, and roles.
- **MongoDB (Source of Truth)**:
  - High-velocity real-time chat data (`conversations`, `channels`, `messages`, `threads`, `reactions`).
- **Relationship Strategy**:
  - Application-level numeric references (`workspaceId`, `teamId`, `userId`, `senderId`, `createdBy`).
  - No cross-database foreign keys. No user profile duplication (names/emails) in MongoDB.

## MongoDB Chat Models

1. **`Conversation`** (`src/models/Conversation.js`):
   - Direct (1-on-1) or group conversations.
   - Requires `workspaceId`, `type` (`direct` | `group`), `participantIds` (min 2), and `createdBy`.
   - Idempotent lookup prevents duplicate direct conversations between the same user pair.
2. **`Channel`** (`src/models/Channel.js`):
   - Workspace-level discussion channels (public or private), optionally scoped to a `teamId`.
   - Requires `workspaceId`, normalized lowercase `name`, `createdBy`, `isPrivate`, and `memberIds`.
   - Enforces unique channel name within the workspace and team scope.
3. **`Message`** (`src/models/Message.js`):
   - Core message document belonging to **either** a `conversationId` **or** a `channelId` (mutually exclusive).
   - Contains `workspaceId`, `senderId` (authenticated user), `content`, `messageType` (`text` | `system`), optional `replyToMessageId`, and optional `threadId`.
   - Supports `editedAt` and `deletedAt` timestamps.
4. **`Thread`** (`src/models/Thread.js`):
   - Threaded reply sub-conversations anchored to a unique `rootMessageId`.
   - Scoped to `workspaceId`, parent `channelId` or `conversationId`, and `createdBy`.
5. **`Reaction`** (`src/models/Reaction.js`):
   - User emoji reactions attached to a target `messageId`.
   - Compound unique index `{ messageId, userId, emoji }` ensures idempotent reactions without duplicates.

## Indexing Strategy

- **`Conversation`**:
  - `{ workspaceId: 1, participantIds: 1 }`
  - `{ workspaceId: 1, type: 1, participantIds: 1 }`
- **`Channel`**:
  - `{ workspaceId: 1, teamId: 1, name: 1 }` (unique: true)
  - `{ workspaceId: 1, isPrivate: 1 }`
- **`Message`**:
  - `{ workspaceId: 1, conversationId: 1, createdAt: -1, _id: -1 }` (cursor pagination)
  - `{ workspaceId: 1, channelId: 1, createdAt: -1, _id: -1 }` (cursor pagination)
  - `{ threadId: 1, createdAt: -1, _id: -1 }`
  - `{ senderId: 1, createdAt: -1 }`
  - `{ replyToMessageId: 1 }`
- **`Thread`**:
  - `{ rootMessageId: 1 }` (unique: true)
  - `{ workspaceId: 1, channelId: 1 }`
  - `{ workspaceId: 1, conversationId: 1 }`
- **`Reaction`**:
  - `{ messageId: 1, userId: 1, emoji: 1 }` (unique: true)
  - `{ userId: 1 }`

## Message Pagination Strategy

- Implements **stable cursor-based pagination** using `{ createdAt, _id }`.
- Eliminates expensive MongoDB `skip()` offset overhead on large conversation histories.
- Supports descending queries with `beforeCursor`:
  ```javascript
  {
    $or: [
      { createdAt: { $lt: cursorDate } },
      { createdAt: cursorDate, _id: { $lt: cursorId } }
    ]
  }
  ```
- Returns `{ messages, pagination: { limit, hasMore, nextCursor } }`.

## Soft Deletion & Editing

- **Editing**: Updates `content` and sets `editedAt = new Date()`. Only permitted by the original sender. Deleted messages cannot be edited.
- **Soft Deletion**: Sets `deletedAt = new Date()`. The historical record is preserved in storage for auditability while UI consumers render soft-deleted placeholders.

## Future Chat API Boundary

- The service/repository layer (`src/services/chatService.js`, `src/repositories/`) separates authoritative authenticated user IDs from user-supplied payloads.
- REST and Socket.IO broadcast handlers for real-time messaging, typing indicators, and presence will consume this foundational data layer in subsequent phases.

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8002` | Port for the realtime Express and Socket.IO server |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/nexora_chat` | MongoDB connection string |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis server connection string |
| `LARAVEL_API_URL` | `http://127.0.0.1:8001` | Laravel backend base URL for auth validation |
| `FRONTEND_URL` | `http://localhost:5173` | Allowed CORS frontend origin |

## Distributed Realtime & Redis Integration

### Redis Role vs. MongoDB Role

- **MongoDB (Persistence Source of Truth)**:
  - Stores all chat history, conversations, channels, threads, and reactions persistently.
  - Redis never replaces MongoDB as the persistent data store.
- **Redis (Realtime Coordination & Scalability)**:
  - Socket.IO cross-instance event distribution via `@socket.io/redis-adapter` (pub/sub).
  - Distributed presence tracking across multi-process or multi-server deployments (`nexora:presence:user:{userId}` and `nexora:presence:ws:{workspaceId}`).
  - Ephemeral coordination; no chat messages or business entities are persisted in Redis.

### Graceful Fallback Mode (Redis Unavailable)

If Redis is offline or unreachable:
1. The server logs a clear notification: `[Redis] Unavailable (...) — running realtime server in single-node fallback mode.`
2. The Socket.IO server continues operating seamlessly using its default in-memory adapter.
3. Single-node chat messaging, presence, and typing indicators remain 100% operational.
4. The server avoids infinite reconnect crash loops and continues serving HTTP and WebSocket traffic.

### Health Endpoint (`GET /health`)

The health endpoint provides real-time status for infrastructure components:
- **Both Connected (Distributed Mode)**:
  ```json
  {
    "status": "ok",
    "service": "nexora-realtime",
    "mongo": "connected",
    "mongodb": "connected",
    "redis": "connected"
  }
  ```
- **Redis Offline (Single-Node Fallback Mode)**:
  ```json
  {
    "status": "degraded",
    "service": "nexora-realtime",
    "mongo": "connected",
    "mongodb": "connected",
    "redis": "unavailable"
  }
  ```

### Running Multiple Realtime Instances (Horizontal Scaling)

When Redis is active, multiple Node.js Socket.IO instances can share traffic. To run two instances on the same host:

1. Ensure Redis is running:
   ```bash
   redis-server
   ```
2. Start Instance 1 (Port 8002):
   ```bash
   PORT=8002 npm start
   ```
3. Start Instance 2 (Port 8003):
   ```bash
   PORT=8003 npm start
   ```
4. Clients connected to Instance 1 and Instance 2 in the same workspace or channel room will receive broadcasts published across instances through the Redis adapter.

## Available Scripts

- `npm run dev` — Starts server with `nodemon` for development
- `npm start` — Starts server in production mode
- `npm test` — Executes full automated test suite (infrastructure + chat data layer + presence/typing + Redis)
