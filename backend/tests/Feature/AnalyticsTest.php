<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use App\Models\Workspace;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AnalyticsTest extends TestCase
{
    use RefreshDatabase;

    protected function createWorkspaceWithOwner(): array
    {
        $owner = User::factory()->create([
            'name' => 'Workspace Owner',
            'email' => 'owner_' . uniqid() . '@example.com',
        ]);

        $workspace = Workspace::create([
            'name' => 'Analytics Workspace',
            'slug' => 'analytics-' . uniqid(),
            'owner_id' => $owner->id,
        ]);

        $workspace->members()->attach($owner->id, ['role_id' => null, 'joined_at' => now()]);

        return [$owner, $workspace];
    }

    protected function addMemberToWorkspace(Workspace $workspace, User $user, string $roleSlug = 'team_member'): void
    {
        $role = Role::firstOrCreate(['slug' => $roleSlug], ['name' => ucfirst(str_replace('_', ' ', $roleSlug))]);
        $workspace->members()->attach($user->id, [
            'role_id' => $role->id,
            'joined_at' => now(),
        ]);
    }

    // 1. Authenticated user can access analytics
    public function test_authenticated_user_can_access_analytics(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        $response = $this->actingAs($owner, 'sanctum')->getJson("/api/analytics/overview?workspace_id={$workspace->id}");

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'data' => [
                    'workspace' => [
                        'id' => $workspace->id,
                        'name' => $workspace->name,
                    ],
                ],
            ])
            ->assertJsonStructure([
                'success',
                'data' => [
                    'workspace' => ['id', 'name', 'slug'],
                    'overview' => [
                        'total_projects',
                        'active_projects',
                        'completed_projects',
                        'total_tasks',
                        'completed_tasks',
                        'incomplete_tasks',
                        'overdue_tasks',
                        'completion_percentage',
                    ],
                    'task_distribution' => [
                        'by_status' => ['todo', 'in_progress', 'review', 'done'],
                        'by_priority' => ['low', 'medium', 'high', 'urgent'],
                    ],
                    'completion_trend',
                    'projects',
                    'workload' => [
                        'assignees',
                        'unassigned' => [
                            'total_tasks',
                            'completed_tasks',
                            'incomplete_tasks',
                            'overdue_tasks',
                        ],
                    ],
                ],
                'meta' => ['workspace_id', 'workspace_name', 'start_date', 'end_date'],
            ]);
    }

    // 2. Unauthenticated request is rejected
    public function test_unauthenticated_request_is_rejected(): void
    {
        $this->getJson('/api/analytics/overview')->assertStatus(401);
        $this->getJson('/api/analytics/tasks')->assertStatus(401);
        $this->getJson('/api/analytics/projects')->assertStatus(401);
        $this->getJson('/api/analytics/workload')->assertStatus(401);
    }

    // 3. Workspace owner can access analytics
    public function test_workspace_owner_can_access_analytics(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        $response = $this->actingAs($owner, 'sanctum')->getJson("/api/analytics/overview?workspace_id={$workspace->id}");
        $response->assertStatus(200);
        $this->assertEquals($workspace->id, $response->json('data.workspace.id'));
    }

    // 4. Workspace member can access analytics
    public function test_workspace_member_can_access_analytics(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $member = User::factory()->create();
        $this->addMemberToWorkspace($workspace, $member);

        $response = $this->actingAs($member, 'sanctum')->getJson("/api/analytics/overview?workspace_id={$workspace->id}");
        $response->assertStatus(200);
        $this->assertEquals($workspace->id, $response->json('data.workspace.id'));
    }

    // 5. Unauthorized workspace returns 403
    public function test_unauthorized_workspace_returns_403(): void
    {
        [$owner1, $workspace1] = $this->createWorkspaceWithOwner();
        [$owner2, $workspace2] = $this->createWorkspaceWithOwner();

        // Owner 2 tries to access Workspace 1
        $response = $this->actingAs($owner2, 'sanctum')->getJson("/api/analytics/overview?workspace_id={$workspace1->id}");
        $response->assertStatus(403);

        // Via header
        $responseHeader = $this->actingAs($owner2, 'sanctum')->getJson('/api/analytics/overview', [
            'X-Workspace-Id' => (string) $workspace1->id,
        ]);
        $responseHeader->assertStatus(403);
    }

    // 6. Workspace A cannot see Workspace B metrics
    public function test_workspace_a_cannot_see_workspace_b_metrics(): void
    {
        [$owner1, $workspace1] = $this->createWorkspaceWithOwner();
        [$owner2, $workspace2] = $this->createWorkspaceWithOwner();

        $project1 = Project::create([
            'workspace_id' => $workspace1->id,
            'owner_id' => $owner1->id,
            'name' => 'Workspace 1 Secret Project',
            'status' => 'active',
        ]);

        Task::create([
            'project_id' => $project1->id,
            'creator_id' => $owner1->id,
            'title' => 'Secret Task 1',
            'status' => 'done',
        ]);

        $project2 = Project::create([
            'workspace_id' => $workspace2->id,
            'owner_id' => $owner2->id,
            'name' => 'Workspace 2 Project',
            'status' => 'active',
        ]);

        $response = $this->actingAs($owner2, 'sanctum')->getJson("/api/analytics/overview?workspace_id={$workspace2->id}");
        $response->assertStatus(200);

        // Workspace 2 has 1 project and 0 tasks
        $this->assertEquals(1, $response->json('data.overview.total_projects'));
        $this->assertEquals(0, $response->json('data.overview.total_tasks'));

        // Workspace 1 secret project is not in workspace 2 list
        $projectNames = collect($response->json('data.projects'))->pluck('name')->all();
        $this->assertNotContains('Workspace 1 Secret Project', $projectNames);
    }

    // 7. Valid date range works
    public function test_valid_date_range_works(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        $start = now()->subDays(10)->toDateString();
        $end = now()->toDateString();

        $response = $this->actingAs($owner, 'sanctum')->getJson("/api/analytics/overview?workspace_id={$workspace->id}&start_date={$start}&end_date={$end}");

        $response->assertStatus(200);
        $this->assertEquals($start, $response->json('meta.start_date'));
        $this->assertEquals($end, $response->json('meta.end_date'));
    }

    // 8. Invalid date range is rejected
    public function test_invalid_date_range_is_rejected(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        // End before start
        $start = now()->toDateString();
        $end = now()->subDays(5)->toDateString();

        $response = $this->actingAs($owner, 'sanctum')->getJson("/api/analytics/overview?workspace_id={$workspace->id}&start_date={$start}&end_date={$end}");
        $response->assertStatus(422);

        // Non-date string
        $responseMalformed = $this->actingAs($owner, 'sanctum')->getJson("/api/analytics/overview?workspace_id={$workspace->id}&start_date=not-a-date");
        $responseMalformed->assertStatus(422);
    }

    // 9. Empty workspace returns valid zero/empty metrics
    public function test_empty_workspace_returns_valid_zero_metrics(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        $response = $this->actingAs($owner, 'sanctum')->getJson("/api/analytics/overview?workspace_id={$workspace->id}");

        $response->assertStatus(200);
        $overview = $response->json('data.overview');
        $this->assertEquals(0, $overview['total_projects']);
        $this->assertEquals(0, $overview['total_tasks']);
        $this->assertEquals(0, $overview['completed_tasks']);
        $this->assertEquals(0, $overview['incomplete_tasks']);
        $this->assertEquals(0, $overview['overdue_tasks']);
        $this->assertEquals(0, $overview['completion_percentage']);
        $this->assertEmpty($response->json('data.projects'));
        $this->assertEmpty($response->json('data.workload.assignees'));
    }

    // 10. Aggregation results use real database records
    public function test_aggregation_results_use_real_database_records(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        $project = Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $owner->id,
            'name' => 'Real DB Project',
            'status' => 'active',
        ]);

        // Create 4 tasks: 2 done, 1 in_progress, 1 todo
        Task::create([
            'project_id' => $project->id,
            'creator_id' => $owner->id,
            'title' => 'Task Done 1',
            'status' => 'done',
        ]);

        Task::create([
            'project_id' => $project->id,
            'creator_id' => $owner->id,
            'title' => 'Task Done 2',
            'status' => 'done',
        ]);

        Task::create([
            'project_id' => $project->id,
            'creator_id' => $owner->id,
            'title' => 'Task Progress',
            'status' => 'in_progress',
        ]);

        Task::create([
            'project_id' => $project->id,
            'creator_id' => $owner->id,
            'title' => 'Task Todo',
            'status' => 'todo',
        ]);

        $response = $this->actingAs($owner, 'sanctum')->getJson("/api/analytics/overview?workspace_id={$workspace->id}");

        $response->assertStatus(200);
        $overview = $response->json('data.overview');
        $this->assertEquals(1, $overview['total_projects']);
        $this->assertEquals(4, $overview['total_tasks']);
        $this->assertEquals(2, $overview['completed_tasks']);
        $this->assertEquals(2, $overview['incomplete_tasks']);
        $this->assertEquals(50, $overview['completion_percentage']);
    }

    // 11. Task status aggregation is correct
    public function test_task_status_aggregation_is_correct(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        $project = Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $owner->id,
            'name' => 'Status Project',
            'status' => 'active',
        ]);

        Task::create(['project_id' => $project->id, 'creator_id' => $owner->id, 'title' => 'T1', 'status' => 'todo']);
        Task::create(['project_id' => $project->id, 'creator_id' => $owner->id, 'title' => 'T2', 'status' => 'in_progress']);
        Task::create(['project_id' => $project->id, 'creator_id' => $owner->id, 'title' => 'T3', 'status' => 'review']);
        Task::create(['project_id' => $project->id, 'creator_id' => $owner->id, 'title' => 'T4', 'status' => 'done']);
        Task::create(['project_id' => $project->id, 'creator_id' => $owner->id, 'title' => 'T5', 'status' => 'done']);

        $response = $this->actingAs($owner, 'sanctum')->getJson("/api/analytics/tasks?workspace_id={$workspace->id}");

        $response->assertStatus(200);
        $statusDist = $response->json('data.distribution.by_status');
        $this->assertEquals(1, $statusDist['todo']);
        $this->assertEquals(1, $statusDist['in_progress']);
        $this->assertEquals(1, $statusDist['review']);
        $this->assertEquals(2, $statusDist['done']);
    }

    // 12. Priority aggregation is correct
    public function test_priority_aggregation_is_correct(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        $project = Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $owner->id,
            'name' => 'Priority Project',
            'status' => 'active',
        ]);

        Task::create(['project_id' => $project->id, 'creator_id' => $owner->id, 'title' => 'T1', 'priority' => 'low']);
        Task::create(['project_id' => $project->id, 'creator_id' => $owner->id, 'title' => 'T2', 'priority' => 'medium']);
        Task::create(['project_id' => $project->id, 'creator_id' => $owner->id, 'title' => 'T3', 'priority' => 'high']);
        Task::create(['project_id' => $project->id, 'creator_id' => $owner->id, 'title' => 'T4', 'priority' => 'urgent']);
        Task::create(['project_id' => $project->id, 'creator_id' => $owner->id, 'title' => 'T5', 'priority' => 'urgent']);

        $response = $this->actingAs($owner, 'sanctum')->getJson("/api/analytics/tasks?workspace_id={$workspace->id}");

        $response->assertStatus(200);
        $pDist = $response->json('data.distribution.by_priority');
        $this->assertEquals(1, $pDist['low']);
        $this->assertEquals(1, $pDist['medium']);
        $this->assertEquals(1, $pDist['high']);
        $this->assertEquals(2, $pDist['urgent']);
    }

    // 13. Project metrics are workspace-scoped
    public function test_project_metrics_are_workspace_scoped(): void
    {
        [$owner1, $workspace1] = $this->createWorkspaceWithOwner();
        [$owner2, $workspace2] = $this->createWorkspaceWithOwner();

        Project::create([
            'workspace_id' => $workspace1->id,
            'owner_id' => $owner1->id,
            'name' => 'Project Alpha',
            'status' => 'active',
        ]);

        Project::create([
            'workspace_id' => $workspace2->id,
            'owner_id' => $owner2->id,
            'name' => 'Project Beta',
            'status' => 'active',
        ]);

        $response = $this->actingAs($owner1, 'sanctum')->getJson("/api/analytics/projects?workspace_id={$workspace1->id}");

        $response->assertStatus(200);
        $projectList = $response->json('data.projects');
        $this->assertCount(1, $projectList);
        $this->assertEquals('Project Alpha', $projectList[0]['name']);
    }

    // 14. Workload metrics do not leak users/tasks from another workspace
    public function test_workload_metrics_do_not_leak_other_workspace(): void
    {
        [$owner1, $workspace1] = $this->createWorkspaceWithOwner();
        [$owner2, $workspace2] = $this->createWorkspaceWithOwner();

        $project1 = Project::create([
            'workspace_id' => $workspace1->id,
            'owner_id' => $owner1->id,
            'name' => 'P1',
            'status' => 'active',
        ]);

        $task1 = Task::create([
            'project_id' => $project1->id,
            'creator_id' => $owner1->id,
            'title' => 'P1 Task',
            'status' => 'todo',
        ]);
        $task1->assignees()->attach($owner1->id);

        $response = $this->actingAs($owner2, 'sanctum')->getJson("/api/analytics/workload?workspace_id={$workspace2->id}");

        $response->assertStatus(200);
        $assignees = $response->json('data.workload.assignees');
        $this->assertCount(0, $assignees);
    }

    // 15. Overdue task calculations match due date logic
    public function test_overdue_task_calculations(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        $project = Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $owner->id,
            'name' => 'Overdue Test Project',
            'status' => 'active',
        ]);

        // Overdue task (due yesterday, not done)
        Task::create([
            'project_id' => $project->id,
            'creator_id' => $owner->id,
            'title' => 'Overdue Task',
            'status' => 'in_progress',
            'due_date' => now()->subDay(),
        ]);

        // Not overdue (due tomorrow, not done)
        Task::create([
            'project_id' => $project->id,
            'creator_id' => $owner->id,
            'title' => 'Future Task',
            'status' => 'in_progress',
            'due_date' => now()->addDay(),
        ]);

        // Done task with past due date (not considered overdue)
        Task::create([
            'project_id' => $project->id,
            'creator_id' => $owner->id,
            'title' => 'Completed Past Task',
            'status' => 'done',
            'due_date' => now()->subDay(),
        ]);

        $response = $this->actingAs($owner, 'sanctum')->getJson("/api/analytics/overview?workspace_id={$workspace->id}");

        $response->assertStatus(200);
        $this->assertEquals(1, $response->json('data.overview.overdue_tasks'));
    }
}
