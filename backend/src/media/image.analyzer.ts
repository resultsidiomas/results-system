import { openai } from '../config/openai.js';
import { env } from '../config/env.js';

export async function analyzeImage(base64Data: string, mimeType = 'image/jpeg'): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: env.OPENAI_MODEL_COMMERCIAL,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Descreva esta imagem enviada por um lead/aluno em uma conversa de WhatsApp. Seja objetivo — a descrição vai virar contexto de texto para outro agente de IA.',
          },
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${base64Data}` },
          },
        ],
      },
    ],
    max_tokens: 300,
  });

  return completion.choices[0]?.message?.content ?? '';
}
