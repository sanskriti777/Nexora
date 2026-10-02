<?php

namespace App\Services;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Support\Facades\DB;

class AnalyticsService
{
    /**
     * Get high-level workspace summary metrics.
     */
    public function getOverview(int $workspaceId, ?Carbon $startDate = null, ?Carbon $endDate = null): array
    {
        $projectIds = Project::where('workspace_id', $workspaceId)->pluck('id');

        $totalProjects = Project::where('workspace_id', $workspaceId)
            ->where('status', '!=', 'archived')
            ->count();

        $activeProjects = Project::where('workspace_id', $workspaceId)
            ->whereIn('status', ['active', 'planning'])
            ->count();

        $completedProjects = Project::where('workspace_id', $workspaceId)
            ->where('status', 'completed')
            ->count();

        // Build tasks query scoped to workspace projects
        $tasksQuery = Task::whereIn('project_id', $projectIds);
        if ($startDate) {
            $tasksQuery->where('created_at', '>=', $startDate);
        }
        if ($endDate) {
            $tasksQuery->where('created_at', '<=', $endDate);
        }

        $totalTasks = (clone $tasksQuery)->count();
        $completedTasks = (clone $tasksQuery)->where('status', 'done')->count();
        $incompleteTasks = (clone $tasksQuery)->where('status', '!=', 'done')->count();

        $now = Carbon::now();
        $overdueTasks = (clone $tasksQuery)
            ->where('status', '!=', 'done')
            ->whereNotNull('due_date')
            ->where('due_date', '<', $now)
            ->count();

        $completionPercentage = $totalTasks > 0
            ? (int) round(($completedTasks / $totalTasks) * 100)
            : 0;

        return [
            'total_projects' => $totalProjects,
            'active_projects' => $activeProjects,
            'completed_projects' => $completedProjects,
            'total_tasks' => $totalTasks,
            'completed_tasks' => $completedTasks,
            'incomplete_tasks' => $incompleteTasks,
            'overdue_tasks' => $overdueTasks,
            'completion_percentage' => $completionPercentage,
        ];
    }

    /**
     * Get task distribution broken down by status and priority.
     */
    public function getTaskDistribution(int $workspaceId, ?Carbon $startDate = null, ?Carbon $endDate = null): array
    {
        $projectIds = Project::where('workspace_id', $workspaceId)->pluck('id');

        $tasksQuery = Task::whereIn('project_id', $projectIds);
        if ($startDate) {
            $tasksQuery->where('created_at', '>=', $startDate);
        }
        if ($endDate) {
            $tasksQuery->where('created_at', '<=', $endDate);
        }

        // Group by status
        $rawStatusCounts = (clone $tasksQuery)
            ->select('status', DB::raw('COUNT(*) as count'))
            ->groupBy('status')
            ->pluck('count', 'status')
            ->all();

        // Canonical statuses
        $byStatus = [
            'todo' => (int) ($rawStatusCounts['todo'] ?? 0),
            'in_progress' => (int) ($rawStatusCounts['in_progress'] ?? 0),
            'review' => (int) ($rawStatusCounts['review'] ?? 0),
            'done' => (int) ($rawStatusCounts['done'] ?? 0),
        ];

        // Group by priority
        $rawPriorityCounts = (clone $tasksQuery)
            ->select('priority', DB::raw('COUNT(*) as count'))
            ->groupBy('priority')
            ->pluck('count', 'priority')
            ->all();

        // Canonical priorities
        $byPriority = [
            'low' => (int) ($rawPriorityCounts['low'] ?? 0),
            'medium' => (int) ($rawPriorityCounts['medium'] ?? 0),
            'high' => (int) ($rawPriorityCounts['high'] ?? 0),
            'urgent' => (int) ($rawPriorityCounts['urgent'] ?? 0),
        ];

        return [
            'by_status' => $byStatus,
            'by_priority' => $byPriority,
        ];
    }

    /**
     * Get daily task completion trend within a date window.
     */
    public function getCompletionTrend(int $workspaceId, ?Carbon $startDate = null, ?Carbon $endDate = null, int $defaultDays = 14): array
    {
        $projectIds = Project::where('workspace_id', $workspaceId)->pluck('id');

        $end = $endDate ? $endDate->copy()->endOfDay() : Carbon::now()->endOfDay();
        $start = $startDate ? $startDate->copy()->startOfDay() : $end->copy()->subDays($defaultDays - 1)->startOfDay();

        // Aggregate completed tasks per date via database GROUP BY
        $dailyCounts = Task::whereIn('project_id', $projectIds)
            ->where('status', 'done')
            ->whereBetween('updated_at', [$start, $end])
            ->selectRaw('DATE(updated_at) as log_date, COUNT(*) as aggregate_count')
            ->groupBy('log_date')
            ->pluck('aggregate_count', 'log_date')
            ->all();

        // Fill all dates in the range for uninterrupted chart rendering
        $period = CarbonPeriod::create($start, $end);
        $trend = [];

        foreach ($period as $date) {
            $formattedDate = $date->format('Y-m-d');
            $trend[] = [
                'date' => $formattedDate,
                'day' => $date->format('D'),
                'completed' => (int) ($dailyCounts[$formattedDate] ?? 0),
            ];
        }

        return $trend;
    }

