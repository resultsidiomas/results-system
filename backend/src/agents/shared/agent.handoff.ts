import { supabase } from '../../config/supabase.js';
import { sendText } from '../../whatsapp/uazapi/uazapi.sender.js';
import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';

export async function notifyGi(
  contactId: string,
  phone: string,
  reason: string,
  lastReply: string,
): Promise<void> {
  const { error } = await supabase.from('contacts').update({ pausar_ia: 'Sim' }).eq('id', contactId);
  if (error) throw error;

  if (!env.GI_ALERT_NUMBER) {
    logger.warn('GI_ALERT_NUMBER not configured, skipping handoff alert');
    return;
  }

  await sendText(
    env.GI_ALERT_NUMBER,
    `${reason}\nTelefone: ${phone}\nÚltima resposta da IA: ${lastReply}`,
  );
}
