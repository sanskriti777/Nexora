import React, { useState, useEffect, useRef } from 'react';
import activityService from '../services/activityService';
import workspaceService from '../services/workspaceService';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';

/**
 * Map an activity action name to a friendly readable label and icon
 */
const getActionMeta = (action = '', entityType = '') => {
  const act = action.toLowerCase();
  const ent = entityType.toLowerCase();

  if (act.includes('created')) {
    return { icon: '➕', label: 'Created', color: '#16A34A', bg: '#DCFCE7' };
  }
  if (act.includes('deleted') || act.includes('removed')) {
    return { icon: '🗑️', label: 'Deleted', color: '#DC2626', bg: '#FEE2E2' };
  }
  if (act.includes('status')) {
    return { icon: '🔄', label: 'Status Changed', color: '#2563EB', bg: '#DBEAFE' };
  }
  if (act.includes('priority')) {
    return { icon: '⚡', label: 'Priority Changed', color: '#D97706', bg: '#FEF3C7' };
  }
  if (act.includes('uploaded')) {
    return { icon: '📎', label: 'Attachment Uploaded', color: '#7C3AED', bg: '#EDE9FE' };
  }
  if (act.includes('assigned')) {
    return { icon: '👤', label: 'Assigned', color: '#0284C7', bg: '#E0F2FE' };
  }
  if (act.includes('member')) {
    return { icon: '👥', label: 'Membership', color: '#0D9488', bg: '#CCFBF1' };
  }
  if (act.includes('updated')) {
    return { icon: '✏️', label: 'Updated', color: '#D97706', bg: '#FEF3C7' };
  }

  // Fallbacks based on entity type
  if (ent === 'project') return { icon: '📁', label: 'Project Action', color: '#2563EB', bg: '#DBEAFE' };
  if (ent === 'task') return { icon: '✓', label: 'Task Action', color: '#16A34A', bg: '#DCFCE7' };
  if (ent === 'team') return { icon: '👥', label: 'Team Action', color: '#0D9488', bg: '#CCFBF1' };

  return { icon: '⏱️', label: action.replace(/_/g, ' '), color: '#475569', bg: '#F1F5F9' };
};

/**
 * Format date headers ("Today", "Yesterday", or readable date)
 */
const formatDateGroup = (dateString) => {
  if (!dateString) return 'Earlier';
  const date = new Date(dateString);
  const now = new Date();

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) return 'Yesterday';

  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
};

