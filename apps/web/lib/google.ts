import 'server-only';
import * as oidc from 'openid-client';
import { appUrl } from './app-url';

export { appUrl };

// "Sign in with Google" via OpenID Connect (authorization code flow with PKCE, state and nonce).
// Keys come from the environment (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET), never from the code.

/** Short-lived cookie that carries PKCE verifier, state and nonce between the two steps. */
export const OAUTH_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-oauth-google' : 'oauth-google';

export const googleEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/** Must be registered in Google Cloud: Clients → doodle → Authorized redirect URIs. */
export const googleRedirectUri = () => new URL('/api/auth/google/callback', appUrl()).href;

let config: Promise<oidc.Configuration> | null = null;

/** Google's OpenID configuration (endpoints and signing keys), fetched once. */
export function googleConfig() {
  config ??= oidc
    .discovery(new URL('https://accounts.google.com'), process.env.GOOGLE_CLIENT_ID!, process.env.GOOGLE_CLIENT_SECRET!)
    .catch(err => { config = null; throw err; }); // try again next time instead of caching a failure
  return config;
}
