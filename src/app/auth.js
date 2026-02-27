'use strict';

const oauthPlugin = require('@fastify/oauth2');

/**
 * Register OAuth2 login and callback routes. When OAUTH2_CLIENT_ID and OAUTH2_CLIENT_SECRET
 * are set, registers GET /auth/login/:provider and GET /auth/callback/:provider (e.g. google).
 * Callback exchanges the code, fetches user profile, signs a JWT with config.jwtSecret, and returns { token }.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} config - must have jwtSecret; for OAuth2: oauth2ClientId, oauth2ClientSecret, oauth2CallbackBaseUrl, oauth2Provider (default 'google')
 */
async function registerAuth(app, config) {
  const clientId = config.oauth2ClientId || process.env.OAUTH2_CLIENT_ID;
  const clientSecret = config.oauth2ClientSecret || process.env.OAUTH2_CLIENT_SECRET;
  const callbackBaseUrl = (config.oauth2CallbackBaseUrl || process.env.OAUTH2_CALLBACK_BASE_URL || '').replace(/\/$/, '');
  const provider = (config.oauth2Provider || process.env.OAUTH2_PROVIDER || 'google').toLowerCase();

  if (!clientId || !clientSecret || !callbackBaseUrl) {
    app.log?.info?.('OAuth2 not configured (missing OAUTH2_CLIENT_ID, OAUTH2_CLIENT_SECRET, or OAUTH2_CALLBACK_BASE_URL); auth routes skipped');
    return;
  }

  const callbackUri = `${callbackBaseUrl}/auth/callback/${provider}`;
  const authConfig = provider === 'github' ? oauthPlugin.GITHUB_CONFIGURATION : oauthPlugin.GOOGLE_CONFIGURATION;
  const pluginName = `${provider}OAuth2`;

  await app.register(oauthPlugin, {
    name: pluginName,
    scope: provider === 'google' ? ['profile', 'email'] : ['user:email'],
    credentials: {
      client: { id: clientId, secret: clientSecret },
      auth: authConfig,
    },
    startRedirectPath: `/auth/login/${provider}`,
    callbackUri,
  });

  app.get(`/auth/callback/${provider}`, async function (request, reply) {
    try {
      const result = await this[pluginName].getAccessTokenFromAuthorizationCodeFlow(request);
      const accessToken = result.token?.access_token;
      if (!accessToken) {
        reply.code(500);
        return { error: 'No access token in OAuth response' };
      }

      let sub = '';
      let email = '';
      if (provider === 'google') {
        const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
          reply.code(500);
          return { error: 'Failed to fetch Google userinfo' };
        }
        const user = await res.json();
        sub = user.id || user.sub || user.email || '';
        email = user.email || '';
      } else if (provider === 'github') {
        const res = await fetch('https://api.github.com/user', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
          reply.code(500);
          return { error: 'Failed to fetch GitHub user' };
        }
        const user = await res.json();
        sub = String(user.id ?? user.login ?? '');
        email = user.email || '';
      }

      const jwtSecret = config.jwtSecret || process.env.JWT_SECRET;
      if (!jwtSecret) {
        reply.code(500);
        return { error: 'JWT_SECRET not configured' };
      }
      const token = app.jwt.sign({ sub, email }, { expiresIn: '7d' });
      return { token };
    } catch (err) {
      app.log?.error?.(err, 'OAuth2 callback error');
      reply.code(500);
      return { error: err.message || 'OAuth2 callback failed' };
    }
  });
}

module.exports = { registerAuth };
