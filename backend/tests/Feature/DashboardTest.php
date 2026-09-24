<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Models\Workspace;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Helper to create an authenticated user with a workspace
     */
    protected function createWorkspaceWithUser(): array
    {
        $user = User::factory()->create([
            'name' => 'Test User',
            'email' => 'user@test.com',
        ]);

        $workspace = Workspace::create([
            'name' => 'Test Workspace',
            'slug' => 'test-workspace',
            'owner_id' => $user->id,
        ]);

        $workspace->members()->attach($user->id, ['role_id' => null, 'joined_at' => now()]);

        return [$user, $workspace];
    }

    /**
     * 1. Unauthenticated request must return 401 Unauthorized
     */
    public function test_unauthenticated_request_is_rejected(): void
    {
        $response = $this->getJson('/api/dashboard');

        $response->assertStatus(401);
    }

    /**
     * 2. Authenticated request succeeds and returns structured JSON
     */
    public function test_authenticated_user_can_access_dashboard(): void
    {
        [$user, $workspace] = $this->createWorkspaceWithUser();

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/dashboard');

        $response->assertStatus(200)
                 ->assertJson([
                     'success' => true,
                     'data' => [
                         'workspace' => [
                             'id' => $workspace->id,
                             'name' => 'Test Workspace',
                         ],
                     ],
                 ])
                 ->assertJsonStructure([
                     'success',
                     'data' => [
                         'workspace' => ['id', 'name', 'slug'],
                         'summary' => [
                             'total_projects',
                             'total_tasks',
                             'completed_tasks',
                             'in_progress_tasks',
                             'overdue_tasks',
                         ],
                         'project_overview' => [
                             'completed',
                             'in_progress',
                             'todo',
                             'overdue',
                             'completed_percentage',
                             'in_progress_percentage',
                             'todo_percentage',
                             'overdue_percentage',
                         ],
                         'task_completion_trend',
                         'my_projects',
                         'upcoming_deadlines',
                         'recent_activity',
                     ],
                 ]);
    }

    /**
     * 3. Empty dashboard returns zeroed metrics and empty arrays without errors
     */
    public function test_empty_workspace_returns_zeroed_metrics(): void
    {
        [$user, $workspace] = $this->createWorkspaceWithUser();

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/dashboard');

        $response->assertStatus(200)
                 ->assertJson([
                     'success' => true,
                     'data' => [
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
                         ],
                         'my_projects' => [],
                         'upcoming_deadlines' => [],
                         'recent_activity' => [],
                     ],
                 ]);
    }

    /**
     * 4. User sees only authorized workspace data (Workspace isolation)
     */
    public function test_user_cannot_access_foreign_workspace_data(): void
    {
        [$userA, $workspaceA] = $this->createWorkspaceWithUser();

        // Create a foreign workspace with foreign project and task
        $userB = User::factory()->create(['email' => 'userB@test.com']);
        $workspaceB = Workspace::create([
            'name' => 'Workspace B',
            'slug' => 'workspace-b',
            'owner_id' => $userB->id,
        ]);
        $projectB = Project::create([
            'workspace_id' => $workspaceB->id,
            'owner_id' => $userB->id,
            'name' => 'Foreign Project B',
            'status' => 'active',
        ]);
        Task::create([
            'project_id' => $projectB->id,
            'creator_id' => $userB->id,
            'title' => 'Foreign Task',
            'status' => 'todo',
        ]);

        // User A requests their own dashboard
        $response = $this->actingAs($userA, 'sanctum')->getJson('/api/dashboard');

        $response->assertStatus(200);
        $this->assertEquals(0, $response->json('data.summary.total_projects'));
        $this->assertEquals(0, $response->json('data.summary.total_tasks'));

        // User A tries to explicitly access Workspace B via header -> should be 403 Forbidden
        $foreignResponse = $this->actingAs($userA, 'sanctum')
            ->withHeaders(['X-Workspace-Id' => $workspaceB->id])
            ->getJson('/api/dashboard');

        $foreignResponse->assertStatus(403);
    }

    /**
     * 5. Accurate total project counts (ignoring archived projects)
     */
    public function test_accurate_project_counts(): void
    {
        [$user, $workspace] = $this->createWorkspaceWithUser();

        Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $user->id,
            'name' => 'Active Project 1',
            'status' => 'active',
        ]);
        Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $user->id,
            'name' => 'Active Project 2',
            'status' => 'planning',
        ]);
        Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $user->id,
            'name' => 'Archived Project',
            'status' => 'archived',
        ]);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/dashboard');

        $response->assertStatus(200);
        $this->assertEquals(2, $response->json('data.summary.total_projects'));
    }

    /**
     * 6 & 7. Task counts & completed tasks calculation
     */
    public function test_task_counts_and_completion_calculation(): void
    {
        [$user, $workspace] = $this->createWorkspaceWithUser();

        $project = Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $user->id,
            'name' => 'Core Project',
            'status' => 'active',
        ]);

        Task::create([
            'project_id' => $project->id,
            'creator_id' => $user->id,
            'title' => 'Task Done 1',
            'status' => 'done',
        ]);
        Task::create([
            'project_id' => $project->id,
            'creator_id' => $user->id,
            'title' => 'Task Done 2',
            'status' => 'done',
        ]);
        Task::create([
            'project_id' => $project->id,
            'creator_id' => $user->id,
            'title' => 'Task Todo',
            'status' => 'todo',
        ]);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/dashboard');

        $response->assertStatus(200);
        $this->assertEquals(3, $response->json('data.summary.total_tasks'));
        $this->assertEquals(2, $response->json('data.summary.completed_tasks'));
        $this->assertEquals(67, $response->json('data.project_overview.completed_percentage'));
    }

    /**
     * 8. In-progress task calculation (including review state)
     */
    public function test_in_progress_task_calculation(): void
    {
        [$user, $workspace] = $this->createWorkspaceWithUser();

        $project = Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $user->id,
            'name' => 'Core Project',
            'status' => 'active',
        ]);

        Task::create([
            'project_id' => $project->id,
            'creator_id' => $user->id,
            'title' => 'Task 1',
            'status' => 'in_progress',
        ]);
        Task::create([
            'project_id' => $project->id,
            'creator_id' => $user->id,
            'title' => 'Task 2',
            'status' => 'review',
        ]);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/dashboard');

        $response->assertStatus(200);
        $this->assertEquals(2, $response->json('data.summary.in_progress_tasks'));
    }

    /**
     * 9. Overdue tasks calculation (due date in past and status != done)
     */
    public function test_overdue_tasks_calculation(): void
    {
        [$user, $workspace] = $this->createWorkspaceWithUser();

        $project = Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $user->id,
            'name' => 'Core Project',
            'status' => 'active',
        ]);

        // Overdue task (past due date, not done)
        Task::create([
            'project_id' => $project->id,
            'creator_id' => $user->id,
            'title' => 'Overdue Task',
            'status' => 'todo',
            'due_date' => Carbon::now()->subDays(2),
        ]);

        // Completed task with past due date -> MUST NOT be counted as overdue
        Task::create([
            'project_id' => $project->id,
            'creator_id' => $user->id,
            'title' => 'Completed Past Task',
            'status' => 'done',
            'due_date' => Carbon::now()->subDays(3),
        ]);

        // Future task
        Task::create([
            'project_id' => $project->id,
            'creator_id' => $user->id,
            'title' => 'Future Task',
            'status' => 'todo',
            'due_date' => Carbon::now()->addDays(5),
        ]);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/dashboard');

        $response->assertStatus(200);
        $this->assertEquals(1, $response->json('data.summary.overdue_tasks'));
    }

    /**
     * 10. Project progress calculation (completed / total * 100) and handling zero tasks
     */
    public function test_project_progress_calculation(): void
    {
        [$user, $workspace] = $this->createWorkspaceWithUser();

        $projectWithTasks = Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $user->id,
            'name' => 'Project with Tasks',
            'status' => 'active',
        ]);

        Task::create([
            'project_id' => $projectWithTasks->id,
            'creator_id' => $user->id,
            'title' => 'Done Task',
            'status' => 'done',
        ]);
        Task::create([
            'project_id' => $projectWithTasks->id,
            'creator_id' => $user->id,
            'title' => 'Todo Task',
            'status' => 'todo',
        ]);

        $projectWithoutTasks = Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $user->id,
            'name' => 'Empty Project',
            'status' => 'active',
        ]);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/dashboard');

        $response->assertStatus(200);

        $projects = collect($response->json('data.my_projects'));

        $p1 = $projects->firstWhere('id', $projectWithTasks->id);
        $this->assertNotNull($p1);
        $this->assertEquals(50, $p1['progress']);
        $this->assertEquals(2, $p1['tasks_count']);
        $this->assertEquals(1, $p1['completed_tasks_count']);

        $p2 = $projects->firstWhere('id', $projectWithoutTasks->id);
        $this->assertNotNull($p2);
        $this->assertNull($p2['progress']); // Indicates "No tasks"
        $this->assertEquals(0, $p2['tasks_count']);
    }
}
