# NEXORA API Overview

All REST API endpoints are served by the Laravel backend under the `/api` prefix and require a valid `Bearer` Sanctum token (except public Auth endpoints).

---

## 1. Authentication Endpoints
- `POST /api/register` - Create new user account
- `POST /api/login` - Authenticate user & issue token
- `POST /api/logout` - Revoke current token
- `GET /api/user` - Fetch authenticated user profile

---

## 2. Workspace Endpoints
- `GET /api/workspaces` - List user workspaces
- `POST /api/workspaces` - Create workspace
- `GET /api/workspaces/{id}` - Get workspace details & members
- `PUT /api/workspaces/{id}` - Update workspace
- `DELETE /api/workspaces/{id}` - Delete workspace
- `POST /api/workspaces/{id}/members` - Invite member to workspace

---

## 3. Project Endpoints
- `GET /api/projects` - List projects in workspace
- `POST /api/projects` - Create project
- `GET /api/projects/{id}` - Get project details (overview, tasks, members)
- `PUT /api/projects/{id}` - Update project details
- `DELETE /api/projects/{id}` - Delete project

---

## 4. Task & Kanban Endpoints
- `GET /api/tasks` - Filter tasks by project/assignee/status
- `POST /api/tasks` - Create new task
- `GET /api/tasks/{id}` - Get task details with comments & subtasks
- `PUT /api/tasks/{id}` - Update task status/priority/details (triggers Redis Pub/Sub event)
- `DELETE /api/tasks/{id}` - Delete task
- `POST /api/tasks/{id}/comments` - Add task comment

---

## 5. Analytics & Activity Endpoints
- `GET /api/analytics/dashboard` - Get dashboard metrics & chart data
- `GET /api/activity-logs` - Get workspace/project activity timeline
