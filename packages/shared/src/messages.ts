// Live-sync messages between the browser and the sync server.

import { z } from 'zod';
import { ElementSchema, LIMITS, coord, elementId, hexColor, roomId } from './elements';

export const RoleSchema = z.enum(['teacher', 'student']);
export type Role = z.infer<typeof RoleSchema>;

export const UserSchema = z.object({
  id: z.string(),
  name: z.string().max(LIMITS.name),
  role: RoleSchema,
  color: hexColor,
});
export type User = z.infer<typeof UserSchema>;

// Strips control characters so names can't break layouts or logs.
export const DisplayNameSchema = z.string()
  .transform(s => s.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().slice(0, LIMITS.name))
  .pipe(z.string().min(1));

export const FollowCameraSchema = z.discriminatedUnion('on', [
  z.object({ on: z.literal(true), cx: coord, cy: coord, z: z.number().min(0.1).max(5) }),
  z.object({ on: z.literal(false) }),
]);
export type FollowCamera = z.infer<typeof FollowCameraSchema>;

// Browser -> server
export const ClientMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('join'), room: roomId, name: DisplayNameSchema, role: RoleSchema, color: hexColor }),
  // Join with a ticket signed by the web app (required for student notebooks).
  z.object({ t: z.literal('join-ticket'), ticket: z.string().min(1).max(4000) }),
  z.object({ t: z.literal('upsert'), els: z.array(ElementSchema).min(1).max(LIMITS.batch) }),
  z.object({ t: z.literal('delete'), ids: z.array(elementId).min(1).max(LIMITS.elementsPerRoom) }),
  z.object({ t: z.literal('clear') }),
  z.object({ t: z.literal('cursor'), x: coord, y: coord }),
  z.object({ t: z.literal('follow'), cam: FollowCameraSchema }),
]);
export type ClientMessage = z.input<typeof ClientMessageSchema>;

// Server -> browser
export const ServerMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('init'), you: UserSchema, elements: z.array(ElementSchema), users: z.array(UserSchema) }),
  z.object({ t: z.literal('presence'), users: z.array(UserSchema) }),
  z.object({ t: z.literal('upsert'), els: z.array(ElementSchema), by: z.string() }),
  z.object({ t: z.literal('delete'), ids: z.array(elementId), by: z.string() }),
  z.object({ t: z.literal('clear'), by: z.string() }),
  z.object({ t: z.literal('cursor'), id: z.string(), x: coord, y: coord }),
  z.object({ t: z.literal('bye'), id: z.string() }),
  z.object({ t: z.literal('follow'), id: z.string(), cam: FollowCameraSchema }),
  z.object({ t: z.literal('error'), msg: z.string().max(200) }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
