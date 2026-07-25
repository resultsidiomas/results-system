import { supabase } from '../../config/supabase.js';
import { sendText } from '../../whatsapp/uazapi/uazapi.sender.js';
import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';

/** Linhas extras do alerta (ex: nome, idioma, objetivo) — omite o que estiver vazio. */
export type HandoffDetails = Record<string, string | number | boolean | null | undefined>;

function formatDetails(details: HandoffDetails): string {
  const lines = Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([label, value]) => `${label}: ${String(value)}`);

  return lines.length > 0 ? `\n${lines.join('\n')}` : '';
}

/**
 * Pausa a IA pro contato e avisa a Gi. O alerta antes levava só motivo,
 * telefone e a última resposta da IA — a Gi assumia a conversa sem saber nome,
 * idioma, objetivo nem turno preferido, dados que o lead já tinha informado.
 * Agora vai o contexto coletado junto, pra ela abrir o WhatsApp já sabendo com
 * quem está falando.
 */
export async function notifyGi(
  contactId: string,
  phone: string,
  reason: string,
  lastReply: string,
  details: HandoffDetails = {},
): Promise<void> {
  const { error } = await supabase.from('contacts').update({ pausar_ia: 'Sim' }).eq('id', contactId);
  if (error) throw error;

  if (!env.GI_ALERT_NUMBER) {
    logger.warn('GI_ALERT_NUMBER not configured, skipping handoff alert');
    return;
  }

  await sendText(
    env.GI_ALERT_NUMBER,
    `${reason}\nTelefone: ${phone}${formatDetails(details)}\nÚltima resposta da IA: ${lastReply}`,
  );
}
