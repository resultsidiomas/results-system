import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';
import { fractureMessage } from '../../agents/shared/agent.fracture.js';

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
