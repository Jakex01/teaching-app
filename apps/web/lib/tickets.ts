import 'server-only';
import type { Role } from '@teaching/shared';
import { signTicket } from '@teaching/shared/ticket';
import { syncSecret } from './secrets';

/** Signed pass for the sync server: which notebook room, and who is joining it. */
export function boardTicket(room: string, who: { uid: string; name: string; role: Role; color: string }) {
  return signTicket({ room, uid: who.uid, name: who.name.slice(0, 24), role: who.role, color: who.color }, syncSecret());
}
