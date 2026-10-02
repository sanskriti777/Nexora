/**
 * Format relative timestamps
 */
export function formatTimeAgo(dateString) {
  if (!dateString) return '';
  const now = new Date();
  const past = new Date(dateString);
  const diffSec = Math.floor((now - past) / 1000);

  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return past.toLocaleDateString();
}

/**
 * Resolve entity navigation path safely based on real NEXORA routes
 */
export function getNotificationRoute(notification) {
  if (!notification) return null;
  const type = notification.type || '';
  const entityType = notification.entity_type || notification.entityType;
  const entityId = notification.entity_id || notification.entityId;

  if (entityType === 'task' || type.startsWith('task_')) {
    return entityId ? `/tasks/${entityId}` : '/tasks';
  }
  if (entityType === 'project' || type.startsWith('project_')) {
    return entityId ? `/projects/${entityId}` : '/projects';
  }
  if (entityType === 'team' || type.startsWith('team_')) {
    return entityId ? `/teams/${entityId}` : '/teams';
  }
  if (
    entityType === 'channel' ||
    entityType === 'conversation' ||
    type.startsWith('chat_') ||
    type === 'mention'
  ) {
    return '/chat';
  }
  return null;
}

/**
 * Return appropriate iconography for each notification type
 */
export function getNotificationIcon(type) {
  switch (type) {
    case 'task_assigned':
      return '📋';
    case 'task_status_changed':
      return '🔄';
    case 'task_priority_changed':
      return '⚡';
    case 'task_due_date_changed':
      return '📅';
    case 'project_member_added':
      return '📁';
    case 'project_updated':
      return '📂';
    case 'team_member_added':
      return '👥';
    case 'mention':
    case 'chat_mention':
      return '💬';
    case 'chat_message':
    case 'chat_dm':
      return '✉️';
    case 'system':
    default:
      return '🔔';
  }
}

/**
 * Return human readable label and colors for notification type
 */
export function getNotificationTypeBadge(type) {
  switch (type) {
    case 'task_assigned':
      return { label: 'Task Assigned', bg: '#EFF6FF', text: '#2563EB' };
    case 'task_status_changed':
      return { label: 'Status Update', bg: '#F0FDF4', text: '#16A34A' };
    case 'task_priority_changed':
      return { label: 'Priority Update', bg: '#FEF3C7', text: '#D97706' };
    case 'task_due_date_changed':
      return { label: 'Due Date', bg: '#FEF2F2', text: '#DC2626' };
    case 'project_member_added':
      return { label: 'Project Member', bg: '#EFF6FF', text: '#2563EB' };
    case 'project_updated':
      return { label: 'Project Update', bg: '#F1F5F9', text: '#475569' };
    case 'team_member_added':
      return { label: 'Team Member', bg: '#F5F3FF', text: '#7C3AED' };
    case 'mention':
    case 'chat_mention':
      return { label: 'Mention', bg: '#FDF2F8', text: '#DB2777' };
    case 'chat_message':
    case 'chat_dm':
      return { label: 'Direct Message', bg: '#ECFDF5', text: '#059669' };
    case 'system':
    default:
      return { label: 'System', bg: '#F8FAFC', text: '#64748B' };
  }
}
