<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Workspace;
use App\Services\AnalyticsService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class AnalyticsController extends Controller
{
    public function __construct(
        protected AnalyticsService $analyticsService
    ) {}

    /**
     * Comprehensive workspace analytics overview.
     */
    public function overview(Request $request): JsonResponse
    {
        $workspace = $this->resolveWorkspace($request);
        if ($workspace === false) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized access to the specified workspace.',
            ], 403);
        }

        $dates = $this->parseAndValidateDates($request);
        if ($dates instanceof JsonResponse) {
            return $dates;
        }
        [$startDate, $endDate] = $dates;

        if (! $workspace) {
            return $this->emptyResponse();
        }

        $overview = $this->analyticsService->getOverview($workspace->id, $startDate, $endDate);
        $taskDistribution = $this->analyticsService->getTaskDistribution($workspace->id, $startDate, $endDate);
        $completionTrend = $this->analyticsService->getCompletionTrend($workspace->id, $startDate, $endDate);
        $projects = $this->analyticsService->getProjectPerformance($workspace->id, $startDate, $endDate);
        $workload = $this->analyticsService->getWorkload($workspace->id, $startDate, $endDate);

        return response()->json([
            'success' => true,
            'data' => [
                'workspace' => [
                    'id' => $workspace->id,
                    'name' => $workspace->name,
                    'slug' => $workspace->slug,
                ],
                'overview' => $overview,
                'task_distribution' => $taskDistribution,
                'completion_trend' => $completionTrend,
                'projects' => $projects,
                'workload' => $workload,
            ],
            'meta' => [
                'workspace_id' => $workspace->id,
                'workspace_name' => $workspace->name,
                'start_date' => $startDate?->toDateString(),
                'end_date' => $endDate?->toDateString(),
            ],
        ]);
    }

    /**
     * Focused task metrics and distributions.
     */
    public function tasks(Request $request): JsonResponse
    {
        $workspace = $this->resolveWorkspace($request);
        if ($workspace === false) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized access to the specified workspace.',
            ], 403);
        }

        $dates = $this->parseAndValidateDates($request);
        if ($dates instanceof JsonResponse) {
            return $dates;
        }
        [$startDate, $endDate] = $dates;

        if (! $workspace) {
            return response()->json([
                'success' => true,
                'data' => [
                    'workspace' => null,
                    'summary' => [
                        'total_tasks' => 0,
                        'completed_tasks' => 0,
                        'incomplete_tasks' => 0,
                        'overdue_tasks' => 0,
                        'completion_percentage' => 0,
                    ],
                    'distribution' => [
                        'by_status' => ['todo' => 0, 'in_progress' => 0, 'review' => 0, 'done' => 0],
                        'by_priority' => ['low' => 0, 'medium' => 0, 'high' => 0, 'urgent' => 0],
                    ],
                    'completion_trend' => [],
                ],
                'meta' => [
                    'workspace_id' => null,
                    'start_date' => $startDate?->toDateString(),
                    'end_date' => $endDate?->toDateString(),
                ],
            ]);
        }

        $overview = $this->analyticsService->getOverview($workspace->id, $startDate, $endDate);
        $taskDistribution = $this->analyticsService->getTaskDistribution($workspace->id, $startDate, $endDate);
        $completionTrend = $this->analyticsService->getCompletionTrend($workspace->id, $startDate, $endDate);

        return response()->json([
            'success' => true,
            'data' => [
                'workspace' => [
                    'id' => $workspace->id,
                    'name' => $workspace->name,
                    'slug' => $workspace->slug,
                ],
                'summary' => [
                    'total_tasks' => $overview['total_tasks'],
                    'completed_tasks' => $overview['completed_tasks'],
                    'incomplete_tasks' => $overview['incomplete_tasks'],
                    'overdue_tasks' => $overview['overdue_tasks'],
                    'completion_percentage' => $overview['completion_percentage'],
                ],
                'distribution' => $taskDistribution,
                'completion_trend' => $completionTrend,
            ],
            'meta' => [
                'workspace_id' => $workspace->id,
                'workspace_name' => $workspace->name,
                'start_date' => $startDate?->toDateString(),
                'end_date' => $endDate?->toDateString(),
            ],
        ]);
    }

    /**
     * Focused project performance and throughput metrics.
     */
    public function projects(Request $request): JsonResponse
    {
        $workspace = $this->resolveWorkspace($request);
        if ($workspace === false) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized access to the specified workspace.',
            ], 403);
        }

        $dates = $this->parseAndValidateDates($request);
        if ($dates instanceof JsonResponse) {
            return $dates;
        }
        [$startDate, $endDate] = $dates;

        if (! $workspace) {
            return response()->json([
                'success' => true,
                'data' => [
                    'workspace' => null,
                    'projects' => [],
                ],
                'meta' => [
                    'workspace_id' => null,
                    'start_date' => $startDate?->toDateString(),
                    'end_date' => $endDate?->toDateString(),
                ],
            ]);
        }

        $projects = $this->analyticsService->getProjectPerformance($workspace->id, $startDate, $endDate);

        return response()->json([
            'success' => true,
            'data' => [
                'workspace' => [
                    'id' => $workspace->id,
                    'name' => $workspace->name,
                    'slug' => $workspace->slug,
                ],
                'projects' => $projects,
            ],
            'meta' => [
                'workspace_id' => $workspace->id,
                'workspace_name' => $workspace->name,
                'start_date' => $startDate?->toDateString(),
                'end_date' => $endDate?->toDateString(),
            ],
        ]);
    }

    /**
     * Focused team member workload metrics.
     */
    public function workload(Request $request): JsonResponse
    {
        $workspace = $this->resolveWorkspace($request);
        if ($workspace === false) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized access to the specified workspace.',
            ], 403);
        }

        $dates = $this->parseAndValidateDates($request);
        if ($dates instanceof JsonResponse) {
            return $dates;
        }
        [$startDate, $endDate] = $dates;

        if (! $workspace) {
            return response()->json([
                'success' => true,
                'data' => [
                    'workspace' => null,
                    'workload' => [
                        'assignees' => [],
                        'unassigned' => [
                            'total_tasks' => 0,
                            'completed_tasks' => 0,
                            'incomplete_tasks' => 0,
                            'overdue_tasks' => 0,
                        ],
                    ],
                ],
                'meta' => [
                    'workspace_id' => null,
                    'start_date' => $startDate?->toDateString(),
                    'end_date' => $endDate?->toDateString(),
                ],
            ]);
        }

        $workload = $this->analyticsService->getWorkload($workspace->id, $startDate, $endDate);

        return response()->json([
            'success' => true,
            'data' => [
                'workspace' => [
                    'id' => $workspace->id,
                    'name' => $workspace->name,
                    'slug' => $workspace->slug,
                ],
                'workload' => $workload,
            ],
            'meta' => [
                'workspace_id' => $workspace->id,
                'workspace_name' => $workspace->name,
                'start_date' => $startDate?->toDateString(),
                'end_date' => $endDate?->toDateString(),
            ],
        ]);
    }

    /**
     * Resolve workspace context from header or query param with authorization check.
     * Returns false if unauthorized, null if no workspace available, or Workspace instance.
     */
    protected function resolveWorkspace(Request $request): Workspace|null|false
    {
        $user = $request->user();
        $requestedWorkspaceId = $request->header('X-Workspace-Id') ?? $request->query('workspace_id');

        if ($requestedWorkspaceId !== null && $requestedWorkspaceId !== '') {
            $workspaceId = (int) $requestedWorkspaceId;
            $workspace = Workspace::where('id', $workspaceId)
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
     * Validate and parse start/end date range parameters.
     * Returns array [$startDate, $endDate] or JsonResponse with 422 status.
     */
    protected function parseAndValidateDates(Request $request): array|JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
            'from' => 'nullable|date',
            'to' => 'nullable|date|after_or_equal:from',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid date range parameters.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $startRaw = $request->query('start_date') ?? $request->query('from');
        $endRaw = $request->query('end_date') ?? $request->query('to');

        $startDate = $startRaw ? Carbon::parse($startRaw)->startOfDay() : null;
        $endDate = $endRaw ? Carbon::parse($endRaw)->endOfDay() : null;

        if ($startDate && $endDate && $startDate->gt($endDate)) {
            return response()->json([
                'success' => false,
                'message' => 'The start date must be before or equal to the end date.',
                'errors' => [
                    'start_date' => ['The start date must be before or equal to the end date.'],
                ],
            ], 422);
        }

        return [$startDate, $endDate];
    }

    /**
     * Clean zeroed response when user has no accessible workspaces.
     */
    protected function emptyResponse(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => [
                'workspace' => null,
                'overview' => [
                    'total_projects' => 0,
                    'active_projects' => 0,
                    'completed_projects' => 0,
                    'total_tasks' => 0,
                    'completed_tasks' => 0,
                    'incomplete_tasks' => 0,
                    'overdue_tasks' => 0,
                    'completion_percentage' => 0,
                ],
                'task_distribution' => [
                    'by_status' => ['todo' => 0, 'in_progress' => 0, 'review' => 0, 'done' => 0],
                    'by_priority' => ['low' => 0, 'medium' => 0, 'high' => 0, 'urgent' => 0],
                ],
                'completion_trend' => [],
                'projects' => [],
                'workload' => [
                    'assignees' => [],
                    'unassigned' => [
                        'total_tasks' => 0,
                        'completed_tasks' => 0,
                        'incomplete_tasks' => 0,
                        'overdue_tasks' => 0,
                    ],
                ],
            ],
            'meta' => [
                'workspace_id' => null,
                'start_date' => null,
                'end_date' => null,
            ],
        ]);
    }
}
