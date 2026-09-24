import React from 'react';
import { Outlet } from 'react-router-dom';

/**
 * Authentication Layout Component
 *
 * Dedicated layout for Login, Register, Forgot Password, and Reset Password pages.
 */
export const AuthLayout = () => {
  return (
    <div className="auth-layout-container">
      <div className="auth-card-wrapper">
        <Outlet />
      </div>
    </div>
  );
};

export default AuthLayout;
