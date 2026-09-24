import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

/**
 * Enterprise Login Page Component
 *
 * Implements real Laravel Sanctum authentication.
 * Form fields start empty with zero mock values.
 */
export const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    remember: false,
  });

  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const from = location.state?.from?.pathname || '/dashboard';

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    // Clear field-level error on typing
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: '' }));
    }
    if (serverError) {
      setServerError('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');
    setFieldErrors({});

    // Client validation
    const errors = {};
    if (!formData.email.trim()) {
      errors.email = 'Email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Enter a valid email address.';
    }

    if (!formData.password) {
      errors.password = 'Password is required.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setIsLoading(true);

    try {
      await login({
        email: formData.email,
        password: formData.password,
      });
      navigate(from, { replace: true });
    } catch (err) {
      if (err.errors) {
        setFieldErrors(err.errors);
      }
      setServerError(err.message || 'Invalid credentials. Please verify and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-card card" id="login-container">
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
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Sign in to your Nexora workspace</p>
      </div>

      {/* Global Server Error Banner */}
      {serverError && (
        <div className="auth-alert auth-alert-danger" role="alert">
          <span className="auth-alert-icon">⚠️</span>
          <span>{serverError}</span>
        </div>
      )}

      {/* Login Form */}
      <form onSubmit={handleSubmit} className="auth-form" noValidate>
        <Input
          label="Email Address"
          id="email"
          name="email"
          type="email"
          placeholder="name@company.com"
          value={formData.email}
          onChange={handleChange}
          error={fieldErrors.email}
          required
          autoComplete="email"
          autoFocus
        />

        <Input
          label="Password"
          id="password"
          name="password"
          type="password"
          placeholder="••••••••"
          value={formData.password}
          onChange={handleChange}
          error={fieldErrors.password}
          required
          autoComplete="current-password"
        />

        <div className="auth-options-row">
          <label className="auth-checkbox-label">
            <input
              type="checkbox"
              name="remember"
              checked={formData.remember}
              onChange={handleChange}
              className="auth-checkbox"
            />
            <span>Remember me</span>
          </label>

          <Link to="/forgot-password" className="auth-forgot-link">
            Forgot password?
          </Link>
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="auth-submit-btn"
          isLoading={isLoading}
        >
          Sign In
        </Button>
      </form>

      <div className="auth-footer-prompt">
        <span>Don't have an account? </span>
        <Link to="/register" className="auth-accent-link">
          Create account
        </Link>
      </div>
    </div>
  );
};

export default LoginPage;
