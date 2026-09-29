<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\ProjectMember;
use App\Models\Role;
use App\Models\TeamMember;
use App\Models\User;
use App\Models\Workspace;
use App\Models\WorkspaceMember;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class WorkspaceController extends Controller
{
    /**
     * List all workspaces accessible by the authenticated user.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $workspaces = Workspace::where(function ($q) use ($user) {
            $q->where('owner_id', $user->id)
              ->orWhereHas('members', fn($m) => $m->where('users.id', $user->id));
        })
        ->with('owner:id,name,email')
        ->withCount(['members', 'teams', 'projects'])
        ->latest()
        ->get()
        ->map(function ($ws) use ($user) {
            $isOwner = $ws->owner_id === $user->id;
            $membership = $isOwner ? null : WorkspaceMember::where('workspace_id', $ws->id)
                ->where('user_id', $user->id)
                ->with('role')
                ->first();

            return [
                'id' => $ws->id,
                'name' => $ws->name,
                'slug' => $ws->slug,
                'description' => $ws->description,
                'is_owner' => $isOwner,
                'owner' => $ws->owner ? [
                    'id' => $ws->owner->id,
                    'name' => $ws->owner->name,
                    'email' => $ws->owner->email,
                ] : null,
                'role' => $isOwner ? 'Owner' : ($membership?->role?->name ?? 'Member'),
                'members_count' => $ws->members_count ?? 0,
                'teams_count' => $ws->teams_count ?? 0,
                'projects_count' => $ws->projects_count ?? 0,
                'created_at' => $ws->created_at?->toISOString(),
            ];
        });

        return response()->json([
            'success' => true,
            'data' => $workspaces,
        ]);
    }

    /**
     * Get workspace details, current user permissions, member count, and teams.
     */
    public function show(Request $request, int $id): JsonResponse
    {
        $user = $request->user();

        $workspace = Workspace::with(['owner:id,name,email'])
            ->withCount(['members', 'teams', 'projects'])
            ->find($id);

        if (! $workspace) {
            return response()->json([
                'success' => false,
                'message' => 'Workspace not found.',
            ], 404);
        }

        if (! $this->userCanAccessWorkspace($user, $workspace)) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized access to this workspace.',
            ], 403);
        }

        $isOwner = $workspace->owner_id === $user->id;
        $membership = WorkspaceMember::where('workspace_id', $workspace->id)
            ->where('user_id', $user->id)
            ->with('role.permissions')
            ->first();

        $roleName = $isOwner ? 'Owner' : ($membership?->role?->name ?? 'Member');
        $canManage = $this->userCanManageWorkspace($user, $workspace);

        return response()->json([
            'success' => true,
            'data' => [
                'id' => $workspace->id,
                'name' => $workspace->name,
                'slug' => $workspace->slug,
                'description' => $workspace->description,
                'is_owner' => $isOwner,
                'owner' => $workspace->owner,
                'current_user_role' => $roleName,
                'can_manage' => $canManage,
                'members_count' => $workspace->members_count,
                'teams_count' => $workspace->teams_count,
                'projects_count' => $workspace->projects_count,
                'created_at' => $workspace->created_at?->toISOString(),
            ],
        ]);
    }

    /**
     * List members of a workspace with server-side search and pagination.
     */
    public function members(Request $request, int $id): JsonResponse
    {
        $user = $request->user();

        $workspace = Workspace::find($id);
        if (! $workspace) {
            return response()->json([
                'success' => false,
                'message' => 'Workspace not found.',
            ], 404);
        }

        if (! $this->userCanAccessWorkspace($user, $workspace)) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized access to this workspace.',
            ], 403);
        }

        $query = WorkspaceMember::where('workspace_id', $workspace->id)
            ->with(['user:id,name,email,created_at', 'role:id,name,slug']);

        // Search by user name or email
        if ($search = $request->query('search')) {
            $query->whereHas('user', function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%");
            });
        }

        // Role filter
        if ($roleId = $request->query('role_id')) {
            $query->where('role_id', $roleId);
        }

        $perPage = max(1, min(100, (int) $request->query('per_page', 20)));
        $paginated = $query->paginate($perPage);

        $members = collect($paginated->items())->map(function ($m) use ($workspace) {
            $isOwner = $workspace->owner_id === $m->user_id;

            // Count teams this user belongs to within this workspace
            $teamsCount = TeamMember::whereHas('team', fn($t) => $t->where('workspace_id', $workspace->id))
                ->where('user_id', $m->user_id)
                ->count();

            return [
                'id' => $m->user_id,
                'membership_id' => $m->id,
                'name' => $m->user?->name,
                'email' => $m->user?->email,
                'is_owner' => $isOwner,
                'role' => [
                    'id' => $m->role_id,
                    'name' => $isOwner ? 'Owner' : ($m->role?->name ?? 'Member'),
                    'slug' => $isOwner ? 'owner' : ($m->role?->slug ?? 'member'),
                ],
                'teams_count' => $teamsCount,
                'joined_at' => $m->joined_at ? \Carbon\Carbon::parse($m->joined_at)->toISOString() : $m->created_at?->toISOString(),
            ];
        });

        return response()->json([
            'success' => true,
            'data' => $members,
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
            ],
        ]);
    }

    /**
     * Add a member to the workspace.
     */
    public function addMember(Request $request, int $id): JsonResponse
    {
        $user = $request->user();

        $workspace = Workspace::find($id);
        if (! $workspace) {
            return response()->json([
                'success' => false,
                'message' => 'Workspace not found.',
            ], 404);
        }

        if (! $this->userCanManageWorkspace($user, $workspace)) {
            return response()->json([
                'success' => false,
                'message' => 'You do not have permission to manage workspace members.',
            ], 403);
        }

        $validated = $request->validate([
            'email' => ['nullable', 'email', 'exists:users,email'],
            'user_id' => ['nullable', 'integer', 'exists:users,id'],
            'role_id' => ['nullable', 'integer', 'exists:roles,id'],
        ]);

        if (empty($validated['email']) && empty($validated['user_id'])) {
            return response()->json([
                'success' => false,
                'message' => 'Please provide an email or user ID to add a member.',
            ], 422);
        }

        $targetUser = ! empty($validated['user_id'])
            ? User::find($validated['user_id'])
            : User::where('email', $validated['email'])->first();

        if (! $targetUser) {
            return response()->json([
                'success' => false,
                'message' => 'User not found.',
            ], 404);
        }

        // Check if already a member
        $alreadyMember = $workspace->owner_id === $targetUser->id
            || WorkspaceMember::where('workspace_id', $workspace->id)->where('user_id', $targetUser->id)->exists();

        if ($alreadyMember) {
            return response()->json([
                'success' => false,
                'message' => 'User is already a member of this workspace.',
            ], 422);
        }

        // Default role: Team Member if not specified
        $roleId = $validated['role_id'] ?? null;
        if (! $roleId) {
            $defaultRole = Role::where('slug', 'team_member')->first() ?? Role::first();
            $roleId = $defaultRole?->id;
        }

        $membership = WorkspaceMember::create([
            'workspace_id' => $workspace->id,
            'user_id' => $targetUser->id,
            'role_id' => $roleId,
            'joined_at' => now(),
        ]);

        ActivityLog::create([
            'user_id' => $user->id,
            'workspace_id' => $workspace->id,
            'action' => 'workspace_member_added',
            'entity_type' => 'Workspace',
            'entity_id' => $workspace->id,
            'details' => [
                'added_user_id' => $targetUser->id,
                'added_user_name' => $targetUser->name,
                'added_user_email' => $targetUser->email,
                'role_id' => $roleId,
            ],
        ]);

        $membership->load(['user:id,name,email', 'role:id,name,slug']);

        return response()->json([
            'success' => true,
            'message' => 'Member added to workspace successfully.',
            'data' => [
                'id' => $targetUser->id,
                'membership_id' => $membership->id,
                'name' => $targetUser->name,
                'email' => $targetUser->email,
                'role' => [
                    'id' => $membership->role_id,
                    'name' => $membership->role?->name ?? 'Member',
                    'slug' => $membership->role?->slug ?? 'member',
                ],
                'joined_at' => $membership->joined_at?->toISOString(),
            ],
        ], 201);
    }

    /**
     * Update a workspace member's role.
     */
    public function updateMemberRole(Request $request, int $id, int $userId): JsonResponse
    {
        $user = $request->user();

        $workspace = Workspace::find($id);
        if (! $workspace) {
            return response()->json([
                'success' => false,
                'message' => 'Workspace not found.',
            ], 404);
        }

        if (! $this->userCanManageWorkspace($user, $workspace)) {
            return response()->json([
                'success' => false,
                'message' => 'You do not have permission to update workspace member roles.',
            ], 403);
        }

        // Cannot change role of the workspace owner
        if ($workspace->owner_id === $userId) {
            return response()->json([
                'success' => false,
                'message' => 'Cannot modify the role of the workspace owner.',
            ], 422);
        }

        $validated = $request->validate([
            'role_id' => ['required', 'integer', 'exists:roles,id'],
        ]);

        $membership = WorkspaceMember::where('workspace_id', $workspace->id)
            ->where('user_id', $userId)
            ->first();

        if (! $membership) {
            return response()->json([
                'success' => false,
                'message' => 'Member not found in this workspace.',
            ], 404);
        }

        $membership->role_id = $validated['role_id'];
        $membership->save();

        ActivityLog::create([
            'user_id' => $user->id,
            'workspace_id' => $workspace->id,
            'action' => 'workspace_member_role_updated',
            'entity_type' => 'Workspace',
            'entity_id' => $workspace->id,
            'details' => [
                'target_user_id' => $userId,
                'new_role_id' => $validated['role_id'],
            ],
        ]);

        $membership->load('role:id,name,slug');

        return response()->json([
            'success' => true,
            'message' => 'Member role updated successfully.',
            'data' => [
                'user_id' => $userId,
                'role' => $membership->role,
            ],
        ]);
    }

    /**
     * Remove a member from the workspace.
     */
    public function removeMember(Request $request, int $id, int $userId): JsonResponse
    {
        $user = $request->user();

        $workspace = Workspace::find($id);
        if (! $workspace) {
            return response()->json([
                'success' => false,
                'message' => 'Workspace not found.',
            ], 404);
        }

        if (! $this->userCanManageWorkspace($user, $workspace)) {
            return response()->json([
                'success' => false,
                'message' => 'You do not have permission to remove workspace members.',
            ], 403);
        }

        // Safety rule: Cannot remove the workspace owner
        if ($workspace->owner_id === $userId) {
            return response()->json([
                'success' => false,
                'message' => 'Cannot remove the workspace owner from the workspace.',
            ], 422);
        }

        $membership = WorkspaceMember::where('workspace_id', $workspace->id)
            ->where('user_id', $userId)
            ->first();

        if (! $membership) {
            return response()->json([
                'success' => false,
                'message' => 'User is not a member of this workspace.',
            ], 404);
        }

        // Cascade removal: Remove user from all teams belonging to this workspace
        TeamMember::whereHas('team', fn($t) => $t->where('workspace_id', $workspace->id))
            ->where('user_id', $userId)
            ->delete();

        // Cascade removal: Remove user from all projects belonging to this workspace
        ProjectMember::whereHas('project', fn($p) => $p->where('workspace_id', $workspace->id))
            ->where('user_id', $userId)
            ->delete();

        $membership->delete();

        ActivityLog::create([
            'user_id' => $user->id,
            'workspace_id' => $workspace->id,
            'action' => 'workspace_member_removed',
            'entity_type' => 'Workspace',
            'entity_id' => $workspace->id,
            'details' => [
                'removed_user_id' => $userId,
            ],
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Member removed from workspace successfully.',
        ]);
    }

    /**
     * List all platform roles for selection dropdowns.
     */
    public function roles(): JsonResponse
    {
        $roles = Role::with('permissions:id,name,slug')->get();

        return response()->json([
            'success' => true,
            'data' => $roles,
        ]);
    }

    /**
     * Check if a user can access a workspace (view).
     */
    protected function userCanAccessWorkspace(User $user, Workspace $workspace): bool
    {
        if ($workspace->owner_id === $user->id) {
            return true;
        }

        return WorkspaceMember::where('workspace_id', $workspace->id)
            ->where('user_id', $user->id)
            ->exists();
    }

    /**
     * Check if a user can manage workspace settings and members.
     */
    protected function userCanManageWorkspace(User $user, Workspace $workspace): bool
    {
        if ($workspace->owner_id === $user->id) {
            return true;
        }

        $membership = WorkspaceMember::where('workspace_id', $workspace->id)
            ->where('user_id', $user->id)
            ->with('role.permissions')
            ->first();

        if (! $membership || ! $membership->role) {
            return false;
        }

        if (in_array($membership->role->slug, ['admin'])) {
            return true;
        }

        return $membership->role->permissions->contains('slug', 'workspaces.manage');
    }
}
