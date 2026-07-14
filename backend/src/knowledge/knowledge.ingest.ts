import { readFile } from 'node:fs/promises';
import { logger } from '../shared/logger.js';
import { chunkMarkdown } from './knowledge.chunker.js';
import { embedBatch } from './knowledge.embeddings.js';
import { deleteChunksBySource, insertChunks } from './knowledge.repository.js';
import type { KnowledgeAgentType } from './knowledge.schema.js';

/**
 * Ingesta um arquivo markdown na base de conhecimento: apaga chunks antigos
 * da mesma fonte (idempotente — reingestão substitui, não duplica) e insere
 * os novos chunks com embedding.
 */
export async function ingestFile(
  filePath: string,
  source: string,
  agentType: KnowledgeAgentType,
): Promise<number> {
  const markdown = await readFile(filePath, 'utf-8');
  const chunks = chunkMarkdown(source, markdown);

  if (chunks.length === 0) {
    logger.warn('no chunks extracted, skipping', { source });
    return 0;
  }

  const embeddings = await embedBatch(chunks.map((c) => c.content));

  await deleteChunksBySource(source);
  await insertChunks(agentType, chunks, embeddings);

  logger.info('ingested knowledge source', { source, agentType, chunkCount: chunks.length });
  return chunks.length;
}
