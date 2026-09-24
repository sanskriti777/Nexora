import axios from 'axios';

/**
 * Centralized Axios HTTP Client for NEXORA
 *
 * Configures base URL, uniform headers, timeout, authentication bearer tokens,
 * and standardizes error responses.
 */

export const AUTH_TOKEN_KEY = 'nexora_auth_token';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8001/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Request interceptor: Automatically attach Laravel Sanctum bearer token if present
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: Normalizes errors and handles 401 unauthorized revocation
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }

    const customError = {
      status: error.response ? error.response.status : null,
      message:
        error.response?.data?.message ||
        (error.code === 'ERR_NETWORK'
          ? 'Network Error: Cannot connect to Laravel backend. Verify backend is running on port 8001.'
          : error.message || 'An unexpected error occurred.'),
      data: error.response?.data || null,
      errors: error.response?.data?.errors || null,
      isNetworkError: !error.response,
    };

    return Promise.reject(customError);
  }
);

export default apiClient;
