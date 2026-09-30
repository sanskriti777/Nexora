import { getAccessibleWorkspaces, hasWorkspaceAccess } from '../utils/workspaceAuth.js';

/**
 * Workspace Context & Authorization Middleware
 *
 * Resolves active workspace using established priority:
 * 1. X-Workspace-Id header
 * 2. workspace_id query parameter (or body workspaceId)
 * 3. Fallback to first accessible workspace
 *
 * Validates that authenticated user actually belongs to or owns the workspace.
 * Rejects cross-workspace access with 403 Forbidden.
 */
export function createWorkspaceMiddleware(options = {}) {
  const getLaravelApiUrl = () => {
    return options.laravelApiUrl || process.env.LARAVEL_API_URL || 'http://127.0.0.1:8001';
  };

  return async (req, res, next) => {
    try {
      const token = req.token;
      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
      }

      const laravelUrl = getLaravelApiUrl();

      // Priority 1: X-Workspace-Id header
      let workspaceId = req.headers['x-workspace-id'];

      // Priority 2: query parameter or body
      if (!workspaceId) {
        workspaceId = req.query?.workspace_id || req.body?.workspaceId;
      }

      // Priority 3: Fallback to user's first accessible workspace
      if (!workspaceId) {
        const accessible = await getAccessibleWorkspaces(token, laravelUrl);
        if (accessible.length === 0) {
          return res.status(403).json({
            success: false,
            message: 'No accessible workspaces found for this user',
          });
        }
        workspaceId = accessible[0].id;
      }

      const parsedId = parseInt(workspaceId, 10);
      if (isNaN(parsedId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid workspace ID format',
        });
      }

      // Check authoritative access
      const isAllowed = await hasWorkspaceAccess(token, parsedId, laravelUrl);
      if (!isAllowed) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You do not have access to this workspace',
        });
      }

      req.workspaceId = parsedId;
      next();
    } catch (err) {
      console.error('[Workspace Middleware] Error validating workspace access:', err.message);
      return res.status(500).json({
        success: false,
        message: 'Internal server error resolving workspace context',
      });
    }
  };
}

export default createWorkspaceMiddleware;
