import React, { useState, useEffect, useCallback } from 'react';
import { NotificationContext } from './notification-context';
import notificationService from '../services/notificationService';
import realtimeService from '../services/realtimeService';
import { useAuth } from '../hooks/useAuth';

export const NotificationProvider = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const activeWorkspaceId = user?.active_workspace_id || localStorage.getItem('nexora_active_workspace_id') || null;

  const fetchUnreadCount = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await notificationService.getUnreadCount(
        activeWorkspaceId ? { workspace_id: activeWorkspaceId } : {}
      );
      setUnreadCount(typeof res.count === 'number' ? res.count : 0);
    } catch (err) {
      console.error('[NotificationContext] Failed to fetch unread count:', err);
    }
  }, [isAuthenticated, activeWorkspaceId]);

  const fetchNotifications = useCallback(async (params = {}) => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const queryParams = {
        ...params,
        ...(activeWorkspaceId ? { workspace_id: activeWorkspaceId } : {}),
      };
      const data = await notificationService.getNotifications(queryParams);
      const items = data.data || [];
      if (params.page && params.page > 1) {
        setNotifications((prev) => {
          const existingIds = new Set(prev.map((n) => n.id));
          const newItems = items.filter((n) => !existingIds.has(n.id));
          return [...prev, ...newItems];
        });
      } else {
        setNotifications(items);
      }
      return data;
    } catch (err) {
      console.error('[NotificationContext] Failed to fetch notifications:', err);
      setError(err.message || 'Failed to load notifications');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, activeWorkspaceId]);

  const markAsRead = useCallback(async (notificationId) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === notificationId ? { ...n, read_at: n.read_at || new Date().toISOString() } : n
      )
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      await notificationService.markAsRead(notificationId);
    } catch (err) {
      console.error('[NotificationContext] Failed to mark notification as read:', err);
      fetchUnreadCount();
      throw err;
    }
  }, [fetchUnreadCount]);

  const markAllAsRead = useCallback(async () => {
    const prevNotifications = [...notifications];
    const prevCount = unreadCount;

    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
    );
    setUnreadCount(0);

    try {
      await notificationService.markAllAsRead(
        activeWorkspaceId ? { workspace_id: activeWorkspaceId } : {}
      );
    } catch (err) {
      console.error('[NotificationContext] Failed to mark all as read:', err);
      setNotifications(prevNotifications);
      setUnreadCount(prevCount);
      throw err;
    }
  }, [notifications, unreadCount, activeWorkspaceId]);

  const deleteNotification = useCallback(async (notificationId) => {
    const target = notifications.find((n) => n.id === notificationId);
    const wasUnread = target && !target.read_at;

    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    if (wasUnread) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    try {
      await notificationService.deleteNotification(notificationId);
    } catch (err) {
      console.error('[NotificationContext] Failed to delete notification:', err);
      if (target) {
        setNotifications((prev) => [target, ...prev]);
        if (wasUnread) {
          setUnreadCount((prev) => prev + 1);
        }
      }
      throw err;
    }
  }, [notifications]);

  // Initial unread count fetch on authentication
  useEffect(() => {
    let isMounted = true;
    if (isAuthenticated) {
      notificationService
        .getUnreadCount(activeWorkspaceId ? { workspace_id: activeWorkspaceId } : {})
        .then((res) => {
          if (isMounted) {
            setUnreadCount(typeof res.count === 'number' ? res.count : 0);
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, activeWorkspaceId]);

  // Real-time listener: notification:new
  useEffect(() => {
    if (!isAuthenticated) return;

    let socket = realtimeService.getSocket();
    if (!socket) {
      socket = realtimeService.connect();
    }

    const handleNewNotification = (notification) => {
      if (!notification || !notification.id) return;

      // Deduplication safeguard: avoid duplicate notification IDs
      setNotifications((prev) => {
        if (prev.some((n) => n.id === notification.id)) {
          return prev;
        }
        return [
          {
            ...notification,
            read_at: notification.readAt || notification.read_at || null,
            created_at: notification.createdAt || notification.created_at || new Date().toISOString(),
            entity_type: notification.entityType || notification.entity_type || null,
            entity_id: notification.entityId || notification.entity_id || null,
          },
          ...prev,
        ];
      });

      // Increment unread count
      setUnreadCount((prev) => prev + 1);
    };

    if (socket) {
      socket.on('notification:new', handleNewNotification);
    }

    return () => {
      if (socket) {
        socket.off('notification:new', handleNewNotification);
      }
    };
  }, [isAuthenticated]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        error,
        fetchNotifications,
        fetchUnreadCount,
        markAsRead,
        markAllAsRead,
        deleteNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export default NotificationProvider;
