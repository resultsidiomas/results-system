import { openai } from '../../config/openai.js';
import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';

const SYSTEM_PROMPT = `Um contato de uma escola de idiomas foi encaminhado pra atendimento humano
(pausar_ia='Sim') e agora mandou uma nova mensagem no WhatsApp. Classifique
se essa mensagem contém uma dúvida real que precisa de resposta, ou se é só
um encerramento/agradecimento sem necessidade de resposta.

Responda com exatamente uma palavra, sem pontuação: duvida ou encerrado.

duvida: pergunta sobre curso/preço/horário/aula/reagendamento, pedido de
ajuda, qualquer coisa que precise de resposta pra o contato seguir em
frente.
encerrado: agradecimento, confirmação simples ("ok", "tá bom", "👍"),
mensagem sem conteúdo que peça resposta.`;

const CLASSIFIER_TIMEOUT_MS = 3000;

/**
 * Encerramentos puros — decididos sem chamar modelo. Qualquer coisa fora
 * dessa lista e do "encerrado" do classificador recebe resposta.
 */
const ACK_TOKEN =
  '(?:ok(?:ay)?|obrigad[oa]|obg|vlw|valeu|blz|beleza|t[áa] (?:bom|certo)|certo|perfeito|entendi|isso|combinado|at[ée] (?:mais|logo)|\\p{Extended_Pictographic}+)';

/** "ok", "ok obrigada 👍", "valeu, até mais!" — encerramento, sem pergunta nenhuma. */
const PURE_ACKNOWLEDGEMENT = new RegExp(
  `^${ACK_TOKEN}(?:[\\s,!.…]+${ACK_TOKEN})*[\\s!.…]*$`,
  'iu',
);

/**
 * `true` = mensagem merece resposta, vale reativar a IA por esse turno.
 *
 * Fail-**open** de propósito: a versão anterior ficava calada quando o
 * classificador falhava, dava timeout ou devolvia algo inesperado, tratando
 * silêncio como "padrão seguro". Não é — pro contato, silêncio é a escola
 * ignorando ele, e foi uma das causas de "o agente parou e não responde mais".
 * Só cala quando há sinal claro de encerramento (ver ADR-014).
 */
export async function shouldReactivate(message: string): Promise<boolean> {
  const trimmed = message.trim();
  if (trimmed.length === 0) return false;
  if (PURE_ACKNOWLEDGEMENT.test(trimmed)) return false;
  // Mensagem com pergunta explícita não precisa de classificador nenhum.
  if (trimmed.includes('?')) return true;

  return classifyReactivation(trimmed);
}

async function classifyReactivation(message: string): Promise<boolean> {
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

    logger.warn('reactivation classifier returned unexpected value, answering anyway', { raw });
    return true;
  } catch (err) {
    logger.warn('reactivation classifier failed, answering anyway', {
      errorMessage: (err as Error).message,
    });
    return true;
  } finally {
    clearTimeout(timeout);
  }
}
