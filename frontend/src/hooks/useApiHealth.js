import { useState, useEffect, useCallback } from 'react';
import { checkApiHealth } from '../services/healthService';

/**
 * useApiHealth Hook
 *
 * Manages the state machine for testing Laravel API connectivity:
 * States:
 * - isLoading: boolean (true while HTTP request is in-flight)
 * - isSuccess: boolean (true if HTTP 200 returned)
 * - isError: boolean (true if request failed or backend unreachable)
 * - data: object | null (parsed JSON payload from Laravel)
 * - error: object | null (error details)
 * - refetch: function (allows user to trigger manual re-check)
 */
export const useApiHealth = (autoFetch = true) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await checkApiHealth();
      setData(result);
    } catch (err) {
      setError(err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoFetch) {
      fetchHealth();
    }
  }, [autoFetch, fetchHealth]);

  return {
    loading,
    data,
    error,
    refetch: fetchHealth,
    isConnected: !loading && !error && data?.data?.success === true,
  };
};
