import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { env } from '../../config/env.js';
import type { ChatMessage } from './agent.types.js';

export function buildMessages(
  systemPrompt: string,
  history: ChatMessage[],
  userMessage: string,
): ChatCompletionMessageParam[] {
  const trimmed = history.slice(-env.AGENT_HISTORY_LIMIT * 2);

  return [
    { role: 'system', content: systemPrompt },
    ...trimmed.map(
      (m): ChatCompletionMessageParam => ({
        role: m.role,
        content: m.content,
      }),
    ),
    { role: 'user', content: userMessage },
  ];
}

/** Última mensagem que a IA enviou nessa conversa — base da guarda de repetição. */
export function lastAssistantReply(history: ChatMessage[]): string | null {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]?.role === 'assistant') return history[i]!.content;
  }
  return null;
}
