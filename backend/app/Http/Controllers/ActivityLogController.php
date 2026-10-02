<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Attachment;
use App\Models\Project;
use App\Models\Task;
use App\Models\Team;
use App\Models\User;
use App\Models\Workspace;
use App\Models\WorkspaceMember;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ActivityLogController extends Controller
{
    /**
     * List activity / audit logs with filtering, searching, and pagination.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        // 1. Resolve and authorize workspace scope
        $requestedWorkspaceId = $request->header('X-Workspace-Id') ?? $request->query('workspace_id');

        if ($requestedWorkspaceId !== null && $requestedWorkspaceId !== '') {
            $workspaceId = (int) $requestedWorkspaceId;
            if (! $this->userBelongsToWorkspace($user->id, $workspaceId)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unauthorized access to this workspace activity.',
                ], 403);
            }
            $targetWorkspaceIds = [$workspaceId];
        } else {
            // Get all workspaces the authenticated user belongs to
            $targetWorkspaceIds = $this->getUserAccessibleWorkspaceIds($user->id);
            if (empty($targetWorkspaceIds)) {
                return response()->json([
                    'success' => true,
                    'data' => [],
                    'pagination' => [
                        'current_page' => 1,
                        'per_page' => 20,
                        'total' => 0,
                        'last_page' => 1,
                        'has_more' => false,
                    ],
                ]);
            }
        }

        // 2. Build Query
        $query = ActivityLog::whereIn('workspace_id', $targetWorkspaceIds)
            ->with([
                'user:id,name,email',
                'workspace:id,name,slug',
            ]);

        // Filter: User (Actor)
        if ($request->filled('user_id')) {
            $query->byUser((int) $request->query('user_id'));
        }

        // Filter: Action
        if ($request->filled('action')) {
            $query->byAction(trim((string) $request->query('action')));
        }

        // Filter: Entity Type and optional Entity ID
        if ($request->filled('entity_type')) {
            $entityType = trim((string) $request->query('entity_type'));
            $entityId = $request->filled('entity_id') ? (int) $request->query('entity_id') : null;
            $query->byEntity($entityType, $entityId);
        } elseif ($request->filled('entity_id')) {
            $query->where('entity_id', (int) $request->query('entity_id'));
        }

        // Filter: Date range
        $from = $request->query('from');
        $to = $request->query('to');
        if ($from || $to) {
            $query->betweenDates($from, $to);
        }

        // Filter: Search
        if ($request->filled('search')) {
            $query->search((string) $request->query('search'));
        }

        // 3. Pagination & Ordering (Newest First)
        $perPage = (int) $request->query('per_page', 20);
        $perPage = max(1, min(100, $perPage));

        $paginated = $query->orderBy('created_at', 'desc')
            ->orderBy('id', 'desc')
            ->paginate($perPage);

        // 4. Batch resolve live entity info without N+1 queries
        $items = $paginated->items();
        $formatted = $this->formatActivitiesWithEntities($items);

        return response()->json([
            'success' => true,
            'data' => $formatted,
            'pagination' => [
                'current_page' => $paginated->currentPage(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
                'last_page' => $paginated->lastPage(),
                'has_more' => $paginated->hasMorePages(),
            ],
        ]);
    }

    /**
     * Show a single activity log record with detailed information.
     */
    public function show(Request $request, int $id): JsonResponse
    {
        $user = $request->user();

        $activity = ActivityLog::with([
            'user:id,name,email',
            'workspace:id,name,slug',
        ])->find($id);

        if (! $activity) {
            return response()->json([
                'success' => false,
                'message' => 'Activity record not found.',
            ], 404);
        }

        if (! $this->userBelongsToWorkspace($user->id, $activity->workspace_id)) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized access to this activity.',
            ], 403);
        }

        $formatted = $this->formatActivitiesWithEntities([$activity]);

        return response()->json([
            'success' => true,
            'data' => $formatted[0] ?? null,
        ]);
    }

    /**
     * Return available activity filters (distinct actions and entity types)
     * for the user's accessible workspace context.
     */
    public function filters(Request $request): JsonResponse
    {
        $user = $request->user();
        $requestedWorkspaceId = $request->header('X-Workspace-Id') ?? $request->query('workspace_id');

        if ($requestedWorkspaceId !== null && $requestedWorkspaceId !== '') {
            $workspaceId = (int) $requestedWorkspaceId;
            if (! $this->userBelongsToWorkspace($user->id, $workspaceId)) {
                return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
            }
            $targetWorkspaceIds = [$workspaceId];
        } else {
            $targetWorkspaceIds = $this->getUserAccessibleWorkspaceIds($user->id);
        }

        $actions = ActivityLog::whereIn('workspace_id', $targetWorkspaceIds)
            ->distinct()
            ->pluck('action')
            ->filter()
            ->values();

        $entityTypes = ActivityLog::whereIn('workspace_id', $targetWorkspaceIds)
            ->distinct()
            ->pluck('entity_type')
            ->filter()
            ->values();

        // Get members in these workspaces
        $memberIds = WorkspaceMember::whereIn('workspace_id', $targetWorkspaceIds)
            ->pluck('user_id')
            ->merge(Workspace::whereIn('id', $targetWorkspaceIds)->pluck('owner_id'))
            ->unique()
            ->values();

        $actors = User::whereIn('id', $memberIds)
            ->select('id', 'name', 'email')
            ->orderBy('name')
            ->get();

        return response()->json([
            'success' => true,
            'data' => [
                'actions' => $actions,
                'entity_types' => $entityTypes,
                'actors' => $actors,
            ],
        ]);
    }

    /**
     * Batch format activities and resolve live/historical entity names efficiently.
     */
    protected function formatActivitiesWithEntities(array $activities): array
    {
        if (empty($activities)) {
            return [];
        }

        // Collect entity IDs by normalized entity type
        $entityMap = [
            'project' => [],
            'task' => [],
            'team' => [],
            'workspace' => [],
            'attachment' => [],
        ];

        foreach ($activities as $log) {
            $type = strtolower($log->entity_type);
            if (isset($entityMap[$type]) && $log->entity_id) {
                $entityMap[$type][] = (int) $log->entity_id;
            }
        }

        // Bulk load live entity titles/names in one query per entity type
        $liveProjects = ! empty($entityMap['project'])
            ? Project::whereIn('id', array_unique($entityMap['project']))->pluck('name', 'id')->all()
            : [];

        $liveTasks = ! empty($entityMap['task'])
            ? Task::whereIn('id', array_unique($entityMap['task']))->pluck('title', 'id')->all()
            : [];

        $liveTeams = ! empty($entityMap['team'])
            ? Team::whereIn('id', array_unique($entityMap['team']))->pluck('name', 'id')->all()
            : [];

        $liveWorkspaces = ! empty($entityMap['workspace'])
            ? Workspace::whereIn('id', array_unique($entityMap['workspace']))->pluck('name', 'id')->all()
            : [];

        $liveAttachments = ! empty($entityMap['attachment'])
            ? Attachment::whereIn('id', array_unique($entityMap['attachment']))->pluck('original_name', 'id')->all()
            : [];

        $result = [];
        foreach ($activities as $log) {
            $type = strtolower($log->entity_type);
            $entityName = null;
            $exists = false;

            if ($type === 'project' && isset($liveProjects[$log->entity_id])) {
                $entityName = $liveProjects[$log->entity_id];
                $exists = true;
            } elseif ($type === 'task' && isset($liveTasks[$log->entity_id])) {
                $entityName = $liveTasks[$log->entity_id];
                $exists = true;
            } elseif ($type === 'team' && isset($liveTeams[$log->entity_id])) {
                $entityName = $liveTeams[$log->entity_id];
                $exists = true;
            } elseif ($type === 'workspace' && isset($liveWorkspaces[$log->entity_id])) {
                $entityName = $liveWorkspaces[$log->entity_id];
                $exists = true;
            } elseif ($type === 'attachment' && isset($liveAttachments[$log->entity_id])) {
                $entityName = $liveAttachments[$log->entity_id];
                $exists = true;
            }

            // Fallback to historical details if entity no longer exists in DB
            if ($entityName === null && is_array($log->details)) {
                $entityName = $log->details['name']
                    ?? $log->details['title']
                    ?? $log->details['original_name']
                    ?? null;
            }

            $result[] = [
                'id' => $log->id,
                'action' => $log->action,
                'entity_type' => $log->entity_type,
                'entity_id' => $log->entity_id,
                'entity' => [
                    'type' => $log->entity_type,
                    'id' => $log->entity_id,
                    'name' => $entityName,
                    'exists' => $exists,
                ],
                'actor' => $log->user ? [
                    'id' => $log->user->id,
                    'name' => $log->user->name,
                    'email' => $log->user->email,
                ] : null,
                'workspace' => $log->workspace ? [
                    'id' => $log->workspace->id,
                    'name' => $log->workspace->name,
                    'slug' => $log->workspace->slug,
                ] : null,
                'details' => $log->details ?? [],
                'created_at' => $log->created_at?->toIso8601String(),
                'created_at_human' => $log->created_at?->diffForHumans(),
            ];
        }

        return $result;
    }

    /**
     * Check if a user belongs to a workspace (as owner or member).
     */
    protected function userBelongsToWorkspace(int $userId, ?int $workspaceId): bool
    {
        if (! $workspaceId) {
            return false;
        }

        $workspace = Workspace::find($workspaceId);
        if (! $workspace) {
            return false;
        }

        if ($workspace->owner_id === $userId) {
            return true;
        }

        return WorkspaceMember::where('workspace_id', $workspaceId)
            ->where('user_id', $userId)
            ->exists();
    }

    /**
     * Get all workspace IDs the user is a member or owner of.
     */
    protected function getUserAccessibleWorkspaceIds(int $userId): array
    {
        $owned = Workspace::where('owner_id', $userId)->pluck('id');
        $memberOf = WorkspaceMember::where('user_id', $userId)->pluck('workspace_id');

        return $owned->merge($memberOf)->unique()->values()->all();
    }
}
