<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Project;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use App\Models\Workspace;
use App\Models\WorkspaceMember;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProjectTest extends TestCase
{
    use RefreshDatabase;

    protected function createWorkspaceWithOwner(): array
    {
        $owner = User::factory()->create([
            'name' => 'Workspace Owner',
            'email' => 'owner@example.com',
        ]);

        $workspace = Workspace::create([
            'name' => 'Primary Workspace',
            'slug' => 'primary-workspace',
            'owner_id' => $owner->id,
        ]);

        $workspace->members()->attach($owner->id, ['role_id' => null, 'joined_at' => now()]);

        return [$owner, $workspace];
    }

    protected function createMemberWithRole(Workspace $workspace, string $roleSlug, array $permissionSlugs = []): User
    {
        $user = User::factory()->create();

        $role = Role::firstOrCreate(['slug' => $roleSlug], [
            'name' => ucfirst(str_replace('_', ' ', $roleSlug)),
        ]);

        if (! empty($permissionSlugs)) {
            $permIds = [];
            foreach ($permissionSlugs as $slug) {
                $perm = Permission::firstOrCreate(['slug' => $slug], [
                    'name' => ucfirst(str_replace('.', ' ', $slug)),
                ]);
                $permIds[] = $perm->id;
            }
            $role->permissions()->sync($permIds);
        }

        $workspace->members()->attach($user->id, [
            'role_id' => $role->id,
            'joined_at' => now(),
        ]);

        return $user;
    }

    /**
     * 1. Authenticated user can list authorized projects
     */
    public function test_authenticated_user_can_list_authorized_projects(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $owner->id,
            'name' => 'Project Alpha',
            'status' => 'active',
        ]);

        $response = $this->actingAs($owner, 'sanctum')->getJson('/api/projects');

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
            ])
            ->assertJsonCount(1, 'data')
            ->assertJsonFragment(['name' => 'Project Alpha']);
    }

    /**
     * 2. Unauthenticated user cannot list projects
     */
    public function test_unauthenticated_user_cannot_list_projects(): void
    {
        $response = $this->getJson('/api/projects');

        $response->assertStatus(401);
    }

    /**
     * 3. User cannot see another workspace's projects
     */
    public function test_user_cannot_see_another_workspaces_projects(): void
    {
        [$owner1, $workspace1] = $this->createWorkspaceWithOwner();

        $owner2 = User::factory()->create();
        $workspace2 = Workspace::create([
            'name' => 'Foreign Workspace',
            'slug' => 'foreign-workspace',
            'owner_id' => $owner2->id,
        ]);

        Project::create([
            'workspace_id' => $workspace2->id,
            'owner_id' => $owner2->id,
            'name' => 'Secret Foreign Project',
        ]);

        // User 1 lists projects in their default workspace
        $response = $this->actingAs($owner1, 'sanctum')->getJson('/api/projects');
        $response->assertStatus(200)
            ->assertJsonCount(0, 'data')
            ->assertJsonMissing(['name' => 'Secret Foreign Project']);

        // User 1 tries to explicitly access workspace2 via header
        $forbiddenResponse = $this->actingAs($owner1, 'sanctum')
            ->withHeader('X-Workspace-Id', $workspace2->id)
            ->getJson('/api/projects');
        $forbiddenResponse->assertStatus(403);
    }

    /**
     * 4. User with permission can create project
     */
    public function test_user_with_permission_can_create_project(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $manager = $this->createMemberWithRole($workspace, 'project_manager', ['projects.manage']);

        $response = $this->actingAs($manager, 'sanctum')
            ->withHeader('X-Workspace-Id', $workspace->id)
            ->postJson('/api/projects', [
                'name' => 'Brand New Initiative',
                'description' => 'Important business initiative description',
                'status' => 'planning',
                'priority' => 'high',
            ]);

        $response->assertStatus(201)
            ->assertJson([
                'success' => true,
                'data' => [
                    'name' => 'Brand New Initiative',
                    'status' => 'planning',
                    'priority' => 'high',
                ],
            ]);
    }

    /**
     * 5. User without permission cannot create project
     */
    public function test_user_without_permission_cannot_create_project(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $viewer = $this->createMemberWithRole($workspace, 'viewer', ['projects.view']);

        $response = $this->actingAs($viewer, 'sanctum')
            ->withHeader('X-Workspace-Id', $workspace->id)
            ->postJson('/api/projects', [
                'name' => 'Unauthorized Attempt',
            ]);

        $response->assertStatus(403);
    }

    /**
     * 6. Invalid project data returns 422
     */
    public function test_invalid_project_data_returns_422(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        $response = $this->actingAs($owner, 'sanctum')
            ->postJson('/api/projects', [
                'name' => '', // Required field missing
                'status' => 'invalid_status_enum',
            ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['name', 'status']);
    }

    /**
     * 7. Created project is stored in MySQL
     */
    public function test_created_project_is_stored_in_database(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        $this->actingAs($owner, 'sanctum')
            ->postJson('/api/projects', [
                'name' => 'Database Storage Test',
                'description' => 'Persisted safely',
                'priority' => 'urgent',
            ]);

        $this->assertDatabaseHas('projects', [
            'workspace_id' => $workspace->id,
            'name' => 'Database Storage Test',
            'priority' => 'urgent',
            'owner_id' => $owner->id,
        ]);
    }

    /**
     * 8. Project details require authorization
     */
    public function test_project_details_require_authorization(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        $project = Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $owner->id,
            'name' => 'Auth Required Project',
        ]);

        // Unauthenticated
        $this->getJson("/api/projects/{$project->id}")->assertStatus(401);

        // Authenticated authorized
        $response = $this->actingAs($owner, 'sanctum')->getJson("/api/projects/{$project->id}");
        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'data' => [
                    'id' => $project->id,
                    'name' => 'Auth Required Project',
                ],
            ]);
    }

    /**
     * 9. Unauthorized project access is blocked
     */
    public function test_unauthorized_project_access_is_blocked(): void
    {
        [$owner1, $workspace1] = $this->createWorkspaceWithOwner();

        $project1 = Project::create([
            'workspace_id' => $workspace1->id,
            'owner_id' => $owner1->id,
            'name' => 'Confidential Project',
        ]);

        $foreignUser = User::factory()->create();

        // Foreign user cannot view project
        $this->actingAs($foreignUser, 'sanctum')
            ->getJson("/api/projects/{$project1->id}")
            ->assertStatus(403);
    }

    /**
     * 10. Authorized user can update project
     */
    public function test_authorized_user_can_update_project(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        $project = Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $owner->id,
            'name' => 'Original Name',
            'status' => 'planning',
        ]);

        $response = $this->actingAs($owner, 'sanctum')
            ->putJson("/api/projects/{$project->id}", [
                'name' => 'Updated Project Name',
                'status' => 'active',
                'description' => 'Updated description text',
            ]);

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'data' => [
                    'name' => 'Updated Project Name',
                    'status' => 'active',
                ],
            ]);

        $this->assertDatabaseHas('projects', [
            'id' => $project->id,
            'name' => 'Updated Project Name',
            'status' => 'active',
        ]);
    }

    /**
     * 11. Unauthorized user cannot update project
     */
    public function test_unauthorized_user_cannot_update_project(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        $project = Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $owner->id,
            'name' => 'Protected Project',
        ]);

        $viewer = $this->createMemberWithRole($workspace, 'viewer', ['projects.view']);

        $response = $this->actingAs($viewer, 'sanctum')
            ->putJson("/api/projects/{$project->id}", [
                'name' => 'Hacked Name',
            ]);

        $response->assertStatus(403);
    }

    /**
     * 12. Project search works
     */
    public function test_project_search_works(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        Project::create(['workspace_id' => $workspace->id, 'owner_id' => $owner->id, 'name' => 'Finance Dashboard Engine']);
        Project::create(['workspace_id' => $workspace->id, 'owner_id' => $owner->id, 'name' => 'Mobile Notification Pipeline']);

        $response = $this->actingAs($owner, 'sanctum')->getJson('/api/projects?search=Finance');

        $response->assertStatus(200)
            ->assertJsonCount(1, 'data')
            ->assertJsonFragment(['name' => 'Finance Dashboard Engine'])
            ->assertJsonMissing(['name' => 'Mobile Notification Pipeline']);
    }

    /**
     * 13. Project filtering works
     */
    public function test_project_filtering_works(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        Project::create(['workspace_id' => $workspace->id, 'owner_id' => $owner->id, 'name' => 'Active Project', 'status' => 'active']);
        Project::create(['workspace_id' => $workspace->id, 'owner_id' => $owner->id, 'name' => 'Planning Project', 'status' => 'planning']);

        $response = $this->actingAs($owner, 'sanctum')->getJson('/api/projects?status=active');

        $response->assertStatus(200)
            ->assertJsonCount(1, 'data')
            ->assertJsonFragment(['name' => 'Active Project'])
            ->assertJsonMissing(['name' => 'Planning Project']);
    }

    /**
     * 14. Project sorting works
     */
    public function test_project_sorting_works(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        Project::create(['workspace_id' => $workspace->id, 'owner_id' => $owner->id, 'name' => 'AAA First Alphabetical']);
        Project::create(['workspace_id' => $workspace->id, 'owner_id' => $owner->id, 'name' => 'ZZZ Last Alphabetical']);

        $responseAsc = $this->actingAs($owner, 'sanctum')->getJson('/api/projects?sort_by=name&sort_order=asc');
        $responseAsc->assertStatus(200);
        $this->assertEquals('AAA First Alphabetical', $responseAsc->json('data.0.name'));

        $responseDesc = $this->actingAs($owner, 'sanctum')->getJson('/api/projects?sort_by=name&sort_order=desc');
        $responseDesc->assertStatus(200);
        $this->assertEquals('ZZZ Last Alphabetical', $responseDesc->json('data.0.name'));
    }

    /**
     * 15. Project pagination works
     */
    public function test_project_pagination_works(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        for ($i = 1; $i <= 15; $i++) {
            Project::create([
                'workspace_id' => $workspace->id,
                'owner_id' => $owner->id,
                'name' => "Batch Project {$i}",
            ]);
        }

        $response = $this->actingAs($owner, 'sanctum')->getJson('/api/projects?per_page=10&page=1');

        $response->assertStatus(200)
            ->assertJsonCount(10, 'data')
            ->assertJson([
                'meta' => [
                    'current_page' => 1,
                    'last_page' => 2,
                    'per_page' => 10,
                    'total' => 15,
                ],
            ]);
    }

    /**
     * 16. Project task counts are correct
     */
    public function test_project_task_counts_are_correct(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        $project = Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $owner->id,
            'name' => 'Task Counting Project',
        ]);

        Task::create(['project_id' => $project->id, 'creator_id' => $owner->id, 'title' => 'Task 1', 'status' => 'done']);
        Task::create(['project_id' => $project->id, 'creator_id' => $owner->id, 'title' => 'Task 2', 'status' => 'in_progress']);
        Task::create(['project_id' => $project->id, 'creator_id' => $owner->id, 'title' => 'Task 3', 'status' => 'todo']);

        $response = $this->actingAs($owner, 'sanctum')->getJson("/api/projects/{$project->id}");

        $response->assertStatus(200)
            ->assertJson([
                'data' => [
                    'statistics' => [
                        'total_tasks' => 3,
                        'completed_tasks' => 1,
                        'in_progress_tasks' => 1,
                        'todo_tasks' => 1,
                    ],
                ],
            ]);
    }

    /**
     * 17. Project progress is calculated correctly
     */
    public function test_project_progress_is_calculated_correctly(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        // 1. Project with 0 tasks -> progress is null (handles 0 tasks without dividing by zero)
        $emptyProject = Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $owner->id,
            'name' => 'Empty Project',
        ]);

        $emptyResponse = $this->actingAs($owner, 'sanctum')->getJson("/api/projects/{$emptyProject->id}");
        $emptyResponse->assertStatus(200)
            ->assertJsonPath('data.statistics.progress', null);

        // 2. Project with 2 of 4 tasks completed -> progress is 50.0%
        $activeProject = Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $owner->id,
            'name' => 'Half Finished Project',
        ]);

        Task::create(['project_id' => $activeProject->id, 'creator_id' => $owner->id, 'title' => 'T1', 'status' => 'done']);
        Task::create(['project_id' => $activeProject->id, 'creator_id' => $owner->id, 'title' => 'T2', 'status' => 'done']);
        Task::create(['project_id' => $activeProject->id, 'creator_id' => $owner->id, 'title' => 'T3', 'status' => 'todo']);
        Task::create(['project_id' => $activeProject->id, 'creator_id' => $owner->id, 'title' => 'T4', 'status' => 'in_progress']);

        $activeResponse = $this->actingAs($owner, 'sanctum')->getJson("/api/projects/{$activeProject->id}");
        $activeResponse->assertStatus(200)
            ->assertJsonPath('data.statistics.progress', 50);
    }

    /**
     * 18. Empty project list returns valid empty response
     */
    public function test_empty_project_list_returns_valid_empty_response(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        $response = $this->actingAs($owner, 'sanctum')->getJson('/api/projects');

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'data' => [],
                'meta' => [
                    'current_page' => 1,
                    'last_page' => 1,
                    'total' => 0,
                ],
            ]);
    }
}
