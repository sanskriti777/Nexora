import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import teamService from '../services/teamService';
import workspaceService from '../services/workspaceService';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import Avatar from '../components/ui/Avatar';

export const TeamDetailsPage = () => {
  const { teamId } = useParams();
  const navigate = useNavigate();

  const [team, setTeam] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [errorStatus, setErrorStatus] = useState(null);

  // Available Workspace Members (for adding to this team)
  const [workspaceMembers, setWorkspaceMembers] = useState([]);
  const [isLoadingWsMembers, setIsLoadingWsMembers] = useState(false);

  // Add Member Modal
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedTeamRole, setSelectedTeamRole] = useState('member');
  const [isSubmittingMember, setIsSubmittingMember] = useState(false);
  const [memberFormError, setMemberFormError] = useState(null);

  // Remove Member Modal
  const [removingMember, setRemovingMember] = useState(null);
  const [isRemovingMember, setIsRemovingMember] = useState(false);

  // Edit Team Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({ name: '', description: '', team_lead_id: '' });
  const [editFormErrors, setEditFormErrors] = useState({});
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Delete Team Modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Alert Banner
  const [alertBanner, setAlertBanner] = useState(null);
  const [refreshIndex, setRefreshIndex] = useState(0);

  const fetchTeamDetails = useCallback(() => {
    setRefreshIndex((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let ignore = false;
    teamService
      .getTeam(teamId)
      .then((res) => {
        if (!ignore) {
          if (res.data) {
            setTeam(res.data);
          } else {
            setErrorMessage('Team not found.');
          }
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setErrorStatus(err.status);
          if (err.status === 403) {
            setErrorMessage('You do not have permission to view this team or it belongs to a different workspace.');
          } else if (err.status === 404) {
            setErrorMessage('The requested team does not exist or has been removed.');
          } else {
            setErrorMessage(err.message || 'Failed to load team.');
          }
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [teamId, refreshIndex]);

  // Load Workspace Members when Add Member modal opens
  const openAddMemberModal = async () => {
    if (!team) return;
    setIsAddMemberModalOpen(true);
    setMemberFormError(null);
    setSelectedUserId('');
    setSelectedTeamRole('member');

    try {
      setIsLoadingWsMembers(true);
      const res = await workspaceService.getWorkspaceMembers(team.workspace_id, { per_page: 100 });
      const wsMemberList = res.data || [];
      // Filter out members already in this team
      const existingTeamUserIds = new Set((team.members || []).map((m) => m.id));
      const availableToAdd = wsMemberList.filter((m) => m.user && !existingTeamUserIds.has(m.user.id));
      setWorkspaceMembers(availableToAdd);
      if (availableToAdd.length > 0) {
        setSelectedUserId(String(availableToAdd[0].user.id));
      }
    } catch {
      setMemberFormError('Failed to load eligible workspace members.');
    } finally {
      setIsLoadingWsMembers(false);
    }
  };

  const handleAddMemberSubmit = async (e) => {
    e.preventDefault();
    if (!selectedUserId) {
      setMemberFormError('Please select a member to add.');
      return;
    }

    try {
      setIsSubmittingMember(true);
      setMemberFormError(null);
      await teamService.addTeamMember(team.id, {
        user_id: Number(selectedUserId),
        role: selectedTeamRole,
      });

      setAlertBanner({ type: 'success', message: 'Member successfully added to team.' });
      setIsAddMemberModalOpen(false);
      fetchTeamDetails();
    } catch (err) {
      setMemberFormError(err.message || 'Failed to add member to team.');
    } finally {
      setIsSubmittingMember(false);
    }
  };

  const handleRemoveMemberConfirm = async () => {
    if (!removingMember || !team) return;
    try {
      setIsRemovingMember(true);
      await teamService.removeTeamMember(team.id, removingMember.id);
      setAlertBanner({ type: 'success', message: `Removed ${removingMember.name} from team.` });
      setRemovingMember(null);
      fetchTeamDetails();
    } catch (err) {
      setAlertBanner({ type: 'danger', message: err.message || 'Failed to remove member.' });
    } finally {
      setIsRemovingMember(false);
    }
  };

  const handleEditTeamSubmit = async (e) => {
    e.preventDefault();
    setEditFormErrors({});

    const errors = {};
    if (!editFormData.name.trim()) errors.name = 'Team name is required.';
    if (Object.keys(errors).length > 0) {
      setEditFormErrors(errors);
      return;
    }

    try {
      setIsSubmittingEdit(true);
      await teamService.updateTeam(team.id, {
        name: editFormData.name.trim(),
        description: editFormData.description.trim() || null,
        team_lead_id: editFormData.team_lead_id ? Number(editFormData.team_lead_id) : null,
      });

      setAlertBanner({ type: 'success', message: 'Team details updated.' });
      setIsEditModalOpen(false);
      fetchTeamDetails();
    } catch (err) {
      if (err.errors) {
        setEditFormErrors(err.errors);
      } else {
        setEditFormErrors({ general: err.message || 'Failed to update team.' });
      }
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleDeleteTeamConfirm = async () => {
    if (!team) return;
    try {
      setIsDeleting(true);
      await teamService.deleteTeam(team.id);
      navigate('/teams');
    } catch (err) {
      setAlertBanner({ type: 'danger', message: err.message || 'Failed to delete team.' });
      setIsDeleteModalOpen(false);
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="team-details-loading text-center py-12">
        <div className="loading-spinner" />
        <p className="loading-caption mt-2">Loading team details...</p>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="team-details-error py-8">
        <Card className="error-card text-center p-8 max-w-lg mx-auto">
          <div className="error-icon text-3xl mb-3">{errorStatus === 403 ? '🔒' : '⚠️'}</div>
          <h2 className="error-title text-xl font-bold mb-2">
            {errorStatus === 403 ? 'Access Forbidden' : 'Unable to Load Team'}
          </h2>
          <p className="error-desc text-secondary text-sm mb-6">{errorMessage}</p>
          <Link to="/teams" className="btn btn-primary">
            ← Back to Teams
          </Link>
        </Card>
      </div>
    );
  }

  if (!team) return null;

  return (
    <div className="team-details-page-container">
      {/* Breadcrumbs & Back Navigation */}
      <div className="breadcrumbs-bar mb-4 flex items-center justify-between">
        <Link to="/teams" className="back-link text-sm text-primary font-medium hover:underline">
          ← Back to Teams
        </Link>
        <span className="text-xs text-secondary">
          Workspace: <strong>{team.workspace?.name || 'Workspace'}</strong>
        </span>
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

      {/* Team Header Card */}
      <Card className="team-header-card mb-6 p-6">
        <div className="team-header-content flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="team-header-info">
            <div className="team-title-row flex items-center gap-3">
              <h1 className="team-title text-2xl font-bold">{team.name}</h1>
              <Badge variant="primary">{team.members_count ?? team.members?.length ?? 0} Members</Badge>
            </div>
            <p className="team-desc text-secondary text-sm mt-1 max-w-2xl">
              {team.description || 'No description provided for this team.'}
            </p>

            <div className="team-meta-row flex items-center gap-4 mt-3 text-xs text-secondary">
              <div className="team-lead-info flex items-center gap-1.5">
                <span className="font-medium">Lead:</span>
                {team.lead ? (
                  <div className="flex items-center gap-1">
                    <Avatar name={team.lead.name} size="xs" />
                    <span className="text-main font-medium">{team.lead.name}</span>
                  </div>
                ) : (
                  <span className="text-muted italic">Unassigned</span>
                )}
              </div>
              <span className="meta-separator">•</span>
              <span>Created {new Date(team.created_at).toLocaleDateString()}</span>
            </div>
          </div>

          <div className="team-header-actions flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setEditFormData({
                  name: team.name,
                  description: team.description || '',
                  team_lead_id: team.team_lead_id ? String(team.team_lead_id) : '',
                });
                setEditFormErrors({});
                setIsEditModalOpen(true);
              }}
            >
              Edit Team
            </Button>
            <Button variant="danger" onClick={() => setIsDeleteModalOpen(true)}>
              Delete Team
            </Button>
          </div>
        </div>
      </Card>

      {/* Main Content Layout */}
      <div className="team-content-grid grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Team Members (2 cols) */}
        <div className="team-members-col lg:col-span-2">
          <Card className="team-members-card p-5">
            <div className="section-header flex items-center justify-between mb-4">
              <div>
                <h2 className="section-title text-lg font-bold">Team Members</h2>
                <p className="text-xs text-secondary">
                  Members belonging to this functional unit in the workspace.
                </p>
              </div>
              <Button variant="primary" size="sm" onClick={openAddMemberModal}>
                + Add Member
              </Button>
            </div>

            {(!team.members || team.members.length === 0) ? (
              <div className="empty-members-box text-center py-8">
                <div className="empty-icon text-2xl mb-2">👤</div>
                <p className="text-sm font-medium">No members in this team yet</p>
                <p className="text-xs text-secondary mt-1 mb-4">
                  Add workspace members to assign tasks and collaborate.
                </p>
                <Button variant="primary" size="sm" onClick={openAddMemberModal}>
                  Add Member
                </Button>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="enterprise-table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Email</th>
                      <th>Team Role</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.members.map((m) => {
                      const isLead = team.team_lead_id === m.id || m.pivot?.role === 'lead';
                      return (
                        <tr key={m.id}>
                          <td>
                            <div className="member-cell-info flex items-center gap-2.5">
                              <Avatar name={m.name} size="sm" />
                              <div className="member-name-block">
                                <span className="member-name font-medium">{m.name}</span>
                                {isLead && <Badge variant="warning" className="ml-2 text-xs">LEAD</Badge>}
                              </div>
                            </div>
                          </td>
                          <td className="text-sm text-secondary">{m.email}</td>
                          <td>
                            <Badge variant={isLead ? 'warning' : 'neutral'}>
                              {(m.pivot?.role || (isLead ? 'lead' : 'member')).toUpperCase()}
                            </Badge>
                          </td>
                          <td className="text-right">
                            <button
                              type="button"
                              className="btn btn-outline-danger btn-xs"
                              onClick={() => setRemovingMember(m)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Associated Projects (1 col) */}
        <div className="team-projects-col">
          <Card className="team-projects-card p-5">
            <div className="section-header mb-4">
              <h2 className="section-title text-lg font-bold">Assigned Projects</h2>
              <p className="text-xs text-secondary">
                Projects owned or operated by this team.
              </p>
            </div>

            {(!team.projects || team.projects.length === 0) ? (
              <div className="empty-projects-box text-center py-8">
                <div className="empty-icon text-2xl mb-2">📁</div>
                <p className="text-sm font-medium">No projects assigned</p>
                <p className="text-xs text-secondary mt-1">
                  Projects assigned to this team will show up here.
                </p>
              </div>
            ) : (
              <div className="projects-mini-list space-y-3">
                {team.projects.map((p) => (
                  <div key={p.id} className="project-mini-item p-3 rounded border border-light">
                    <div className="flex items-center justify-between">
                      <Link to={`/projects/${p.id}`} className="font-medium text-sm text-primary hover:underline">
                        {p.name}
                      </Link>
                      <Badge variant={p.status === 'completed' ? 'success' : 'neutral'}>
                        {p.status}
                      </Badge>
                    </div>
                    {p.description && (
                      <p className="text-xs text-secondary mt-1 line-clamp-2">{p.description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ADD MEMBER MODAL */}
      {isAddMemberModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-dialog card">
            <div className="modal-header">
              <h3 className="modal-title font-semibold text-lg">Add Member to Team</h3>
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
                {memberFormError && <div className="form-error-alert">{memberFormError}</div>}

                {isLoadingWsMembers ? (
                  <div className="py-4 text-center">
                    <div className="loading-spinner" />
                    <p className="loading-caption mt-2">Loading workspace members...</p>
                  </div>
                ) : workspaceMembers.length === 0 ? (
                  <p className="text-sm text-secondary">
                    All members of this workspace are already in this team.
                  </p>
                ) : (
                  <>
                    <div className="form-group">
                      <label htmlFor="team-member-select" className="form-label">
                        Select Workspace Member <span className="text-danger">*</span>
                      </label>
                      <select
                        id="team-member-select"
                        className="input-field"
                        value={selectedUserId}
                        onChange={(e) => setSelectedUserId(e.target.value)}
                      >
                        {workspaceMembers.map((m) => (
                          <option key={m.user.id} value={m.user.id}>
                            {m.user.name} ({m.user.email})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="team-role-select" className="form-label">Team Role</label>
                      <select
                        id="team-role-select"
                        className="input-field"
                        value={selectedTeamRole}
                        onChange={(e) => setSelectedTeamRole(e.target.value)}
                      >
                        <option value="member">Member</option>
                        <option value="lead">Lead</option>
                      </select>
                    </div>
                  </>
                )}
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
                {workspaceMembers.length > 0 && (
                  <Button type="submit" variant="primary" disabled={isSubmittingMember}>
                    {isSubmittingMember ? 'Adding...' : 'Add to Team'}
                  </Button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REMOVE MEMBER MODAL */}
      {removingMember && (
        <div className="modal-backdrop">
          <div className="modal-dialog card modal-dialog-sm">
            <div className="modal-header">
              <h3 className="modal-title font-semibold text-lg text-danger">Remove Team Member</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setRemovingMember(null)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>
            <div className="modal-body p-4">
              <p className="text-secondary text-sm">
                Are you sure you want to remove <strong>{removingMember.name}</strong> from this team?
                They will remain in the workspace.
              </p>
            </div>
            <div className="modal-footer p-4 border-t border-light flex justify-end space-x-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRemovingMember(null)}
                disabled={isRemovingMember}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={handleRemoveMemberConfirm}
                disabled={isRemovingMember}
              >
                {isRemovingMember ? 'Removing...' : 'Remove'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT TEAM MODAL */}
      {isEditModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-dialog card">
            <div className="modal-header">
              <h3 className="modal-title font-semibold text-lg">Edit Team</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsEditModalOpen(false)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleEditTeamSubmit}>
              <div className="modal-body p-4 space-y-4">
                {editFormErrors.general && <div className="form-error-alert">{editFormErrors.general}</div>}

                <div className="form-group">
                  <label htmlFor="edit-team-name" className="form-label">
                    Team Name <span className="text-danger">*</span>
                  </label>
                  <input
                    id="edit-team-name"
                    type="text"
                    className={`input-field ${editFormErrors.name ? 'input-error' : ''}`}
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  />
                  {editFormErrors.name && (
                    <span className="form-field-error text-danger text-xs">{editFormErrors.name}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="edit-team-desc" className="form-label">Description</label>
                  <textarea
                    id="edit-team-desc"
                    className="input-field textarea-field"
                    rows={3}
                    value={editFormData.description}
                    onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="edit-team-lead" className="form-label">Team Lead</label>
                  <select
                    id="edit-team-lead"
                    className="input-field"
                    value={editFormData.team_lead_id}
                    onChange={(e) => setEditFormData({ ...editFormData, team_lead_id: e.target.value })}
                  >
                    <option value="">Unassigned</option>
                    {(team.members || []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="modal-footer p-4 border-t border-light flex justify-end space-x-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditModalOpen(false)}
                  disabled={isSubmittingEdit}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={isSubmittingEdit}>
                  {isSubmittingEdit ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE TEAM CONFIRMATION MODAL */}
      {isDeleteModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-dialog card modal-dialog-sm">
            <div className="modal-header">
              <h3 className="modal-title font-semibold text-lg text-danger">Delete Team</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsDeleteModalOpen(false)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>
            <div className="modal-body p-4">
              <p className="text-secondary text-sm">
                Are you sure you want to delete <strong>{team.name}</strong>? This action cannot be undone.
              </p>
            </div>
            <div className="modal-footer p-4 border-t border-light flex justify-end space-x-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={handleDeleteTeamConfirm}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete Team'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamDetailsPage;
