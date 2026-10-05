import { NextResponse, type NextRequest } from 'next/server';
import * as oidc from 'openid-client';
import { z } from 'zod';
import { and, eq, getDb, normalizeEmail, oauthAccounts, teacherProfiles, users } from '@teaching/db';
import { verifyPayload } from '@teaching/shared/ticket';
import { OAUTH_COOKIE, appUrl, googleConfig, googleEnabled } from '@/lib/google';
import { sessionSecret } from '@/lib/secrets';
import { createSession } from '@/lib/session';

// Step 2 of "Sign in with Google": Google sends the browser back here with a one-time code.
// openid-client exchanges it for tokens and checks the ID token (Google's signature, issuer,
// audience, expiry, nonce) together with state and PKCE before we trust anything in it.

const Flow = z.object({ codeVerifier: z.string(), state: z.string(), nonce: z.string(), exp: z.number() });

export async function GET(request: NextRequest) {
  const login = (error: string) => {
    const res = NextResponse.redirect(new URL(`/logowanie?blad=${error}`, appUrl()), 303);
    res.cookies.delete(OAUTH_COOKIE);
    return res;
  };
  if (!googleEnabled()) return login('google-wylaczone');

  // The person closed or cancelled Google's screen.
  if (request.nextUrl.searchParams.get('error')) return login('google-anulowano');

  const flow = Flow.safeParse(verifyPayload(request.cookies.get(OAUTH_COOKIE)?.value ?? '', sessionSecret()));
  if (!flow.success || flow.data.exp < Date.now()) return login('google-wygaslo');

  let claims: oidc.IDToken;
  try {
    const config = await googleConfig();
    // Rebuild the URL on our public address (behind a proxy, request.url can show an internal host).
    const currentUrl = new URL(request.nextUrl.pathname + request.nextUrl.search, appUrl());
    const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: flow.data.codeVerifier,
      expectedState: flow.data.state,
      expectedNonce: flow.data.nonce,
      idTokenExpected: true,
    });
    const idClaims = tokens.claims();
    if (!idClaims) return login('google');
    claims = idClaims;
  } catch (e) {
    console.warn('Google sign-in failed:', (e as Error).message); // never log tokens or codes
    return login('google');
  }

  const googleId = claims.sub;
  const email = typeof claims.email === 'string' ? normalizeEmail(claims.email) : null;
  if (!email || claims.email_verified !== true) return login('google-email');

  const db = getDb();

  // 1. This Google account is already linked to someone.
  let [linked] = await db
    .select({ userId: oauthAccounts.userId })
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.provider, 'google'), eq(oauthAccounts.providerUserId, googleId)));

  // 2. First Google sign-in: link it to the account (teacher or student) with the same (Google-verified) e-mail.
  if (!linked) {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (user) {
      await db.insert(oauthAccounts).values({ provider: 'google', providerUserId: googleId, userId: user.id }).onConflictDoNothing();
      linked = { userId: user.id };
    }
  }

  // 3. No account yet. Sign-up stays closed unless ALLOW_GOOGLE_SIGNUP=true.
  if (!linked) {
    if (process.env.ALLOW_GOOGLE_SIGNUP !== 'true') return login('brak-konta');
    const name = (typeof claims.given_name === 'string' ? claims.given_name : typeof claims.name === 'string' ? claims.name : email.split('@')[0]).slice(0, 40);
    linked = await db.transaction(async tx => {
      const [user] = await tx.insert(users).values({ email, displayName: name, role: 'teacher' }).returning({ id: users.id });
      await tx.insert(teacherProfiles).values({ userId: user.id });
      await tx.insert(oauthAccounts).values({ provider: 'google', providerUserId: googleId, userId: user.id });
      return { userId: user.id };
    });
  }

  const [account] = await db
    .select({ role: users.role, teacher: teacherProfiles.userId })
    .from(users)
    .leftJoin(teacherProfiles, eq(teacherProfiles.userId, users.id))
    .where(eq(users.id, linked.userId));
  if (!account || (account.role === 'teacher' && !account.teacher)) return login('brak-konta');

  await createSession(linked.userId);
  const res = NextResponse.redirect(new URL(account.role === 'teacher' ? '/panel' : '/uczen', appUrl()), 303);
  res.cookies.delete(OAUTH_COOKIE);
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
