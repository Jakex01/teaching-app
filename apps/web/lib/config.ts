// Server-side configuration read from environment variables.

import { z } from 'zod';

const Env = z.object({
  SYNC_PUBLIC_URL: z.string().url().refine(u => /^wss?:\/\//.test(u), 'Must start with ws:// or wss://')
    .default('ws://localhost:3001/ws'),
});

export const config = Env.parse({
  SYNC_PUBLIC_URL: process.env.SYNC_PUBLIC_URL || undefined,
});
