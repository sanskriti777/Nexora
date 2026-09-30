/**
 * Express Authentication Middleware
 *
 * Validates Sanctum Bearer token on incoming HTTP requests against Laravel /api/me.
 * Never trusts client-supplied user IDs.
 */
export function createAuthMiddleware(options = {}) {
  const getLaravelApiUrl = () => {
    return (options.laravelApiUrl || process.env.LARAVEL_API_URL || 'http://127.0.0.1:8001').replace(/\/+$/, '');
  };

  return async (req, res, next) => {
    try {
      const authHeader = req.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required: Missing token',
        });
      }

      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required: Missing token',
        });
      }

      const laravelUrl = getLaravelApiUrl();
      let response;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 5000);

        response = await fetch(`${laravelUrl}/api/me`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timeout);
      } catch (networkError) {
        console.error('[HTTP Auth] Authentication service unreachable');
        return res.status(503).json({
          success: false,
          message: 'Authentication error: Auth service unreachable',
        });
      }

      if (!response.ok) {
        return res.status(401).json({
          success: false,
          message: 'Authentication failed: Invalid or expired token',
        });
      }

      const body = await response.json();
      const user = body?.data?.user || body?.user;

      if (!user || !user.id) {
        return res.status(401).json({
          success: false,
          message: 'Authentication failed: Invalid user profile returned',
        });
      }

      req.user = {
        id: user.id,
        name: user.name,
        email: user.email,
      };
      req.token = token;

      next();
    } catch (err) {
      console.error('[HTTP Auth] Internal error during request authentication');
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };
}

export default createAuthMiddleware;
