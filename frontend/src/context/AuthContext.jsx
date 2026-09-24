import React, { useState, useEffect, useCallback } from 'react';
import { AuthContext } from './auth-context';
import authService, { AUTH_TOKEN_KEY } from '../services/authService';

/**
 * Authentication Provider
 *
 * Manages global authentication state, token persistence, and session verification via Laravel Sanctum.
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem(AUTH_TOKEN_KEY));
  const [isLoading, setIsLoading] = useState(() => Boolean(localStorage.getItem(AUTH_TOKEN_KEY)));

  // Initialize and verify authentication state on mount
  const refreshUser = useCallback(async () => {
    const storedToken = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!storedToken) {
      setUser(null);
      setToken(null);
      setIsLoading(false);
      return;
    }

    try {
      const response = await authService.getCurrentUser();
      const userData = response.data?.user || response.data || null;
      setUser(userData);
      setToken(storedToken);
    } catch {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      setUser(null);
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      if (localStorage.getItem(AUTH_TOKEN_KEY)) {
        try {
          const response = await authService.getCurrentUser();
          if (isMounted) {
            setUser(response.data?.user || response.data || null);
          }
        } catch {
          if (isMounted) {
            localStorage.removeItem(AUTH_TOKEN_KEY);
            setUser(null);
            setToken(null);
          }
        } finally {
          if (isMounted) {
            setIsLoading(false);
          }
        }
      } else {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    init();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (credentials) => {
    const data = await authService.login(credentials);
    const newToken = data.data?.token || localStorage.getItem(AUTH_TOKEN_KEY);
    const newUser = data.data?.user || null;
    setToken(newToken);
    setUser(newUser);
    return data;
  };

  const register = async (payload) => {
    const data = await authService.register(payload);
    const newToken = data.data?.token || localStorage.getItem(AUTH_TOKEN_KEY);
    const newUser = data.data?.user || null;
    setToken(newToken);
    setUser(newUser);
    return data;
  };

  const logout = async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
      setToken(null);
    }
  };

  const value = {
    user,
    token,
    isAuthenticated: Boolean(token && user),
    isLoading,
    login,
    register,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthProvider;
