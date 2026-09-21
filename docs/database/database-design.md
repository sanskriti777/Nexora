# NEXORA Database Design

NEXORA relies on a hybrid database architecture:
- **MySQL**: Relational data (users, projects, tasks, permissions, activities).
- **MongoDB**: Document data (chat messages, channels, threads, reactions).

---

## 1. MySQL Relational Schema Design

### `users`
- `id` (BIGINT, PK, Auto-increment)
- `name` (VARCHAR)
- `email` (VARCHAR, Unique)
- `password` (VARCHAR, Hashed)
- `avatar` (VARCHAR, Nullable)
- `created_at`, `updated_at`, `deleted_at` (Timestamp / Soft deletes)

### `roles` & `permissions`
- `roles`: `id`, `name` (Admin, Project Manager, Team Lead, Team Member, Viewer), `slug`
- `permissions`: `id`, `name`, `slug`
- `role_permissions`: `role_id`, `permission_id`

### `workspaces` & `workspace_members`
- `workspaces`: `id`, `name`, `slug`, `owner_id` (FK -> users.id)
- `workspace_members`: `workspace_id`, `user_id`, `role_id`

### `teams` & `team_members`
- `teams`: `id`, `workspace_id`, `name`, `description`, `team_lead_id`
- `team_members`: `team_id`, `user_id`

### `projects` & `project_members`
- `projects`: `id`, `workspace_id`, `team_id`, `name`, `description`, `owner_id`, `manager_id`, `status` (Planning, Active, On Hold, Completed, Archived), `priority`, `start_date`, `deadline`
- `project_members`: `project_id`, `user_id`, `role`

### `tasks` & `task_assignees`
- `tasks`: `id`, `project_id`, `title`, `description`, `creator_id`, `priority` (Low, Medium, High, Urgent), `status` (To Do, In Progress, Review, Done), `due_date`
- `task_assignees`: `task_id`, `user_id`
- `task_labels`: `id`, `task_id`, `name`, `color`
- `task_comments`: `id`, `task_id`, `user_id`, `content`, `created_at`

### `activity_logs`
- `id`, `user_id`, `workspace_id`, `action`, `entity_type`, `entity_id`, `details`, `created_at`

---

## 2. MongoDB Document Collections

### `channels`
```json
{
  "_id": "ObjectId",
  "workspaceId": 1,
  "name": "frontend",
  "type": "public",
  "description": "Frontend development channel",
  "members": [101, 102, 103],
  "createdAt": "ISODate"
}
```

### `messages`
```json
{
  "_id": "ObjectId",
  "conversationId": "ObjectId(channel_or_dm_id)",
  "conversationType": "channel",
  "senderId": 101,
  "content": "The API endpoint is live now!",
  "replyTo": null,
  "reactions": [
    { "emoji": "👍", "users": [102, 103] }
  ],
  "attachments": [],
  "createdAt": "ISODate",
  "updatedAt": "ISODate",
  "deletedAt": null
}
```

---

## 3. Database Soft Delete Strategy

If a user account is deleted in MySQL:
1. `users.deleted_at` is set in MySQL (Soft Delete).
2. The user identity becomes `"Deleted User"` in application output.
3. Historical messages in MongoDB retain `senderId: 101`, preserving project conversation audit history.
