import crypto from 'node:crypto';

// The teacher you're signed in as during development, until real login exists (task B2).
export const DEV_TEACHER_ID = '00000000-0000-4000-8000-000000000001';

// Unguessable live-sync room for a student's board. Fits the sync server's room id rules ([a-z0-9-]).
export const newRoomId = () => `b-${crypto.randomBytes(10).toString('hex')}`;
