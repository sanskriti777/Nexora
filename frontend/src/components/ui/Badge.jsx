import React from 'react';

/**
 * Reusable Enterprise Status Badge Component
 *
 * Variants: primary, success, warning, danger, neutral
 */
export const Badge = ({
  children,
  variant = 'neutral',
  dot = false,
  className = '',
  ...props
}) => {
  return (
    <span className={`badge badge-${variant} ${className}`.trim()} {...props}>
      {dot && <span className="badge-dot" />}
      {children}
    </span>
  );
};

export default Badge;
