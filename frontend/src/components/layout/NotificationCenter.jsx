import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useNotifications } from '../../hooks/useNotifications';
import {
  formatTimeAgo,
  getNotificationRoute,
  getNotificationIcon,
} from '../../utils/notificationUtils';

export const NotificationCenter = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const {
    notifications,
    unreadCount,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
  } = useNotifications();

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Fetch recent preview items on opening
  useEffect(() => {
    if (isOpen) {
      fetchNotifications({ per_page: 5 }).catch(() => {});
    }
  }, [isOpen, fetchNotifications]);

  const handleNotificationClick = async (n) => {
    if (!n.read_at) {
      await markAsRead(n.id).catch(() => {});
    }
    setIsOpen(false);

    const targetRoute = getNotificationRoute(n);
    if (targetRoute) {
      navigate(targetRoute);
    }
  };

  const handleSingleMarkRead = async (e, id) => {
    e.stopPropagation();
    await markAsRead(id).catch(() => {});
  };

  const previewNotifications = notifications.slice(0, 5);

  return (
    <div className="topbar-dropdown" ref={dropdownRef}>
      <button
        type="button"
        className="topbar-icon-button"
        onClick={() => setIsOpen((prev) => !prev)}
        title="Notifications"
        aria-label="Notifications"
        aria-expanded={isOpen}
      >
        <span className="topbar-icon">🔔</span>
        {unreadCount > 0 && (
          <span className="topbar-badge" aria-label={`${unreadCount} unread notifications`}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="dropdown-menu card topbar-dropdown-menu right-aligned"
          style={{ width: '360px', padding: 0, boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              borderBottom: '1px solid var(--border-color)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>
                Notifications
              </span>
              {unreadCount > 0 && (
                <span
                  style={{
                    backgroundColor: '#EFF6FF',
                    color: '#2563EB',
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '9999px',
                  }}
                >
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                style={{
                  fontSize: '12px',
                  background: 'none',
                  border: 'none',
                  color: '#2563EB',
                  cursor: 'pointer',
                  fontWeight: 500,
                  padding: '2px 4px',
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div
            className="notification-list"
            style={{ maxHeight: '340px', overflowY: 'auto' }}
          >
            {previewNotifications.length === 0 ? (
              <div
                style={{
                  padding: '36px 16px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                }}
              >
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>🔕</div>
                <div style={{ fontSize: '14px', fontWeight: 500 }}>No notifications yet</div>
                <div style={{ fontSize: '12px', marginTop: '4px' }}>We'll notify you when work happens</div>
              </div>
            ) : (
              previewNotifications.map((n) => {
                const isUnread = !n.read_at;
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
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--border-color)',
                      background: isUnread ? '#F0F9FF' : 'transparent',
                      cursor: 'pointer',
                      display: 'flex',
                      gap: '12px',
                      alignItems: 'flex-start',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        backgroundColor: isUnread ? '#DBEAFE' : 'var(--hover-bg, #F1F5F9)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        fontSize: '16px',
                      }}
                    >
                      {getNotificationIcon(n.type)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                          gap: '6px',
                          marginBottom: '2px',
                        }}
                      >
                        <span
                          style={{
                            fontWeight: isUnread ? 700 : 500,
                            fontSize: '13px',
                            color: isUnread ? '#0F172A' : '#334155',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {n.title}
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            color: '#94A3B8',
                            flexShrink: 0,
                          }}
                        >
                          {formatTimeAgo(n.created_at)}
                        </span>
                      </div>
                      <p
                        style={{
                          fontSize: '12px',
                          color: '#64748B',
                          margin: 0,
                          lineHeight: '1.4',
                          overflow: 'hidden',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {n.message}
                      </p>
                    </div>
                    {isUnread && (
                      <button
                        type="button"
                        onClick={(e) => handleSingleMarkRead(e, n.id)}
                        title="Mark as read"
                        aria-label="Mark as read"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#2563EB',
                          cursor: 'pointer',
                          padding: '2px',
                          flexShrink: 0,
                          fontSize: '14px',
                          lineHeight: 1,
                        }}
                      >
                        ●
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '10px 16px',
              textAlign: 'center',
              borderTop: '1px solid var(--border-color)',
              background: '#FAFBFD',
            }}
          >
            <Link
              to="/notifications"
              onClick={() => setIsOpen(false)}
              style={{
                color: '#2563EB',
                fontSize: '13px',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              View all notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