    /**
     * Get project-level performance metrics.
     */
    public function getProjectPerformance(int $workspaceId, ?Carbon $startDate = null, ?Carbon $endDate = null): array
    {
        $now = Carbon::now();

        $projects = Project::where('workspace_id', $workspaceId)
            ->withCount([
                'tasks',
                'tasks as completed_tasks_count' => function ($q) {
                    $q->where('status', 'done');
                },
                'tasks as overdue_tasks_count' => function ($q) use ($now) {
                    $q->where('status', '!=', 'done')
                      ->whereNotNull('due_date')
                      ->where('due_date', '<', $now);
                },
            ])
            ->orderBy('name')
            ->get();

        return $projects->map(function ($project) {
            $total = (int) $project->tasks_count;
            $completed = (int) $project->completed_tasks_count;
            $incomplete = max(0, $total - $completed);
            $overdue = (int) $project->overdue_tasks_count;
            $percentage = $total > 0 ? (int) round(($completed / $total) * 100) : 0;

            return [
                'id' => $project->id,
                'name' => $project->name,
                'status' => $project->status,
                'priority' => $project->priority,
                'start_date' => $project->start_date?->format('Y-m-d'),
                'due_date' => $project->due_date?->format('Y-m-d'),
                'total_tasks' => $total,
                'completed_tasks' => $completed,
                'incomplete_tasks' => $incomplete,
                'overdue_tasks' => $overdue,
                'completion_percentage' => $percentage,
            ];
        })->values()->all();
    }

    /**
     * Get workload distribution by assignee.
     */
    public function getWorkload(int $workspaceId, ?Carbon $startDate = null, ?Carbon $endDate = null): array
    {
        $projectIds = Project::where('workspace_id', $workspaceId)->pluck('id');
        $nowFormatted = Carbon::now()->toDateTimeString();

        // Database aggregation across task assignees within this workspace
        $rawAssignees = DB::table('task_assignees')
            ->join('tasks', 'task_assignees.task_id', '=', 'tasks.id')
            ->join('projects', 'tasks.project_id', '=', 'projects.id')
            ->join('users', 'task_assignees.user_id', '=', 'users.id')
            ->where('projects.workspace_id', $workspaceId)
            ->whereNull('tasks.deleted_at')
            ->whereNull('projects.deleted_at')
            ->when($startDate, function ($q) use ($startDate) {
                $q->where('tasks.created_at', '>=', $startDate);
            })
            ->when($endDate, function ($q) use ($endDate) {
                $q->where('tasks.created_at', '<=', $endDate);
            })
            ->select(
                'users.id as user_id',
                'users.name as user_name',
                'users.email as user_email',
                DB::raw('COUNT(tasks.id) as total_tasks'),
                DB::raw("COUNT(CASE WHEN tasks.status = 'done' THEN 1 END) as completed_tasks"),
                DB::raw("COUNT(CASE WHEN tasks.status != 'done' THEN 1 END) as incomplete_tasks"),
                DB::raw("COUNT(CASE WHEN tasks.status != 'done' AND tasks.due_date IS NOT NULL AND tasks.due_date < '{$nowFormatted}' THEN 1 END) as overdue_tasks")
            )
            ->groupBy('users.id', 'users.name', 'users.email')
            ->orderByDesc('total_tasks')
            ->get();

        $assignees = $rawAssignees->map(function ($row) {
            $total = (int) $row->total_tasks;
            $completed = (int) $row->completed_tasks;
            $incomplete = (int) $row->incomplete_tasks;
            $overdue = (int) $row->overdue_tasks;
            $pct = $total > 0 ? (int) round(($completed / $total) * 100) : 0;

            return [
                'user' => [
                    'id' => $row->user_id,
                    'name' => $row->user_name,
                    'email' => $row->user_email,
                ],
                'total_tasks' => $total,
                'completed_tasks' => $completed,
                'incomplete_tasks' => $incomplete,
                'overdue_tasks' => $overdue,
                'completion_percentage' => $pct,
            ];
        })->values()->all();

        // Calculate unassigned tasks in the workspace
        $unassignedQuery = Task::whereIn('project_id', $projectIds)
            ->doesntHave('assignees');

        if ($startDate) {
            $unassignedQuery->where('created_at', '>=', $startDate);
        }
        if ($endDate) {
            $unassignedQuery->where('created_at', '<=', $endDate);
        }

        $unassignedTotal = (clone $unassignedQuery)->count();
        $unassignedCompleted = (clone $unassignedQuery)->where('status', 'done')->count();
        $unassignedIncomplete = (clone $unassignedQuery)->where('status', '!=', 'done')->count();
        $unassignedOverdue = (clone $unassignedQuery)
            ->where('status', '!=', 'done')
            ->whereNotNull('due_date')
            ->where('due_date', '<', Carbon::now())
            ->count();

        return [
            'assignees' => $assignees,
            'unassigned' => [
                'total_tasks' => $unassignedTotal,
                'completed_tasks' => $unassignedCompleted,
                'incomplete_tasks' => $unassignedIncomplete,
                'overdue_tasks' => $unassignedOverdue,
            ],
        ];
    }
}
