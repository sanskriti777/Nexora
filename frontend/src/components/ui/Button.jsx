import React from 'react';

/**
 * Reusable Enterprise Button Component
 *
 * Variants: primary, secondary, outline, danger
 * Sizes: sm, md, lg
 */
export const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  type = 'button',
  isLoading = false,
  disabled = false,
  className = '',
  onClick,
  ...props
}) => {
  const baseClasses = 'btn';
  const variantClass = `btn-${variant}`;
  const sizeClass = size !== 'md' ? `btn-${size}` : '';
  const loadingClass = isLoading ? 'btn-loading' : '';

  return (
    <button
      type={type}
      className={`${baseClasses} ${variantClass} ${sizeClass} ${loadingClass} ${className}`.trim()}
      disabled={disabled || isLoading}
      onClick={onClick}
      {...props}
    >
      {isLoading && <span className="btn-spinner" aria-hidden="true" />}
      <span className="btn-content">{children}</span>
    </button>
  );
};

export default Button;
