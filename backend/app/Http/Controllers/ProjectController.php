<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\Role;
use App\Models\User;
use App\Models\Workspace;
use App\Models\WorkspaceMember;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProjectController extends Controller
{
    /**
     * List projects for the authenticated user within their authorized workspace.
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

        // If user has no workspaces, return empty paginated result
        if (! $workspace) {
            return response()->json([
                'success' => true,
                'data' => [],
                'meta' => [
                    'current_page' => 1,
                    'last_page' => 1,
                    'per_page' => (int) $request->query('per_page', 10),
                    'total' => 0,
                ],
            ]);
        }

        // 2. Build Query
        $query = Project::where('workspace_id', $workspace->id)
            ->with(['owner:id,name,email', 'manager:id,name,email', 'team:id,name', 'members:id,name,email'])
            ->withCount([
                'tasks as total_tasks_count',
                'tasks as completed_tasks_count' => fn($q) => $q->where('status', 'done'),
                'tasks as in_progress_tasks_count' => fn($q) => $q->whereIn('status', ['in_progress', 'review']),
                'members',
            ]);

        // 3. Server-side Search
        if ($search = $request->query('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('description', 'like', "%{$search}%");
            });
        }

        // 4. Server-side Filtering
        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        if ($priority = $request->query('priority')) {
            $query->where('priority', $priority);
        }

        if ($memberId = $request->query('member_id')) {
            $query->where(function ($q) use ($memberId) {
                $q->where('owner_id', $memberId)
                  ->orWhereHas('members', fn($m) => $m->where('users.id', $memberId));
            });
        }

        // 5. Server-side Sorting with Safe Allow-list
        $allowedSorts = ['name', 'created_at', 'updated_at', 'due_date', 'status', 'priority'];
        $sortBy = in_array($request->query('sort_by'), $allowedSorts) ? $request->query('sort_by') : 'created_at';
        $sortOrder = strtolower($request->query('sort_order')) === 'asc' ? 'asc' : 'desc';
        $query->orderBy($sortBy, $sortOrder);

        // 6. Server-side Pagination
        $perPage = max(1, min(100, (int) $request->query('per_page', 10)));
        $paginated = $query->paginate($perPage);

        // 7. Format Result with Progress Calculation
        $projects = collect($paginated->items())->map(function ($project) {
            $total = $project->total_tasks_count ?? 0;
            $completed = $project->completed_tasks_count ?? 0;
            $progress = $total > 0 ? round(($completed / $total) * 100, 1) : null;

            return [
                'id' => $project->id,
                'workspace_id' => $project->workspace_id,
                'name' => $project->name,
                'description' => $project->description,
                'status' => $project->status,
                'priority' => $project->priority,
                'start_date' => $project->start_date ? $project->start_date->toDateString() : null,
                'due_date' => $project->due_date ? $project->due_date->toDateString() : null,
                'owner' => $project->owner ? [
                    'id' => $project->owner->id,
                    'name' => $project->owner->name,
                    'email' => $project->owner->email,
                ] : null,
                'manager' => $project->manager ? [
                    'id' => $project->manager->id,
                    'name' => $project->manager->name,
                    'email' => $project->manager->email,
                ] : null,
                'team' => $project->team ? [
                    'id' => $project->team->id,
                    'name' => $project->team->name,
                ] : null,
                'members_count' => $project->members_count ?? 0,
                'total_tasks_count' => $total,
                'completed_tasks_count' => $completed,
                'in_progress_tasks_count' => $project->in_progress_tasks_count ?? 0,
                'progress' => $progress,
                'created_at' => $project->created_at ? $project->created_at->toISOString() : null,
                'updated_at' => $project->updated_at ? $project->updated_at->toISOString() : null,
            ];
        });

        return response()->json([
            'success' => true,
            'data' => $projects,
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
            ],
        ]);
    }

    /**
     * Create a new project within the authorized workspace.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        // 1. Resolve Workspace Scope
        $workspace = $this->resolveWorkspace($request, $user);
        if ($workspace === false || ! $workspace) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized or missing workspace context.',
            ], 403);
        }

        // 2. Authorization: Verify user can manage projects in this workspace
        if (! $this->userCanManageProjects($user, $workspace)) {
            return response()->json([
                'success' => false,
                'message' => 'You do not have permission to create projects in this workspace.',
            ], 403);
        }

        // 3. Validation
        $validated = $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('projects', 'name')
                    ->where('workspace_id', $workspace->id)
                    ->whereNull('deleted_at'),
            ],
            'description' => ['nullable', 'string', 'max:2000'],
            'status' => ['nullable', 'string', 'in:planning,active,on_hold,completed,archived'],
            'priority' => ['nullable', 'string', 'in:low,medium,high,urgent'],
            'start_date' => ['nullable', 'date'],
            'due_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'team_id' => [
                'nullable',
                'integer',
                Rule::exists('teams', 'id')->where('workspace_id', $workspace->id),
            ],
            'manager_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        // 4. Create Project
        $project = Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $user->id,
            'team_id' => $validated['team_id'] ?? null,
            'manager_id' => $validated['manager_id'] ?? null,
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
            'status' => $validated['status'] ?? 'planning',
            'priority' => $validated['priority'] ?? 'medium',
            'start_date' => $validated['start_date'] ?? null,
            'due_date' => $validated['due_date'] ?? null,
        ]);

        // 5. Automatically attach creator as initial member
        ProjectMember::firstOrCreate([
            'project_id' => $project->id,
            'user_id' => $user->id,
        ], [
            'role' => 'owner',
        ]);

        // 6. Log Activity
        ActivityLog::create([
            'user_id' => $user->id,
            'workspace_id' => $workspace->id,
            'action' => 'project_created',
            'entity_type' => 'Project',
            'entity_id' => $project->id,
            'details' => [
                'name' => $project->name,
                'status' => $project->status,
                'priority' => $project->priority,
            ],
        ]);

        $project->load(['owner:id,name,email', 'manager:id,name,email', 'team:id,name', 'members:id,name,email']);

        return response()->json([
            'success' => true,
            'message' => 'Project created successfully.',
            'data' => $project,
        ], 201);
    }

    /**
     * Show detailed project information, progress, task breakdown, members, and activity.
     */
    public function show(Request $request, int $id): JsonResponse
    {
        $user = $request->user();

        $project = Project::with([
            'workspace:id,name,slug',
            'owner:id,name,email',
            'manager:id,name,email',
            'team:id,name',
            'members' => fn($q) => $q->select('users.id', 'users.name', 'users.email'),
        ])->find($id);

        if (! $project) {
            return response()->json([
                'success' => false,
                'message' => 'Project not found.',
            ], 404);
        }

        // Authorization check: Verify user can access this project
        if (! $this->userCanAccessProject($user, $project)) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized access to this project.',
            ], 403);
        }

        // Calculate real task metrics
        $tasksQuery = $project->tasks();
        $totalTasks = (clone $tasksQuery)->count();
        $completedTasks = (clone $tasksQuery)->where('status', 'done')->count();
        $inProgressTasks = (clone $tasksQuery)->whereIn('status', ['in_progress', 'review'])->count();
        $todoTasks = (clone $tasksQuery)->where('status', 'todo')->count();
        $overdueTasks = (clone $tasksQuery)
            ->where('status', '!=', 'done')
            ->whereNotNull('due_date')
            ->where('due_date', '<', now())
            ->count();

        $progress = $totalTasks > 0 ? round(($completedTasks / $totalTasks) * 100, 1) : null;

        // Fetch recent tasks for summary
        $recentTasks = $project->tasks()
            ->with(['creator:id,name,email', 'assignees:id,name,email'])
            ->latest()
            ->take(10)
            ->get()
            ->map(fn($t) => [
                'id' => $t->id,
                'title' => $t->title,
                'status' => $t->status,
                'priority' => $t->priority,
                'due_date' => $t->due_date ? $t->due_date->toDateString() : null,
                'creator' => $t->creator ? ['id' => $t->creator->id, 'name' => $t->creator->name] : null,
                'assignees' => $t->assignees->map(fn($a) => ['id' => $a->id, 'name' => $a->name]),
            ]);

        // Fetch recent project activity
        $recentActivity = ActivityLog::where('workspace_id', $project->workspace_id)
            ->where('entity_type', 'Project')
            ->where('entity_id', $project->id)
            ->with('user:id,name,email')
            ->latest()
            ->take(10)
            ->get()
            ->map(fn($a) => [
                'id' => $a->id,
                'action' => $a->action,
                'user' => $a->user ? ['id' => $a->user->id, 'name' => $a->user->name] : null,
                'details' => $a->details,
                'created_at' => $a->created_at ? $a->created_at->toISOString() : null,
            ]);

        return response()->json([
            'success' => true,
            'data' => [
                'id' => $project->id,
                'workspace' => $project->workspace,
                'name' => $project->name,
                'description' => $project->description,
                'status' => $project->status,
                'priority' => $project->priority,
                'start_date' => $project->start_date ? $project->start_date->toDateString() : null,
                'due_date' => $project->due_date ? $project->due_date->toDateString() : null,
                'owner' => $project->owner ? [
                    'id' => $project->owner->id,
                    'name' => $project->owner->name,
                    'email' => $project->owner->email,
                ] : null,
                'manager' => $project->manager ? [
                    'id' => $project->manager->id,
                    'name' => $project->manager->name,
                    'email' => $project->manager->email,
                ] : null,
                'team' => $project->team ? [
                    'id' => $project->team->id,
                    'name' => $project->team->name,
                ] : null,
                'members' => $project->members->map(fn($m) => [
                    'id' => $m->id,
                    'name' => $m->name,
                    'email' => $m->email,
                    'role' => $m->pivot->role ?? 'member',
                ]),
                'statistics' => [
                    'total_tasks' => $totalTasks,
                    'completed_tasks' => $completedTasks,
                    'in_progress_tasks' => $inProgressTasks,
                    'todo_tasks' => $todoTasks,
                    'overdue_tasks' => $overdueTasks,
                    'progress' => $progress,
                ],
                'recent_tasks' => $recentTasks,
                'recent_activity' => $recentActivity,
                'created_at' => $project->created_at ? $project->created_at->toISOString() : null,
                'updated_at' => $project->updated_at ? $project->updated_at->toISOString() : null,
            ],
        ]);
    }

    /**
     * Update project attributes.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $user = $request->user();

        $project = Project::find($id);
        if (! $project) {
            return response()->json([
                'success' => false,
                'message' => 'Project not found.',
            ], 404);
        }

        $workspace = Workspace::find($project->workspace_id);

        // Authorization check: User must have permission to manage projects in this workspace
        if (! $this->userCanManageProjects($user, $workspace)) {
            return response()->json([
                'success' => false,
                'message' => 'You do not have permission to update this project.',
            ], 403);
        }

        // Validation
        $validated = $request->validate([
            'name' => [
                'sometimes',
                'required',
                'string',
                'max:255',
                Rule::unique('projects', 'name')
                    ->where('workspace_id', $project->workspace_id)
                    ->whereNull('deleted_at')
                    ->ignore($project->id),
            ],
            'description' => ['nullable', 'string', 'max:2000'],
            'status' => ['nullable', 'string', 'in:planning,active,on_hold,completed,archived'],
            'priority' => ['nullable', 'string', 'in:low,medium,high,urgent'],
            'start_date' => ['nullable', 'date'],
            'due_date' => ['nullable', 'date'],
            'team_id' => [
                'nullable',
                'integer',
                Rule::exists('teams', 'id')->where('workspace_id', $project->workspace_id),
            ],
            'manager_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        $project->update($validated);

        // Log Activity
        ActivityLog::create([
            'user_id' => $user->id,
            'workspace_id' => $project->workspace_id,
            'action' => 'project_updated',
            'entity_type' => 'Project',
            'entity_id' => $project->id,
            'details' => $validated,
        ]);

        $project->load(['owner:id,name,email', 'manager:id,name,email', 'team:id,name', 'members:id,name,email']);

        return response()->json([
            'success' => true,
            'message' => 'Project updated successfully.',
            'data' => $project,
        ]);
    }

    /**
     * Soft delete/archive the project.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $user = $request->user();

        $project = Project::find($id);
        if (! $project) {
            return response()->json([
                'success' => false,
                'message' => 'Project not found.',
            ], 404);
        }

        $workspace = Workspace::find($project->workspace_id);

        // Authorization check: User must have permission to manage projects in this workspace
        if (! $this->userCanManageProjects($user, $workspace)) {
            return response()->json([
                'success' => false,
                'message' => 'You do not have permission to delete this project.',
            ], 403);
        }

        // Soft delete the project
        $project->delete();

        // Log Activity
        ActivityLog::create([
            'user_id' => $user->id,
            'workspace_id' => $workspace->id,
            'action' => 'project_deleted',
            'entity_type' => 'Project',
            'entity_id' => $id,
            'details' => ['name' => $project->name],
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Project deleted successfully.',
        ]);
    }

    /**
     * Add a member to the project.
     */
    public function addMember(Request $request, int $id): JsonResponse
    {
        $user = $request->user();

        $project = Project::find($id);
        if (! $project) {
            return response()->json([
                'success' => false,
                'message' => 'Project not found.',
            ], 404);
        }

        $workspace = Workspace::find($project->workspace_id);

        if (! $this->userCanManageProjects($user, $workspace)) {
            return response()->json([
                'success' => false,
                'message' => 'You do not have permission to manage project members.',
            ], 403);
        }

        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'role' => ['nullable', 'string', 'max:50'],
        ]);

        // Target user must belong to the workspace
        $targetUser = User::find($validated['user_id']);
        $isInWorkspace = $workspace->owner_id === $targetUser->id
            || WorkspaceMember::where('workspace_id', $workspace->id)->where('user_id', $targetUser->id)->exists();

        if (! $isInWorkspace) {
            return response()->json([
                'success' => false,
                'message' => 'User must be a member of the workspace before being added to a project.',
            ], 422);
        }

        // Duplicate prevention
        $existing = ProjectMember::where('project_id', $project->id)
            ->where('user_id', $targetUser->id)
            ->first();

        if ($existing) {
            return response()->json([
                'success' => false,
                'message' => 'User is already a member of this project.',
            ], 422);
        }

        $member = ProjectMember::create([
            'project_id' => $project->id,
            'user_id' => $targetUser->id,
            'role' => $validated['role'] ?? 'member',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Member added successfully.',
            'data' => [
                'id' => $targetUser->id,
                'name' => $targetUser->name,
                'email' => $targetUser->email,
                'role' => $member->role,
            ],
        ], 201);
    }

    /**
     * Remove a member from the project.
     */
    public function removeMember(Request $request, int $id, int $userId): JsonResponse
    {
        $user = $request->user();

        $project = Project::find($id);
        if (! $project) {
            return response()->json([
                'success' => false,
                'message' => 'Project not found.',
            ], 404);
        }

        $workspace = Workspace::find($project->workspace_id);

        if (! $this->userCanManageProjects($user, $workspace)) {
            return response()->json([
                'success' => false,
                'message' => 'You do not have permission to manage project members.',
            ], 403);
        }

        if ($project->owner_id === $userId) {
            return response()->json([
                'success' => false,
                'message' => 'Cannot remove the project owner.',
            ], 422);
        }

        ProjectMember::where('project_id', $project->id)
            ->where('user_id', $userId)
            ->delete();

        return response()->json([
            'success' => true,
            'message' => 'Member removed successfully.',
        ]);
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
     * Check if a user has permission to manage (create, edit, delete) projects in a workspace.
     */
    protected function userCanManageProjects(User $user, ?Workspace $workspace): bool
    {
        if (! $workspace) {
            return false;
        }

        // Workspace owner has full privileges
        if ($workspace->owner_id === $user->id) {
            return true;
        }

        $membership = WorkspaceMember::where('workspace_id', $workspace->id)
            ->where('user_id', $user->id)
            ->with('role.permissions')
            ->first();

        if (! $membership || ! $membership->role) {
            return false;
        }

        // Specific administrative role slugs
        if (in_array($membership->role->slug, ['admin', 'project_manager'])) {
            return true;
        }

        return $membership->role->permissions->contains('slug', 'projects.manage');
    }

    /**
     * Check if a user can access (view) a specific project.
     */
    protected function userCanAccessProject(User $user, Project $project): bool
    {
        $workspace = $project->workspace ?? Workspace::find($project->workspace_id);
        if (! $workspace) {
            return false;
        }

        // Workspace owner has access
        if ($workspace->owner_id === $user->id) {
            return true;
        }

        // Workspace members have access
        $isWorkspaceMember = WorkspaceMember::where('workspace_id', $workspace->id)
            ->where('user_id', $user->id)
            ->exists();

        if ($isWorkspaceMember) {
            return true;
        }

        // Direct project members have access
        return ProjectMember::where('project_id', $project->id)
            ->where('user_id', $user->id)
            ->exists();
    }
}
