import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

/**
 * Reset Password Page Component
 *
 * Visual UI implementation matching Image 1 specifications.
 */
export const ResetPasswordPage = () => {
  const [formData, setFormData] = useState({
    password: '',
    password_confirmation: '',
  });
  const [notice, setNotice] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setNotice(
      'Password reset endpoint will be connected in a future backend phase. Please contact your workspace administrator for manual credential recovery.'
    );
  };

  return (
    <div className="auth-card card" id="reset-password-container">
      {/* Brand Header */}
      <div className="auth-header">
        <Link to="/" className="auth-logo-link">
          <img
            src="/logo_Light.png"
            alt="NEXORA"
            className="auth-logo-img"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </Link>
        <h1 className="auth-title">Set new password</h1>
        <p className="auth-subtitle">Choose a secure password for your account</p>
      </div>

      {notice && (
        <div className="auth-alert auth-alert-info" role="status">
          <span className="auth-alert-icon">ℹ️</span>
          <span>{notice}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="auth-form" noValidate>
        <Input
          label="New Password"
          id="password"
          name="password"
          type="password"
          placeholder="Minimum 8 characters"
          value={formData.password}
          onChange={handleChange}
          required
          autoFocus
        />

        <Input
          label="Confirm New Password"
          id="password_confirmation"
          name="password_confirmation"
          type="password"
          placeholder="Re-enter password"
          value={formData.password_confirmation}
          onChange={handleChange}
          required
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="auth-submit-btn"
        >
          Update Password
        </Button>
      </form>

      <div className="auth-footer-prompt">
        <Link to="/login" className="auth-accent-link">
          ← Back to Sign In
        </Link>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
