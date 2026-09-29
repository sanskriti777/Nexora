<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Role;
use App\Models\Task;
use App\Models\Team;
use App\Models\User;
use App\Models\Workspace;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CalendarTest extends TestCase
{
    use RefreshDatabase;

    protected function setupWorkspaceWithProject(): array
    {
        $owner = User::factory()->create([
            'name' => 'Calendar Owner',
            'email' => 'calendar_owner@example.com',
        ]);

        $workspace = Workspace::create([
            'name' => 'Calendar Test Workspace',
            'slug' => 'calendar-test-workspace',
            'owner_id' => $owner->id,
        ]);

        $workspace->members()->attach($owner->id, ['role_id' => null, 'joined_at' => now()]);

        $project = Project::create([
            'workspace_id' => $workspace->id,
            'name' => 'Calendar Project Alpha',
            'status' => 'active',
            'priority' => 'high',
            'owner_id' => $owner->id,
        ]);

        return [$owner, $workspace, $project];
    }

    public function test_unauthenticated_request_is_rejected(): void
    {
        $response = $this->getJson('/api/calendar');
        $response->assertStatus(401);
    }

    public function test_authenticated_workspace_member_can_retrieve_calendar(): void
    {
        [$owner, $workspace, $project] = $this->setupWorkspaceWithProject();

        Task::create([
            'project_id' => $project->id,
            'creator_id' => $owner->id,
            'title' => 'Deliver Milestone 1',
            'status' => 'in_progress',
            'priority' => 'high',
            'due_date' => Carbon::now()->addDays(2),
        ]);

        $response = $this->actingAs($owner)
            ->withHeaders(['X-Workspace-Id' => $workspace->id])
            ->getJson('/api/calendar');

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'Deliver Milestone 1');
    }

    public function test_cross_workspace_data_is_forbidden_when_unauthorized(): void
    {
        [$owner, $workspace, $project] = $this->setupWorkspaceWithProject();

        // Foreign user
        $foreignUser = User::factory()->create(['email' => 'stranger@example.com']);

        $response = $this->actingAs($foreignUser)
            ->withHeaders(['X-Workspace-Id' => $workspace->id])
            ->getJson('/api/calendar');

        $response->assertStatus(403);
    }

    public function test_cross_workspace_tasks_are_not_leaked(): void
    {
        [$owner1, $workspace1, $project1] = $this->setupWorkspaceWithProject();

        // Workspace 2
        $owner2 = User::factory()->create();
        $workspace2 = Workspace::create([
            'name' => 'Second Workspace',
            'slug' => 'second-workspace',
            'owner_id' => $owner2->id,
        ]);
        $project2 = Project::create([
            'workspace_id' => $workspace2->id,
            'name' => 'Project Beta',
            'status' => 'active',
            'owner_id' => $owner2->id,
        ]);

        Task::create([
            'project_id' => $project1->id,
            'creator_id' => $owner1->id,
            'title' => 'Workspace 1 Task',
            'status' => 'todo',
            'due_date' => Carbon::now()->addDay(),
        ]);

        Task::create([
            'project_id' => $project2->id,
            'creator_id' => $owner2->id,
            'title' => 'Workspace 2 Private Task',
            'status' => 'todo',
            'due_date' => Carbon::now()->addDay(),
        ]);

        $response = $this->actingAs($owner1)
            ->withHeaders(['X-Workspace-Id' => $workspace1->id])
            ->getJson('/api/calendar');

        $response->assertStatus(200);
        $titles = collect($response->json('data'))->pluck('title')->all();
        $this->assertContains('Workspace 1 Task', $titles);
        $this->assertNotContains('Workspace 2 Private Task', $titles);
    }

    public function test_task_with_due_date_appears_and_task_without_due_date_does_not(): void
    {
        [$owner, $workspace, $project] = $this->setupWorkspaceWithProject();

        Task::create([
            'project_id' => $project->id,
            'creator_id' => $owner->id,
            'title' => 'Scheduled Task',
            'status' => 'todo',
            'due_date' => Carbon::now()->addDays(5),
        ]);

        Task::create([
            'project_id' => $project->id,
            'creator_id' => $owner->id,
            'title' => 'Unscheduled Backlog Item',
            'status' => 'todo',
            'due_date' => null,
        ]);

        $response = $this->actingAs($owner)
            ->withHeaders(['X-Workspace-Id' => $workspace->id])
            ->getJson('/api/calendar');

        $response->assertStatus(200);
        $data = $response->json('data');
        $this->assertCount(1, $data);
        $this->assertEquals('Scheduled Task', $data[0]['title']);
    }

    public function test_date_range_filtering_works(): void
    {
        [$owner, $workspace, $project] = $this->setupWorkspaceWithProject();

        // Task in October
        Task::create([
            'project_id' => $project->id,
            'creator_id' => $owner->id,
            'title' => 'October Milestone',
            'status' => 'todo',
            'due_date' => Carbon::parse('2026-10-15 14:00:00'),
        ]);

        // Task in November
        Task::create([
            'project_id' => $project->id,
            'creator_id' => $owner->id,
            'title' => 'November Milestone',
            'status' => 'todo',
            'due_date' => Carbon::parse('2026-11-20 10:00:00'),
        ]);

        // Query only October
        $response = $this->actingAs($owner)
            ->withHeaders(['X-Workspace-Id' => $workspace->id])
            ->getJson('/api/calendar?start=2026-10-01&end=2026-10-31');

        $response->assertStatus(200);
        $data = $response->json('data');
        $this->assertCount(1, $data);
        $this->assertEquals('October Milestone', $data[0]['title']);
    }

    public function test_project_filtering_works(): void
    {
        [$owner, $workspace, $projectA] = $this->setupWorkspaceWithProject();

        $projectB = Project::create([
            'workspace_id' => $workspace->id,
            'name' => 'Calendar Project Bravo',
            'status' => 'active',
            'owner_id' => $owner->id,
        ]);

        Task::create([
            'project_id' => $projectA->id,
            'creator_id' => $owner->id,
            'title' => 'Task in Project Alpha',
            'due_date' => Carbon::now()->addDays(2),
        ]);

        Task::create([
            'project_id' => $projectB->id,
            'creator_id' => $owner->id,
            'title' => 'Task in Project Bravo',
            'due_date' => Carbon::now()->addDays(3),
        ]);

        $response = $this->actingAs($owner)
            ->withHeaders(['X-Workspace-Id' => $workspace->id])
            ->getJson('/api/calendar?project_id=' . $projectB->id);

        $response->assertStatus(200);
        $data = $response->json('data');
        $this->assertCount(1, $data);
        $this->assertEquals('Task in Project Bravo', $data[0]['title']);
    }

    public function test_status_and_priority_filtering_works(): void
    {
        [$owner, $workspace, $project] = $this->setupWorkspaceWithProject();

        Task::create([
            'project_id' => $project->id,
            'creator_id' => $owner->id,
            'title' => 'High Priority Todo',
            'status' => 'todo',
            'priority' => 'high',
            'due_date' => Carbon::now()->addDays(1),
        ]);

        Task::create([
            'project_id' => $project->id,
            'creator_id' => $owner->id,
            'title' => 'Low Priority Done',
            'status' => 'done',
            'priority' => 'low',
            'due_date' => Carbon::now()->addDays(2),
        ]);

        // Filter by status=todo
        $resStatus = $this->actingAs($owner)
            ->withHeaders(['X-Workspace-Id' => $workspace->id])
            ->getJson('/api/calendar?status=todo');

        $resStatus->assertStatus(200);
        $this->assertCount(1, $resStatus->json('data'));
        $this->assertEquals('High Priority Todo', $resStatus->json('data.0.title'));

        // Filter by priority=low
        $resPriority = $this->actingAs($owner)
            ->withHeaders(['X-Workspace-Id' => $workspace->id])
            ->getJson('/api/calendar?priority=low');

        $resPriority->assertStatus(200);
        $this->assertCount(1, $resPriority->json('data'));
        $this->assertEquals('Low Priority Done', $resPriority->json('data.0.title'));
    }

    public function test_assignee_and_team_filtering_works(): void
    {
        [$owner, $workspace, $project] = $this->setupWorkspaceWithProject();

        $member = User::factory()->create();
        $workspace->members()->attach($member->id, ['role_id' => null, 'joined_at' => now()]);

        $team = Team::create([
            'workspace_id' => $workspace->id,
            'name' => 'Backend Core',
        ]);

        $taskWithTeam = Task::create([
            'project_id' => $project->id,
            'team_id' => $team->id,
            'creator_id' => $owner->id,
            'title' => 'Task for Core Team',
            'due_date' => Carbon::now()->addDays(1),
        ]);

        $taskWithAssignee = Task::create([
            'project_id' => $project->id,
            'creator_id' => $owner->id,
            'title' => 'Task for Specific Member',
            'due_date' => Carbon::now()->addDays(2),
        ]);
        $taskWithAssignee->assignees()->attach($member->id);

        // Team filter
        $resTeam = $this->actingAs($owner)
            ->withHeaders(['X-Workspace-Id' => $workspace->id])
            ->getJson('/api/calendar?team_id=' . $team->id);
        $resTeam->assertStatus(200);
        $this->assertCount(1, $resTeam->json('data'));
        $this->assertEquals('Task for Core Team', $resTeam->json('data.0.title'));

        // Assignee filter
        $resAssignee = $this->actingAs($owner)
            ->withHeaders(['X-Workspace-Id' => $workspace->id])
            ->getJson('/api/calendar?assignee_id=' . $member->id);
        $resAssignee->assertStatus(200);
        $this->assertCount(1, $resAssignee->json('data'));
        $this->assertEquals('Task for Specific Member', $resAssignee->json('data.0.title'));
    }

    public function test_overdue_tasks_flagged_correctly(): void
    {
        [$owner, $workspace, $project] = $this->setupWorkspaceWithProject();

        Task::create([
            'project_id' => $project->id,
            'creator_id' => $owner->id,
            'title' => 'Overdue Task Item',
            'status' => 'in_progress',
            'due_date' => Carbon::now()->subDays(3),
        ]);

        Task::create([
            'project_id' => $project->id,
            'creator_id' => $owner->id,
            'title' => 'Future Task Item',
            'status' => 'todo',
            'due_date' => Carbon::now()->addDays(3),
        ]);

        $response = $this->actingAs($owner)
            ->withHeaders(['X-Workspace-Id' => $workspace->id])
            ->getJson('/api/calendar');

        $response->assertStatus(200);
        $data = collect($response->json('data'));

        $overdue = $data->firstWhere('title', 'Overdue Task Item');
        $future = $data->firstWhere('title', 'Future Task Item');

        $this->assertTrue($overdue['is_overdue']);
        $this->assertFalse($future['is_overdue']);
    }
}
