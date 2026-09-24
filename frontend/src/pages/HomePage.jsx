import React from 'react';
import { Link } from 'react-router-dom';

/**
 * HomePage Component
 *
 * Welcome landing page for NEXORA: Plan. Manage. Collaborate. Deliver.
 * Introduces the platform architecture and provides immediate entry into API health monitoring.
 */
export const HomePage = () => {
  return (
    <div className="home-page">
      <section className="hero">
        <div className="hero-badge">
          <span>●</span> NEXORA Phase 3 Architecture Foundation
        </div>
        <h1 className="hero-title">Plan. Manage. Collaborate. Deliver.</h1>
        <p className="hero-subtitle">
          Next-generation real-time project management platform built on a modern decoupled architecture.
        </p>

        <div className="hero-actions">
          <Link to="/health" className="btn btn-primary" id="hero-btn-health">
            Inspect API Health Status →
          </Link>
          <a
            href="https://github.com/sanskriti777/Nexora"
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
          >
            GitHub Repository
          </a>
        </div>
      </section>

      <section className="features-section">
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1.25rem', fontFamily: 'var(--font-display)' }}>
          System Architecture Overview
        </h2>

        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">⚛</div>
            <h3 className="feature-title">React + Vite Frontend</h3>
            <p className="feature-desc">
              High-performance Single Page Application (SPA) powered by Vite, React 19, React Router, and a centralized Axios service layer. Runs on local port 5173.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">⚡</div>
            <h3 className="feature-title">Laravel REST API Backend</h3>
            <p className="feature-desc">
              Robust PHP 8.3 + Laravel 13 backend handling authentication, business logic, validation, and database transactions via Eloquent ORM. Runs on local port 8001.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">🐬</div>
            <h3 className="feature-title">Relational Persistence</h3>
            <p className="feature-desc">
              MySQL 8.0 relational database storing structured entities: Workspaces, Projects, Tasks, Roles, and Permissions with strict foreign-key integrity.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">🔄</div>
            <h3 className="feature-title">Future Real-Time Layer</h3>
            <p className="feature-desc">
              Upcoming Phase 4+ expansion: Node.js + Socket.IO for live Kanban synchronization and instant team chat backed by MongoDB and Redis.
            </p>
          </div>
        </div>
      </section>

      <section className="flow-diagram" style={{ marginTop: '2.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--accent-secondary)' }}>
          Active Phase 3 Communication Channel
        </h3>
        <div className="flow-steps">
          <div className="flow-step">
            <strong>React Client</strong>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>localhost:5173</div>
          </div>
          <div className="flow-arrow">→ Axios HTTP →</div>
          <div className="flow-step">
            <strong>Laravel API</strong>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>127.0.0.1:8001</div>
          </div>
          <div className="flow-arrow">→ Eloquent ORM →</div>
          <div className="flow-step">
            <strong>MySQL DB</strong>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Port 3306</div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;
