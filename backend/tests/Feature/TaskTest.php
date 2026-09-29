<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Permission;
use App\Models\Project;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use App\Models\Workspace;
use App\Models\WorkspaceMember;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TaskTest extends TestCase
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

    // ==========================================
    // AUTHENTICATION TESTS
    // ==========================================

    public function test_unauthenticated_user_cannot_list_tasks(): void
    {
        $response = $this->getJson('/api/tasks');
        $response->assertStatus(401);
    }

    public function test_unauthenticated_user_cannot_create_task(): void
    {
        $response = $this->postJson('/api/tasks', ['title' => 'Test Task']);
        $response->assertStatus(401);
    }

    public function test_unauthenticated_user_cannot_view_task_details(): void
    {
        $response = $this->getJson('/api/tasks/1');
        $response->assertStatus(401);
    }

    public function test_unauthenticated_user_cannot_update_task(): void
    {
        $response = $this->putJson('/api/tasks/1', ['title' => 'Updated']);
        $response->assertStatus(401);
    }

    public function test_unauthenticated_user_cannot_delete_task(): void
    {
        $response = $this->deleteJson('/api/tasks/1');
        $response->assertStatus(401);
    }

    // ==========================================
    // AUTHORIZATION / IDOR TESTS
    // ==========================================

    public function test_user_cannot_access_tasks_from_another_workspace(): void
    {
        [$owner1, $workspace1] = $this->createWorkspaceWithOwner();

        $owner2 = User::factory()->create();
        $workspace2 = Workspace::create([
            'name' => 'Other Workspace',
            'slug' => 'other-workspace',
            'owner_id' => $owner2->id,
        ]);

        $project2 = Project::create([
            'workspace_id' => $workspace2->id,
            'owner_id' => $owner2->id,
            'name' => 'Foreign Project',
            'status' => 'active',
        ]);

        $task2 = Task::create([
            'project_id' => $project2->id,
            'creator_id' => $owner2->id,
            'title' => 'Foreign Task',
            'status' => 'todo',
            'priority' => 'high',
        ]);

        // 1. Owner 1 listing tasks shouldn't see Foreign Task
        $response = $this->actingAs($owner1, 'sanctum')->getJson('/api/tasks');
        $response->assertStatus(200)
            ->assertJsonCount(0, 'data');

        // 2. Direct IDOR attempt: Owner 1 fetching task 2 details should be forbidden (403)
        $detailResponse = $this->actingAs($owner1, 'sanctum')->getJson("/api/tasks/{$task2->id}");
        $detailResponse->assertStatus(403);

        // 3. Direct IDOR attempt: Owner 1 updating task 2 should be forbidden (403)
        $updateResponse = $this->actingAs($owner1, 'sanctum')->putJson("/api/tasks/{$task2->id}", [
            'title' => 'Hacked Task',
        ]);
        $updateResponse->assertStatus(403);

        // 4. Direct IDOR attempt: Owner 1 deleting task 2 should be forbidden (403)
        $deleteResponse = $this->actingAs($owner1, 'sanctum')->deleteJson("/api/tasks/{$task2->id}");
        $deleteResponse->assertStatus(403);
    }

    public function test_viewer_without_manage_permission_cannot_create_task(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $viewer = $this->createMemberWithRole($workspace, 'viewer');

        $project = Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $owner->id,
            'name' => 'Internal Project',
        ]);

        $response = $this->actingAs($viewer, 'sanctum')->postJson('/api/tasks', [
            'project_id' => $project->id,
            'title' => 'Unauthorized Task Creation',
        ]);

        $response->assertStatus(403);
    }

    public function test_viewer_without_manage_permission_cannot_delete_task(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $viewer = $this->createMemberWithRole($workspace, 'viewer');

        $project = Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $owner->id,
            'name' => 'Internal Project',
        ]);

        $task = Task::create([
            'project_id' => $project->id,
            'creator_id' => $owner->id,
            'title' => 'Task to delete',
        ]);

        $response = $this->actingAs($viewer, 'sanctum')->deleteJson("/api/tasks/{$task->id}");
        $response->assertStatus(403);
    }

    // ==========================================
    // CREATE TASK TESTS
    // ==========================================

    public function test_authorized_user_can_create_task(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $assignee = $this->createMemberWithRole($workspace, 'team_member');

        $project = Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $owner->id,
            'name' => 'Website Redesign',
            'status' => 'active',
        ]);

        $payload = [
            'project_id' => $project->id,
            'title' => 'Implement Navigation Header',
            'description' => 'Responsive navbar with glassmorphism',
            'status' => 'in_progress',
            'priority' => 'urgent',
            'due_date' => now()->addDays(5)->toDateTimeString(),
            'assignees' => [$assignee->id],
        ];

        $response = $this->actingAs($owner, 'sanctum')->postJson('/api/tasks', $payload);

        $response->assertStatus(201)
            ->assertJson([
                'success' => true,
                'message' => 'Task created successfully.',
                'data' => [
                    'title' => 'Implement Navigation Header',
                    'status' => 'in_progress',
                    'priority' => 'urgent',
                    'project_id' => $project->id,
                ],
            ]);

        $this->assertDatabaseHas('tasks', [
            'title' => 'Implement Navigation Header',
            'status' => 'in_progress',
            'priority' => 'urgent',
            'project_id' => $project->id,
            'creator_id' => $owner->id,
        ]);

        $taskId = $response->json('data.id');
        $this->assertDatabaseHas('task_assignees', [
            'task_id' => $taskId,
            'user_id' => $assignee->id,
        ]);
    }

    public function test_task_creation_validation_fails_on_missing_required_fields(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        $response = $this->actingAs($owner, 'sanctum')->postJson('/api/tasks', []);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['title', 'project_id']);
    }

    public function test_task_creation_fails_with_invalid_status_or_priority(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $project = Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $owner->id,
            'name' => 'Project',
        ]);

        $response = $this->actingAs($owner, 'sanctum')->postJson('/api/tasks', [
            'project_id' => $project->id,
            'title' => 'Bad Enums Task',
            'status' => 'unknown_status',
            'priority' => 'super_critical',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['status', 'priority']);
    }

    public function test_task_creation_fails_when_project_belongs_to_inaccessible_workspace(): void
    {
        [$owner1, $workspace1] = $this->createWorkspaceWithOwner();

        $owner2 = User::factory()->create();
        $workspace2 = Workspace::create([
            'name' => 'Workspace Two',
            'slug' => 'workspace-two',
            'owner_id' => $owner2->id,
        ]);

        $foreignProject = Project::create([
            'workspace_id' => $workspace2->id,
            'owner_id' => $owner2->id,
            'name' => 'Foreign Project',
        ]);

        $response = $this->actingAs($owner1, 'sanctum')->postJson('/api/tasks', [
            'project_id' => $foreignProject->id,
            'title' => 'Illicit Task',
        ]);

        $response->assertStatus(403);
    }

    public function test_task_creation_fails_when_assignee_belongs_to_another_workspace(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $project = Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $owner->id,
            'name' => 'Project Alpha',
        ]);

        $outsiderUser = User::factory()->create();

        $response = $this->actingAs($owner, 'sanctum')->postJson('/api/tasks', [
            'project_id' => $project->id,
            'title' => 'Task for outsider',
            'assignees' => [$outsiderUser->id],
        ]);

        $response->assertStatus(422)
            ->assertJsonFragment([
                'success' => false,
                'message' => 'One or more assignees do not belong to this workspace.',
            ]);
    }

    // ==========================================
    // LIST & FILTER TESTS
    // ==========================================

    public function test_empty_task_list_returns_proper_structure(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        $response = $this->actingAs($owner, 'sanctum')->getJson('/api/tasks');

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'data' => [],
                'meta' => [
                    'current_page' => 1,
                    'total' => 0,
                ],
            ]);
    }

    public function test_tasks_can_be_filtered_by_status_priority_and_project(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        $project1 = Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $owner->id,
            'name' => 'Project One',
        ]);

        $project2 = Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $owner->id,
            'name' => 'Project Two',
        ]);

        Task::create([
            'project_id' => $project1->id,
            'creator_id' => $owner->id,
            'title' => 'Task 1: Bugfix',
            'status' => 'todo',
            'priority' => 'low',
        ]);

        Task::create([
            'project_id' => $project1->id,
            'creator_id' => $owner->id,
            'title' => 'Task 2: Security Patch',
            'status' => 'done',
            'priority' => 'urgent',
        ]);

        Task::create([
            'project_id' => $project2->id,
            'creator_id' => $owner->id,
            'title' => 'Task 3: Refactor',
            'status' => 'todo',
            'priority' => 'high',
        ]);

        // Filter by project_id
        $resProject = $this->actingAs($owner, 'sanctum')->getJson("/api/tasks?project_id={$project1->id}");
        $resProject->assertStatus(200)->assertJsonCount(2, 'data');

        // Filter by status=done
        $resStatus = $this->actingAs($owner, 'sanctum')->getJson('/api/tasks?status=done');
        $resStatus->assertStatus(200)
            ->assertJsonCount(1, 'data')
            ->assertJsonFragment(['title' => 'Task 2: Security Patch']);

        // Filter by priority=urgent
        $resPriority = $this->actingAs($owner, 'sanctum')->getJson('/api/tasks?priority=urgent');
        $resPriority->assertStatus(200)
            ->assertJsonCount(1, 'data')
            ->assertJsonFragment(['title' => 'Task 2: Security Patch']);

        // Search query
        $resSearch = $this->actingAs($owner, 'sanctum')->getJson('/api/tasks?search=Bugfix');
        $resSearch->assertStatus(200)
            ->assertJsonCount(1, 'data')
            ->assertJsonFragment(['title' => 'Task 1: Bugfix']);
    }

    public function test_tasks_can_be_filtered_by_assignee(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $assignee1 = $this->createMemberWithRole($workspace, 'team_member');
        $assignee2 = $this->createMemberWithRole($workspace, 'team_member');

        $project = Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $owner->id,
            'name' => 'Project',
        ]);

        $task1 = Task::create([
            'project_id' => $project->id,
            'creator_id' => $owner->id,
            'title' => 'Assigned to User 1',
        ]);
        $task1->assignees()->attach($assignee1->id);

        $task2 = Task::create([
            'project_id' => $project->id,
            'creator_id' => $owner->id,
            'title' => 'Assigned to User 2',
        ]);
        $task2->assignees()->attach($assignee2->id);

        $response = $this->actingAs($owner, 'sanctum')->getJson("/api/tasks?assignee_id={$assignee1->id}");
        $response->assertStatus(200)
            ->assertJsonCount(1, 'data')
            ->assertJsonFragment(['title' => 'Assigned to User 1']);
    }

    // ==========================================
    // DETAILS TESTS
    // ==========================================

    public function test_authorized_user_can_view_task_details(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $assignee = $this->createMemberWithRole($workspace, 'team_member');

        $project = Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $owner->id,
            'name' => 'Mobile App',
        ]);

        $task = Task::create([
            'project_id' => $project->id,
            'creator_id' => $owner->id,
            'title' => 'Configure OAuth Provider',
            'description' => 'Setup Google and GitHub OAuth credentials',
            'status' => 'review',
            'priority' => 'high',
        ]);
        $task->assignees()->attach($assignee->id);

        $response = $this->actingAs($owner, 'sanctum')->getJson("/api/tasks/{$task->id}");

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'data' => [
                    'id' => $task->id,
                    'title' => 'Configure OAuth Provider',
                    'status' => 'review',
                    'priority' => 'high',
                    'project' => [
                        'id' => $project->id,
                        'name' => 'Mobile App',
                    ],
                    'creator' => [
                        'id' => $owner->id,
                        'name' => 'Workspace Owner',
                    ],
                ],
            ]);
    }

    // ==========================================
    // UPDATE TESTS
    // ==========================================

    public function test_authorized_user_can_update_task(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $assignee = $this->createMemberWithRole($workspace, 'team_member');

        $project = Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $owner->id,
            'name' => 'Documentation Site',
        ]);

        $task = Task::create([
            'project_id' => $project->id,
            'creator_id' => $owner->id,
            'title' => 'Draft Architecture Guide',
            'status' => 'todo',
            'priority' => 'medium',
        ]);

        $response = $this->actingAs($owner, 'sanctum')->putJson("/api/tasks/{$task->id}", [
            'title' => 'Finalize Architecture Guide',
            'status' => 'done',
            'priority' => 'urgent',
            'assignees' => [$assignee->id],
        ]);

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'message' => 'Task updated successfully.',
                'data' => [
                    'title' => 'Finalize Architecture Guide',
                    'status' => 'done',
                    'priority' => 'urgent',
                ],
            ]);

        $this->assertDatabaseHas('tasks', [
            'id' => $task->id,
            'title' => 'Finalize Architecture Guide',
            'status' => 'done',
            'priority' => 'urgent',
        ]);

        $this->assertDatabaseHas('task_assignees', [
            'task_id' => $task->id,
            'user_id' => $assignee->id,
        ]);
    }

    // ==========================================
    // DELETE & SOFT-DELETE TESTS
    // ==========================================

    public function test_authorized_user_can_delete_task_with_soft_delete(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        $project = Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $owner->id,
            'name' => 'Billing System',
        ]);

        $task = Task::create([
            'project_id' => $project->id,
            'creator_id' => $owner->id,
            'title' => 'Legacy Webhook Cleanup',
        ]);

        $response = $this->actingAs($owner, 'sanctum')->deleteJson("/api/tasks/{$task->id}");

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'message' => 'Task deleted successfully.',
            ]);

        // Verify soft-deleted
        $this->assertSoftDeleted('tasks', ['id' => $task->id]);

        // Verify excluded from normal list
        $listResponse = $this->actingAs($owner, 'sanctum')->getJson('/api/tasks');
        $listResponse->assertStatus(200)
            ->assertJsonCount(0, 'data');
    }

    // ==========================================
    // ACTIVITY LOGGING TESTS
    // ==========================================

    public function test_task_operations_record_activity_logs(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        $project = Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $owner->id,
            'name' => 'Activity Test Project',
        ]);

        // 1. Create Task -> Logs task_created
        $createResponse = $this->actingAs($owner, 'sanctum')->postJson('/api/tasks', [
            'project_id' => $project->id,
            'title' => 'Log Activity Task',
        ]);
        $taskId = $createResponse->json('data.id');

        $this->assertDatabaseHas('activity_logs', [
            'workspace_id' => $workspace->id,
            'user_id' => $owner->id,
            'action' => 'task_created',
            'entity_type' => 'Task',
            'entity_id' => $taskId,
        ]);

        // 2. Update Task -> Logs task_updated
        $this->actingAs($owner, 'sanctum')->putJson("/api/tasks/{$taskId}", [
            'status' => 'done',
        ]);

        $this->assertDatabaseHas('activity_logs', [
            'workspace_id' => $workspace->id,
            'user_id' => $owner->id,
            'action' => 'task_updated',
            'entity_type' => 'Task',
            'entity_id' => $taskId,
        ]);

        // 3. Delete Task -> Logs task_deleted
        $this->actingAs($owner, 'sanctum')->deleteJson("/api/tasks/{$taskId}");

        $this->assertDatabaseHas('activity_logs', [
            'workspace_id' => $workspace->id,
            'user_id' => $owner->id,
            'action' => 'task_deleted',
            'entity_type' => 'Task',
            'entity_id' => $taskId,
        ]);
    }
}
