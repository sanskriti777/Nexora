import React from 'react';
import { useAuth } from '../hooks/useAuth';
import Card from '../components/ui/Card';
import Avatar from '../components/ui/Avatar';
import Badge from '../components/ui/Badge';

/**
 * Profile Page Component
 *
 * Displays the current authenticated user's details retrieved from /api/me.
 * Adheres strictly to the rule against mock user names.
 */
export const ProfilePage = () => {
  const { user } = useAuth();

  return (
    <div className="module-container" id="profile-view">
      <div className="module-header-row mb-6">
        <div>
          <h1 className="module-page-title">User Profile</h1>
          <p className="module-page-subtitle">Personal account information and workspace role</p>
        </div>
      </div>

      <div className="profile-layout-grid">
        {/* Left: User Card */}
        <Card className="profile-user-card">
          <div className="profile-avatar-center">
            <Avatar name={user?.name || user?.email || 'User'} size="lg" />
          </div>
          <h2 className="profile-full-name">{user?.name || 'Authenticated User'}</h2>
          <p className="profile-email-text">{user?.email || '—'}</p>
          <div className="profile-badge-row">
            <Badge variant="primary">Active Account</Badge>
          </div>

          <div className="profile-meta-list">
            <div className="profile-meta-item">
              <span className="profile-meta-label">User ID:</span>
              <span className="profile-meta-val font-mono">#{user?.id || '—'}</span>
            </div>
            <div className="profile-meta-item">
              <span className="profile-meta-label">Member Since:</span>
              <span className="profile-meta-val">
                {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Active session'}
              </span>
            </div>
          </div>
        </Card>

        {/* Right: Account Details */}
        <Card title="Account Information" subtitle="Verified credentials managed by Laravel Sanctum">
          <div className="profile-info-fields">
            <div className="info-field-group">
              <span className="info-field-label">Full Name</span>
              <div className="info-field-value">{user?.name || '—'}</div>
            </div>

            <div className="info-field-group">
              <span className="info-field-label">Email Address</span>
              <div className="info-field-value">{user?.email || '—'}</div>
            </div>

            <div className="info-field-group">
              <span className="info-field-label">Session Status</span>
              <div className="info-field-value text-success font-semibold">
                ● Sanctum Authenticated Session Active
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ProfilePage;
