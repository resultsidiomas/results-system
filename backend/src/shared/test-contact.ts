/**
 * Identidade do contato sintético do console de teste.
 *
 * Vive fora de `admin/` porque três caminhos precisam concordar sobre ela e
 * antes não concordavam: o console gravava `test-{sessão}`, o fluxo n8n criava
 * `{sessão}` (sem prefixo) e o painel procurava `test-{sessão}`. O resultado
 * era conversa de teste invisível no painel, contada como lead real e imune ao
 * "Zerar sessão".
 */
export const TEST_PHONE_PREFIX = 'test-';

export function testPhone(sessionId: string): string {
  return `${TEST_PHONE_PREFIX}${sessionId}`;
}

/**
 * `true` para o contato sintético do console.
 *
 * Usado no caminho de produção (`n8n-agent.routes.ts`) para não mandar alerta
 * de WhatsApp para a equipe com dado fictício — o fluxo do n8n chama a mesma
 * rota do atendimento real e não tem como saber que aquilo é teste.
 */
export function isTestPhone(phone: string): boolean {
  return phone.startsWith(TEST_PHONE_PREFIX);
}
