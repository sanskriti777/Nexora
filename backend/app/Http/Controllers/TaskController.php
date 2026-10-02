<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use App\Models\Workspace;
use App\Models\WorkspaceMember;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TaskController extends Controller
{
    /**
     * List tasks for the authenticated user within their authorized workspace scope.
     * Supports search, status, priority, project, and assignee filtering, sorting, and pagination.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        // 1. Resolve Workspace Scope
        $workspace = $this->resolveWorkspace($request, $user);
        if ($workspace === false) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized access to the specified workspace.',
            ], 403);
        }

        if (! $workspace) {
            return response()->json([
                'success' => true,
                'data' => [],
                'meta' => [
                    'current_page' => 1,
                    'last_page' => 1,
                    'per_page' => (int) $request->query('per_page', 20),
                    'total' => 0,
                ],
            ]);
        }

        // 2. Build Query scoped to Projects in the resolved Workspace
        $query = Task::whereHas('project', function ($q) use ($workspace) {
            $q->where('workspace_id', $workspace->id);
        })->with([
            'project:id,workspace_id,name,status',
            'creator:id,name,email',
            'assignees:id,name,email',
            'team:id,name',
            'labels:id,task_id,name,color',
        ]);

        // 3. Project Filter
        if ($projectId = $request->query('project_id')) {
            $query->where('project_id', $projectId);
        }

        // 4. Server-side Search (title and description)
        if ($search = $request->query('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                  ->orWhere('description', 'like', "%{$search}%");
            });
        }

        // 5. Status Filter
        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        // 6. Priority Filter
        if ($priority = $request->query('priority')) {
            $query->where('priority', $priority);
        }

        // 7. Assignee Filter
        if ($assigneeId = $request->query('assignee_id')) {
            $query->whereHas('assignees', function ($q) use ($assigneeId) {
                $q->where('users.id', $assigneeId);
            });
        }

        // 8. Server-side Sorting with Safe Allow-list
        $allowedSorts = ['title', 'created_at', 'updated_at', 'due_date', 'status', 'priority'];
        $sortBy = in_array($request->query('sort_by'), $allowedSorts) ? $request->query('sort_by') : 'created_at';
        $sortDirection = strtolower($request->query('sort_direction') ?? $request->query('sort_order') ?? 'desc') === 'asc' ? 'asc' : 'desc';
        $query->orderBy($sortBy, $sortDirection);

        // 9. Server-side Pagination
        $perPage = max(1, min(100, (int) $request->query('per_page', 20)));
        $paginated = $query->paginate($perPage);

        // 10. Format Result
        $tasks = collect($paginated->items())->map(function ($task) {
            return $this->formatTask($task);
        });

        return response()->json([
            'success' => true,
            'data' => $tasks,
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
            ],
        ]);
    }

    /**
     * Get tasks for a specific project.
     */
    public function projectTasks(Request $request, int $projectId): JsonResponse
    {
        $user = $request->user();

        $project = Project::find($projectId);
        if (! $project) {
            return response()->json([
                'success' => false,
                'message' => 'Project not found.',
            ], 404);
        }

        if (! $this->userCanAccessProject($user, $project)) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized access to this project.',
            ], 403);
        }

        $request->merge(['project_id' => $projectId]);

        return $this->index($request);
    }

    /**
     * Create a new task within a verified project and workspace.
     */
    public function store(Request $request, \App\Services\NotificationService $notificationService): JsonResponse
    {
        $user = $request->user();

        // 1. Validation
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'project_id' => ['required', 'integer', 'exists:projects,id'],
            'team_id' => ['nullable', 'integer', 'exists:teams,id'],
            'status' => ['nullable', 'string', 'in:todo,in_progress,review,done'],
            'priority' => ['nullable', 'string', 'in:low,medium,high,urgent'],
            'due_date' => ['nullable', 'date'],
            'assignees' => ['nullable', 'array'],
            'assignees.*' => ['integer', 'exists:users,id'],
        ]);

        // 2. Verify Project & Workspace Access
        $project = Project::with('workspace')->find($validated['project_id']);
        if (! $project) {
            return response()->json([
                'success' => false,
                'message' => 'Project not found.',
            ], 404);
        }

        $workspace = $project->workspace ?? Workspace::find($project->workspace_id);
        if (! $workspace || ! $this->userCanManageTasks($user, $workspace, $project)) {
            return response()->json([
                'success' => false,
                'message' => 'You do not have permission to create tasks in this project.',
            ], 403);
        }

        // 3. Verify Team belongs to same workspace if supplied
        if (! empty($validated['team_id'])) {
            $validTeam = \App\Models\Team::where('id', $validated['team_id'])
                ->where('workspace_id', $workspace->id)
                ->exists();
            if (! $validTeam) {
                return response()->json([
                    'success' => false,
                    'message' => 'Selected team does not belong to this workspace.',
                ], 422);
            }
        }

        // 4. Verify Assignees belong to the same workspace
        if (! empty($validated['assignees'])) {
            $invalidAssignee = $this->findNonWorkspaceUser($validated['assignees'], $workspace);
            if ($invalidAssignee) {
                return response()->json([
                    'success' => false,
                    'message' => 'One or more assignees do not belong to this workspace.',
                ], 422);
            }
        }

        // 5. Create Task
        $task = Task::create([
            'project_id' => $project->id,
            'team_id' => $validated['team_id'] ?? null,
            'creator_id' => $user->id,
            'title' => $validated['title'],
            'description' => $validated['description'] ?? null,
            'status' => $validated['status'] ?? 'todo',
            'priority' => $validated['priority'] ?? 'medium',
            'due_date' => $validated['due_date'] ?? null,
        ]);

        // 6. Sync Assignees
        if (! empty($validated['assignees'])) {
            $task->assignees()->sync($validated['assignees']);

            // Notify assignees (excluding creator if they assigned themselves)
            $notifyUsers = User::whereIn('id', $validated['assignees'])
                ->where('id', '!=', $user->id)
                ->get();

            $notificationService->sendToUsers(
                $notifyUsers,
                $workspace,
                'task_assigned',
                'New Task Assigned',
                "You have been assigned to '{$task->title}'",
                'task',
                $task->id,
                ['project_id' => $project->id]
            );
        }

        // 7. Activity Log
        ActivityLog::create([
            'user_id' => $user->id,
            'workspace_id' => $workspace->id,
            'action' => 'task_created',
            'entity_type' => 'Task',
            'entity_id' => $task->id,
            'details' => [
                'title' => $task->title,
                'project_id' => $project->id,
                'project_name' => $project->name,
                'status' => $task->status,
                'priority' => $task->priority,
            ],
        ]);

        $task->load([
            'project:id,workspace_id,name,status',
            'creator:id,name,email',
            'assignees:id,name,email',
            'team:id,name',
            'labels:id,task_id,name,color',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Task created successfully.',
            'data' => $this->formatTask($task),
        ], 201);
    }

    /**
     * Show task details.
     */
    public function show(Request $request, int $id): JsonResponse
    {
        $user = $request->user();

        $task = Task::with([
            'project' => fn($q) => $q->select('id', 'workspace_id', 'name', 'status')->with('workspace:id,name,slug'),
            'creator:id,name,email',
            'assignees:id,name,email',
            'team:id,name',
            'labels:id,task_id,name,color',
        ])->find($id);

        if (! $task) {
            return response()->json([
                'success' => false,
                'message' => 'Task not found.',
            ], 404);
        }

        // IDOR / Authorization Check: Verify user has access to this project/workspace
        if (! $this->userCanAccessProject($user, $task->project)) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized access to this task.',
            ], 403);
        }

        return response()->json([
            'success' => true,
            'data' => $this->formatTask($task),
        ]);
    }

    /**
     * Update an existing task.
     */
    public function update(Request $request, int $id, \App\Services\NotificationService $notificationService): JsonResponse
    {
        $user = $request->user();

        $task = Task::with('project.workspace')->find($id);
        if (! $task) {
            return response()->json([
                'success' => false,
                'message' => 'Task not found.',
            ], 404);
        }

        $project = $task->project;
        $workspace = $project->workspace ?? Workspace::find($project->workspace_id);

        if (! $this->userCanAccessProject($user, $project)) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized access to this task.',
            ], 403);
        }

        if (! $this->userCanManageTasks($user, $workspace, $project)) {
            // Check if user is an assignee updating status
            $isAssignee = $task->assignees()->where('users.id', $user->id)->exists();
            $onlyUpdatingStatus = $request->has('status') && count($request->except(['status'])) === 0;

            if (! ($isAssignee && $onlyUpdatingStatus)) {
                return response()->json([
                    'success' => false,
                    'message' => 'You do not have permission to modify this task.',
                ], 403);
            }
        }

        // Validation
        $validated = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'status' => ['nullable', 'string', 'in:todo,in_progress,review,done'],
            'priority' => ['nullable', 'string', 'in:low,medium,high,urgent'],
            'due_date' => ['nullable', 'date'],
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
            'team_id' => ['nullable', 'integer', 'exists:teams,id'],
            'assignees' => ['nullable', 'array'],
            'assignees.*' => ['integer', 'exists:users,id'],
        ]);

        // If project reassignment is requested, ensure destination project is in the same accessible workspace
        if (! empty($validated['project_id']) && $validated['project_id'] != $task->project_id) {
            $destProject = Project::find($validated['project_id']);
            if (! $destProject || $destProject->workspace_id !== $workspace->id || ! $this->userCanAccessProject($user, $destProject)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Cannot move task to an inaccessible project or different workspace.',
                ], 403);
            }
            $task->project_id = $destProject->id;
        }

        $oldAssignees = $task->assignees()->pluck('users.id')->toArray();

        // Validate Assignees belong to workspace
        if (array_key_exists('assignees', $validated)) {
            if (! empty($validated['assignees'])) {
                $invalidAssignee = $this->findNonWorkspaceUser($validated['assignees'], $workspace);
                if ($invalidAssignee) {
                    return response()->json([
                        'success' => false,
                        'message' => 'One or more assignees do not belong to this workspace.',
                    ], 422);
                }
            }
            $task->assignees()->sync($validated['assignees'] ?? []);

            $newAssignees = array_diff($validated['assignees'] ?? [], $oldAssignees);
            if (!empty($newAssignees)) {
                $notifyUsers = User::whereIn('id', $newAssignees)
                    ->where('id', '!=', $user->id)
                    ->get();
                $notificationService->sendToUsers(
                    $notifyUsers,
                    $workspace,
                    'task_assigned',
                    'New Task Assigned',
                    "You have been assigned to '{$task->title}'",
                    'task',
                    $task->id,
                    ['project_id' => $project->id]
                );
            }
        }

        $changes = [];

        // Update fields
        if (isset($validated['title'])) {
            $task->title = $validated['title'];
        }
        if (array_key_exists('description', $validated)) {
            $task->description = $validated['description'];
        }
        if (isset($validated['status']) && $validated['status'] !== $task->status) {
            $task->status = $validated['status'];
            $changes['status'] = true;
        }
        if (isset($validated['priority']) && $validated['priority'] !== $task->priority) {
            $task->priority = $validated['priority'];
            $changes['priority'] = true;
        }
        if (array_key_exists('due_date', $validated) && $validated['due_date'] !== $task->due_date) {
            $task->due_date = $validated['due_date'];
            $changes['due_date'] = true;
        }
        if (array_key_exists('team_id', $validated)) {
            $task->team_id = $validated['team_id'];
        }

        $task->save();

        if (!empty($changes)) {
            $notifyUserIds = $task->assignees()->where('users.id', '!=', $user->id)->pluck('users.id')->toArray();
            if ($task->creator_id && $task->creator_id !== $user->id && !in_array($task->creator_id, $notifyUserIds)) {
                $notifyUserIds[] = $task->creator_id;
            }
            if (!empty($notifyUserIds)) {
                $notifyUsers = User::whereIn('id', $notifyUserIds)->get();
                if ($notifyUsers->isNotEmpty()) {
                    if (isset($changes['status'])) {
                        $notificationService->sendToUsers($notifyUsers, $workspace, 'task_status_changed', 'Task Status Updated', "Status for '{$task->title}' changed to {$task->status}", 'task', $task->id, ['project_id' => $project->id]);
                    }
                    if (isset($changes['priority'])) {
                        $notificationService->sendToUsers($notifyUsers, $workspace, 'task_priority_changed', 'Task Priority Updated', "Priority for '{$task->title}' changed to {$task->priority}", 'task', $task->id, ['project_id' => $project->id]);
                    }
                    if (isset($changes['due_date'])) {
                        $notificationService->sendToUsers($notifyUsers, $workspace, 'task_due_date_changed', 'Task Due Date Updated', "Due date for '{$task->title}' changed", 'task', $task->id, ['project_id' => $project->id]);
                    }
                }
            }
        }

        // Activity Log
        ActivityLog::create([
            'user_id' => $user->id,
            'workspace_id' => $workspace->id,
            'action' => 'task_updated',
            'entity_type' => 'Task',
            'entity_id' => $task->id,
            'details' => [
                'title' => $task->title,
                'status' => $task->status,
                'priority' => $task->priority,
            ],
        ]);

        $task->load([
            'project:id,workspace_id,name,status',
            'creator:id,name,email',
            'assignees:id,name,email',
            'team:id,name',
            'labels:id,task_id,name,color',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Task updated successfully.',
            'data' => $this->formatTask($task),
        ]);
    }

    /**
     * Soft-delete a task.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $user = $request->user();

        $task = Task::with('project.workspace')->find($id);
        if (! $task) {
            return response()->json([
                'success' => false,
                'message' => 'Task not found.',
            ], 404);
        }

        $project = $task->project;
        $workspace = $project->workspace ?? Workspace::find($project->workspace_id);

        if (! $this->userCanAccessProject($user, $project)) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized access to this task.',
            ], 403);
        }

        if (! $this->userCanManageTasks($user, $workspace, $project)) {
            return response()->json([
                'success' => false,
                'message' => 'You do not have permission to delete this task.',
            ], 403);
        }

        // Record Activity before soft delete
        ActivityLog::create([
            'user_id' => $user->id,
            'workspace_id' => $workspace->id,
            'action' => 'task_deleted',
            'entity_type' => 'Task',
            'entity_id' => $task->id,
            'details' => [
                'title' => $task->title,
                'project_id' => $project->id,
            ],
        ]);

        $task->delete();

        return response()->json([
            'success' => true,
            'message' => 'Task deleted successfully.',
        ]);
    }

    /**
     * Format a task model into standard JSON response array.
     */
    protected function formatTask(Task $task): array
    {
        return [
            'id' => $task->id,
            'project_id' => $task->project_id,
            'team_id' => $task->team_id,
            'creator_id' => $task->creator_id,
            'title' => $task->title,
            'description' => $task->description,
            'status' => $task->status,
            'priority' => $task->priority,
            'due_date' => $task->due_date ? $task->due_date->toISOString() : null,
            'project' => $task->project ? [
                'id' => $task->project->id,
                'workspace_id' => $task->project->workspace_id,
                'name' => $task->project->name,
                'status' => $task->project->status,
                'workspace' => $task->project->relationLoaded('workspace') && $task->project->workspace ? [
                    'id' => $task->project->workspace->id,
                    'name' => $task->project->workspace->name,
                    'slug' => $task->project->workspace->slug,
                ] : null,
            ] : null,
            'creator' => $task->creator ? [
                'id' => $task->creator->id,
                'name' => $task->creator->name,
                'email' => $task->creator->email,
            ] : null,
            'assignees' => $task->assignees ? $task->assignees->map(fn($u) => [
                'id' => $u->id,
                'name' => $u->name,
                'email' => $u->email,
            ]) : [],
            'team' => $task->team ? [
                'id' => $task->team->id,
                'name' => $task->team->name,
            ] : null,
            'labels' => $task->labels ? $task->labels->map(fn($l) => [
                'id' => $l->id,
                'name' => $l->name,
                'color' => $l->color,
            ]) : [],
            'created_at' => $task->created_at ? $task->created_at->toISOString() : null,
            'updated_at' => $task->updated_at ? $task->updated_at->toISOString() : null,
        ];
    }

    /**
     * Resolve workspace context from header, query, or fallback.
     * Returns false if specified workspace is unauthorized.
     */
    protected function resolveWorkspace(Request $request, User $user): Workspace|null|false
    {
        $requestedWorkspaceId = $request->header('X-Workspace-Id') ?? $request->query('workspace_id');

        if ($requestedWorkspaceId) {
            $workspace = Workspace::where('id', $requestedWorkspaceId)
                ->where(function ($query) use ($user) {
                    $query->where('owner_id', $user->id)
                          ->orWhereHas('members', function ($m) use ($user) {
                              $m->where('users.id', $user->id);
                          });
                })->first();

            return $workspace ?: false;
        }

        return $user->workspaces()->first()
            ?? Workspace::where('owner_id', $user->id)->first();
    }

    /**
     * Check if user can access (view) a specific project.
     */
    protected function userCanAccessProject(User $user, ?Project $project): bool
    {
        if (! $project) {
            return false;
        }

        $workspace = $project->workspace ?? Workspace::find($project->workspace_id);
        if (! $workspace) {
            return false;
        }

        if ($workspace->owner_id === $user->id) {
            return true;
        }

        $isWorkspaceMember = WorkspaceMember::where('workspace_id', $workspace->id)
            ->where('user_id', $user->id)
            ->exists();

        if ($isWorkspaceMember) {
            return true;
        }

        return ProjectMember::where('project_id', $project->id)
            ->where('user_id', $user->id)
            ->exists();
    }

    /**
     * Check if user has permission to manage (create, edit, delete) tasks in a project/workspace.
     */
    protected function userCanManageTasks(User $user, ?Workspace $workspace, ?Project $project): bool
    {
        if (! $workspace) {
            return false;
        }

        // Workspace owner has full privileges
        if ($workspace->owner_id === $user->id) {
            return true;
        }

        // Project owner / manager has task management privileges for that project
        if ($project && ($project->owner_id === $user->id || $project->manager_id === $user->id)) {
            return true;
        }

        $membership = WorkspaceMember::where('workspace_id', $workspace->id)
            ->where('user_id', $user->id)
            ->with('role.permissions')
            ->first();

        if (! $membership || ! $membership->role) {
            // Check direct project membership role
            if ($project) {
                $projMember = ProjectMember::where('project_id', $project->id)
                    ->where('user_id', $user->id)
                    ->first();
                if ($projMember && in_array($projMember->role, ['owner', 'manager', 'lead'])) {
                    return true;
                }
            }
            return false;
        }

        // Administrative roles
        if (in_array($membership->role->slug, ['admin', 'project_manager', 'team_lead'])) {
            return true;
        }

        return $membership->role->permissions->contains('slug', 'tasks.manage');
    }

    /**
     * Check that all assignee user IDs belong to the workspace.
     * Returns the first non-matching user ID or null if all valid.
     */
    protected function findNonWorkspaceUser(array $userIds, Workspace $workspace): ?int
    {
        foreach ($userIds as $uid) {
            $isOwner = $workspace->owner_id == $uid;
            $isMember = WorkspaceMember::where('workspace_id', $workspace->id)
                ->where('user_id', $uid)
                ->exists();

            if (! $isOwner && ! $isMember) {
                return (int) $uid;
            }
        }

        return null;
    }
}
