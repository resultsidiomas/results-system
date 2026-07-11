import Fastify from 'fastify';
import corsPlugin from '../../src/plugins/cors.plugin.js';
import errorHandlerPlugin from '../../src/plugins/error-handler.plugin.js';
import { uazapiWebhookRoute } from '../../src/whatsapp/uazapi/uazapi.webhook.js';
import { env } from '../../src/config/env.js';

const app = Fastify({ logger: false });
await app.register(corsPlugin);
await app.register(errorHandlerPlugin);
await app.register(uazapiWebhookRoute);

const r1 = await app.inject({
  method: 'POST',
  url: '/api/v1/webhook/whatsapp',
  payload: {},
});
console.log('no-token:', r1.statusCode, r1.body);

const r2 = await app.inject({
  method: 'POST',
  url: '/api/v1/webhook/whatsapp',
  headers: { 'x-webhook-token': env.UAZAPI_WEBHOOK_SECRET },
  payload: { foo: 'bar' },
});
console.log('invalid-payload:', r2.statusCode, r2.body);

const r3 = await app.inject({
  method: 'POST',
  url: '/api/v1/webhook/whatsapp',
  headers: { 'x-webhook-token': env.UAZAPI_WEBHOOK_SECRET },
  payload: {
    instanceName: 'outra-instancia',
    chat: { wa_chatid: '5511999999999@s.whatsapp.net', wa_name: 'Teste' },
    message: {
      id: 'abc123',
      content: 'oi',
      messageType: 'conversation',
      fromMe: false,
      chatid: '5511999999999@s.whatsapp.net',
    },
  },
});
console.log('unknown-instance:', r3.statusCode, r3.body);

// Matching instance -> exercises contact lookup/create (real Supabase call).
// A network/DB error here means Supabase isn't reachable from this env —
// not a bug in the guard chain, just an infra check.
try {
  const r4 = await app.inject({
    method: 'POST',
    url: '/api/v1/webhook/whatsapp',
    headers: { 'x-webhook-token': env.UAZAPI_WEBHOOK_SECRET },
    payload: {
      instanceName: env.UAZAPI_INSTANCE,
      chat: { wa_chatid: '5511988887777@s.whatsapp.net', wa_name: 'Smoke Test' },
      message: {
        id: 'smoke-test-001',
        content: 'oi, quero saber sobre cursos de inglês',
        messageType: 'conversation',
        fromMe: false,
        chatid: '5511988887777@s.whatsapp.net',
      },
    },
  });
  console.log('matching-instance:', r4.statusCode, r4.body);
} catch (err) {
  console.log('matching-instance: threw', (err as Error).message);
}

await app.close();
