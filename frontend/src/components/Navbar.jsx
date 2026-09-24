import React from 'react';
import { NavLink, Link } from 'react-router-dom';

/**
 * Navbar Component
 *
 * Provides top-level branding and client-side navigation using React Router.
 * Employs NavLink for automatic active route state highlighting.
 */
export const Navbar = () => {
  return (
    <header className="navbar">
      <Link to="/" className="brand" id="nav-brand-logo">
        <div className="brand-logo-icon">N</div>
        <div>
          <div className="brand-text">NEXORA</div>
          <div className="brand-tagline-small">Plan • Collaborate • Deliver</div>
        </div>
      </Link>

      <nav aria-label="Main Navigation">
        <ul className="nav-links">
          <li>
            <NavLink
              to="/"
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
              end
              id="nav-link-home"
            >
              Overview
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/health"
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
              id="nav-link-health"
            >
              API Status
            </NavLink>
          </li>
        </ul>
      </nav>
    </header>
  );
};

export default Navbar;
