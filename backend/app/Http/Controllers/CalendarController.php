<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Models\Workspace;
use App\Models\WorkspaceMember;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CalendarController extends Controller
{
    /**
     * Get workspace-scoped tasks with due dates for calendar visualization.
     * Supports date range (start, end), project, team, assignee, status, and priority filters.
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
                    'total' => 0,
                    'start' => $request->query('start'),
                    'end' => $request->query('end'),
                    'workspace_id' => null,
                ],
            ]);
        }

        // 2. Base Query: Only tasks with due_date belonging to projects in this workspace
        $query = Task::whereHas('project', function ($q) use ($workspace) {
            $q->where('workspace_id', $workspace->id);
        })
        ->whereNotNull('due_date')
        ->with([
            'project:id,workspace_id,name,status,priority',
            'team:id,name',
            'assignees:id,name,email',
        ]);

        // 3. Date Range Filter
        $start = $request->query('start');
        $end = $request->query('end');

        if ($start) {
            try {
                $startDate = Carbon::parse($start)->startOfDay();
                $query->where('due_date', '>=', $startDate);
            } catch (\Exception $e) {
                // Ignore parse errors, fallback to exact string if valid
            }
        }

        if ($end) {
            try {
                $endDate = Carbon::parse($end)->endOfDay();
                $query->where('due_date', '<=', $endDate);
            } catch (\Exception $e) {
                // Ignore parse errors
            }
        }

        // 4. Project Filter
        if ($projectId = $request->query('project_id')) {
            $query->where('project_id', $projectId);
        }

        // 5. Team Filter
        if ($teamId = $request->query('team_id')) {
            $query->where('team_id', $teamId);
        }

        // 6. Assignee Filter
        if ($assigneeId = $request->query('assignee_id')) {
            $query->whereHas('assignees', function ($q) use ($assigneeId) {
                $q->where('users.id', $assigneeId);
            });
        }

        // 7. Status Filter
        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        // 8. Priority Filter
        if ($priority = $request->query('priority')) {
            $query->where('priority', $priority);
        }

        // 9. Overdue Filter (only overdue tasks)
        if ($request->boolean('overdue')) {
            $query->where('due_date', '<', Carbon::now())
                  ->where('status', '!=', 'done');
        }

        // Order ascending by due_date
        $tasks = $query->orderBy('due_date', 'asc')->get();

        // 10. Format items for Calendar
        $now = Carbon::now();
        $formatted = $tasks->map(function ($task) use ($now) {
            $dueDate = $task->due_date ? Carbon::parse($task->due_date) : null;

            return [
                'id' => $task->id,
                'title' => $task->title,
                'description' => $task->description,
                'status' => $task->status,
                'priority' => $task->priority,
                'due_date' => $dueDate ? $dueDate->toIso8601String() : null,
                'due_date_formatted' => $dueDate ? $dueDate->format('Y-m-d') : null,
                'due_time_formatted' => $dueDate ? $dueDate->format('H:i') : null,
                'project_id' => $task->project_id,
                'project' => $task->project ? [
                    'id' => $task->project->id,
                    'name' => $task->project->name,
                    'status' => $task->project->status,
                    'priority' => $task->project->priority,
                ] : null,
                'team_id' => $task->team_id,
                'team' => $task->team ? [
                    'id' => $task->team->id,
                    'name' => $task->team->name,
                ] : null,
                'assignees' => $task->assignees ? $task->assignees->map(fn($u) => [
                    'id' => $u->id,
                    'name' => $u->name,
                    'email' => $u->email,
                ]) : [],
                'is_overdue' => $dueDate ? ($dueDate->lt($now) && $task->status !== 'done') : false,
                'is_today' => $dueDate ? $dueDate->isSameDay($now) : false,
            ];
        });

        return response()->json([
            'success' => true,
            'data' => $formatted,
            'meta' => [
                'total' => $formatted->count(),
                'start' => $start,
                'end' => $end,
                'workspace_id' => $workspace->id,
                'workspace_name' => $workspace->name,
            ],
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
}
