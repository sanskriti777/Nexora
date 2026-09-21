# NEXORA System Architecture

## 1. High-Level Architecture

NEXORA utilizes a hybrid multi-tier backend architecture designed to handle both structured relational application operations and high-throughput real-time events.

```
                    +-------------------+
                    |   REACT FRONTEND  |
                    +---------+---------+
                              |
                +-------------+-------------+
                |                           |
             REST API                   WebSocket
                |                           |
                v                           v
      +-------------------+       +--------------------+
      |  LARAVEL BACKEND  |       |  REAL-TIME SERVER  |
      |   (PHP 8.3+)      |       | (Node.js/Socket.IO)|
      +---------+---------+       +----------+---------+
                |                            |
                v                            v
      +-------------------+       +--------------------+
      |   MYSQL DATABASE  |       |  MONGODB DATABASE  |
      +---------+---------+       +----------+---------+
                |                            |
                +-------------+--------------+
                              |
                              v
                    +-------------------+
                    |   REDIS PUB/SUB   |
                    +-------------------+
```

---

## 2. Component Responsibilities

### React Frontend (`frontend/`)
- User Interface & SPA Client Routing (`react-router-dom`).
- Authentication state management & Sanctum token handling (`AuthContext`).
- Interactive Kanban Board (Drag-and-Drop).
- Slack-style Chat Interface & channel switcher (`SocketContext`).
- Analytics dashboards with Recharts.

### Laravel Main Backend (`backend/`)
- User Registration, Login, Profile & Sanctum Authentication.
- Role-Based Access Control (RBAC) via Policies & Gates.
- Business logic for Workspaces, Teams, Projects, Tasks, and Comments.
- File attachment metadata handling & storage security.
- Dispatched Redis Pub/Sub events on task state changes.

### Node.js Real-Time Server (`realtime-server/`)
- Persistent WebSocket gateway via Socket.IO.
- Chat message broadcasting & MongoDB persistence.
- Typing indicators & online presence management.
- Subscription to Redis Pub/Sub channel for live task updates from Laravel.

### MySQL Database
- Primary relational storage: Users, Roles, Workspaces, Teams, Projects, Tasks, Labels, Comments, Attachments, Activity Logs.

### MongoDB Database
- Document storage for messaging: Messages, Channels, Reactions, Threads, Chat Events.

### Redis
- Event bridge between Laravel and Node.js (Pub/Sub).
- Online user presence store & performance caching.

---

## 3. Communication Patterns

1. **Client-to-Laravel**: HTTP REST requests over standard HTTPS using Axios with Sanctum Bearer tokens.
2. **Client-to-Node**: Bidirectional WebSocket connections via Socket.IO.
3. **Laravel-to-Node**: Indirect messaging using Redis Pub/Sub (`redis.publish('task-updated', data)`).
4. **Cross-Database Identity**: Application-level IDs (e.g. MySQL `user_id` stored as `senderId` string in MongoDB). No direct foreign keys between MySQL and MongoDB.
