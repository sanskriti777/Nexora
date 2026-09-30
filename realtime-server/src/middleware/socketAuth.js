/**
 * Socket.IO Authentication Middleware
 *
 * Validates client credentials against Laravel Sanctum.
 * Rejects unauthenticated connections and populates socket.data.user with verified identity.
 *
 * NEVER logs, broadcasts, or exposes raw authentication tokens.
 */
export function createSocketAuthMiddleware(options = {}) {
  const getLaravelApiUrl = () => {
    return options.laravelApiUrl || process.env.LARAVEL_API_URL || 'http://127.0.0.1:8001';
  };

  return async (socket, next) => {
    try {
      // 1. Extract token from handshake auth payload or authorization header
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers?.authorization
          ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '').trim()
          : null);

      if (!token || typeof token !== 'string' || token.trim() === '') {
        return next(new Error('Authentication required: Missing token'));
      }

      const laravelUrl = getLaravelApiUrl();
      const meEndpoint = `${laravelUrl.replace(/\/+$/, '')}/api/me`;

      // 2. Validate token against Laravel /api/me
      let response;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || 5000);

        response = await fetch(meEndpoint, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token.trim()}`,
            'Accept': 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
      } catch (networkError) {
        // Network or timeout failure connecting to Laravel
        console.error('[SocketAuth] Authentication service unreachable');
        return next(new Error('Authentication error: Auth service unreachable'));
      }

      // 3. Handle rejection from Laravel (401, 403, etc.)
      if (!response.ok) {
        return next(new Error('Authentication failed: Invalid or expired token'));
      }

      const body = await response.json();
      const user = body?.data?.user || body?.user;

      if (!user || !user.id) {
        return next(new Error('Authentication failed: Invalid user profile returned'));
      }

      // 4. Attach only safe identity data to socket.data.user
      socket.data.user = {
        id: user.id,
        name: user.name,
        email: user.email,
      };
      // Store token internally on socket for authoritative workspace permission validation
      socket.data.token = token.trim();

      return next();
    } catch (err) {
      console.error('[SocketAuth] Internal error during handshake validation');
      return next(new Error('Authentication failed: Internal error'));
    }
  };
}

export default createSocketAuthMiddleware;
