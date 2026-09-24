import axios from 'axios';

/**
 * Centralized Axios HTTP Client for NEXORA
 *
 * Why centralize?
 * 1. Single source of truth for the API base URL (VITE_API_BASE_URL).
 * 2. Uniform headers (Content-Type, Accept) sent with every HTTP request.
 * 3. Consistent timeout handling and global response error interception.
 * 4. Enables seamless future expansion (attaching Sanctum bearer tokens).
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8001/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000, // 10 second timeout to prevent hanging UI
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Response interceptor: Normalizes errors for downstream React consumers
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Standardize error message extraction
    const customError = {
      status: error.response ? error.response.status : null,
      message:
        error.response?.data?.message ||
        (error.code === 'ERR_NETWORK'
          ? 'Network Error: Cannot connect to Laravel backend. Verify backend is running on port 8001.'
          : error.message || 'An unexpected error occurred.'),
      data: error.response?.data || null,
      isNetworkError: !error.response,
    };

    return Promise.reject(customError);
  }
);

export default apiClient;
