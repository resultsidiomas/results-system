import { openai } from '../../config/openai.js';
import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';
import type { ChatMessage } from '../shared/agent.types.js';

export type Intent = 'commercial' | 'support' | 'ambiguous';

const SYSTEM_PROMPT = `Classifique a intenção da ÚLTIMA mensagem do contato numa conversa de WhatsApp de uma escola de idiomas.
Responda com exatamente uma palavra, sem pontuação: commercial, support ou ambiguous.

commercial: interesse em cursos, preços, matrícula, aula experimental, quer aprender idioma. Inclui aluno já matriculado querendo contratar algo novo (outro idioma, mais aulas, trocar de plano por vontade própria).
support: aluno já matriculado — remarcar aula, cancelar, dúvida sobre professor/horário/app/material que ele já usa.
ambiguous: não dá pra saber nem pela última mensagem nem pelo histórico.

REGRA IMPORTANTE: a última mensagem pode ser curta e depender do histórico
("sim", "pode ser", "e o horário?", "quanto fica?"). Nesses casos, continue o
assunto que já estava em andamento na conversa em vez de classificar a frase
isolada — trocar de time no meio do atendimento quebra a conversa.`;

const CLASSIFIER_TIMEOUT_MS = 3000;
const HISTORY_TURNS_FOR_ROUTING = 6;

function buildClassifierInput(message: string, history: ChatMessage[]): string {
  const recent = history.slice(-HISTORY_TURNS_FOR_ROUTING);
  if (recent.length === 0) return `ÚLTIMA MENSAGEM DO CONTATO: ${message}`;

  const transcript = recent
    .map((m) => `${m.role === 'user' ? 'Contato' : 'Atendimento'}: ${m.content}`)
    .join('\n');

  return `HISTÓRICO RECENTE DA CONVERSA:\n${transcript}\n\nÚLTIMA MENSAGEM DO CONTATO: ${message}`;
}

/**
 * `history` é opcional só pra não quebrar chamadas antigas, mas sempre que
 * existir deve ser passado: classificar a mensagem isolada fazia o roteador
 * trocar de agente no meio da conversa (um "e o horário?" durante a
 * qualificação caía no suporte, que atende como se o lead já fosse aluno).
 */
export async function classifyIntent(
  message: string,
  history: ChatMessage[] = [],
): Promise<Intent> {
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
          { role: 'user', content: buildClassifierInput(message, history) },
        ],
      },
      { signal: controller.signal },
    );

    const raw = completion.choices[0]?.message?.content?.trim().toLowerCase() ?? '';
    if (raw === 'commercial' || raw === 'support' || raw === 'ambiguous') {
      return raw;
    }

    logger.warn('intent classifier returned unexpected value, treating as ambiguous', { raw });
    return 'ambiguous';
  } catch (err) {
    logger.warn('intent classifier failed, treating as ambiguous', {
      errorMessage: (err as Error).message,
    });
    return 'ambiguous';
  } finally {
    clearTimeout(timeout);
  }
}
