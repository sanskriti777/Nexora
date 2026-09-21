# NEXORA

> **Real-Time Project Management & Collaboration Platform**  
> *Plan. Manage. Collaborate. Deliver.*

---

## 📌 Project Overview

**NEXORA** is a professional, SaaS-style collaborative workspace combining Jira-style project/task management with Slack-style real-time team communication. 

Teams often struggle with context switching between separate task-tracking software and messaging applications. **NEXORA** unifies task tracking, drag-and-drop Kanban boards, real-time channel/DM communication, team role-based authorization, file management, calendar scheduling, notifications, analytics, and audit logging into a single cohesive platform.

---

## 🎯 Problem Statement

In modern software development teams, tools are often fragmented:
- **Project Management** → Jira / Trello
- **Communication** → Slack / Teams
- **File Sharing** → Google Drive
- **Analytics** → Custom Dashboards

This leads to scattered information, lost discussions, context-switching overhead, and a lack of unified project oversight. **NEXORA** resolves this by connecting communication directly to task workflows in real time.

---

## 🚀 Objectives

1. Eliminate context switching by bringing real-time chat and task management into one workspace.
2. Provide real-time collaborative updates (live Kanban movements, instant notifications, online presence, typing indicators).
3. Demonstrate a robust hybrid full-stack architecture (Laravel REST API + Node.js Socket.IO server + MySQL + MongoDB + Redis Pub/Sub).
4. Implement strict Role-Based Access Control (RBAC) across workspaces, projects, and administrative functions.

---

## ⚡ Core Features

### Status Legend
- 🟢 **Implemented (Phase 1 Foundation)**
- 🟡 **Planned (Phases 2-16 Development Roadmap)**

### Feature Matrix

| Feature | Status | Description |
| :--- | :--- | :--- |
| **Project Foundation** | 🟢 Implemented | Root structure, documentation, git setup, build configs. |
| **Authentication & RBAC** | 🟡 Planned | Laravel Sanctum API auth, JWT/token verification, roles (Admin, PM, Team Lead, Member, Viewer). |
| **Workspace & Team Management** | 🟡 Planned | Multi-workspace support, team assignment, member role management. |
| **Project & Task Management** | 🟡 Planned | Project CRUD, task priorities, statuses, subtasks, labels, and assignees. |
| **Drag-and-Drop Kanban** | 🟡 Planned | Interactive Kanban board with live WebSocket updates for all connected clients. |
| **Real-Time Slack-style Chat** | 🟡 Planned | Public/private channels, direct messages, message threads, reactions, typing indicators. |
| **Online Presence** | 🟡 Planned | Real-time user online/offline status powered by Socket.IO & Redis. |
| **Notifications System** | 🟡 Planned | In-app alerts, unread counts, realtime WebSocket push notifications. |
| **File Management** | 🟡 Planned | Project/task file attachments with secure access verification. |
| **Calendar View** | 🟡 Planned | Task deadlines, project milestones, and interactive event scheduling. |
| **Analytics & Reports** | 🟡 Planned | Charts for project progress, task completion velocity, and team workload. |
| **Audit & Activity Log** | 🟡 Planned | Historic timeline of system actions (created, updated, assigned, completed). |

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend** | React.js + Vite | User Interface & Client-side state |
| **Styling** | Vanilla CSS | Custom responsive design system |
| **Main Backend** | PHP + Laravel 11/12 | Core REST APIs, business logic, authorization |
| **Real-Time Server** | Node.js + Express + Socket.IO | Persistent WebSockets, chat, live updates |
| **Relational Database** | MySQL 8.0 | Structured relational data (Users, Projects, Tasks, Roles) |
| **Document Database** | MongoDB | Chat messages, channels, threads, reactions |
| **Cache & Event Bus** | Redis | Inter-service Pub/Sub & presence tracking |
| **Authentication** | Laravel Sanctum | Token-based API & WebSocket authentication |
| **Analytics Charts** | Recharts / Chart.js | Visual metrics & dashboards |

---

## 🏗️ System Architecture

```
                               ┌──────────────────────┐
                               │        USERS         │
                               └──────────┬───────────┘
                                          │
                                          ▼
                               ┌──────────────────────┐
                               │   REACT.JS FRONTEND  │
                               └──────────┬───────────┘
                                          │
                      ┌───────────────────┴───────────────────┐
                      │                                       │
                   REST API                               WebSocket
                      │                                       │
                      ▼                                       ▼
           ┌─────────────────────┐                 ┌─────────────────────┐
           │   LARAVEL + PHP     │                 │ NODE.JS + SOCKET.IO │
           │    CORE BACKEND     │                 │  REAL-TIME SERVER   │
           └──────────┬──────────┘                 └──────────┬──────────┘
                      │                                       │
                      ▼                                       ▼
               ┌─────────────┐                         ┌─────────────┐
               │    MYSQL    │                         │   MONGODB   │
               │ Users/Tasks │                         │ Messages    │
               └──────┬──────┘                         └──────┬──────┘
                      │                                       │
                      └───────────────────┬───────────────────┘
                                          │
                                          ▼
                                    ┌───────────┐
                                    │   REDIS   │
                                    │  Pub/Sub  │
                                    └───────────┘
```

