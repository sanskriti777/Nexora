import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../hooks/useNotifications';
import notificationService from '../services/notificationService';
import {
  formatTimeAgo,
  getNotificationRoute,
  getNotificationIcon,
  getNotificationTypeBadge,
} from '../utils/notificationUtils';

const NotificationsPage = () => {
  const navigate = useNavigate();
  const { markAsRead, markAllAsRead, deleteNotification, unreadCount } = useNotifications();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [tabFilter, setTabFilter] = useState('all'); // 'all' | 'unread'
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      try {
        const params = {
          page,
          per_page: 15,
        };

        if (tabFilter === 'unread') {
          params.unread_only = 1;
        }

        if (typeFilter !== 'all') {
          params.type = typeFilter;
        }

        const res = await notificationService.getNotifications(params);
        if (isMounted) {
          setNotifications(res.data || []);
          setTotalPages(res.last_page || 1);
          setTotalCount(res.total || 0);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to load notifications. Please try again.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [page, tabFilter, typeFilter]);

  const handleTabChange = (newTab) => {
    setTabFilter(newTab);
    setPage(1);
    setLoading(true);
  };

  const handleTypeChange = (e) => {
    setTypeFilter(e.target.value);
    setPage(1);
    setLoading(true);
  };

  const handleNotificationClick = async (n) => {
    if (!n.read_at) {
      await markAsRead(n.id).catch(() => {});
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === n.id ? { ...item, read_at: new Date().toISOString() } : item
        )
      );
    }

    const route = getNotificationRoute(n);
    if (route) {
      navigate(route);
    }
  };

  const handleSingleMarkRead = async (e, id) => {
    e.stopPropagation();
    try {
      await markAsRead(id);
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, read_at: new Date().toISOString() } : item
        )
      );
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  const handleSingleDelete = async (e, id) => {
    e.stopPropagation();
    try {
      await deleteNotification(id);
      setNotifications((prev) => prev.filter((item) => item.id !== id));
      setTotalCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllAsRead();
      setNotifications((prev) =>
        prev.map((item) => ({ ...item, read_at: new Date().toISOString() }))
      );
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  return (
    <div className="page-container" style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Top Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0F172A', margin: '0 0 4px 0' }}>
            Notifications
          </h1>
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0 }}>
            Stay updated with your tasks, projects, teams, and workspace activity
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="btn btn-secondary btn-sm"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              <span>✓</span>
              <span>Mark all as read</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Tab Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px',
          borderBottom: '1px solid #E2E8F0',
          paddingBottom: '12px',
        }}
      >
        {/* Tab Buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => handleTabChange('all')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              background: tabFilter === 'all' ? '#2563EB' : 'transparent',
              color: tabFilter === 'all' ? '#FFFFFF' : '#64748B',
              transition: 'all 0.15s ease',
            }}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('unread')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              background: tabFilter === 'unread' ? '#2563EB' : 'transparent',
              color: tabFilter === 'unread' ? '#FFFFFF' : '#64748B',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <span>Unread</span>
            {unreadCount > 0 && (
              <span
                style={{
                  background: tabFilter === 'unread' ? 'rgba(255,255,255,0.25)' : '#EFF6FF',
                  color: tabFilter === 'unread' ? '#FFFFFF' : '#2563EB',
                  padding: '1px 6px',
                  borderRadius: '9999px',
                  fontSize: '11px',
                  fontWeight: 700,
                }}
              >
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* Type Filter Select */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: '#64748B' }}>Filter by type:</span>
          <select
            value={typeFilter}
            onChange={handleTypeChange}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid #E2E8F0',
              backgroundColor: '#FFFFFF',
              color: '#0F172A',
              fontSize: '13px',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="all">All Types</option>
            <option value="task_assigned">Task Assigned</option>
            <option value="task_status_changed">Task Status Changed</option>
            <option value="task_priority_changed">Task Priority Changed</option>
            <option value="task_due_date_changed">Task Due Date Changed</option>
            <option value="project_member_added">Project Member Added</option>
            <option value="project_updated">Project Updated</option>
            <option value="team_member_added">Team Member Added</option>
            <option value="mention">Mentions</option>
            <option value="chat_message">Chat Messages</option>
            <option value="system">System</option>
          </select>
        </div>
      </div>

      {/* Main Content Card */}
      <div
        className="card"
        style={{
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          overflow: 'hidden',
          backgroundColor: '#FFFFFF',
        }}
      >
        {loading ? (
          <div style={{ padding: '60px 24px', textAlign: 'center', color: '#64748B' }}>
            <div className="loading-spinner" style={{ margin: '0 auto 16px auto' }} />
            <p style={{ margin: 0, fontSize: '14px' }}>Loading notifications...</p>
          </div>
        ) : error ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#DC2626' }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>⚠️</div>
            <p style={{ fontWeight: 600, fontSize: '15px', marginBottom: '8px' }}>{error}</p>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setPage((p) => p);
              }}
              className="btn btn-secondary btn-sm"
            >
              Retry
            </button>
          </div>
        ) : notifications.length === 0 ? (
          <div style={{ padding: '64px 24px', textAlign: 'center', color: '#64748B' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>🔔</div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>
              No notifications found
            </h3>
            <p style={{ fontSize: '14px', maxWidth: '360px', margin: '0 auto', color: '#64748B' }}>
              {tabFilter === 'unread'
                ? 'You have caught up with all your notifications!'
                : 'When new tasks, projects, mentions, or workspace events occur, they will appear here.'}
            </p>
          </div>
        ) : (
          <div>
            {notifications.map((n) => {
              const isUnread = !n.read_at;
              const badge = getNotificationTypeBadge(n.type);
              return (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') handleNotificationClick(n);
                  }}
                  style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid #E2E8F0',
                    backgroundColor: isUnread ? '#F0F9FF' : '#FFFFFF',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '16px',
                    transition: 'background-color 0.15s ease',
                  }}
                >
                  {/* Icon */}
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '8px',
                      backgroundColor: isUnread ? '#DBEAFE' : '#F1F5F9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      fontSize: '18px',
                    }}
                  >
                    {getNotificationIcon(n.type)}
                  </div>

                  {/* Body */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        flexWrap: 'wrap',
                        marginBottom: '4px',
                      }}
                    >
                      <span
                        style={{
                          fontWeight: isUnread ? 700 : 600,
                          fontSize: '15px',
                          color: '#0F172A',
                        }}
                      >
                        {n.title}
                      </span>

                      <span
                        style={{
                          backgroundColor: badge.bg,
                          color: badge.text,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                        }}
                      >
                        {badge.label}
                      </span>

                      {isUnread && (
                        <span
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: '#2563EB',
                            display: 'inline-block',
                          }}
                        />
                      )}
                    </div>

                    <p
                      style={{
                        fontSize: '14px',
                        color: '#475569',
                        margin: '0 0 8px 0',
                        lineHeight: 1.5,
                      }}
                    >
                      {n.message}
                    </p>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', color: '#94A3B8' }}>
                      <span>{formatTimeAgo(n.created_at)}</span>
                      <span>•</span>
                      <span>{new Date(n.created_at).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flexShrink: 0,
                    }}
                  >
                    {isUnread && (
                      <button
                        type="button"
                        onClick={(e) => handleSingleMarkRead(e, n.id)}
                        className="btn btn-secondary btn-sm"
                        style={{
                          padding: '4px 10px',
                          fontSize: '12px',
                          fontWeight: 500,
                        }}
                      >
                        Mark read
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => handleSingleDelete(e, n.id)}
                      title="Dismiss notification"
                      aria-label="Dismiss notification"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#94A3B8',
                        cursor: 'pointer',
                        padding: '6px',
                        fontSize: '14px',
                        borderRadius: '4px',
                        lineHeight: 1,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#DC2626';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#94A3B8';
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {!loading && totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '20px',
            fontSize: '13px',
            color: '#64748B',
          }}
        >
          <div>
            Showing page {page} of {totalPages} ({totalCount} total)
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={page <= 1}
              onClick={() => {
                setLoading(true);
                setPage((p) => Math.max(1, p - 1));
              }}
            >
              ← Previous
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={page >= totalPages}
              onClick={() => {
                setLoading(true);
                setPage((p) => Math.min(totalPages, p + 1));
              }}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;
