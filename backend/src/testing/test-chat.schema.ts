import { z } from 'zod';

export const testChatSessionIdSchema = z
  .string()
  .regex(/^[a-zA-Z0-9-]{1,64}$/, 'invalid session id');

export const testChatMessageBodySchema = z.object({
  message: z.string().min(1).max(2000),
});
