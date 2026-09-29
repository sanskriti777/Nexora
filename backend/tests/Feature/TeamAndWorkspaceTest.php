<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Permission;
use App\Models\Role;
use App\Models\Team;
use App\Models\TeamMember;
use App\Models\User;
use App\Models\Workspace;
use App\Models\WorkspaceMember;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TeamAndWorkspaceTest extends TestCase
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
    // 1. AUTHENTICATION & IDOR TESTS
    // ==========================================

    public function test_unauthenticated_user_cannot_access_workspaces_or_teams(): void
    {
        $this->getJson('/api/workspaces')->assertStatus(401);
        $this->getJson('/api/teams')->assertStatus(401);
        $this->postJson('/api/teams', ['name' => 'Team A'])->assertStatus(401);
    }

    public function test_user_cannot_access_another_workspace_or_its_teams(): void
    {
        [$owner1, $workspace1] = $this->createWorkspaceWithOwner();

        $owner2 = User::factory()->create();
        $workspace2 = Workspace::create([
            'name' => 'Foreign Workspace',
            'slug' => 'foreign-workspace',
            'owner_id' => $owner2->id,
        ]);

        $foreignTeam = Team::create([
            'workspace_id' => $workspace2->id,
            'name' => 'Foreign Core Team',
        ]);

        // User 1 cannot view Workspace 2 details
        $this->actingAs($owner1, 'sanctum')->getJson("/api/workspaces/{$workspace2->id}")
            ->assertStatus(403);

        // User 1 cannot view Foreign Team details
        $this->actingAs($owner1, 'sanctum')->getJson("/api/teams/{$foreignTeam->id}")
            ->assertStatus(403);

        // User 1 cannot delete Foreign Team
        $this->actingAs($owner1, 'sanctum')->deleteJson("/api/teams/{$foreignTeam->id}")
            ->assertStatus(403);
    }

    // ==========================================
    // 2. WORKSPACE MEMBERSHIP TESTS
    // ==========================================

    public function test_authorized_user_can_view_workspace_and_members(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $member = $this->createMemberWithRole($workspace, 'team_member');

        $response = $this->actingAs($owner, 'sanctum')->getJson("/api/workspaces/{$workspace->id}");
        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'data' => [
                    'id' => $workspace->id,
                    'name' => 'Primary Workspace',
                    'can_manage' => true,
                ],
            ]);

        $membersResponse = $this->actingAs($owner, 'sanctum')->getJson("/api/workspaces/{$workspace->id}/members");
        $membersResponse->assertStatus(200)
            ->assertJsonCount(2, 'data');
    }

    public function test_authorized_user_can_add_member_to_workspace(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $newUser = User::factory()->create(['email' => 'newbie@example.com']);

        $role = Role::firstOrCreate(['slug' => 'team_member'], ['name' => 'Team Member']);

        $response = $this->actingAs($owner, 'sanctum')->postJson("/api/workspaces/{$workspace->id}/members", [
            'email' => 'newbie@example.com',
            'role_id' => $role->id,
        ]);

        $response->assertStatus(201)
            ->assertJson([
                'success' => true,
                'message' => 'Member added to workspace successfully.',
            ]);

        $this->assertDatabaseHas('workspace_members', [
            'workspace_id' => $workspace->id,
            'user_id' => $newUser->id,
            'role_id' => $role->id,
        ]);

        $this->assertDatabaseHas('activity_logs', [
            'workspace_id' => $workspace->id,
            'action' => 'workspace_member_added',
            'entity_type' => 'Workspace',
            'entity_id' => $workspace->id,
        ]);
    }

    public function test_cannot_add_duplicate_member_to_workspace(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $member = $this->createMemberWithRole($workspace, 'team_member');

        $response = $this->actingAs($owner, 'sanctum')->postJson("/api/workspaces/{$workspace->id}/members", [
            'email' => $member->email,
        ]);

        $response->assertStatus(422)
            ->assertJson([
                'success' => false,
                'message' => 'User is already a member of this workspace.',
            ]);
    }

    public function test_cannot_remove_workspace_owner(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();

        $response = $this->actingAs($owner, 'sanctum')->deleteJson("/api/workspaces/{$workspace->id}/members/{$owner->id}");
        $response->assertStatus(422)
            ->assertJson([
                'success' => false,
                'message' => 'Cannot remove the workspace owner from the workspace.',
            ]);
    }

    public function test_authorized_user_can_remove_member_with_team_cleanup(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $member = $this->createMemberWithRole($workspace, 'team_member');

        $team = Team::create([
            'workspace_id' => $workspace->id,
            'name' => 'Cleanup Team',
        ]);
        TeamMember::create(['team_id' => $team->id, 'user_id' => $member->id]);

        $this->assertDatabaseHas('team_members', ['team_id' => $team->id, 'user_id' => $member->id]);

        // Remove from workspace
        $response = $this->actingAs($owner, 'sanctum')->deleteJson("/api/workspaces/{$workspace->id}/members/{$member->id}");
        $response->assertStatus(200);

        // Assert member was removed from workspace AND cascaded from teams
        $this->assertDatabaseMissing('workspace_members', [
            'workspace_id' => $workspace->id,
            'user_id' => $member->id,
        ]);

        $this->assertDatabaseMissing('team_members', [
            'team_id' => $team->id,
            'user_id' => $member->id,
        ]);
    }

    // ==========================================
    // 3. TEAM CRUD TESTS
    // ==========================================

    public function test_authorized_user_can_create_team(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $lead = $this->createMemberWithRole($workspace, 'team_lead');

        $response = $this->actingAs($owner, 'sanctum')
            ->withHeader('X-Workspace-Id', $workspace->id)
            ->postJson('/api/teams', [
                'name' => 'Platform Engineering',
                'description' => 'Core infrastructure and CI/CD pipelines',
                'team_lead_id' => $lead->id,
            ]);

        $response->assertStatus(201)
            ->assertJson([
                'success' => true,
                'message' => 'Team created successfully.',
                'data' => [
                    'name' => 'Platform Engineering',
                ],
            ]);

        $this->assertDatabaseHas('teams', [
            'workspace_id' => $workspace->id,
            'name' => 'Platform Engineering',
            'team_lead_id' => $lead->id,
        ]);

        $this->assertDatabaseHas('activity_logs', [
            'workspace_id' => $workspace->id,
            'action' => 'team_created',
            'entity_type' => 'Team',
        ]);
    }

    public function test_team_lead_must_belong_to_workspace(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $outsider = User::factory()->create();

        $response = $this->actingAs($owner, 'sanctum')
            ->withHeader('X-Workspace-Id', $workspace->id)
            ->postJson('/api/teams', [
                'name' => 'Design Team',
                'team_lead_id' => $outsider->id,
            ]);

        $response->assertStatus(422)
            ->assertJson([
                'success' => false,
                'message' => 'The selected team lead does not belong to this workspace.',
            ]);
    }

    public function test_regular_member_without_permission_cannot_create_or_delete_team(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $viewer = $this->createMemberWithRole($workspace, 'viewer');

        $team = Team::create([
            'workspace_id' => $workspace->id,
            'name' => 'Protected Team',
        ]);

        $createResponse = $this->actingAs($viewer, 'sanctum')
            ->withHeader('X-Workspace-Id', $workspace->id)
            ->postJson('/api/teams', ['name' => 'Hacker Team']);
        $createResponse->assertStatus(403);

        $deleteResponse = $this->actingAs($viewer, 'sanctum')->deleteJson("/api/teams/{$team->id}");
        $deleteResponse->assertStatus(403);
    }

    // ==========================================
    // 4. TEAM MEMBERSHIP TESTS
    // ==========================================

    public function test_can_add_workspace_member_to_team(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $member = $this->createMemberWithRole($workspace, 'team_member');

        $team = Team::create([
            'workspace_id' => $workspace->id,
            'name' => 'Mobile Squad',
        ]);

        $response = $this->actingAs($owner, 'sanctum')->postJson("/api/teams/{$team->id}/members", [
            'user_id' => $member->id,
        ]);

        $response->assertStatus(201)
            ->assertJson([
                'success' => true,
                'message' => 'Member added to team successfully.',
            ]);

        $this->assertDatabaseHas('team_members', [
            'team_id' => $team->id,
            'user_id' => $member->id,
        ]);
    }

    public function test_cannot_add_non_workspace_user_to_team(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $outsider = User::factory()->create();

        $team = Team::create([
            'workspace_id' => $workspace->id,
            'name' => 'Security Squad',
        ]);

        $response = $this->actingAs($owner, 'sanctum')->postJson("/api/teams/{$team->id}/members", [
            'user_id' => $outsider->id,
        ]);

        $response->assertStatus(422)
            ->assertJson([
                'success' => false,
                'message' => 'User must be a member of the workspace before being added to a team.',
            ]);
    }

    public function test_cannot_add_duplicate_user_to_team(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $member = $this->createMemberWithRole($workspace, 'team_member');

        $team = Team::create([
            'workspace_id' => $workspace->id,
            'name' => 'Frontend Squad',
        ]);
        TeamMember::create(['team_id' => $team->id, 'user_id' => $member->id]);

        $response = $this->actingAs($owner, 'sanctum')->postJson("/api/teams/{$team->id}/members", [
            'user_id' => $member->id,
        ]);

        $response->assertStatus(422)
            ->assertJson([
                'success' => false,
                'message' => 'User is already a member of this team.',
            ]);
    }

    public function test_can_remove_member_from_team(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $member = $this->createMemberWithRole($workspace, 'team_member');

        $team = Team::create([
            'workspace_id' => $workspace->id,
            'name' => 'Ops Squad',
        ]);
        TeamMember::create(['team_id' => $team->id, 'user_id' => $member->id]);

        $response = $this->actingAs($owner, 'sanctum')->deleteJson("/api/teams/{$team->id}/members/{$member->id}");

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'message' => 'Member removed from team successfully.',
            ]);

        $this->assertDatabaseMissing('team_members', [
            'team_id' => $team->id,
            'user_id' => $member->id,
        ]);
    }
}
