import { redis } from '../config/redis.js';

/**
 * Bolhas de um turno de teste, na ordem e no ritmo em que o fluxo as entregaria
 * ao WhatsApp.
 *
 * Existe porque o `Respond to Webhook` do n8n responde **uma vez só**: o fluxo
 * não tem como devolver a primeira bolha, esperar, devolver a segunda. Então a
 * direção é invertida — no lugar do `POST /send/text` da UAZAPI, o fluxo em modo
 * de teste empurra cada bolha para cá, e o painel busca conforme chegam.
 *
 * O que isso preserva: o intervalo entre uma bolha e outra é o `Wait` real do
 * fluxo. Animar o atraso no navegador daria a mesma aparência sem medir nada —
 * e um teste que parece mais real do que foi é pior do que não testar.
 */
export interface TestBubble {
  text: string;
  at: string;
}

/** Turno de teste dura segundos; a hora é folga pra sessão esquecida aberta. */
const TTL_SECONDS = 3600;

function bubblesKey(sessionId: string): string {
  return `test-bubbles:${sessionId}`;
}

export async function pushTestBubble(sessionId: string, text: string): Promise<number> {
  const key = bubblesKey(sessionId);
  const bubble: TestBubble = { text, at: new Date().toISOString() };

  const length = await redis.rpush(key, JSON.stringify(bubble));
  await redis.expire(key, TTL_SECONDS);

  return length;
}

/**
 * Bolhas a partir de `after`, que é quantas o painel já mostrou.
 *
 * O painel pergunta em intervalo curto durante o turno; devolver só o que falta
 * evita ele redesenhar a conversa inteira a cada resposta.
 */
export async function getTestBubbles(sessionId: string, after = 0): Promise<TestBubble[]> {
  const raw = await redis.lrange(bubblesKey(sessionId), after, -1);
  return raw.map((item) => JSON.parse(item) as TestBubble);
}

export async function clearTestBubbles(sessionId: string): Promise<void> {
  await redis.del(bubblesKey(sessionId));
}
