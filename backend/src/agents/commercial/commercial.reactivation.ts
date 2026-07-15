import { openai } from '../../config/openai.js';
import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';

const SYSTEM_PROMPT = `Um lead de uma escola de idiomas foi encaminhado pra atendimento humano
(pausar_ia='Sim') e agora mandou uma nova mensagem no WhatsApp. Classifique
se essa mensagem contém uma dúvida real que precisa de resposta, ou se é só
um encerramento/agradecimento sem necessidade de resposta.

Responda com exatamente uma palavra, sem pontuação: duvida ou encerrado.

duvida: pergunta sobre curso/preço/horário/aula, pedido de ajuda, qualquer
coisa que precise de resposta pra o lead seguir em frente.
encerrado: agradecimento, confirmação simples ("ok", "tá bom", "👍"),
mensagem sem conteúdo que peça resposta.`;

const CLASSIFIER_TIMEOUT_MS = 3000;

/** true = mensagem parece uma duvida real, vale a pena reativar a IA por esse turno. */
export async function shouldReactivate(message: string): Promise<boolean> {
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
    if (raw === 'duvida') return true;
    if (raw === 'encerrado') return false;

    logger.warn('reactivation classifier returned unexpected value, staying paused', { raw });
    return false;
  } catch (err) {
    logger.warn('reactivation classifier failed, staying paused', {
      errorMessage: (err as Error).message,
    });
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
