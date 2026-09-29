<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Team;
use App\Models\TeamMember;
use App\Models\User;
use App\Models\Workspace;
use App\Models\WorkspaceMember;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TeamController extends Controller
{
    /**
     * List all teams within the authorized workspace.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $workspace = $this->resolveWorkspace($request, $user);
        if ($workspace === false) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized access to the specified workspace.',
            ], 403);
        }

        if (! $workspace) {
            return response()->json([
                'success' => true,
                'data' => [],
            ]);
        }

        $query = Team::where('workspace_id', $workspace->id)
            ->with(['teamLead:id,name,email', 'members:id,name,email'])
            ->withCount(['members', 'projects']);

        if ($search = $request->query('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('description', 'like', "%{$search}%");
            });
        }

        $teams = $query->latest()->get()->map(function ($team) {
            return [
                'id' => $team->id,
                'workspace_id' => $team->workspace_id,
                'name' => $team->name,
                'description' => $team->description,
                'team_lead' => $team->teamLead ? [
                    'id' => $team->teamLead->id,
                    'name' => $team->teamLead->name,
                    'email' => $team->teamLead->email,
                ] : null,
                'members_count' => $team->members_count,
                'projects_count' => $team->projects_count,
                'members' => $team->members->map(fn($m) => [
                    'id' => $m->id,
                    'name' => $m->name,
                    'email' => $m->email,
                ]),
                'created_at' => $team->created_at?->toISOString(),
            ];
        });

        return response()->json([
            'success' => true,
            'data' => $teams,
        ]);
    }

    /**
     * Create a new team within the workspace.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        $workspace = $this->resolveWorkspace($request, $user);
        if ($workspace === false || ! $workspace) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized or missing workspace context.',
            ], 403);
        }

        if (! $this->userCanManageTeams($user, $workspace)) {
            return response()->json([
                'success' => false,
                'message' => 'You do not have permission to create teams in this workspace.',
            ], 403);
        }

        $validated = $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('teams', 'name')->where('workspace_id', $workspace->id),
            ],
            'description' => ['nullable', 'string', 'max:1000'],
            'team_lead_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        // If team_lead_id is provided, verify they are in this workspace
        if (! empty($validated['team_lead_id'])) {
            $leadInWorkspace = $this->userBelongsToWorkspace($validated['team_lead_id'], $workspace);
            if (! $leadInWorkspace) {
                return response()->json([
                    'success' => false,
                    'message' => 'The selected team lead does not belong to this workspace.',
                ], 422);
            }
        }

        $team = Team::create([
            'workspace_id' => $workspace->id,
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
            'team_lead_id' => $validated['team_lead_id'] ?? null,
        ]);

        // Automatically add the creator / team lead as member of the team
        $memberIdToAdd = $validated['team_lead_id'] ?? $user->id;
        TeamMember::firstOrCreate([
            'team_id' => $team->id,
            'user_id' => $memberIdToAdd,
        ]);

        ActivityLog::create([
            'user_id' => $user->id,
            'workspace_id' => $workspace->id,
            'action' => 'team_created',
            'entity_type' => 'Team',
            'entity_id' => $team->id,
            'details' => [
                'name' => $team->name,
                'team_lead_id' => $team->team_lead_id,
            ],
        ]);

        $team->load(['teamLead:id,name,email', 'members:id,name,email']);
        $team->loadCount(['members', 'projects']);

        return response()->json([
            'success' => true,
            'message' => 'Team created successfully.',
            'data' => [
                'id' => $team->id,
                'workspace_id' => $team->workspace_id,
                'name' => $team->name,
                'description' => $team->description,
                'team_lead' => $team->teamLead,
                'members_count' => $team->members_count,
                'projects_count' => $team->projects_count,
                'members' => $team->members,
                'created_at' => $team->created_at?->toISOString(),
            ],
        ], 201);
    }

    /**
     * Show detailed team information, including members and associated projects.
     */
    public function show(Request $request, int $id): JsonResponse
    {
        $user = $request->user();

        $team = Team::with([
            'workspace:id,name,slug,owner_id',
            'teamLead:id,name,email',
            'members:id,name,email',
            'projects:id,team_id,name,status,priority',
        ])
        ->withCount(['members', 'projects'])
        ->find($id);

        if (! $team) {
            return response()->json([
                'success' => false,
                'message' => 'Team not found.',
            ], 404);
        }

        if (! $this->userBelongsToWorkspace($user->id, $team->workspace)) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized access to this team.',
            ], 403);
        }

        $canManage = $this->userCanManageSpecificTeam($user, $team);

        return response()->json([
            'success' => true,
            'data' => [
                'id' => $team->id,
                'workspace_id' => $team->workspace_id,
                'workspace' => $team->workspace,
                'name' => $team->name,
                'description' => $team->description,
                'team_lead' => $team->teamLead,
                'can_manage' => $canManage,
                'members_count' => $team->members_count,
                'projects_count' => $team->projects_count,
                'members' => $team->members->map(function ($m) use ($team) {
                    $isLead = $team->team_lead_id === $m->id;
                    return [
                        'id' => $m->id,
                        'name' => $m->name,
                        'email' => $m->email,
                        'is_lead' => $isLead,
                        'joined_at' => $m->pivot?->created_at?->toISOString(),
                    ];
                }),
                'projects' => $team->projects,
                'created_at' => $team->created_at?->toISOString(),
            ],
        ]);
    }

    /**
     * Update team details.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $user = $request->user();

        $team = Team::with('workspace')->find($id);
        if (! $team) {
            return response()->json([
                'success' => false,
                'message' => 'Team not found.',
            ], 404);
        }

        if (! $this->userCanManageSpecificTeam($user, $team)) {
            return response()->json([
                'success' => false,
                'message' => 'You do not have permission to update this team.',
            ], 403);
        }

        $validated = $request->validate([
            'name' => [
                'sometimes',
                'required',
                'string',
                'max:255',
                Rule::unique('teams', 'name')->where('workspace_id', $team->workspace_id)->ignore($team->id),
            ],
            'description' => ['nullable', 'string', 'max:1000'],
            'team_lead_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        if (array_key_exists('team_lead_id', $validated) && ! empty($validated['team_lead_id'])) {
            $leadInWorkspace = $this->userBelongsToWorkspace($validated['team_lead_id'], $team->workspace);
            if (! $leadInWorkspace) {
                return response()->json([
                    'success' => false,
                    'message' => 'The selected team lead does not belong to this workspace.',
                ], 422);
            }

            // Ensure the team lead is also a team member
            TeamMember::firstOrCreate([
                'team_id' => $team->id,
                'user_id' => $validated['team_lead_id'],
            ]);
        }

        if (isset($validated['name'])) {
            $team->name = $validated['name'];
        }
        if (array_key_exists('description', $validated)) {
            $team->description = $validated['description'];
        }
        if (array_key_exists('team_lead_id', $validated)) {
            $team->team_lead_id = $validated['team_lead_id'];
        }

        $team->save();

        ActivityLog::create([
            'user_id' => $user->id,
            'workspace_id' => $team->workspace_id,
            'action' => 'team_updated',
            'entity_type' => 'Team',
            'entity_id' => $team->id,
            'details' => [
                'name' => $team->name,
                'team_lead_id' => $team->team_lead_id,
            ],
        ]);

        $team->load(['teamLead:id,name,email', 'members:id,name,email']);
        $team->loadCount(['members', 'projects']);

        return response()->json([
            'success' => true,
            'message' => 'Team updated successfully.',
            'data' => $team,
        ]);
    }

    /**
     * Delete a team.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $user = $request->user();

        $team = Team::with('workspace')->find($id);
        if (! $team) {
            return response()->json([
                'success' => false,
                'message' => 'Team not found.',
            ], 404);
        }

        if (! $this->userCanManageTeams($user, $team->workspace)) {
            return response()->json([
                'success' => false,
                'message' => 'You do not have permission to delete this team.',
            ], 403);
        }

        ActivityLog::create([
            'user_id' => $user->id,
            'workspace_id' => $team->workspace_id,
            'action' => 'team_deleted',
            'entity_type' => 'Team',
            'entity_id' => $team->id,
            'details' => [
                'name' => $team->name,
            ],
        ]);

        $team->delete();

        return response()->json([
            'success' => true,
            'message' => 'Team deleted successfully.',
        ]);
    }

    /**
     * List members of a team.
     */
    public function members(Request $request, int $id): JsonResponse
    {
        $user = $request->user();

        $team = Team::with('workspace')->find($id);
        if (! $team) {
            return response()->json([
                'success' => false,
                'message' => 'Team not found.',
            ], 404);
        }

        if (! $this->userBelongsToWorkspace($user->id, $team->workspace)) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized access to this team.',
            ], 403);
        }

        $members = $team->members()->select('users.id', 'users.name', 'users.email')
            ->get()
            ->map(function ($m) use ($team) {
                return [
                    'id' => $m->id,
                    'name' => $m->name,
                    'email' => $m->email,
                    'is_lead' => $team->team_lead_id === $m->id,
                    'joined_at' => $m->pivot?->created_at?->toISOString(),
                ];
            });

        return response()->json([
            'success' => true,
            'data' => $members,
        ]);
    }

    /**
     * Add a member to the team.
     */
    public function addMember(Request $request, int $id): JsonResponse
    {
        $user = $request->user();

        $team = Team::with('workspace')->find($id);
        if (! $team) {
            return response()->json([
                'success' => false,
                'message' => 'Team not found.',
            ], 404);
        }

        if (! $this->userCanManageSpecificTeam($user, $team)) {
            return response()->json([
                'success' => false,
                'message' => 'You do not have permission to manage team members.',
            ], 403);
        }

        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
        ]);

        $targetUser = User::find($validated['user_id']);

        // Business Rule: User MUST be in the workspace before being added to a team
        if (! $this->userBelongsToWorkspace($targetUser->id, $team->workspace)) {
            return response()->json([
                'success' => false,
                'message' => 'User must be a member of the workspace before being added to a team.',
            ], 422);
        }

        // Business Rule: Duplicate prevention
        $existing = TeamMember::where('team_id', $team->id)
            ->where('user_id', $targetUser->id)
            ->exists();

        if ($existing) {
            return response()->json([
                'success' => false,
                'message' => 'User is already a member of this team.',
            ], 422);
        }

        TeamMember::create([
            'team_id' => $team->id,
            'user_id' => $targetUser->id,
        ]);

        ActivityLog::create([
            'user_id' => $user->id,
            'workspace_id' => $team->workspace_id,
            'action' => 'team_member_added',
            'entity_type' => 'Team',
            'entity_id' => $team->id,
            'details' => [
                'added_user_id' => $targetUser->id,
                'team_name' => $team->name,
            ],
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Member added to team successfully.',
            'data' => [
                'id' => $targetUser->id,
                'name' => $targetUser->name,
                'email' => $targetUser->email,
                'is_lead' => $team->team_lead_id === $targetUser->id,
            ],
        ], 201);
    }

    /**
     * Remove a member from the team.
     */
    public function removeMember(Request $request, int $id, int $userId): JsonResponse
    {
        $user = $request->user();

        $team = Team::with('workspace')->find($id);
        if (! $team) {
            return response()->json([
                'success' => false,
                'message' => 'Team not found.',
            ], 404);
        }

        if (! $this->userCanManageSpecificTeam($user, $team)) {
            return response()->json([
                'success' => false,
                'message' => 'You do not have permission to manage team members.',
            ], 403);
        }

        $membership = TeamMember::where('team_id', $team->id)
            ->where('user_id', $userId)
            ->first();

        if (! $membership) {
            return response()->json([
                'success' => false,
                'message' => 'User is not a member of this team.',
            ], 404);
        }

        // If the removed user is the team lead, unset team_lead_id
        if ($team->team_lead_id === $userId) {
            $team->team_lead_id = null;
            $team->save();
        }

        $membership->delete();

        ActivityLog::create([
            'user_id' => $user->id,
            'workspace_id' => $team->workspace_id,
            'action' => 'team_member_removed',
            'entity_type' => 'Team',
            'entity_id' => $team->id,
            'details' => [
                'removed_user_id' => $userId,
                'team_name' => $team->name,
            ],
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Member removed from team successfully.',
        ]);
    }

    /**
     * Check if a user belongs to a workspace.
     */
    protected function userBelongsToWorkspace(int $userId, ?Workspace $workspace): bool
    {
        if (! $workspace) {
            return false;
        }

        if ($workspace->owner_id === $userId) {
            return true;
        }

        return WorkspaceMember::where('workspace_id', $workspace->id)
            ->where('user_id', $userId)
            ->exists();
    }

    /**
     * Check if a user has permission to manage all teams in a workspace.
     */
    protected function userCanManageTeams(User $user, ?Workspace $workspace): bool
    {
        if (! $workspace) {
            return false;
        }

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

        if (in_array($membership->role->slug, ['admin', 'project_manager'])) {
            return true;
        }

        return $membership->role->permissions->contains('slug', 'workspaces.manage');
    }

    /**
     * Check if a user can manage a specific team (including its team lead).
     */
    protected function userCanManageSpecificTeam(User $user, Team $team): bool
    {
        if ($this->userCanManageTeams($user, $team->workspace)) {
            return true;
        }

        // The team lead can manage their own team's members and details
        return $team->team_lead_id === $user->id;
    }

    /**
     * Resolve workspace context from header, query, or fallback.
     */
    protected function resolveWorkspace(Request $request, User $user): Workspace|null|false
    {
        $requestedWorkspaceId = $request->header('X-Workspace-Id') ?? $request->query('workspace_id');

        if ($requestedWorkspaceId) {
            $workspace = Workspace::where('id', $requestedWorkspaceId)
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
}
