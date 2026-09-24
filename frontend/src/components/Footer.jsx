import React from 'react';

/**
 * Footer Component
 *
 * Global footer with architecture versioning and tagline.
 */
export const Footer = () => {
  return (
    <footer className="footer">
      <p>
        <strong>NEXORA</strong> — Real-Time Project Management &amp; Collaboration Platform.
      </p>
      <p style={{ marginTop: '0.25rem', color: 'var(--text-dim)' }}>
        Phase 3: React + Vite + Axios &amp; Laravel REST API Connection Established
      </p>
    </footer>
  );
};

export default Footer;
