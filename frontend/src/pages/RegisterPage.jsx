import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

/**
 * Enterprise Registration Page Component
 *
 * Implements real Laravel Sanctum registration.
 * All fields start empty with zero mock values.
 */
export const RegisterPage = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    password_confirmation: '',
    agreeTerms: false,
  });

  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
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

    const errors = {};
    if (!formData.name.trim()) {
      errors.name = 'Full name is required.';
    }

    if (!formData.email.trim()) {
      errors.email = 'Email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Enter a valid email address.';
    }

    if (!formData.password) {
      errors.password = 'Password is required.';
    } else if (formData.password.length < 8) {
      errors.password = 'Password must be at least 8 characters.';
    }

    if (!formData.password_confirmation) {
      errors.password_confirmation = 'Please confirm your password.';
    } else if (formData.password !== formData.password_confirmation) {
      errors.password_confirmation = 'Passwords do not match.';
    }

    if (!formData.agreeTerms) {
      errors.agreeTerms = 'You must agree to the Terms of Service to continue.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setIsLoading(true);

    try {
      await register({
        name: formData.name.trim(),
        email: formData.email.trim(),
        password: formData.password,
        password_confirmation: formData.password_confirmation,
      });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (err.errors) {
        setFieldErrors(err.errors);
      }
      setServerError(err.message || 'Registration failed. Please check your information and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-card card" id="register-container">
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
        <h1 className="auth-title">Create your account</h1>
        <p className="auth-subtitle">Get started with your Nexora workspace</p>
      </div>

      {/* Global Server Error */}
      {serverError && (
        <div className="auth-alert auth-alert-danger" role="alert">
          <span className="auth-alert-icon">⚠️</span>
          <span>{serverError}</span>
        </div>
      )}

      {/* Register Form */}
      <form onSubmit={handleSubmit} className="auth-form" noValidate>
        <Input
          label="Full Name"
          id="name"
          name="name"
          type="text"
          placeholder="e.g. Jane Doe"
          value={formData.name}
          onChange={handleChange}
          error={fieldErrors.name}
          required
          autoComplete="name"
          autoFocus
        />

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
        />

        <Input
          label="Password"
          id="password"
          name="password"
          type="password"
          placeholder="Minimum 8 characters"
          value={formData.password}
          onChange={handleChange}
          error={fieldErrors.password}
          required
          autoComplete="new-password"
        />

        <Input
          label="Confirm Password"
          id="password_confirmation"
          name="password_confirmation"
          type="password"
          placeholder="Re-enter password"
          value={formData.password_confirmation}
          onChange={handleChange}
          error={fieldErrors.password_confirmation}
          required
          autoComplete="new-password"
        />

        <div className="form-group">
          <label className="auth-checkbox-label">
            <input
              type="checkbox"
              name="agreeTerms"
              checked={formData.agreeTerms}
              onChange={handleChange}
              className="auth-checkbox"
            />
            <span className="auth-terms-text">
              I agree to the Terms of Service and Privacy Policy
            </span>
          </label>
          {fieldErrors.agreeTerms && (
            <span className="form-error-text">{fieldErrors.agreeTerms}</span>
          )}
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="auth-submit-btn"
          isLoading={isLoading}
        >
          Create Account
        </Button>
      </form>

      <div className="auth-footer-prompt">
        <span>Already have an account? </span>
        <Link to="/login" className="auth-accent-link">
          Sign In
        </Link>
      </div>
    </div>
  );
};

export default RegisterPage;
