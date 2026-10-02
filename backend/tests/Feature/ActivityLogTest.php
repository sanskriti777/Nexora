<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Project;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ActivityLogTest extends TestCase
{
    use RefreshDatabase;

    protected function createWorkspaceWithOwner(): array
    {
        $owner = User::factory()->create([
            'name' => 'Workspace Owner',
            'email' => 'owner_' . uniqid() . '@example.com',
        ]);

        $workspace = Workspace::create([
            'name' => 'Primary Workspace',
            'slug' => 'workspace-' . uniqid(),
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

    // 1. Authenticated user can retrieve activity
    public function test_authenticated_user_can_retrieve_activity(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        ActivityLog::create([
            'user_id' => $owner->id,
            'workspace_id' => $workspace->id,
            'action' => 'project_created',
            'entity_type' => 'Project',
            'entity_id' => 1,
            'details' => ['name' => 'Test Project'],
        ]);

        $response = $this->actingAs($owner)->getJson('/api/activity');

        $response->assertStatus(200);
        $this->assertTrue($response->json('success'));
        $this->assertCount(1, $response->json('data'));
        $this->assertEquals('project_created', $response->json('data.0.action'));
    }

    // 2. Unauthenticated user is rejected
    public function test_unauthenticated_user_is_rejected(): void
    {
        $response = $this->getJson('/api/activity');
        $response->assertStatus(401);

        $response = $this->getJson('/api/activity/1');
        $response->assertStatus(401);

        $response = $this->getJson('/api/activity/filters');
        $response->assertStatus(401);
    }

    // 3. Activity is ordered newest first
    public function test_activity_is_ordered_newest_first(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        $first = ActivityLog::create([
            'user_id' => $owner->id,
            'workspace_id' => $workspace->id,
            'action' => 'first_action',
            'entity_type' => 'Project',
            'entity_id' => 1,
            'created_at' => now()->subHours(2),
        ]);

        $second = ActivityLog::create([
            'user_id' => $owner->id,
            'workspace_id' => $workspace->id,
            'action' => 'second_action',
            'entity_type' => 'Project',
            'entity_id' => 1,
            'created_at' => now()->subHour(1),
        ]);

        $response = $this->actingAs($owner)->getJson("/api/activity?workspace_id={$workspace->id}");

        $response->assertStatus(200);
        $this->assertEquals('second_action', $response->json('data.0.action'));
        $this->assertEquals('first_action', $response->json('data.1.action'));
    }

    // 4. Pagination works
    public function test_pagination_works(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        for ($i = 1; $i <= 25; $i++) {
            ActivityLog::create([
                'user_id' => $owner->id,
                'workspace_id' => $workspace->id,
                'action' => "action_{$i}",
                'entity_type' => 'Task',
                'entity_id' => $i,
                'created_at' => now()->subMinutes(30 - $i),
            ]);
        }

        $response = $this->actingAs($owner)->getJson("/api/activity?workspace_id={$workspace->id}&per_page=10&page=1");

        $response->assertStatus(200);
        $this->assertCount(10, $response->json('data'));
        $this->assertEquals(25, $response->json('pagination.total'));
        $this->assertEquals(3, $response->json('pagination.last_page'));
        $this->assertTrue($response->json('pagination.has_more'));

        $page2Response = $this->actingAs($owner)->getJson("/api/activity?workspace_id={$workspace->id}&per_page=10&page=2");
        $this->assertCount(10, $page2Response->json('data'));
    }

    // 5. Action filter works
    public function test_action_filter_works(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        ActivityLog::create([
            'user_id' => $owner->id,
            'workspace_id' => $workspace->id,
            'action' => 'task_created',
            'entity_type' => 'Task',
            'entity_id' => 1,
        ]);

        ActivityLog::create([
            'user_id' => $owner->id,
            'workspace_id' => $workspace->id,
            'action' => 'project_created',
            'entity_type' => 'Project',
            'entity_id' => 1,
        ]);

        $response = $this->actingAs($owner)->getJson("/api/activity?workspace_id={$workspace->id}&action=task_created");

        $response->assertStatus(200);
        $this->assertCount(1, $response->json('data'));
        $this->assertEquals('task_created', $response->json('data.0.action'));
    }

    // 6. User filter works
    public function test_user_filter_works(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $member = User::factory()->create();
        $this->addMemberToWorkspace($workspace, $member);

        ActivityLog::create([
            'user_id' => $owner->id,
            'workspace_id' => $workspace->id,
            'action' => 'owner_action',
            'entity_type' => 'Workspace',
            'entity_id' => $workspace->id,
        ]);

        ActivityLog::create([
            'user_id' => $member->id,
            'workspace_id' => $workspace->id,
            'action' => 'member_action',
            'entity_type' => 'Workspace',
            'entity_id' => $workspace->id,
        ]);

        $response = $this->actingAs($owner)->getJson("/api/activity?workspace_id={$workspace->id}&user_id={$member->id}");

        $response->assertStatus(200);
        $this->assertCount(1, $response->json('data'));
        $this->assertEquals('member_action', $response->json('data.0.action'));
        $this->assertEquals($member->id, $response->json('data.0.actor.id'));
    }

    // 7. Entity type filter works
    public function test_entity_type_filter_works(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        ActivityLog::create([
            'user_id' => $owner->id,
            'workspace_id' => $workspace->id,
            'action' => 'task_created',
            'entity_type' => 'Task',
            'entity_id' => 1,
        ]);

        ActivityLog::create([
            'user_id' => $owner->id,
            'workspace_id' => $workspace->id,
            'action' => 'project_created',
            'entity_type' => 'Project',
            'entity_id' => 1,
        ]);

        $response = $this->actingAs($owner)->getJson("/api/activity?workspace_id={$workspace->id}&entity_type=Project");

        $response->assertStatus(200);
        $this->assertCount(1, $response->json('data'));
        $this->assertEquals('project_created', $response->json('data.0.action'));
    }

    // 8. Date filter works
    public function test_date_filter_works(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        $old = ActivityLog::create([
            'user_id' => $owner->id,
            'workspace_id' => $workspace->id,
            'action' => 'old_activity',
            'entity_type' => 'Project',
            'entity_id' => 1,
        ]);
        $old->created_at = now()->subDays(10);
        $old->save();

        $recent = ActivityLog::create([
            'user_id' => $owner->id,
            'workspace_id' => $workspace->id,
            'action' => 'recent_activity',
            'entity_type' => 'Project',
            'entity_id' => 1,
        ]);
        $recent->created_at = now()->subDay();
        $recent->save();

        $from = now()->subDays(2)->toDateString();
        $response = $this->actingAs($owner)->getJson("/api/activity?workspace_id={$workspace->id}&from={$from}");

        $response->assertStatus(200);
        $this->assertCount(1, $response->json('data'));
        $this->assertEquals('recent_activity', $response->json('data.0.action'));
    }

    // 9. Search works
    public function test_search_works(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        ActivityLog::create([
            'user_id' => $owner->id,
            'workspace_id' => $workspace->id,
            'action' => 'attachment_uploaded',
            'entity_type' => 'Attachment',
            'entity_id' => 1,
            'details' => ['original_name' => 'secret_roadmap.pdf'],
        ]);

        ActivityLog::create([
            'user_id' => $owner->id,
            'workspace_id' => $workspace->id,
            'action' => 'task_created',
            'entity_type' => 'Task',
            'entity_id' => 1,
            'details' => ['title' => 'Design new header'],
        ]);

        $response = $this->actingAs($owner)->getJson("/api/activity?workspace_id={$workspace->id}&search=attachment");

        $response->assertStatus(200);
        $this->assertCount(1, $response->json('data'));
        $this->assertEquals('attachment_uploaded', $response->json('data.0.action'));
    }

    // 10. Workspace owner can view workspace activity
    public function test_workspace_owner_can_view_workspace_activity(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        ActivityLog::create([
            'user_id' => $owner->id,
            'workspace_id' => $workspace->id,
            'action' => 'workspace_created',
            'entity_type' => 'Workspace',
            'entity_id' => $workspace->id,
        ]);

        $response = $this->actingAs($owner)->getJson("/api/activity?workspace_id={$workspace->id}");
        $response->assertStatus(200);
        $this->assertCount(1, $response->json('data'));
    }

    // 11. Workspace member can view permitted workspace activity
    public function test_workspace_member_can_view_permitted_workspace_activity(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $member = User::factory()->create();
        $this->addMemberToWorkspace($workspace, $member);

        ActivityLog::create([
            'user_id' => $owner->id,
            'workspace_id' => $workspace->id,
            'action' => 'project_created',
            'entity_type' => 'Project',
            'entity_id' => 1,
        ]);

        $response = $this->actingAs($member)->getJson("/api/activity?workspace_id={$workspace->id}");
        $response->assertStatus(200);
        $this->assertCount(1, $response->json('data'));
    }

    // 12. Cross-workspace activity is rejected
    public function test_cross_workspace_activity_is_rejected(): void
    {
        [$owner1, $workspace1] = $this->createWorkspaceWithOwner();
        [$owner2, $workspace2] = $this->createWorkspaceWithOwner();

        ActivityLog::create([
            'user_id' => $owner1->id,
            'workspace_id' => $workspace1->id,
            'action' => 'secret_action',
            'entity_type' => 'Project',
            'entity_id' => 1,
        ]);

        // Owner 2 attempts to query Workspace 1 activity
        $response = $this->actingAs($owner2)->getJson("/api/activity?workspace_id={$workspace1->id}");
        $response->assertStatus(403);
    }

    // 13. workspace_id cannot be abused for IDOR
    public function test_workspace_id_cannot_be_abused_for_idor(): void
    {
        [$owner1, $workspace1] = $this->createWorkspaceWithOwner();
        [$owner2, $workspace2] = $this->createWorkspaceWithOwner();

        // Header attempt
        $response = $this->actingAs($owner2)->getJson('/api/activity', [
            'X-Workspace-Id' => (string) $workspace1->id,
        ]);
        $response->assertStatus(403);
    }

    // 14. user_id filter cannot leak another workspace
    public function test_user_id_filter_cannot_leak_another_workspace(): void
    {
        [$owner1, $workspace1] = $this->createWorkspaceWithOwner();
        [$owner2, $workspace2] = $this->createWorkspaceWithOwner();

        ActivityLog::create([
            'user_id' => $owner1->id,
            'workspace_id' => $workspace1->id,
            'action' => 'workspace1_action',
            'entity_type' => 'Task',
            'entity_id' => 1,
        ]);

        // Owner 2 queries without workspace_id param, but specifying user_id = owner1
        $response = $this->actingAs($owner2)->getJson("/api/activity?user_id={$owner1->id}");

        $response->assertStatus(200);
        // Should return empty because owner2 does not have access to workspace1
        $this->assertCount(0, $response->json('data'));
    }

    // 15. entity_id cannot bypass workspace isolation
    public function test_entity_id_cannot_bypass_workspace_isolation(): void
    {
        [$owner1, $workspace1] = $this->createWorkspaceWithOwner();
        [$owner2, $workspace2] = $this->createWorkspaceWithOwner();

        ActivityLog::create([
            'user_id' => $owner1->id,
            'workspace_id' => $workspace1->id,
            'action' => 'task_created',
            'entity_type' => 'Task',
            'entity_id' => 999,
        ]);

        // Owner 2 queries for entity_id = 999
        $response = $this->actingAs($owner2)->getJson('/api/activity?entity_id=999');

        $response->assertStatus(200);
        $this->assertCount(0, $response->json('data'));
    }

    // 16. Safe actor data is returned
    public function test_safe_actor_data_is_returned(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        ActivityLog::create([
            'user_id' => $owner->id,
            'workspace_id' => $workspace->id,
            'action' => 'test_action',
            'entity_type' => 'Task',
            'entity_id' => 1,
        ]);

        $response = $this->actingAs($owner)->getJson("/api/activity?workspace_id={$workspace->id}");

        $response->assertStatus(200);
        $actor = $response->json('data.0.actor');

        $this->assertNotNull($actor);
        $this->assertEquals($owner->id, $actor['id']);
        $this->assertEquals($owner->name, $actor['name']);
        $this->assertEquals($owner->email, $actor['email']);
    }

    // 17. Sensitive user fields are not returned
    public function test_sensitive_user_fields_are_not_returned(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        ActivityLog::create([
            'user_id' => $owner->id,
            'workspace_id' => $workspace->id,
            'action' => 'test_action',
            'entity_type' => 'Task',
            'entity_id' => 1,
        ]);

        $response = $this->actingAs($owner)->getJson("/api/activity?workspace_id={$workspace->id}");

        $response->assertStatus(200);
        $actor = $response->json('data.0.actor');

        $this->assertArrayNotHasKey('password', $actor);
        $this->assertArrayNotHasKey('remember_token', $actor);
        $this->assertArrayNotHasKey('two_factor_secret', $actor);
        $this->assertArrayNotHasKey('tokens', $actor);
    }

    // 18. Activity remains readable when referenced entity is deleted
    public function test_activity_remains_readable_when_referenced_entity_is_deleted(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        $project = Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $owner->id,
            'name' => 'Ephemeral Project',
            'slug' => 'ephemeral-' . uniqid(),
            'status' => 'planning',
        ]);

        $log = ActivityLog::create([
            'user_id' => $owner->id,
            'workspace_id' => $workspace->id,
            'action' => 'project_deleted',
            'entity_type' => 'Project',
            'entity_id' => $project->id,
            'details' => ['name' => 'Ephemeral Project'],
        ]);

        // Hard delete the project from DB
        $project->delete();

        $response = $this->actingAs($owner)->getJson("/api/activity?workspace_id={$workspace->id}");

        $response->assertStatus(200);
        $this->assertCount(1, $response->json('data'));
        $entity = $response->json('data.0.entity');

        $this->assertFalse($entity['exists']);
        $this->assertEquals('Ephemeral Project', $entity['name']);
    }

    // 19. Show activity detail works for authorized user
    public function test_show_activity_detail_works_for_authorized_user(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        $log = ActivityLog::create([
            'user_id' => $owner->id,
            'workspace_id' => $workspace->id,
            'action' => 'task_created',
            'entity_type' => 'Task',
            'entity_id' => 42,
            'details' => ['title' => 'Build login screen'],
        ]);

        $response = $this->actingAs($owner)->getJson("/api/activity/{$log->id}");

        $response->assertStatus(200);
        $this->assertTrue($response->json('success'));
        $this->assertEquals($log->id, $response->json('data.id'));
        $this->assertEquals('task_created', $response->json('data.action'));
    }

    // 20. Show activity detail rejected for unauthorized user
    public function test_show_activity_detail_rejected_for_unauthorized_user(): void
    {
        [$owner1, $workspace1] = $this->createWorkspaceWithOwner();
        [$owner2, $workspace2] = $this->createWorkspaceWithOwner();

        $log = ActivityLog::create([
            'user_id' => $owner1->id,
            'workspace_id' => $workspace1->id,
            'action' => 'secret_action',
            'entity_type' => 'Project',
            'entity_id' => 1,
        ]);

        $response = $this->actingAs($owner2)->getJson("/api/activity/{$log->id}");
        $response->assertStatus(403);
    }

    // 21. Filters endpoint rejected for unauthorized workspace
    public function test_filters_rejected_for_unauthorized_workspace(): void
    {
        [$owner1, $workspace1] = $this->createWorkspaceWithOwner();
        [$owner2, $workspace2] = $this->createWorkspaceWithOwner();

        $response = $this->actingAs($owner2)->getJson("/api/activity/filters?workspace_id={$workspace1->id}");
        $response->assertStatus(403);
    }

    // 22. Per page parameter is capped at 100
    public function test_per_page_is_capped_at_maximum(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        $response = $this->actingAs($owner)->getJson("/api/activity?workspace_id={$workspace->id}&per_page=999999");
        $response->assertStatus(200);
        $this->assertEquals(100, $response->json('pagination.per_page'));
    }

    // 23. Malformed date filter is handled gracefully without 500
    public function test_malformed_date_filter_is_handled_gracefully(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        ActivityLog::create([
            'user_id' => $owner->id,
            'workspace_id' => $workspace->id,
            'action' => 'test_action',
            'entity_type' => 'Task',
            'entity_id' => 1,
        ]);

        $response = $this->actingAs($owner)->getJson("/api/activity?workspace_id={$workspace->id}&from=invalid-date-string&to=garbage");
        $response->assertStatus(200);
        $this->assertCount(1, $response->json('data'));
    }
}
