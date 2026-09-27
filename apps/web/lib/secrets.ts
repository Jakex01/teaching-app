import 'server-only';

// Secrets come from environment variables. `npm run dev` uses fixed dev values; a production build refuses to run without them.
function secret(name: string, devValue: string) {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === 'development') return devValue;
  throw new Error(`${name} is not set`);
}

/** Signs join tickets for the sync server. Must be the same value in apps/sync. */
export const syncSecret = () => secret('SYNC_SECRET', 'dev-only-sync-secret');

/** Signs the student session cookie. */
export const sessionSecret = () => secret('SESSION_SECRET', 'dev-only-session-secret');
