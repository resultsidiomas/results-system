import Fastify from 'fastify';
import errorHandlerPlugin from '../../src/plugins/error-handler.plugin.js';
import { n8nAgentRoutes } from '../../src/integrations/n8n-agent/n8n-agent.routes.js';
import { env } from '../../src/config/env.js';
import { redis } from '../../src/config/redis.js';

/**
 * Trava do contrato que o fluxo do n8n depende.
 *
 * O node do agente no n8n chama estas rotas com estes campos e lê estas chaves
 * da resposta. Nada disso aparece em teste de unidade de agente, então uma
 * renomeação de rota ou de campo passaria batida no build e só quebraria em
 * produção, com lead do outro lado.
 *
 * Só o que roda sem serviço externo: caminho da rota, autenticação e validação
 * de corpo. O caminho feliz precisa de OpenAI, Supabase e Redis de verdade e
 * vive nos evals (`npm run eval:commercial`).
 */
let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures += 1;
  console.log(
    `${label}: ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)}) ${pass ? 'PASS' : 'FAIL'}`,
  );
}

const app = Fastify({ logger: false });
await app.register(errorHandlerPlugin);
await app.register(n8nAgentRoutes);
await app.ready();

// ---------- caminho das rotas ----------

const unknownRoute = await app.inject({ method: 'POST', url: '/api/v1/n8n-agent/rodar' });
check('rota inexistente devolve 404 (prova que o 404 abaixo seria real)', unknownRoute.statusCode, 404);

const runNoAuth = await app.inject({
  method: 'POST',
  url: '/api/v1/n8n-agent/run',
  payload: { message: 'oi', sessionId: '5511999999999@s.whatsapp.net' },
});
check('POST /api/v1/n8n-agent/run existe', runNoAuth.statusCode !== 404, true);
check('run exige x-internal-key', runNoAuth.statusCode, 401);

const priceNoAuth = await app.inject({
  method: 'POST',
  url: '/api/v1/n8n-agent/send-price-table',
  payload: { sessionId: '5511999999999@s.whatsapp.net' },
});
check('POST /api/v1/n8n-agent/send-price-table existe', priceNoAuth.statusCode !== 404, true);
check('send-price-table exige x-internal-key', priceNoAuth.statusCode, 401);

// ---------- autenticação ----------

const wrongKey = await app.inject({
  method: 'POST',
  url: '/api/v1/n8n-agent/run',
  headers: { 'x-internal-key': 'chave-errada' },
  payload: { message: 'oi', sessionId: '5511999999999@s.whatsapp.net' },
});
check('chave errada é recusada', wrongKey.statusCode, 401);

// ---------- validação de corpo ----------
// Com a chave certa, corpo inválido tem que parar em 400 ANTES de tocar em
// OpenAI/Supabase. Se um campo obrigatório do n8n for renomeado, cai aqui.

const auth = { 'x-internal-key': env.INTERNAL_API_KEY };

const missingMessage = await app.inject({
  method: 'POST',
  url: '/api/v1/n8n-agent/run',
  headers: auth,
  payload: { sessionId: '5511999999999@s.whatsapp.net' },
});
check('run sem `message` é rejeitado', missingMessage.statusCode, 400);

const missingSession = await app.inject({
  method: 'POST',
  url: '/api/v1/n8n-agent/run',
  headers: auth,
  payload: { message: 'oi' },
});
check('run sem `sessionId` é rejeitado', missingSession.statusCode, 400);

const badVariant = await app.inject({
  method: 'POST',
  url: '/api/v1/n8n-agent/send-price-table',
  headers: auth,
  payload: { sessionId: '5511999999999@s.whatsapp.net', variant: 'inexistente' },
});
check('variante de tabela inválida é rejeitada', badVariant.statusCode, 400);

// `contexto` é opcional e o n8n manda chaves variadas dentro dele — o schema
// não pode passar a exigir nada ali. Testado com `message` ausente de
// propósito: o 400 tem que vir do `message`, provando que o `contexto` inteiro
// foi aceito, sem deixar a requisição chegar em OpenAI/Supabase/Redis.
const contextTolerated = await app.inject({
  method: 'POST',
  url: '/api/v1/n8n-agent/run',
  headers: auth,
  payload: {
    sessionId: '5511999999999@s.whatsapp.net',
    contexto: { senderName: 'Pedro', instanceName: 'results', chatName: 'Pedro', extra: 123 },
  },
});
check('contexto com chaves variadas é aceito pelo schema', contextTolerated.statusCode, 400);

await app.close();
redis.disconnect();

console.log(failures === 0 ? '\nall pass' : `\n${failures} fail`);
process.exit(failures === 0 ? 0 : 1);
