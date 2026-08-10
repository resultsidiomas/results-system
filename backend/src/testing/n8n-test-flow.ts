import { env } from '../config/env.js';
import { logger } from '../shared/logger.js';

/**
 * Dispara o fluxo REAL do n8n em modo de teste.
 *
 * O que "real" significa aqui: a mensagem entra pelo mesmo webhook que a UAZAPI
 * usa, passa pelos mesmos filtros, debounce/junção e fracionamento do n8n, e o
 * fluxo chama o mesmo `POST /api/v1/n8n-agent/run` do atendimento de produção.
 * A ÚNICA diferença é o último passo: com `testMode: true` o fluxo desvia do
 * node que envia pela UAZAPI e devolve o resultado na resposta do webhook.
 * Nada é enviado para nenhum WhatsApp.
 *
 * Se `N8N_TEST_WEBHOOK_URL` não estiver configurada, o console cai no caminho
 * direto do backend (engine completa, sem a camada n8n) — o front mostra qual
 * caminho respondeu, para o teste nunca parecer mais real do que foi.
 */
export interface N8nTestResult {
  /** Texto único devolvido pelo fluxo. */
  reply: string;
  /** Bolhas já fracionadas pelo n8n, na ordem em que iriam para o WhatsApp. */
  bubbles: string[];
  sendPriceTable: boolean;
  priceTableVariant: string | null;
  pausarIa: string | null;
  /** Payload cru do n8n, para inspeção na aba de análise do console. */
  raw: unknown;
}

export function isN8nTestConfigured(): boolean {
  return Boolean(env.N8N_TEST_WEBHOOK_URL);
}

export async function runN8nTestFlow(params: {
  sessionId: string;
  message: string;
  senderName: string;
  instance: string;
}): Promise<N8nTestResult> {
  const url = env.N8N_TEST_WEBHOOK_URL;
  if (!url) throw new Error('N8N_TEST_WEBHOOK_URL não configurada');

  // Payload no mesmo formato que a UAZAPI entrega ao webhook (ver
  // docs/MAPA_ARQUITETURA_AGENTE_N8N.md § "Contrato de entrada da UAZAPI"),
  // para o fluxo não precisar de um caminho de parsing próprio só pro teste.
  const body = {
    testMode: true,
    instanceName: params.instance,
    chat: {
      wa_chatid: params.sessionId,
      wa_name: params.senderName,
    },
    message: {
      id: `test-${Date.now()}`,
      content: params.message,
      text: params.message,
      messageType: 'conversation',
      fromMe: false,
      chatid: params.sessionId,
    },
  };

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (env.N8N_TEST_SECRET) headers['x-test-secret'] = env.N8N_TEST_SECRET;

  const started = Date.now();
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    // O fluxo tem espera de debounce; sem timeout largo o console cortaria uma
    // execução que ainda ia responder.
    signal: AbortSignal.timeout(env.N8N_TEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`n8n respondeu ${response.status}: ${detail.slice(0, 300)}`);
  }

  const raw = (await response.json()) as Record<string, unknown>;

  logger.info('n8n test flow ok', {
    sessionId: params.sessionId,
    elapsedMs: Date.now() - started,
  });

  return normalize(raw);
}

/**
 * O "Respond to Webhook" do n8n pode devolver objeto ou array de um item, e o
 * nome do campo de texto varia conforme onde o branch de teste foi ligado
 * (`reply` vindo do backend, `output` vindo de um node de IA, `text` do
 * fracionador). Aceitar as três formas evita que o console quebre por causa de
 * um ajuste no fluxo.
 */
function normalize(raw: unknown): N8nTestResult {
  const payload = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | undefined;
  const source = (payload?.json as Record<string, unknown> | undefined) ?? payload ?? {};

  const reply =
    typeof source.reply === 'string'
      ? source.reply
      : typeof source.output === 'string'
        ? source.output
        : typeof source.text === 'string'
          ? source.text
          : '';

  const bubbles = Array.isArray(source.bubbles)
    ? (source.bubbles as unknown[]).filter((item): item is string => typeof item === 'string')
    : reply
      ? reply.split('\n').map((line) => line.trim()).filter(Boolean)
      : [];

  return {
    reply,
    bubbles,
    sendPriceTable: source.sendPriceTable === true,
    priceTableVariant: typeof source.priceTableVariant === 'string' ? source.priceTableVariant : null,
    pausarIa: typeof source.pausarIa === 'string' ? source.pausarIa : null,
    raw,
  };
}
