import React from 'react';
import { useApiHealth } from '../hooks/useApiHealth';
import StatusBadge from '../components/StatusBadge';

/**
 * HealthPage Component
 *
 * Demonstrates live React → Axios → Laravel REST API communication.
 * Validates endpoint: GET http://127.0.0.1:8000/api/health
 */
export const HealthPage = () => {
  const { loading, data, error, refetch, isConnected } = useApiHealth(true);

  const getStatusBadge = () => {
    if (loading) {
      return <StatusBadge status="loading" text="Checking API..." />;
    }
    if (isConnected) {
      return <StatusBadge status="connected" text="Connected" />;
    }
    return <StatusBadge status="error" text="Disconnected" />;
  };

  return (
    <div className="health-container">
      <div className="card status-card">
        {/* Status Header */}
        <div className="status-header">
          <div>
            <h1 style={{ fontSize: '1.75rem', fontFamily: 'var(--font-display)', marginBottom: '0.25rem' }}>
              NEXORA API Status
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Live health check between React frontend and Laravel backend.
            </p>
          </div>
          <div>{getStatusBadge()}</div>
        </div>

        {/* State 1: Loading State */}
        {loading && (
          <div className="alert" style={{ background: 'var(--status-info-bg)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#93c5fd' }}>
            <span className="alert-icon">⏳</span>
            <div>
              <strong>Checking NEXORA API...</strong>
              <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                Dispatching HTTP GET request via Axios to <code>http://127.0.0.1:8000/api/health</code>...
              </p>
            </div>
          </div>
        )}

        {/* State 2: Connected / Success State */}
        {!loading && isConnected && data && (
          <div>
            <div className="alert alert-success">
              <span className="alert-icon">✔</span>
              <div>
                <strong style={{ fontSize: '1.05rem' }}>{data.data.message || 'NEXORA API is running'}</strong>
                <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                  The Laravel backend answered successfully with HTTP 200 OK.
                </p>
              </div>
            </div>

            {/* Diagnostic Details Grid */}
            <div className="status-details-grid">
              <div className="detail-item">
                <div className="detail-label">Endpoint</div>
                <div className="detail-value">GET /api/health</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">HTTP Status</div>
                <div className="detail-value" style={{ color: 'var(--status-success)' }}>
                  {data.status} {data.statusText || 'OK'}
                </div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Response Time</div>
                <div className="detail-value">{data.latencyMs} ms</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Timestamp</div>
                <div className="detail-value">{new Date(data.timestamp).toLocaleTimeString()}</div>
              </div>
            </div>

            <div style={{ marginTop: '1.25rem' }}>
              <div className="detail-label" style={{ marginBottom: '0.5rem' }}>
                Backend JSON Response Payload
              </div>
              <pre className="code-block">{JSON.stringify(data.data, null, 2)}</pre>
            </div>
          </div>
        )}

        {/* State 3: Disconnected / Error State */}
        {!loading && error && (
          <div>
            <div className="alert alert-error">
              <span className="alert-icon">✖</span>
              <div>
                <strong style={{ fontSize: '1.05rem' }}>Unable to connect to NEXORA API</strong>
                <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                  {error.message || 'Failed to establish connection with the Laravel backend.'}
                </p>
              </div>
            </div>

            <div style={{ margin: '1.25rem 0', background: 'rgba(239, 68, 68, 0.05)', padding: '1.25rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <h4 style={{ fontSize: '0.95rem', color: '#fca5a5', marginBottom: '0.5rem' }}>
                Troubleshooting Steps:
              </h4>
              <ol style={{ paddingLeft: '1.25rem', color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: '1.7' }}>
                <li>
                  Verify Laravel development server is running:
                  <code style={{ display: 'block', margin: '0.35rem 0', padding: '0.3rem 0.6rem', background: '#0a0d14', borderRadius: '4px' }}>
                    cd backend &amp;&amp; php artisan serve --port=8001
                  </code>
                </li>
                <li>
                  Confirm the backend server is reachable at:
                  <code style={{ marginLeft: '0.5rem' }}>http://127.0.0.1:8001</code>
                </li>
                <li>Ensure no firewall or antivirus is blocking port 8001.</li>
                <li>Check your browser developer tools Network and Console tabs for CORS or ERR_CONNECTION_REFUSED.</li>
              </ol>
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div style={{ marginTop: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--bg-card-border)', paddingTop: '1.25rem' }}>
          <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
            Base URL: <code>{import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api'}</code>
          </div>
          <button
            onClick={refetch}
            disabled={loading}
            className="btn btn-primary"
            id="btn-recheck-health"
          >
            {loading ? 'Testing...' : 'Check Again'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default HealthPage;
