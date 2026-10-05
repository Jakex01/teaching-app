import crypto from 'node:crypto';

// The example teacher in the local development database (created by the seed).
export const DEV_TEACHER_ID = '00000000-0000-4000-8000-000000000001';
export const DEV_TEACHER_EMAIL = 'dev-teacher@teaching.local';
/** Local development database only (set by the seed). Production accounts are made with `npm run teacher:create`. */
export const DEV_TEACHER_PASSWORD = 'doodle-dev-password';

// Unguessable live-sync room for a student's board. Fits the sync server's room id rules ([a-z0-9-]).
export const newRoomId = () => `b-${crypto.randomBytes(10).toString('hex')}`;
