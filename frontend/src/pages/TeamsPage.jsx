import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import workspaceService from '../services/workspaceService';
import teamService from '../services/teamService';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import Avatar from '../components/ui/Avatar';

export const TeamsPage = ({ defaultTab = 'teams' }) => {
  const location = useLocation();
  const initialTab = location.pathname.includes('/workspace/members') ? 'members' : defaultTab;
  const [activeTab, setActiveTab] = useState(initialTab);

  // Workspaces State
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(null);
  const [workspaceDetails, setWorkspaceDetails] = useState(null);
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(true);

  // Teams State
  const [teams, setTeams] = useState([]);
  const [teamSearch, setTeamSearch] = useState('');
  const [isLoadingTeams, setIsLoadingTeams] = useState(false);

  // Workspace Members State
  const [members, setMembers] = useState([]);
  const [memberMeta, setMemberMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [memberSearch, setMemberSearch] = useState('');
  const [memberRoleFilter, setMemberRoleFilter] = useState('');
  const [memberPage, setMemberPage] = useState(1);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);

  // Roles List
  const [availableRoles, setAvailableRoles] = useState([]);

  // Modals
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [teamFormData, setTeamFormData] = useState({ name: '', description: '', team_lead_id: '' });
  const [teamFormErrors, setTeamFormErrors] = useState({});
  const [isSubmittingTeam, setIsSubmittingTeam] = useState(false);

  const [deletingTeamId, setDeletingTeamId] = useState(null);
  const [isDeletingTeam, setIsDeletingTeam] = useState(false);

  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [memberFormData, setMemberFormData] = useState({ email: '', role: 'member' });
  const [memberFormErrors, setMemberFormErrors] = useState({});
  const [isSubmittingMember, setIsSubmittingMember] = useState(false);

  const [editingMemberRole, setEditingMemberRole] = useState(null);
  const [selectedRoleForMember, setSelectedRoleForMember] = useState('');
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  const [deletingMember, setDeletingMember] = useState(null);
  const [isRemovingMember, setIsRemovingMember] = useState(false);

  // Feedback notifications
  const [alertBanner, setAlertBanner] = useState(null); // { type: 'success'|'danger', message: '' }

  // Load Workspaces and Roles
  useEffect(() => {
    let ignore = false;
    async function init() {
      try {
        setIsLoadingWorkspaces(true);
        const [wsRes, rolesRes] = await Promise.all([
          workspaceService.getWorkspaces(),
          workspaceService.getRoles().catch(() => ({ data: [] })),
        ]);

        if (!ignore) {
          const wsList = wsRes.data || [];
          setWorkspaces(wsList);
          if (rolesRes.data) {
            setAvailableRoles(rolesRes.data);
          }
          if (wsList.length > 0) {
            setActiveWorkspaceId(wsList[0].id);
          }
        }
      } catch (err) {
        if (!ignore) {
          setAlertBanner({ type: 'danger', message: err.message || 'Failed to load workspace data.' });
        }
      } finally {
        if (!ignore) setIsLoadingWorkspaces(false);
      }
    }
    init();
    return () => { ignore = true; };
  }, []);

  const [refreshTeamsIndex, setRefreshTeamsIndex] = useState(0);
  const [refreshMembersIndex, setRefreshMembersIndex] = useState(0);

  const fetchWorkspaceDetails = useCallback((wsId) => {
    if (!wsId) return;
    workspaceService.getWorkspace(wsId)
      .then((res) => {
        if (res.data) setWorkspaceDetails(res.data);
      })
      .catch((err) => {
        console.error('Failed to load workspace details:', err);
      });
  }, []);

  const fetchTeams = useCallback(() => {
    setRefreshTeamsIndex((prev) => prev + 1);
  }, []);

  const fetchMembers = useCallback(() => {
    setRefreshMembersIndex((prev) => prev + 1);
  }, []);

  // Fetch Workspace Details & Teams
  useEffect(() => {
    if (!activeWorkspaceId) return;
    let ignore = false;
    fetchWorkspaceDetails(activeWorkspaceId);

    if (activeTab === 'teams') {
      teamService.getTeams({ workspace_id: activeWorkspaceId, search: teamSearch.trim() || undefined })
        .then((res) => {
          if (!ignore) {
            setTeams(res.data || []);
            setIsLoadingTeams(false);
          }
        })
        .catch((err) => {
          if (!ignore) {
            setAlertBanner({ type: 'danger', message: err.message || 'Failed to load teams.' });
            setIsLoadingTeams(false);
          }
        });
    }

    return () => {
      ignore = true;
    };
  }, [activeWorkspaceId, activeTab, teamSearch, refreshTeamsIndex, fetchWorkspaceDetails]);

  // Fetch Workspace Members
  useEffect(() => {
    if (!activeWorkspaceId || activeTab !== 'members') return;
    let ignore = false;

    workspaceService.getWorkspaceMembers(activeWorkspaceId, {
      page: memberPage,
      per_page: 10,
      search: memberSearch.trim() || undefined,
      role: memberRoleFilter || undefined,
    })
      .then((res) => {
        if (!ignore) {
          setMembers(res.data || []);
          setMemberMeta(res.meta || { current_page: memberPage, last_page: 1, total: (res.data || []).length });
          setIsLoadingMembers(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setAlertBanner({ type: 'danger', message: err.message || 'Failed to load workspace members.' });
          setIsLoadingMembers(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [activeWorkspaceId, activeTab, memberPage, memberSearch, memberRoleFilter, refreshMembersIndex]);

  // Current user's permission flags in this workspace
  const userMembership = workspaceDetails?.current_user_membership;
  const userRole = userMembership?.role?.name || (workspaceDetails?.owner_id === userMembership?.user_id ? 'owner' : 'member');
  const canManageWorkspace = ['owner', 'admin'].includes(userRole);
  const canManageTeams = ['owner', 'admin', 'project_manager'].includes(userRole);

  // Team Create / Edit Submit
  const handleTeamSubmit = async (e) => {
    e.preventDefault();
    setTeamFormErrors({});

    const errors = {};
    if (!teamFormData.name.trim()) errors.name = 'Team name is required.';
    if (Object.keys(errors).length > 0) {
      setTeamFormErrors(errors);
      return;
    }

    try {
      setIsSubmittingTeam(true);
      if (editingTeam) {
        await teamService.updateTeam(editingTeam.id, {
          name: teamFormData.name.trim(),
          description: teamFormData.description.trim() || null,
          team_lead_id: teamFormData.team_lead_id ? Number(teamFormData.team_lead_id) : null,
        });
        setAlertBanner({ type: 'success', message: `Team "${teamFormData.name}" updated successfully.` });
      } else {
        await teamService.createTeam({
          name: teamFormData.name.trim(),
          description: teamFormData.description.trim() || null,
          team_lead_id: teamFormData.team_lead_id ? Number(teamFormData.team_lead_id) : null,
          workspace_id: activeWorkspaceId,
        });
        setAlertBanner({ type: 'success', message: `Team "${teamFormData.name}" created successfully.` });
      }

      setIsTeamModalOpen(false);
      setEditingTeam(null);
      setTeamFormData({ name: '', description: '', team_lead_id: '' });
      fetchTeams(activeWorkspaceId, teamSearch);
      fetchWorkspaceDetails(activeWorkspaceId);
    } catch (err) {
      if (err.errors) {
        setTeamFormErrors(err.errors);
      } else {
        setTeamFormErrors({ general: err.message || 'Operation failed.' });
      }
    } finally {
      setIsSubmittingTeam(false);
    }
  };

  // Team Delete
  const handleConfirmDeleteTeam = async () => {
    if (!deletingTeamId) return;
    try {
      setIsDeletingTeam(true);
      await teamService.deleteTeam(deletingTeamId);
      setAlertBanner({ type: 'success', message: 'Team deleted successfully.' });
      setDeletingTeamId(null);
      fetchTeams(activeWorkspaceId, teamSearch);
      fetchWorkspaceDetails(activeWorkspaceId);
    } catch (err) {
      setAlertBanner({ type: 'danger', message: err.message || 'Failed to delete team.' });
    } finally {
      setIsDeletingTeam(false);
    }
  };

  // Add Workspace Member Submit
  const handleAddMemberSubmit = async (e) => {
    e.preventDefault();
    setMemberFormErrors({});

    const errors = {};
    if (!memberFormData.email.trim()) errors.email = 'Valid email address is required.';
    if (Object.keys(errors).length > 0) {
      setMemberFormErrors(errors);
      return;
    }

    try {
      setIsSubmittingMember(true);
      await workspaceService.addWorkspaceMember(activeWorkspaceId, {
        email: memberFormData.email.trim(),
        role: memberFormData.role,
      });

      setAlertBanner({ type: 'success', message: `Member (${memberFormData.email}) added to workspace.` });
      setIsAddMemberModalOpen(false);
      setMemberFormData({ email: '', role: 'member' });
      fetchMembers(activeWorkspaceId, memberPage, memberSearch, memberRoleFilter);
      fetchWorkspaceDetails(activeWorkspaceId);
    } catch (err) {
      if (err.errors) {
        setMemberFormErrors(err.errors);
      } else {
        setMemberFormErrors({ general: err.message || 'Failed to add member.' });
      }
    } finally {
      setIsSubmittingMember(false);
    }
  };

  // Update Member Role Submit
  const handleUpdateRoleSubmit = async (e) => {
    e.preventDefault();
    if (!editingMemberRole || !selectedRoleForMember) return;

    try {
      setIsUpdatingRole(true);
      await workspaceService.updateWorkspaceMemberRole(activeWorkspaceId, editingMemberRole.user_id, {
        role: selectedRoleForMember,
      });
      setAlertBanner({ type: 'success', message: `Role for ${editingMemberRole.user?.name || 'member'} updated.` });
      setEditingMemberRole(null);
      fetchMembers(activeWorkspaceId, memberPage, memberSearch, memberRoleFilter);
    } catch (err) {
      setAlertBanner({ type: 'danger', message: err.message || 'Failed to update member role.' });
    } finally {
      setIsUpdatingRole(false);
    }
  };

  // Remove Member Confirm
  const handleConfirmRemoveMember = async () => {
    if (!deletingMember) return;
    try {
      setIsRemovingMember(true);
      await workspaceService.removeWorkspaceMember(activeWorkspaceId, deletingMember.user_id);
      setAlertBanner({ type: 'success', message: `Removed ${deletingMember.user?.name || 'member'} from workspace.` });
      setDeletingMember(null);
      fetchMembers(activeWorkspaceId, memberPage, memberSearch, memberRoleFilter);
      fetchWorkspaceDetails(activeWorkspaceId);
    } catch (err) {
      setAlertBanner({ type: 'danger', message: err.message || 'Failed to remove member.' });
    } finally {
      setIsRemovingMember(false);
    }
  };

  const getRoleBadgeVariant = (roleName) => {
    switch (roleName) {
      case 'owner':
        return 'primary';
      case 'admin':
        return 'warning';
      case 'project_manager':
        return 'info';
      case 'member':
        return 'neutral';
      case 'viewer':
        return 'neutral';
      default:
        return 'neutral';
    }
  };

  return (
    <div className="teams-page-container">
      {/* Page Header with Workspace Context */}
      <div className="page-header mb-6">
        <div className="page-header-title-row">
          <div>
            <h1 className="page-title">Teams & Workspace</h1>
            <p className="page-subtitle text-secondary">
              Organize members, build cross-functional teams, and manage workspace permissions.
            </p>
          </div>

          {/* Workspace Switcher / Badge */}
          {workspaces.length > 1 && (
            <div className="workspace-switcher-select-wrap">
              <label htmlFor="workspace-select" className="text-xs text-secondary font-medium mr-2">
                Workspace:
              </label>
              <select
                id="workspace-select"
                className="input-field select-sm"
                value={activeWorkspaceId || ''}
                onChange={(e) => setActiveWorkspaceId(Number(e.target.value))}
              >
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Workspace Summary Bar */}
        {workspaceDetails && (
          <Card className="workspace-summary-card mt-4 p-4">
            <div className="workspace-summary-content">
              <div className="workspace-info-main">
                <div className="workspace-avatar-sq">{workspaceDetails.name?.[0]?.toUpperCase() || 'W'}</div>
                <div>
                  <div className="workspace-title-line">
                    <span className="workspace-name-display">{workspaceDetails.name}</span>
                    <Badge variant={getRoleBadgeVariant(userRole)}>
                      Your Role: {userRole.replace('_', ' ').toUpperCase()}
                    </Badge>
                  </div>
                  <p className="workspace-desc-text text-secondary text-sm">
                    {workspaceDetails.description || 'Enterprise collaboration workspace.'}
                  </p>
                </div>
              </div>

              <div className="workspace-stats-pill-group">
                <div className="stat-pill">
                  <span className="stat-pill-label">Members</span>
                  <span className="stat-pill-value">{workspaceDetails.members_count ?? members.length}</span>
                </div>
                <div className="stat-pill">
                  <span className="stat-pill-label">Teams</span>
                  <span className="stat-pill-value">{workspaceDetails.teams_count ?? teams.length}</span>
                </div>
                <div className="stat-pill">
                  <span className="stat-pill-label">Projects</span>
                  <span className="stat-pill-value">{workspaceDetails.projects_count ?? 0}</span>
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Alert Banner */}
      {alertBanner && (
        <div className={`alert-banner alert-${alertBanner.type} mb-4`}>
          <span>{alertBanner.message}</span>
          <button
            type="button"
            className="alert-close-btn"
            onClick={() => setAlertBanner(null)}
            aria-label="Dismiss alert"
          >
            ✕
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="tab-navigation mb-6">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'teams' ? 'tab-btn-active' : ''}`}
          onClick={() => setActiveTab('teams')}
        >
          <span className="tab-icon">👥</span>
          <span>Teams</span>
          {teams.length > 0 && <span className="tab-counter">{teams.length}</span>}
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'members' ? 'tab-btn-active' : ''}`}
          onClick={() => setActiveTab('members')}
        >
          <span className="tab-icon">👤</span>
          <span>Workspace Members</span>
          {memberMeta.total > 0 && <span className="tab-counter">{memberMeta.total}</span>}
        </button>
      </div>

      {/* TAB 1: TEAMS */}
      {activeTab === 'teams' && (
        <div className="teams-tab-pane">
          {/* Controls Bar */}
          <div className="filter-controls-row mb-6">
            <div className="search-input-wrap">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                className="input-field search-input"
                placeholder="Search teams by name or description..."
                value={teamSearch}
                onChange={(e) => setTeamSearch(e.target.value)}
              />
              {teamSearch && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setTeamSearch('')}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            {canManageTeams && (
              <Button
                variant="primary"
                onClick={() => {
                  setEditingTeam(null);
                  setTeamFormData({ name: '', description: '', team_lead_id: '' });
                  setTeamFormErrors({});
                  setIsTeamModalOpen(true);
                }}
              >
                + Create Team
              </Button>
            )}
          </div>

          {/* Teams Grid / List */}
          {isLoadingTeams || isLoadingWorkspaces ? (
            <div className="loading-state-box">
              <div className="loading-spinner" />
              <p className="loading-caption">Loading teams...</p>
            </div>
          ) : teams.length === 0 ? (
            <Card className="empty-state-card text-center p-8">
              <div className="empty-icon text-3xl mb-3">👥</div>
              <h3 className="empty-title text-lg font-semibold">No teams yet</h3>
              <p className="empty-desc text-secondary text-sm max-w-md mx-auto mb-5">
                {teamSearch
                  ? `No teams matched "${teamSearch}". Try adjusting your search query.`
                  : 'Teams help you organize members, assign dedicated projects, and coordinate execution.'}
              </p>
              {canManageTeams && !teamSearch && (
                <Button
                  variant="primary"
                  onClick={() => {
                    setEditingTeam(null);
                    setTeamFormData({ name: '', description: '', team_lead_id: '' });
                    setTeamFormErrors({});
                    setIsTeamModalOpen(true);
                  }}
                >
                  Create Your First Team
                </Button>
              )}
            </Card>
          ) : (
            <div className="teams-grid">
              {teams.map((team) => (
                <Card key={team.id} className="team-card">
                  <div className="team-card-header">
                    <div className="team-card-title-group">
                      <h3 className="team-card-name">
                        <Link to={`/teams/${team.id}`} className="team-name-link">
                          {team.name}
                        </Link>
                      </h3>
                      <p className="team-card-desc text-secondary text-sm">
                        {team.description || 'No team description provided.'}
                      </p>
                    </div>
                  </div>

                  <div className="team-card-lead-row my-3">
                    <span className="text-xs text-secondary font-medium">Team Lead:</span>
                    {team.lead ? (
                      <div className="team-lead-badge">
                        <Avatar name={team.lead.name} size="xs" />
                        <span className="text-sm font-medium ml-1.5">{team.lead.name}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted italic ml-1">Unassigned</span>
                    )}
                  </div>

                  <div className="team-card-stats-row py-2 border-t border-b border-light">
                    <div className="team-mini-stat">
                      <span className="team-stat-num">{team.members_count ?? 0}</span>
                      <span className="team-stat-lbl text-xs text-secondary">Members</span>
                    </div>
                    <div className="team-mini-stat">
                      <span className="team-stat-num">{team.projects_count ?? 0}</span>
                      <span className="team-stat-lbl text-xs text-secondary">Projects</span>
                    </div>
                  </div>

                  <div className="team-card-actions mt-3">
                    <Link to={`/teams/${team.id}`} className="btn btn-secondary btn-sm flex-1 text-center">
                      View Details
                    </Link>

                    {canManageTeams && (
                      <>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          title="Edit Team"
                          onClick={() => {
                            setEditingTeam(team);
                            setTeamFormData({
                              name: team.name,
                              description: team.description || '',
                              team_lead_id: team.team_lead_id ? String(team.team_lead_id) : '',
                            });
                            setTeamFormErrors({});
                            setIsTeamModalOpen(true);
                          }}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm"
                          title="Delete Team"
                          onClick={() => setDeletingTeamId(team.id)}
                        >
                          🗑
                        </button>
                      </>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: WORKSPACE MEMBERS */}
      {activeTab === 'members' && (
        <div className="members-tab-pane">
          {/* Controls Bar */}
          <div className="filter-controls-row mb-6">
            <div className="search-input-wrap flex-1">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                className="input-field search-input"
                placeholder="Search members by name or email..."
                value={memberSearch}
                onChange={(e) => {
                  setMemberSearch(e.target.value);
                  setMemberPage(1);
                }}
              />
              {memberSearch && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => {
                    setMemberSearch('');
                    setMemberPage(1);
                  }}
                  aria-label="Clear member search"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="role-filter-wrap">
              <select
                className="input-field select-filter"
                value={memberRoleFilter}
                onChange={(e) => {
                  setMemberRoleFilter(e.target.value);
                  setMemberPage(1);
                }}
              >
                <option value="">All Roles</option>
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="project_manager">Project Manager</option>
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>

            {canManageWorkspace && (
              <Button
                variant="primary"
                onClick={() => {
                  setMemberFormData({ email: '', role: 'member' });
                  setMemberFormErrors({});
                  setIsAddMemberModalOpen(true);
                }}
              >
                + Add Member
              </Button>
            )}
          </div>

          {/* Members Table */}
          {isLoadingMembers ? (
            <div className="loading-state-box">
              <div className="loading-spinner" />
              <p className="loading-caption">Loading workspace members...</p>
            </div>
          ) : members.length === 0 ? (
            <Card className="empty-state-card text-center p-8">
              <div className="empty-icon text-3xl mb-3">👤</div>
              <h3 className="empty-title text-lg font-semibold">No members found</h3>
              <p className="empty-desc text-secondary text-sm max-w-md mx-auto mb-4">
                {memberSearch || memberRoleFilter
                  ? 'No members match the current filter criteria.'
                  : 'Invite members to collaborate in this workspace.'}
              </p>
              {canManageWorkspace && (
                <Button
                  variant="primary"
                  onClick={() => {
                    setMemberFormData({ email: '', role: 'member' });
                    setMemberFormErrors({});
                    setIsAddMemberModalOpen(true);
                  }}
                >
                  Add Member
                </Button>
              )}
            </Card>
          ) : (
            <Card className="table-card overflow-hidden">
              <div className="table-responsive">
                <table className="enterprise-table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Email</th>
                      <th>Workspace Role</th>
                      <th>Joined Date</th>
                      {canManageWorkspace && <th className="text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => {
                      const memberUser = m.user || {};
                      const memberRoleName = m.role?.name || 'member';
                      const isOwner = memberUser.id === workspaceDetails?.owner_id || memberRoleName === 'owner';

                      return (
                        <tr key={m.id || memberUser.id}>
                          <td>
                            <div className="member-cell-info">
                              <Avatar name={memberUser.name || 'User'} size="sm" />
                              <div className="member-name-group ml-3">
                                <span className="member-full-name font-medium">{memberUser.name}</span>
                              </div>
                            </div>
                          </td>
                          <td className="text-secondary text-sm">{memberUser.email}</td>
                          <td>
                            <Badge variant={getRoleBadgeVariant(memberRoleName)}>
                              {memberRoleName.replace('_', ' ').toUpperCase()}
                            </Badge>
                          </td>
                          <td className="text-secondary text-sm">
                            {m.joined_at ? new Date(m.joined_at).toLocaleDateString() : 'Active'}
                          </td>
                          {canManageWorkspace && (
                            <td className="text-right">
                              {isOwner ? (
                                <span className="text-xs text-muted italic">Workspace Owner</span>
                              ) : (
                                <div className="action-button-group justify-end">
                                  <button
                                    type="button"
                                    className="btn btn-outline btn-xs"
                                    onClick={() => {
                                      setEditingMemberRole(m);
                                      setSelectedRoleForMember(memberRoleName);
                                    }}
                                  >
                                    Edit Role
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-outline-danger btn-xs"
                                    onClick={() => setDeletingMember(m)}
                                  >
                                    Remove
                                  </button>
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {memberMeta.last_page > 1 && (
                <div className="pagination-bar p-3 border-t border-light flex justify-between items-center">
                  <span className="text-xs text-secondary">
                    Showing page {memberMeta.current_page} of {memberMeta.last_page} ({memberMeta.total} total members)
                  </span>
                  <div className="pagination-btn-group">
                    <button
                      type="button"
                      className="btn btn-outline btn-xs mr-2"
                      disabled={memberMeta.current_page <= 1}
                      onClick={() => setMemberPage((prev) => Math.max(prev - 1, 1))}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-xs"
                      disabled={memberMeta.current_page >= memberMeta.last_page}
                      onClick={() => setMemberPage((prev) => Math.min(prev + 1, memberMeta.last_page))}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* CREATE / EDIT TEAM MODAL */}
      {isTeamModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-dialog card">
            <div className="modal-header">
              <h3 className="modal-title font-semibold text-lg">
                {editingTeam ? 'Edit Team' : 'Create New Team'}
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsTeamModalOpen(false)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleTeamSubmit}>
              <div className="modal-body p-4 space-y-4">
                {teamFormErrors.general && (
                  <div className="form-error-alert">{teamFormErrors.general}</div>
                )}

                <div className="form-group">
                  <label htmlFor="team-name-input" className="form-label">
                    Team Name <span className="text-danger">*</span>
                  </label>
                  <input
                    id="team-name-input"
                    type="text"
                    className={`input-field ${teamFormErrors.name ? 'input-error' : ''}`}
                    placeholder="e.g. Core Engineering, Product Design, Marketing"
                    value={teamFormData.name}
                    onChange={(e) => setTeamFormData({ ...teamFormData, name: e.target.value })}
                  />
                  {teamFormErrors.name && (
                    <span className="form-field-error text-danger text-xs">{teamFormErrors.name}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="team-desc-input" className="form-label">
                    Description
                  </label>
                  <textarea
                    id="team-desc-input"
                    className="input-field textarea-field"
                    rows={3}
                    placeholder="Brief description of the team responsibilities..."
                    value={teamFormData.description}
                    onChange={(e) => setTeamFormData({ ...teamFormData, description: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="team-lead-select" className="form-label">
                    Team Lead (Optional)
                  </label>
                  <select
                    id="team-lead-select"
                    className="input-field"
                    value={teamFormData.team_lead_id}
                    onChange={(e) => setTeamFormData({ ...teamFormData, team_lead_id: e.target.value })}
                  >
                    <option value="">Unassigned</option>
                    {members.map((m) => {
                      const u = m.user;
                      if (!u) return null;
                      return (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.email})
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              <div className="modal-footer p-4 border-t border-light flex justify-end space-x-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsTeamModalOpen(false)}
                  disabled={isSubmittingTeam}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={isSubmittingTeam}>
                  {isSubmittingTeam ? 'Saving...' : editingTeam ? 'Update Team' : 'Create Team'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE TEAM CONFIRMATION MODAL */}
      {deletingTeamId && (
        <div className="modal-backdrop">
          <div className="modal-dialog card modal-dialog-sm">
            <div className="modal-header">
              <h3 className="modal-title font-semibold text-lg text-danger">Delete Team</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setDeletingTeamId(null)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>
            <div className="modal-body p-4">
              <p className="text-secondary text-sm">
                Are you sure you want to delete this team? Team members will remain in the workspace, but team assignments will be removed.
              </p>
            </div>
            <div className="modal-footer p-4 border-t border-light flex justify-end space-x-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeletingTeamId(null)}
                disabled={isDeletingTeam}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={handleConfirmDeleteTeam}
                disabled={isDeletingTeam}
              >
                {isDeletingTeam ? 'Deleting...' : 'Delete Team'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ADD WORKSPACE MEMBER MODAL */}
      {isAddMemberModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-dialog card">
            <div className="modal-header">
              <h3 className="modal-title font-semibold text-lg">Add Workspace Member</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsAddMemberModalOpen(false)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAddMemberSubmit}>
              <div className="modal-body p-4 space-y-4">
                {memberFormErrors.general && (
                  <div className="form-error-alert">{memberFormErrors.general}</div>
                )}

                <div className="form-group">
                  <label htmlFor="member-email-input" className="form-label">
                    User Email <span className="text-danger">*</span>
                  </label>
                  <input
                    id="member-email-input"
                    type="email"
                    className={`input-field ${memberFormErrors.email ? 'input-error' : ''}`}
                    placeholder="colleague@example.com"
                    value={memberFormData.email}
                    onChange={(e) => setMemberFormData({ ...memberFormData, email: e.target.value })}
                  />
                  {memberFormErrors.email && (
                    <span className="form-field-error text-danger text-xs">{memberFormErrors.email}</span>
                  )}
                  <p className="text-xs text-muted mt-1">
                    Enter the email address of a registered user to add them to this workspace.
                  </p>
                </div>

                <div className="form-group">
                  <label htmlFor="member-role-select" className="form-label">
                    Assign Role <span className="text-danger">*</span>
                  </label>
                  <select
                    id="member-role-select"
                    className="input-field"
                    value={memberFormData.role}
                    onChange={(e) => setMemberFormData({ ...memberFormData, role: e.target.value })}
                  >
                    {availableRoles.length > 0 ? (
                      availableRoles.map((r) => (
                        <option key={r.id} value={r.name}>
                          {r.name.replace('_', ' ').toUpperCase()} — {r.description || ''}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="member">MEMBER</option>
                        <option value="admin">ADMIN</option>
                        <option value="project_manager">PROJECT MANAGER</option>
                        <option value="viewer">VIEWER</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div className="modal-footer p-4 border-t border-light flex justify-end space-x-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddMemberModalOpen(false)}
                  disabled={isSubmittingMember}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={isSubmittingMember}>
                  {isSubmittingMember ? 'Adding...' : 'Add Member'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MEMBER ROLE MODAL */}
      {editingMemberRole && (
        <div className="modal-backdrop">
          <div className="modal-dialog card modal-dialog-sm">
            <div className="modal-header">
              <h3 className="modal-title font-semibold text-lg">Change Member Role</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setEditingMemberRole(null)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleUpdateRoleSubmit}>
              <div className="modal-body p-4 space-y-4">
                <p className="text-sm text-secondary">
                  Update role for <strong>{editingMemberRole.user?.name}</strong>:
                </p>
                <div className="form-group">
                  <label htmlFor="change-role-select" className="form-label">Role</label>
                  <select
                    id="change-role-select"
                    className="input-field"
                    value={selectedRoleForMember}
                    onChange={(e) => setSelectedRoleForMember(e.target.value)}
                  >
                    <option value="admin">ADMIN</option>
                    <option value="project_manager">PROJECT MANAGER</option>
                    <option value="member">MEMBER</option>
                    <option value="viewer">VIEWER</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer p-4 border-t border-light flex justify-end space-x-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingMemberRole(null)}
                  disabled={isUpdatingRole}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={isUpdatingRole}>
                  {isUpdatingRole ? 'Updating...' : 'Save Role'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REMOVE MEMBER CONFIRMATION MODAL */}
      {deletingMember && (
        <div className="modal-backdrop">
          <div className="modal-dialog card modal-dialog-sm">
            <div className="modal-header">
              <h3 className="modal-title font-semibold text-lg text-danger">Remove Workspace Member</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setDeletingMember(null)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>
            <div className="modal-body p-4">
              <p className="text-secondary text-sm">
                Are you sure you want to remove <strong>{deletingMember.user?.name}</strong> from this workspace?
                They will also be removed from any assigned teams in this workspace.
              </p>
            </div>
            <div className="modal-footer p-4 border-t border-light flex justify-end space-x-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeletingMember(null)}
                disabled={isRemovingMember}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={handleConfirmRemoveMember}
                disabled={isRemovingMember}
              >
                {isRemovingMember ? 'Removing...' : 'Remove Member'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamsPage;
