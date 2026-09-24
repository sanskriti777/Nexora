import apiClient, { AUTH_TOKEN_KEY } from './api';

export { AUTH_TOKEN_KEY };

/**
 * Authentication Service
 *
 * Communicates with Laravel Sanctum authentication endpoints.
 */
export const authService = {
  /**
   * Log in user with credentials
   */
  login: async (credentials) => {
    const response = await apiClient.post('/login', credentials);
    const token = response.data?.data?.token;
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    }
    return response.data;
  },

  /**
   * Register a new user
   */
  register: async (payload) => {
    const response = await apiClient.post('/register', payload);
    const token = response.data?.data?.token;
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    }
    return response.data;
  },

  /**
   * Retrieve current authenticated user profile
   */
  getCurrentUser: async () => {
    const response = await apiClient.get('/me');
    return response.data;
  },

  /**
   * Log out and invalidate Sanctum token
   */
  logout: async () => {
    try {
      await apiClient.post('/logout');
    } finally {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  },

  /**
   * Helper to check if a token exists in local storage
   */
  hasToken: () => {
    return Boolean(localStorage.getItem(AUTH_TOKEN_KEY));
  },

  /**
   * Get raw token string
   */
  getToken: () => {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  },
};

export default authService;
