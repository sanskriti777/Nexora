<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Project;
use App\Models\Task;
use App\Models\Workspace;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    /**
     * Retrieve aggregated, workspace-scoped dashboard data for the authenticated user.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        // 1. Resolve Workspace Scope
        $requestedWorkspaceId = $request->header('X-Workspace-Id') ?? $request->query('workspace_id');
        $workspace = null;

        if ($requestedWorkspaceId) {
            // Verify access: user must be owner or workspace member
            $workspace = Workspace::where('id', $requestedWorkspaceId)
                ->where(function ($query) use ($user) {
                    $query->where('owner_id', $user->id)
                          ->orWhereHas('members', function ($m) use ($user) {
                              $m->where('users.id', $user->id);
                          });
                })->first();

            if (! $workspace) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unauthorized access to the specified workspace.',
                ], 403);
            }
        } else {
            // Default to user's first accessible workspace
            $workspace = $user->workspaces()->first()
                ?? Workspace::where('owner_id', $user->id)->first();
        }

        // If the user has no accessible workspace, return clean zeroed response
        if (! $workspace) {
            return response()->json([
                'success' => true,
                'data' => [
                    'workspace' => null,
                    'summary' => [
                        'total_projects' => 0,
                        'total_tasks' => 0,
                        'completed_tasks' => 0,
                        'in_progress_tasks' => 0,
                        'overdue_tasks' => 0,
                    ],
                    'project_overview' => [
                        'completed' => 0,
                        'in_progress' => 0,
                        'todo' => 0,
                        'overdue' => 0,
                        'completed_percentage' => 0,
                        'in_progress_percentage' => 0,
                        'todo_percentage' => 0,
                        'overdue_percentage' => 0,
                    ],
                    'task_completion_trend' => [],
                    'my_projects' => [],
                    'upcoming_deadlines' => [],
                    'recent_activity' => [],
                ],
            ]);
        }

        // 2. Query Projects in this Workspace
        $projectsBase = Project::where('workspace_id', $workspace->id);
        $totalProjects = (clone $projectsBase)->where('status', '!=', 'archived')->count();
        $projectIds = (clone $projectsBase)->pluck('id');

        // 3. Query Tasks in Accessible Projects
        $tasksBase = Task::whereIn('project_id', $projectIds);
        $totalTasks = (clone $tasksBase)->count();
        $completedTasks = (clone $tasksBase)->where('status', 'done')->count();
        $inProgressTasks = (clone $tasksBase)->whereIn('status', ['in_progress', 'review'])->count();
        $todoTasks = (clone $tasksBase)->where('status', 'todo')->count();

        // Calculate Overdue Tasks (due_date in the past and status is not done)
        $now = Carbon::now();
        $overdueTasks = (clone $tasksBase)
            ->where('status', '!=', 'done')
            ->whereNotNull('due_date')
            ->where('due_date', '<', $now)
            ->count();

        // 4. Project Overview Percentages (safely avoiding division by zero)
        $completedPct = $totalTasks > 0 ? (int) round(($completedTasks / $totalTasks) * 100) : 0;
        $inProgressPct = $totalTasks > 0 ? (int) round(($inProgressTasks / $totalTasks) * 100) : 0;
        $overduePct = $totalTasks > 0 ? (int) round(($overdueTasks / $totalTasks) * 100) : 0;
        $todoPct = $totalTasks > 0 ? (int) round(($todoTasks / $totalTasks) * 100) : 0;

        // 5. Task Completion Trend (Past 7 days)
        $sevenDaysAgo = Carbon::now()->subDays(6)->startOfDay();
        $trendCounts = (clone $tasksBase)
            ->where('status', 'done')
            ->where('updated_at', '>=', $sevenDaysAgo)
            ->selectRaw('DATE(updated_at) as log_date, COUNT(*) as aggregate_count')
            ->groupBy('log_date')
            ->pluck('aggregate_count', 'log_date');

        $trendData = [];
        for ($i = 6; $i >= 0; $i--) {
            $dayDate = Carbon::now()->subDays($i)->format('Y-m-d');
            $dayLabel = Carbon::now()->subDays($i)->format('D');
            $trendData[] = [
                'day' => $dayLabel,
                'date' => $dayDate,
                'completed' => (int) ($trendCounts[$dayDate] ?? 0),
            ];
        }

        // 6. My Projects (Recent active projects with real calculated progress)
        $myProjects = (clone $projectsBase)
            ->where('status', '!=', 'archived')
            ->withCount([
                'tasks',
                'tasks as completed_tasks_count' => function ($q) {
                    $q->where('status', 'done');
                },
                'members',
            ])
            ->with(['members' => function ($q) {
                $q->select('users.id', 'users.name', 'users.email')->limit(4);
            }])
            ->orderByDesc('updated_at')
            ->limit(6)
            ->get()
            ->map(function ($project) {
                $tCount = $project->tasks_count;
                $cCount = $project->completed_tasks_count;
                $progress = $tCount > 0 ? (int) round(($cCount / $tCount) * 100) : null;

                return [
                    'id' => $project->id,
                    'name' => $project->name,
                    'description' => $project->description,
                    'status' => $project->status,
                    'priority' => $project->priority,
                    'due_date' => $project->due_date?->format('Y-m-d'),
                    'tasks_count' => $tCount,
                    'completed_tasks_count' => $cCount,
                    'progress' => $progress, // null indicates "No tasks"
                    'members_count' => $project->members_count,
                    'members' => $project->members->map(fn ($m) => [
                        'id' => $m->id,
                        'name' => $m->name,
                    ]),
                ];
            });

        // 7. Upcoming Deadlines (Non-completed tasks with future due date)
        $upcomingDeadlines = (clone $tasksBase)
            ->where('status', '!=', 'done')
            ->whereNotNull('due_date')
            ->where('due_date', '>=', $now)
            ->with(['project:id,name'])
            ->orderBy('due_date', 'asc')
            ->limit(5)
            ->get()
            ->map(function ($task) {
                return [
                    'id' => $task->id,
                    'title' => $task->title,
                    'status' => $task->status,
                    'priority' => $task->priority,
                    'due_date' => $task->due_date?->toIso8601String(),
                    'due_date_formatted' => $task->due_date?->format('M d, Y'),
                    'project' => $task->project ? [
                        'id' => $task->project->id,
                        'name' => $task->project->name,
                    ] : null,
                ];
            });

        // 8. Recent Activity
        $recentActivity = ActivityLog::where('workspace_id', $workspace->id)
            ->with(['user:id,name,email'])
            ->orderByDesc('created_at')
            ->limit(6)
            ->get()
            ->map(function ($log) {
                return [
                    'id' => $log->id,
                    'action' => $log->action,
                    'entity_type' => $log->entity_type,
                    'entity_id' => $log->entity_id,
                    'details' => $log->details,
                    'created_at' => $log->created_at->toIso8601String(),
                    'created_at_human' => $log->created_at->diffForHumans(),
                    'user' => $log->user ? [
                        'id' => $log->user->id,
                        'name' => $log->user->name,
                    ] : null,
                ];
            });

        return response()->json([
            'success' => true,
            'data' => [
                'workspace' => [
                    'id' => $workspace->id,
                    'name' => $workspace->name,
                    'slug' => $workspace->slug,
                ],
                'summary' => [
                    'total_projects' => $totalProjects,
                    'total_tasks' => $totalTasks,
                    'completed_tasks' => $completedTasks,
                    'in_progress_tasks' => $inProgressTasks,
                    'overdue_tasks' => $overdueTasks,
                ],
                'project_overview' => [
                    'completed' => $completedTasks,
                    'in_progress' => $inProgressTasks,
                    'todo' => $todoTasks,
                    'overdue' => $overdueTasks,
                    'completed_percentage' => $completedPct,
                    'in_progress_percentage' => $inProgressPct,
                    'todo_percentage' => $todoPct,
                    'overdue_percentage' => $overduePct,
                ],
                'task_completion_trend' => $trendData,
                'my_projects' => $myProjects,
                'upcoming_deadlines' => $upcomingDeadlines,
                'recent_activity' => $recentActivity,
            ],
        ]);
    }
}
