import 'server-only';

/**
 * The public address of the app, for links that leave it (Google's redirect, links in e-mails).
 * Fixed in config, so a forged Host header can't change where people are sent.
 */
export function appUrl() {
  const url = process.env.APP_URL;
  if (url) return new URL(url);
  if (process.env.NODE_ENV === 'production') throw new Error('APP_URL is not set');
  return new URL('http://localhost:3000');
}
