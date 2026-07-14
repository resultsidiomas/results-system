import { logger } from '../shared/logger.js';
import { embedText } from './knowledge.embeddings.js';
import { matchChunks } from './knowledge.repository.js';
import type { KnowledgeAgentType } from './knowledge.schema.js';

/**
 * Busca semântica na base de conhecimento e formata como bloco de contexto
 * pronto pra injetar no system prompt. Retorna string vazia se não houver
 * chunks (KB ainda não populada ou erro) — agente segue sem contexto extra,
 * nunca quebra o turno por causa disso.
 */
export async function retrieveKnowledgeContext(
  query: string,
  agentType: KnowledgeAgentType,
): Promise<string> {
  try {
    const queryEmbedding = await embedText(query);
    const chunks = await matchChunks(queryEmbedding, agentType);

    if (chunks.length === 0) return '';

    return chunks
      .map((c) => (c.heading ? `### ${c.heading}\n${c.content}` : c.content))
      .join('\n\n---\n\n');
  } catch (err) {
    logger.error('knowledge retrieval failed, continuing without context', {
      errorMessage: (err as Error).message,
    });
    return '';
  }
}
