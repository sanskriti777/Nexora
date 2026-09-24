import apiClient from './api';

/**
 * Health Service
 *
 * Interacts with Laravel API health check endpoint: GET /api/health
 * Returns server operational status and message.
 */
export const checkApiHealth = async () => {
  const startTime = performance.now();
  const response = await apiClient.get('/health');
  const durationMs = Math.round(performance.now() - startTime);

  return {
    data: response.data,
    status: response.status,
    statusText: response.statusText,
    latencyMs: durationMs,
    timestamp: new Date().toISOString(),
  };
};
