<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\Project;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use App\Models\Workspace;
use App\Services\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class NotificationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Prevent real outbound HTTP calls to realtime server during tests
        Http::fake([
            '*/internal/notifications' => Http::response(['success' => true], 200),
        ]);
    }

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

    protected function addMemberToWorkspace(Workspace $workspace, User $user): void
    {
        $role = Role::firstOrCreate(['slug' => 'team_member'], ['name' => 'Team Member']);
        $workspace->members()->attach($user->id, [
            'role_id' => $role->id,
            'joined_at' => now(),
        ]);
    }

    // 1. Authenticated user can retrieve notifications
    public function test_authenticated_user_can_retrieve_notifications(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $service = app(NotificationService::class);

        $service->sendToUser(
            $owner,
            $workspace,
            Notification::TYPE_TASK_ASSIGNED,
            'Task Assigned',
            'You were assigned a task',
            'task',
            '1'
        );

        $response = $this->actingAs($owner)->getJson('/api/notifications');

        $response->assertStatus(200);
        $this->assertCount(1, $response->json('data'));
        $this->assertEquals('Task Assigned', $response->json('data.0.title'));
    }

    // 2. Unauthenticated user rejected
    public function test_unauthenticated_user_is_rejected(): void
    {
        $response = $this->getJson('/api/notifications');
        $response->assertStatus(401);

        $response = $this->getJson('/api/notifications/unread-count');
        $response->assertStatus(401);

        $response = $this->postJson('/api/notifications/read-all');
        $response->assertStatus(401);
    }

    // 3. User cannot access another user's notification
    public function test_user_cannot_access_another_users_notification(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $otherUser = User::factory()->create();
        $this->addMemberToWorkspace($workspace, $otherUser);

        $service = app(NotificationService::class);
        $notification = $service->sendToUser(
            $owner,
            $workspace,
            Notification::TYPE_SYSTEM,
            'Secret Notification',
            'Only for owner',
            'system',
            null
        );

        // otherUser attempts to read owner's notification
        $response = $this->actingAs($otherUser)->patchJson("/api/notifications/{$notification->id}/read");
        $response->assertStatus(404);

        // otherUser attempts to delete owner's notification
        $deleteResponse = $this->actingAs($otherUser)->deleteJson("/api/notifications/{$notification->id}");
        $deleteResponse->assertStatus(404);

        // Ensure owner's notification was not marked as read
        $this->assertNull($notification->fresh()->read_at);
    }

    // 4. Unread count is correct
    public function test_unread_count_is_correct(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $service = app(NotificationService::class);

        $this->actingAs($owner)->getJson('/api/notifications/unread-count')
            ->assertStatus(200)
            ->assertJson(['count' => 0]);

        $n1 = $service->sendToUser($owner, $workspace, Notification::TYPE_SYSTEM, 'N1', 'Msg 1');
        $service->sendToUser($owner, $workspace, Notification::TYPE_SYSTEM, 'N2', 'Msg 2');

        $this->actingAs($owner)->getJson('/api/notifications/unread-count')
            ->assertStatus(200)
            ->assertJson(['count' => 2]);

        $n1->update(['read_at' => now()]);

        $this->actingAs($owner)->getJson('/api/notifications/unread-count')
            ->assertStatus(200)
            ->assertJson(['count' => 1]);
    }

    // 5. Mark one notification as read
    public function test_mark_one_notification_as_read(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $service = app(NotificationService::class);

        $notification = $service->sendToUser($owner, $workspace, Notification::TYPE_SYSTEM, 'Title', 'Message');
        $this->assertNull($notification->read_at);

        $response = $this->actingAs($owner)->patchJson("/api/notifications/{$notification->id}/read");

        $response->assertStatus(200);
        $this->assertNotNull($notification->fresh()->read_at);
    }

    // 6. Mark all notifications as read
    public function test_mark_all_notifications_as_read(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $service = app(NotificationService::class);

        $n1 = $service->sendToUser($owner, $workspace, Notification::TYPE_SYSTEM, 'N1', 'Msg 1');
        $n2 = $service->sendToUser($owner, $workspace, Notification::TYPE_SYSTEM, 'N2', 'Msg 2');

        $response = $this->actingAs($owner)->postJson('/api/notifications/read-all');

        $response->assertStatus(200);
        $this->assertNotNull($n1->fresh()->read_at);
        $this->assertNotNull($n2->fresh()->read_at);

        $countResponse = $this->actingAs($owner)->getJson('/api/notifications/unread-count');
        $countResponse->assertJson(['count' => 0]);
    }

    // 7. Pagination works
    public function test_pagination_works(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        for ($i = 1; $i <= 25; $i++) {
            Notification::create([
                'notifiable_type' => User::class,
                'notifiable_id' => $owner->id,
                'workspace_id' => $workspace->id,
                'type' => Notification::TYPE_SYSTEM,
                'title' => "Notice {$i}",
                'message' => "Message {$i}",
                'data' => [],
            ]);
        }

        $response = $this->actingAs($owner)->getJson('/api/notifications?per_page=10&page=1');
        $response->assertStatus(200);
        $this->assertCount(10, $response->json('data'));
        $this->assertEquals(25, $response->json('total'));
        $this->assertEquals(3, $response->json('last_page'));

        $page2Response = $this->actingAs($owner)->getJson('/api/notifications?per_page=10&page=2');
        $this->assertCount(10, $page2Response->json('data'));
    }

    // 8. Unread filtering works
    public function test_unread_filtering_works(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $service = app(NotificationService::class);

        $n1 = $service->sendToUser($owner, $workspace, Notification::TYPE_SYSTEM, 'Read Notice', 'Read');
        $n1->update(['read_at' => now()]);

        $service->sendToUser($owner, $workspace, Notification::TYPE_SYSTEM, 'Unread Notice', 'Unread');

        $allResponse = $this->actingAs($owner)->getJson('/api/notifications');
        $this->assertCount(2, $allResponse->json('data'));

        $unreadResponse = $this->actingAs($owner)->getJson('/api/notifications?unread_only=1');
        $this->assertCount(1, $unreadResponse->json('data'));
        $this->assertEquals('Unread Notice', $unreadResponse->json('data.0.title'));
    }

    // 9. Workspace isolation works
    public function test_workspace_isolation_works(): void
    {
        [$owner, $workspace1] = $this->createWorkspaceWithOwner();
        $workspace2 = Workspace::create([
            'name' => 'Secondary Workspace',
            'slug' => 'workspace-sec-' . uniqid(),
            'owner_id' => $owner->id,
        ]);
        $workspace2->members()->attach($owner->id, ['role_id' => null, 'joined_at' => now()]);

        $service = app(NotificationService::class);

        $service->sendToUser($owner, $workspace1, Notification::TYPE_SYSTEM, 'W1 Notice', 'In W1');
        $service->sendToUser($owner, $workspace2, Notification::TYPE_SYSTEM, 'W2 Notice', 'In W2');

        // Scoped to Workspace 1
        $w1Response = $this->actingAs($owner)
            ->withHeader('X-Workspace-Id', $workspace1->id)
            ->getJson('/api/notifications');
        $this->assertCount(1, $w1Response->json('data'));
        $this->assertEquals('W1 Notice', $w1Response->json('data.0.title'));

        // Accessing unauthorized workspace returns 403
        $unauthorizedWorkspace = Workspace::create([
            'name' => 'Stranger Workspace',
            'slug' => 'workspace-stranger-' . uniqid(),
            'owner_id' => User::factory()->create()->id,
        ]);

        $forbiddenResponse = $this->actingAs($owner)
            ->withHeader('X-Workspace-Id', $unauthorizedWorkspace->id)
            ->getJson('/api/notifications');
        $forbiddenResponse->assertStatus(403);
    }

    // 10. Task assignment creates notification
    public function test_task_assignment_creates_notification(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $assignee = User::factory()->create();
        $this->addMemberToWorkspace($workspace, $assignee);

        $project = Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $owner->id,
            'name' => 'Project Alpha',
            'status' => 'active',
        ]);
        $project->members()->attach($assignee->id, ['role' => 'developer']);

        $response = $this->actingAs($owner)
            ->withHeader('X-Workspace-Id', $workspace->id)
            ->postJson('/api/tasks', [
                'title' => 'Implement notifications',
                'project_id' => $project->id,
                'assignees' => [$assignee->id],
            ]);

        $response->assertStatus(201);

        $notification = Notification::where('notifiable_id', $assignee->id)->first();
        $this->assertNotNull($notification);
        $this->assertEquals(Notification::TYPE_TASK_ASSIGNED, $notification->type);
        $this->assertEquals('New Task Assigned', $notification->title);
        $this->assertEquals('task', $notification->entity_type);
    }

    // 11. Relevant task update creates notification
    public function test_relevant_task_update_creates_notification(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $assignee = User::factory()->create();
        $this->addMemberToWorkspace($workspace, $assignee);

        $project = Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $owner->id,
            'name' => 'Project Beta',
            'status' => 'active',
        ]);

        $task = Task::create([
            'project_id' => $project->id,
            'creator_id' => $owner->id,
            'title' => 'Database indexing',
            'status' => 'todo',
            'priority' => 'low',
        ]);
        $task->assignees()->attach($assignee->id);

        // Owner updates status and priority
        $response = $this->actingAs($owner)
            ->withHeader('X-Workspace-Id', $workspace->id)
            ->putJson("/api/tasks/{$task->id}", [
                'status' => 'in_progress',
                'priority' => 'high',
            ]);

        $response->assertStatus(200);

        $statusNotice = Notification::where('notifiable_id', $assignee->id)
            ->where('type', Notification::TYPE_TASK_STATUS_CHANGED)
            ->first();
        $this->assertNotNull($statusNotice);

        $priorityNotice = Notification::where('notifiable_id', $assignee->id)
            ->where('type', Notification::TYPE_TASK_PRIORITY_CHANGED)
            ->first();
        $this->assertNotNull($priorityNotice);
    }

    // 12. Actor is not unnecessarily notified
    public function test_actor_is_not_unnecessarily_notified(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        $project = Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $owner->id,
            'name' => 'Project Gamma',
            'status' => 'active',
        ]);

        // Owner creates task assigning themselves
        $response = $this->actingAs($owner)
            ->withHeader('X-Workspace-Id', $workspace->id)
            ->postJson('/api/tasks', [
                'title' => 'Self-assigned Task',
                'project_id' => $project->id,
                'assignees' => [$owner->id],
            ]);

        $response->assertStatus(201);

        // Owner should NOT receive a notification for self-assignment
        $ownerNotifications = Notification::where('notifiable_id', $owner->id)->get();
        $this->assertCount(0, $ownerNotifications);
    }

    // 13. Notification data is correct
    public function test_notification_data_is_correct(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $service = app(NotificationService::class);

        $notification = $service->sendToUser(
            $owner,
            $workspace,
            Notification::TYPE_TASK_ASSIGNED,
            'Assigned Task',
            'Task description',
            'task',
            '42',
            ['foo' => 'bar', 'custom_id' => 123]
        );

        $this->assertEquals($owner->id, $notification->user_id);
        $this->assertEquals($workspace->id, $notification->workspace_id);
        $this->assertEquals('task', $notification->entity_type);
        $this->assertEquals('42', $notification->entity_id);
        $this->assertEquals(['foo' => 'bar', 'custom_id' => 123], $notification->data);
        $this->assertNull($notification->read_at);
        $this->assertNotNull($notification->created_at);
    }

    // 14. Duplicate notification behavior is controlled
    public function test_duplicate_notification_behavior_is_controlled(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $service = app(NotificationService::class);

        $n1 = $service->sendToUser(
            $owner,
            $workspace,
            Notification::TYPE_TASK_ASSIGNED,
            'Task Assignment',
            'You are assigned',
            'task',
            '99'
        );

        // Immediate identical call within deduplication window
        $n2 = $service->sendToUser(
            $owner,
            $workspace,
            Notification::TYPE_TASK_ASSIGNED,
            'Task Assignment',
            'You are assigned',
            'task',
            '99'
        );

        // Should return the existing notification without creating a second record
        $this->assertEquals($n1->id, $n2->id);
        $count = Notification::where('notifiable_id', $owner->id)->count();
        $this->assertEquals(1, $count);
    }

    // 15. User can delete their own notification
    public function test_user_can_delete_their_own_notification(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $service = app(NotificationService::class);

        $notification = $service->sendToUser($owner, $workspace, Notification::TYPE_SYSTEM, 'To Delete', 'Bye');

        $response = $this->actingAs($owner)->deleteJson("/api/notifications/{$notification->id}");
        $response->assertStatus(200);

        $this->assertDatabaseMissing('notifications', ['id' => $notification->id]);
    }
}
