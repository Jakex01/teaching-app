import { NextResponse } from 'next/server';
import * as oidc from 'openid-client';
import { signPayload } from '@teaching/shared/ticket';
import { OAUTH_COOKIE, appUrl, googleConfig, googleEnabled, googleRedirectUri } from '@/lib/google';
import { sessionSecret } from '@/lib/secrets';

// Step 1 of "Sign in with Google": remember fresh one-time values in a short-lived cookie and send the
// browser to Google. Step 2 is ./callback/route.ts.

export async function GET() {
  const login = (error: string) => NextResponse.redirect(new URL(`/logowanie?blad=${error}`, appUrl()), 303);
  if (!googleEnabled()) return login('google-wylaczone');

  let config: oidc.Configuration;
  try {
    config = await googleConfig();
  } catch (e) {
    console.warn('Google sign-in unavailable:', (e as Error).message);
    return login('google');
  }

  // New for every attempt. PKCE ties the code to this browser, state stops CSRF, nonce stops replayed tokens.
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();

  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: googleRedirectUri(),
    scope: 'openid email profile',
    code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
    code_challenge_method: 'S256',
    state,
    nonce,
    prompt: 'select_account',
  });

  const res = NextResponse.redirect(url, 303);
  res.cookies.set(OAUTH_COOKIE, signPayload({ codeVerifier, state, nonce, exp: Date.now() + 10 * 60_000 }, sessionSecret()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // Lax: the cookie is still sent when Google sends the browser back (a top-level navigation).
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60,
  });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
