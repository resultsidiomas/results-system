import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';
import { fractureMessage } from '../../agents/shared/agent.fracture.js';
import { getPriceTableImage } from './price-table.assets.js';
import type { PriceTableVariant } from '../../agents/commercial/commercial.schema.js';

export async function sendText(remoteJid: string, text: string): Promise<void> {
  const res = await fetch(`${env.UAZAPI_URL}/send/text`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      token: env.UAZAPI_TOKEN,
    },
    body: JSON.stringify({ number: remoteJid, text, delay: env.UAZAPI_SEND_DELAY_MS }),
  });

  if (!res.ok) {
    logger.error('uazapi send failed', { status: res.status });
    throw new Error(`UAZAPI send failed: ${res.status}`);
  }
}

export async function sendFractured(remoteJid: string, fullText: string): Promise<void> {
  for (const paragraph of fractureMessage(fullText)) {
    await sendText(remoteJid, paragraph);
  }
}

async function sendImage(remoteJid: string, base64: string, mimeType: string, caption = ''): Promise<void> {
  const res = await fetch(`${env.UAZAPI_URL}/send/media`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      token: env.UAZAPI_TOKEN,
    },
    body: JSON.stringify({
      number: remoteJid,
      type: 'image',
      file: `data:${mimeType};base64,${base64}`,
      text: caption,
      delay: env.UAZAPI_SEND_DELAY_MS,
    }),
  });

  if (!res.ok) {
    logger.error('uazapi send image failed', { status: res.status });
    throw new Error(`UAZAPI send image failed: ${res.status}`);
  }
}

/**
 * Envia a foto da tabela de preços (só a variante certa pro que o lead
 * pediu) em vez do agente citar valor em texto — elimina risco de o LLM
 * inventar/errar número (ver ADR sobre política de preço). Endpoint
 * /send/media segue convenção não 100% confirmada contra doc oficial da
 * UAZAPI (doc é SPA, não indexável) — validado no primeiro teste real.
 */
export async function sendPriceTableImage(remoteJid: string, variant: PriceTableVariant): Promise<void> {
  const image = getPriceTableImage(variant);
  await sendImage(remoteJid, image.base64, image.mimeType, 'Aqui está nossa tabela de valores 😊');
}
