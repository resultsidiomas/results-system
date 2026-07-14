import { env } from '../config/env.js';

export async function transcribeAudio(audioBuffer: Buffer, mimeType = 'audio/ogg'): Promise<string> {
  if (!env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY not configured — audio transcription unavailable');
  }

  const form = new FormData();
  form.append('model', env.GROQ_MODEL);
  form.append('temperature', '0');
  form.append('response_format', 'verbose_json');
  form.append('language', 'pt');
  form.append('file', new Blob([audioBuffer], { type: mimeType }), 'audio.ogg');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Groq transcription failed: ${res.status}`);
  }

  const data = (await res.json()) as { text: string };
  return data.text;
}
