import { supabase } from '../../config/supabase.js';
import { sendText } from '../../whatsapp/uazapi/uazapi.sender.js';
import { redis } from '../../config/redis.js';
import { markPauseStart } from './agent.pause.js';
import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';

/** Alerta de lead quente: no máximo um por dia por contato. */
const HOT_LEAD_ALERT_TTL_SECONDS = 86_400;
/** Alerta de falha técnica: no máximo um por hora por contato. */
const FAILURE_ALERT_TTL_SECONDS = 3_600;

const ALERT_TTL: Record<HandoffAlertKind, number> = {
  hot_lead: HOT_LEAD_ALERT_TTL_SECONDS,
  turn_failed: FAILURE_ALERT_TTL_SECONDS,
};

export type HandoffAlertKind = 'hot_lead' | 'turn_failed';

/**
 * `true` na primeira vez, `false` enquanto o alerta estiver "reservado".
 *
 * Necessário porque handoff que não pausa a IA (lead quente, falha técnica)
 * repetiria o alerta a cada mensagem: `collected_data` mantém o score ≥ 9 pra
 * sempre depois de atingido — era `pausar_ia` que segurava o segundo alerta
 * (risco previsto no ADR-011). Aqui o freio é explícito e não custa silêncio.
 * Redis fora do ar → deixa alertar (avisar duas vezes é melhor que perder o
 * lead quente).
 */
export async function claimHandoffAlert(
  contactId: string,
  kind: HandoffAlertKind,
): Promise<boolean> {
  try {
    const claimed = await redis.set(
      `handoff_alert:${kind}:${contactId}`,
      new Date().toISOString(),
      'EX',
      ALERT_TTL[kind],
      'NX',
    );
    return claimed !== null;
  } catch (err) {
    logger.warn('handoff alert claim failed, alerting anyway', {
      errorMessage: (err as Error).message,
    });
    return true;
  }
}

/** Linhas extras do alerta (ex: nome, idioma, objetivo) — omite o que estiver vazio. */
export type HandoffDetails = Record<string, string | number | boolean | null | undefined>;

function formatDetails(details: HandoffDetails): string {
  const lines = Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([label, value]) => `${label}: ${String(value)}`);

  return lines.length > 0 ? `\n${lines.join('\n')}` : '';
}

export interface NotifyGiOptions {
  /**
   * `false` = avisa a Gi mas deixa a IA seguir respondendo.
   *
   * Pausar era incondicional, e é a raiz do "agente parou de responder do
   * nada": não existe rotina de resume implementada (`SCHEDULE_RESUME_HOUR`
   * nunca foi usada), então `pausar_ia='Sim'` significava silêncio até alguém
   * editar o Supabase à mão. Só handoff pedido de fato (quer agendar, quer
   * humano, escalação de suporte) pausa; alerta de lead quente e falha técnica
   * avisam sem calar o agente (ver ADR-014).
   */
  pauseAi?: boolean;
}

/**
 * Avisa a Gi (e, quando for o caso, pausa a IA pro contato). O alerta antes
 * levava só motivo, telefone e a última resposta da IA — a Gi assumia a
 * conversa sem saber nome, idioma, objetivo nem turno preferido, dados que o
 * lead já tinha informado. Agora vai o contexto coletado junto, pra ela abrir
 * o WhatsApp já sabendo com quem está falando.
 */
export async function notifyGi(
  contactId: string,
  phone: string,
  reason: string,
  lastReply: string,
  details: HandoffDetails = {},
  options: NotifyGiOptions = {},
): Promise<void> {
  if (options.pauseAi !== false) {
    const { error } = await supabase
      .from('contacts')
      .update({ pausar_ia: 'Sim' })
      .eq('id', contactId);
    if (error) throw error;

    // Carimbo do início da pausa — o prazo de 1 dia é contado daqui, não do
    // último update do contato (que desliza a cada turno respondido).
    await markPauseStart(contactId);
  }

  if (!env.GI_ALERT_NUMBER) {
    logger.warn('GI_ALERT_NUMBER not configured, skipping handoff alert');
    return;
  }

  await sendText(
    env.GI_ALERT_NUMBER,
    `${reason}\nTelefone: ${phone}${formatDetails(details)}\nÚltima resposta da IA: ${lastReply}`,
  );
}
