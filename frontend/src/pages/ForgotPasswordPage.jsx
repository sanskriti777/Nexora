import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

/**
 * Forgot Password Page Component
 *
 * Visual UI implementation matching Image 1 specifications.
 * Note: Password reset email dispatch is scheduled for a future backend milestone.
 */
export const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email.trim()) return;

    // Accurate system status notice (no fake success simulated)
    setNotice(
      'Password reset endpoint will be connected in a future backend phase. Please contact your workspace administrator for manual credential recovery.'
    );
  };

  return (
    <div className="auth-card card" id="forgot-password-container">
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
        <h1 className="auth-title">Reset your password</h1>
        <p className="auth-subtitle">
          Enter your account email to receive recovery instructions
        </p>
      </div>

      {notice && (
        <div className="auth-alert auth-alert-info" role="status">
          <span className="auth-alert-icon">ℹ️</span>
          <span>{notice}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="auth-form" noValidate>
        <Input
          label="Email Address"
          id="email"
          name="email"
          type="email"
          placeholder="name@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="auth-submit-btn"
        >
          Send Reset Link
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

export default ForgotPasswordPage;
