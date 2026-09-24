import React from 'react';
import { Link } from 'react-router-dom';

/**
 * NotFoundPage Component
 *
 * Catches unmatched client-side routes.
 */
export const NotFoundPage = () => {
  return (
    <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
      <h1 style={{ fontSize: '5rem', fontFamily: 'var(--font-display)', color: 'var(--accent-primary)' }}>
        404
      </h1>
      <h2 style={{ fontSize: '1.75rem', marginBottom: '1rem' }}>Page Not Found</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
        The frontend route you navigated to does not exist in NEXORA.
      </p>
      <Link to="/" className="btn btn-primary">
        Return to Overview
      </Link>
    </div>
  );
};

export default NotFoundPage;
