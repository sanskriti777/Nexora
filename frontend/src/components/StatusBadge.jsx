import React from 'react';

/**
 * StatusBadge Component
 *
 * Visual indicator for server / API state.
 * @param {'connected' | 'loading' | 'error'} status
 * @param {string} text
 */
export const StatusBadge = ({ status, text }) => {
  const getBadgeClass = () => {
    switch (status) {
      case 'connected':
        return 'status-indicator-badge connected';
      case 'loading':
        return 'status-indicator-badge loading';
      case 'error':
        return 'status-indicator-badge error';
      default:
        return 'status-indicator-badge';
    }
  };

  const getDotClass = () => {
    switch (status) {
      case 'connected':
        return 'status-dot connected';
      case 'loading':
        return 'status-dot loading';
      case 'error':
        return 'status-dot error';
      default:
        return 'status-dot';
    }
  };

  return (
    <span className={getBadgeClass()}>
      <span className={getDotClass()} />
      <span>{text}</span>
    </span>
  );
};

export default StatusBadge;
