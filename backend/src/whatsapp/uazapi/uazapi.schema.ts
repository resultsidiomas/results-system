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
    /**
     * `true` = mensagem saiu pela própria API (eco da resposta da IA), `false`
     * = pessoa digitou no WhatsApp. Sem isso não havia como distinguir os dois
     * `fromMe`, e o agente se auto-pausava depois de cada resposta.
     * Opcional/default: instância antiga da UAZAPI pode não mandar o campo —
     * nesse caso `fromMe` volta a ser tratado como atendimento humano, que é o
     * lado seguro (pausa a IA em vez de responder por cima de uma pessoa).
     */
    wasSentByApi: z.boolean().default(false),
    isGroup: z.boolean().default(false),
    source: z.string().default(''),
  }),
});

export type UazapiWebhookPayload = z.infer<typeof uazapiWebhookSchema>;