export const ActivityPage = () => {
  const [activities, setActivities] = useState([]);
  const [pagination, setPagination] = useState({
    current_page: 1,
    per_page: 20,
    total: 0,
    last_page: 1,
    has_more: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);

  // Available filter options from API
  const [workspaces, setWorkspaces] = useState([]);
  const [availableActions, setAvailableActions] = useState([]);
  const [availableEntityTypes, setAvailableEntityTypes] = useState([]);
  const [availableActors, setAvailableActors] = useState([]);

  // Active filter state
  const [selectedWorkspace, setSelectedWorkspace] = useState('');
  const [selectedAction, setSelectedAction] = useState('');
  const [selectedEntityType, setSelectedEntityType] = useState('');
  const [selectedActor, setSelectedActor] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const debounceTimerRef = useRef(null);

  // Handle Search Input with 350ms debounce
  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(val);
      setCurrentPage(1);
    }, 350);
  };

  // Load Workspaces for filter dropdown
  useEffect(() => {
    workspaceService
      .getWorkspaces()
      .then((res) => {
        if (res && res.data) {
          setWorkspaces(res.data);
        }
      })
      .catch(() => {
        // Fallback gracefully
      });
  }, []);

  // Load available distinct filters for the current workspace scope
  useEffect(() => {
    activityService
      .getActivityFilters(selectedWorkspace ? { workspace_id: selectedWorkspace } : {})
      .then((res) => {
        if (res && res.data) {
          setAvailableActions(res.data.actions || []);
          setAvailableEntityTypes(res.data.entity_types || []);
          setAvailableActors(res.data.actors || []);
        }
      })
      .catch(() => {});
  }, [selectedWorkspace]);

  // Main Activity Fetching Effect
  useEffect(() => {
    let isMounted = true;

    async function loadActivities() {
      setIsLoading(true);
      setErrorMessage(null);

      const params = {
        page: currentPage,
        per_page: 20,
      };

      if (selectedWorkspace) params.workspace_id = selectedWorkspace;
      if (selectedAction) params.action = selectedAction;
      if (selectedEntityType) params.entity_type = selectedEntityType;
      if (selectedActor) params.user_id = selectedActor;
      if (fromDate) params.from = fromDate;
      if (toDate) params.to = toDate;
      if (debouncedSearch) params.search = debouncedSearch;

      try {
        const response = await activityService.getActivities(params);
        if (isMounted) {
          setActivities(response.data || []);
          if (response.pagination) {
            setPagination(response.pagination);
          }
          setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setErrorMessage(err.message || 'Unable to load activity logs.');
          setIsLoading(false);
        }
      }
    }

    loadActivities();

    return () => {
      isMounted = false;
    };
  }, [
    currentPage,
    selectedWorkspace,
    selectedAction,
    selectedEntityType,
    selectedActor,
    fromDate,
    toDate,
    debouncedSearch,
    refreshTrigger,
  ]);

  const handleClearFilters = () => {
    setSelectedWorkspace('');
    setSelectedAction('');
    setSelectedEntityType('');
    setSelectedActor('');
    setFromDate('');
    setToDate('');
    setSearchQuery('');
    setDebouncedSearch('');
    setCurrentPage(1);
  };

  const hasActiveFilters = Boolean(
    selectedWorkspace ||
    selectedAction ||
    selectedEntityType ||
    selectedActor ||
    fromDate ||
    toDate ||
    debouncedSearch
  );

  // Group activities by date
  const groupedActivities = activities.reduce((acc, log) => {
    const groupKey = formatDateGroup(log.created_at);
    if (!acc[groupKey]) acc[groupKey] = [];
    acc[groupKey].push(log);
    return acc;
  }, {});

  return (
    <div className="module-container" style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 20px' }}>
      {/* 1. Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
            Activity & Audit Trail
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#64748B' }}>
            Historical audit log and operational events across your accessible workspaces.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRefreshTrigger((prev) => prev + 1)}
          disabled={isLoading}
        >
          🔄 Refresh
        </Button>
      </div>

      {/* 2. Filter Bar Card */}
      <Card style={{ padding: '16px', marginBottom: '24px', backgroundColor: '#FFFFFF' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Top Row: Search Input */}
          <div style={{ position: 'relative' }}>
            <span
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '14px',
                color: '#94A3B8',
              }}
            >
              🔍
            </span>
            <input
              type="text"
              placeholder="Search activity by action, resource name, or user..."
              value={searchQuery}
              onChange={handleSearchChange}
              style={{
                width: '100%',
                padding: '9px 12px 9px 36px',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                fontSize: '14px',
                color: '#0F172A',
                backgroundColor: '#F8FAFC',
                outline: 'none',
              }}
            />
          </div>

          {/* Bottom Row: Dropdown Filters */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              alignItems: 'center',
            }}
          >
            {/* Workspace Filter */}
            <select
              value={selectedWorkspace}
              onChange={(e) => {
                setSelectedWorkspace(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                padding: '7px 12px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                fontSize: '13px',
                color: '#334155',
                backgroundColor: '#FFFFFF',
              }}
            >
              <option value="">All Accessible Workspaces</option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>

            {/* Entity Type Filter */}
            <select
              value={selectedEntityType}
              onChange={(e) => {
                setSelectedEntityType(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                padding: '7px 12px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                fontSize: '13px',
                color: '#334155',
                backgroundColor: '#FFFFFF',
              }}
            >
              <option value="">All Entity Types</option>
              {availableEntityTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>

            {/* Action Filter */}
            <select
              value={selectedAction}
              onChange={(e) => {
                setSelectedAction(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                padding: '7px 12px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                fontSize: '13px',
                color: '#334155',
                backgroundColor: '#FFFFFF',
              }}
            >
              <option value="">All Actions</option>
              {availableActions.map((act) => (
                <option key={act} value={act}>
                  {act.replace(/_/g, ' ')}
                </option>
              ))}
            </select>

            {/* Actor / User Filter */}
            <select
              value={selectedActor}
              onChange={(e) => {
                setSelectedActor(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                padding: '7px 12px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                fontSize: '13px',
                color: '#334155',
                backgroundColor: '#FFFFFF',
              }}
            >
              <option value="">All Users</option>
              {availableActors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.name}
                </option>
              ))}
            </select>

            {/* Date From */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#64748B' }}>
              <span>From:</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  padding: '5px 8px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '12px',
                  color: '#334155',
                }}
              />
            </div>

            {/* Date To */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#64748B' }}>
              <span>To:</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  padding: '5px 8px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '12px',
                  color: '#334155',
                }}
              />
            </div>

            {/* Clear Filters Button */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#2563EB',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '4px 8px',
                }}
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* 3. Error State */}
      {errorMessage && (
        <Card style={{ padding: '20px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ color: '#991B1B', fontSize: '14px' }}>
              <strong>Error:</strong> {errorMessage}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRefreshTrigger((prev) => prev + 1)}
            >
              Retry
            </Button>
          </div>
        </Card>
      )}

      {/* 4. Loading State */}
      {isLoading && (
        <div style={{ padding: '60px 0', textAlign: 'center', color: '#64748B' }}>
          <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
          <p style={{ margin: 0, fontSize: '14px' }}>Loading activity logs...</p>
        </div>
      )}

      {/* 5. Empty State */}
      {!isLoading && activities.length === 0 && !errorMessage && (
        <Card style={{ padding: '60px 20px', textAlign: 'center', backgroundColor: '#F8FAFC' }}>
          <span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}>📜</span>
          <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 600, color: '#1E293B' }}>
            No activity found
          </h3>
          <p style={{ margin: 0, fontSize: '14px', color: '#64748B' }}>
            {hasActiveFilters
              ? 'No activity matches your active filter criteria. Try resetting or broadening your filters.'
              : 'Workspace audit trail will display here as team members create projects, update tasks, and upload files.'}
          </p>
          {hasActiveFilters && (
            <div style={{ marginTop: '16px' }}>
              <Button variant="outline" size="sm" onClick={handleClearFilters}>
                Clear Active Filters
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* 6. Activity Timeline List */}
      {!isLoading && activities.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {Object.entries(groupedActivities).map(([groupTitle, logs]) => (
            <div key={groupTitle}>
              {/* Date Group Heading */}
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#64748B',
                  marginBottom: '10px',
                  paddingLeft: '4px',
                }}
              >
                {groupTitle}
              </div>

              {/* Items in this date group */}
              <Card style={{ padding: '0', overflow: 'hidden' }}>
                {logs.map((log, idx) => {
                  const meta = getActionMeta(log.action, log.entity_type);
                  const isLast = idx === logs.length - 1;

                  return (
                    <div
                      key={log.id}
                      style={{
                        padding: '16px 20px',
                        borderBottom: isLast ? 'none' : '1px solid #E2E8F0',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '16px',
                        transition: 'background-color 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#F8FAFC';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#FFFFFF';
                      }}
                    >
                      {/* Action Icon Badge */}
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '8px',
                          backgroundColor: meta.bg,
                          color: meta.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '16px',
                          flexShrink: 0,
                        }}
                      >
                        {meta.icon}
                      </div>

                      {/* Main Details */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>
                            {log.actor?.name || 'System User'}
                          </span>
                          <span style={{ fontSize: '13px', color: '#475569' }}>
                            {log.action.replace(/_/g, ' ')}
                          </span>
                          <Badge variant="neutral">
                            {log.entity_type}
                          </Badge>
                          {log.workspace && (
                            <span style={{ fontSize: '12px', color: '#64748B' }}>
                              in <strong>{log.workspace.name}</strong>
                            </span>
                          )}
                        </div>

                        {/* Resource entity title/name if available */}
                        {log.entity?.name && (
                          <div style={{ fontSize: '14px', color: '#1E293B', fontWeight: 500, marginBottom: '6px' }}>
                            {log.entity.name}
                          </div>
                        )}

                        {/* Detailed changes snippet if changes object exists */}
                        {log.details?.changes && typeof log.details.changes === 'object' && Object.keys(log.details.changes).length > 0 && (
                          <div
                            style={{
                              backgroundColor: '#F1F5F9',
                              borderRadius: '4px',
                              padding: '6px 10px',
                              fontSize: '12px',
                              color: '#334155',
                              display: 'inline-block',
                              marginBottom: '6px',
                            }}
                          >
                            {Object.entries(log.details.changes).map(([k, v]) => (
                              <span key={k} style={{ marginRight: '10px' }}>
                                <strong>{k}:</strong> {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Timestamp & Relative time */}
                        <div style={{ fontSize: '12px', color: '#94A3B8' }}>
                          <span>{log.created_at_human}</span>
                          <span> • </span>
                          <span>{log.created_at ? new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </Card>
            </div>
          ))}

          {/* 7. Pagination Controls */}
          {pagination.total > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 4px',
                fontSize: '13px',
                color: '#64748B',
              }}
            >
              <div>
                Showing page <strong>{pagination.current_page}</strong> of <strong>{pagination.last_page}</strong> ({pagination.total} activities)
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={pagination.current_page <= 1 || isLoading}
                >
                  ← Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => p + 1)}
                  disabled={!pagination.has_more || isLoading}
                >
                  Next →
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ActivityPage;
