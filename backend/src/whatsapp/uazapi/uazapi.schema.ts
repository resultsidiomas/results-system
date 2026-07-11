import { z } from 'zod';

export const uazapiWebhookSchema = z.object({
  instanceName: z.string().min(1),
  chat: z.object({
    wa_chatid: z.string().min(1),
    wa_name: z.string().default(''),
  }),
  message: z.object({
    id: z.string().min(1),
    content: z.string().default(''),
    messageType: z.string().min(1),
    fromMe: z.boolean(),
    chatid: z.string().min(1),
  }),
});

export type UazapiWebhookPayload = z.infer<typeof uazapiWebhookSchema>;