---

## 📂 Project Structure

```
NEXORA/
├── frontend/             # React + Vite application (UI, Kanban, Chat client)
├── backend/              # Laravel application (REST API, Sanctum, Business logic)
├── realtime-server/      # Node.js + Socket.IO server (Real-time chat & WebSocket gateway)
├── docs/                 # System architecture, API specs & DB design docs
│   ├── architecture/
│   ├── database/
│   ├── api/
│   └── development/
├── images/               # Brand assets & reference screenshots
├── .gitignore            # Git ignore configuration
├── README.md             # Project documentation
└── NEXORA_Doc.docx       # Specifications document
```

---

## 👥 User Roles & Permissions

1. **Admin**: Platform-wide management, full user/workspace administration, system analytics.
2. **Project Manager**: Project & task creation, team assignments, deadline tracking, project analytics.
3. **Team Lead**: Assigns tasks within team, reviews submissions, monitors team workload.
4. **Team Member**: Updates assigned tasks, participates in Kanban, uses chat, uploads attachments.
5. **Viewer**: Read-only access to projects, tasks, and team progress.

---

## 🗄️ Database Architecture

- **MySQL**: Handles relational application state (`users`, `workspaces`, `teams`, `projects`, `tasks`, `task_comments`, `attachments`, `activity_logs`).
- **MongoDB**: Handles chat and high-velocity event documents (`messages`, `channels`, `message_threads`, `reactions`).
- **Cross-DB Reference Rule**: Application-level IDs link MySQL and MongoDB entities (e.g. MySQL `users.id` referenced as `senderId` in MongoDB documents). No cross-database foreign keys are created.

---

## ⚡ Real-Time Architecture & Event Flow

When a task status changes on the Kanban board:
1. React client sends `PUT /api/tasks/{id}` to **Laravel API**.
2. Laravel updates **MySQL** database.
3. Laravel publishes `task.updated` event to **Redis Pub/Sub**.
4. **Node.js Socket.IO server** receives Redis event.
5. Node.js broadcasts WebSocket update to all workspace clients.
6. React clients update Kanban board view in real time without refreshing.

---

## 🗓️ Development Roadmap

- [x] **Phase 0**: Environment & specification inspection
- [x] **Phase 1**: Project structure & documentation foundation
- [ ] **Phase 2**: Laravel backend & MySQL database schema setup
- [ ] **Phase 3**: React frontend foundation & design system
- [ ] **Phase 4**: Authentication & Sanctum integration
- [ ] **Phase 5**: Workspace & Team management
- [ ] **Phase 6**: Project management module
- [ ] **Phase 7**: Task management & Kanban board
- [ ] **Phase 8**: Node.js + Socket.IO real-time server
- [ ] **Phase 9**: MongoDB chat integration
- [ ] **Phase 10**: Redis Pub/Sub bridge
- [ ] **Phase 11**: Notifications, Files, Calendar & Activity log
- [ ] **Phase 12**: Analytics & Global search
- [ ] **Phase 13**: Security & authorization audit
- [ ] **Phase 14**: End-to-end testing
- [ ] **Phase 15**: UI polish & responsiveness
- [ ] **Phase 16**: Deployment documentation

---

## 🔧 Installation & Environment Setup

### Prerequisites
- Node.js `v18+` & npm `v9+`
- PHP `v8.2+` & Composer `v2+`
- MySQL Server `v8.0+`
- MongoDB `v6.0+`
- Redis Server `v6.0+`

### Setup Instructions (Planned)

#### 1. Backend (Laravel)
```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate --seed
php artisan serve
```

#### 2. Real-Time Server (Node.js)
```bash
cd realtime-server
npm install
npm run dev
```

#### 3. Frontend (React)
```bash
cd frontend
npm install
npm run dev
```

---

## 🔒 Environment Variables Summary

- **Backend (`backend/.env`)**: `APP_KEY`, `DB_CONNECTION`, `DB_HOST`, `DB_DATABASE`, `REDIS_HOST`, `SANCTUM_STATEFUL_DOMAINS`
- **Realtime Server (`realtime-server/.env`)**: `PORT`, `MONGO_URI`, `REDIS_HOST`, `REDIS_PORT`, `CLIENT_URL`
- **Frontend (`frontend/.env`)**: `VITE_API_URL`, `VITE_SOCKET_URL`

---

## 🧪 Testing

- **Backend**: `php artisan test`
- **Frontend**: `npm run build`
- **Realtime Server**: WebSocket event unit verification

---

## 🔮 Future Improvements

- Video & audio call integrations.
- Time tracking & automated timesheet generation.
- Custom Webhook integrations (GitHub / GitLab pushes into chat channels).
