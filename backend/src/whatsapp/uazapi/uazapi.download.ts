import { env } from '../../config/env.js';

interface DownloadResult {
  base64: string;
  mimeType: string;
}

export async function downloadMedia(messageId: string): Promise<DownloadResult> {
  const res = await fetch(`${env.UAZAPI_URL}/message/download`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      token: env.UAZAPI_TOKEN,
    },
    body: JSON.stringify({ id: messageId, return_base64: true }),
  });

  if (!res.ok) {
    throw new Error(`UAZAPI download failed: ${res.status}`);
  }

  const data = (await res.json()) as { base64Data: string; mimetype?: string };
  return { base64: data.base64Data, mimeType: data.mimetype ?? 'application/octet-stream' };
}
