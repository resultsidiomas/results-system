import { openai } from '../../config/openai.js';
import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';

export type Intent = 'commercial' | 'support' | 'ambiguous';

const SYSTEM_PROMPT = `Classifique a intenção de uma mensagem de WhatsApp para uma escola de idiomas.
Responda com exatamente uma palavra, sem pontuação: commercial, support ou ambiguous.

commercial: interesse em cursos, preços, matrícula, aula experimental, quer aprender idioma.
support: aluno já matriculado — remarcar aula, cancelar, dúvida sobre professor/horário/app.
ambiguous: não dá pra saber com o texto dado.`;

const CLASSIFIER_TIMEOUT_MS = 3000;

export async function classifyIntent(message: string): Promise<Intent> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS);

  try {
    const completion = await openai.chat.completions.create(
      {
        model: env.OPENAI_MODEL_ROUTER,
        temperature: 0,
        max_tokens: 5,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: message },
        ],
      },
      { signal: controller.signal },
    );

    const raw = completion.choices[0]?.message?.content?.trim().toLowerCase() ?? '';
    if (raw === 'commercial' || raw === 'support' || raw === 'ambiguous') {
      return raw;
    }

    logger.warn('intent classifier returned unexpected value, defaulting to commercial');
    return 'commercial';
  } catch (err) {
    logger.warn('intent classifier failed, defaulting to commercial', {
      errorMessage: (err as Error).message,
    });
    return 'commercial';
  } finally {
    clearTimeout(timeout);
  }
}
