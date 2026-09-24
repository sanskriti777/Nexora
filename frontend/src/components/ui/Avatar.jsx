import React from 'react';

/**
 * Reusable User Avatar Component
 *
 * Generates initials from user name or displays a fallback profile icon.
 */
export const Avatar = ({ name = '', size = 'md', className = '' }) => {
  const getInitials = (str) => {
    if (!str || typeof str !== 'string') return '?';
    const trimmed = str.trim();
    if (!trimmed) return '?';
    const parts = trimmed.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return trimmed.substring(0, 2).toUpperCase();
  };

  const initials = getInitials(name);
  const sizeClasses = {
    xs: 'avatar-xs',
    sm: 'avatar-sm',
    md: 'avatar-md',
    lg: 'avatar-lg',
  };

  const sizeClass = sizeClasses[size] || sizeClasses.md;

  return (
    <div
      className={`avatar-circle ${sizeClass} ${className}`.trim()}
      title={name || 'User'}
      aria-label={name || 'User avatar'}
    >
      <span className="avatar-initials">{initials}</span>
    </div>
  );
};

export default Avatar;
