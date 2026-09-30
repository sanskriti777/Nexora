/**
 * Workspace Authorization & Access Validator
 *
 * Verifies that the authenticated user has access to the requested workspace
 * using Laravel as the authoritative source of truth.
 */

const workspaceCache = new Map(); // token -> { workspaces, timestamp }
const CACHE_TTL_MS = 30000; // 30 seconds

/**
 * Fetch accessible workspaces for an authenticated user token
 *
 * @param {string} token
 * @param {string} [laravelApiUrl]
 * @returns {Promise<Array<{ id: number, name: string }>>}
 */
export async function getAccessibleWorkspaces(token, laravelApiUrl) {
  const baseUrl = (laravelApiUrl || process.env.LARAVEL_API_URL || 'http://127.0.0.1:8001').replace(/\/+$/, '');
  const cached = workspaceCache.get(token);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.workspaces;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${baseUrl}/api/workspaces`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return [];
    }

    const body = await res.json();
    const workspaces = Array.isArray(body?.data) ? body.data : [];

    workspaceCache.set(token, {
      workspaces,
      timestamp: Date.now(),
    });

    return workspaces;
  } catch (err) {
    console.error('[WorkspaceAuth] Error fetching workspaces from Laravel:', err.message);
    return [];
  }
}

/**
 * Check if the user has access to a specific workspaceId
 *
 * @param {string} token
 * @param {number} workspaceId
 * @param {string} [laravelApiUrl]
 * @returns {Promise<boolean>}
 */
export async function hasWorkspaceAccess(token, workspaceId, laravelApiUrl) {
  if (!token || !workspaceId) return false;
  const workspaces = await getAccessibleWorkspaces(token, laravelApiUrl);
  const targetId = Number(workspaceId);
  return workspaces.some((ws) => Number(ws.id) === targetId);
}

/**
 * Clear cached workspaces for testing or logout
 */
export function clearWorkspaceCache() {
  workspaceCache.clear();
}

export default {
  getAccessibleWorkspaces,
  hasWorkspaceAccess,
  clearWorkspaceCache,
};
