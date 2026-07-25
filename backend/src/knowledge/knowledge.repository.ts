import { supabase } from '../config/supabase.js';
import { env } from '../config/env.js';
import { logger } from '../shared/logger.js';
import type { KnowledgeAgentType, KnowledgeChunk, MatchedKnowledgeChunk } from './knowledge.schema.js';

export async function deleteChunksBySource(source: string): Promise<void> {
  const { error } = await supabase.from('knowledge_chunks').delete().eq('source', source);
  if (error) throw new Error(`failed to delete existing chunks for ${source}: ${error.message}`);
}

/** Fontes distintas já presentes na base — usado pra limpar o que saiu do allowlist. */
export async function listChunkSources(): Promise<string[]> {
  const { data, error } = await supabase.from('knowledge_chunks').select('source');
  if (error) throw new Error(`failed to list chunk sources: ${error.message}`);

  return [...new Set((data ?? []).map((row) => (row as { source: string }).source))];
}

export async function insertChunks(
  agentType: KnowledgeAgentType,
  chunks: KnowledgeChunk[],
  embeddings: number[][],
): Promise<void> {
  if (chunks.length !== embeddings.length) {
    throw new Error('chunks and embeddings length mismatch');
  }
  if (chunks.length === 0) return;

  const rows = chunks.map((chunk, i) => ({
    agent_type: agentType,
    source: chunk.source,
    heading: chunk.heading,
    content: chunk.content,
    embedding: embeddings[i],
  }));

  const { error } = await supabase.from('knowledge_chunks').insert(rows);
  if (error) throw new Error(`failed to insert knowledge chunks: ${error.message}`);
}

export async function matchChunks(
  queryEmbedding: number[],
  agentType: KnowledgeAgentType,
  matchCount = env.KNOWLEDGE_MATCH_COUNT,
): Promise<MatchedKnowledgeChunk[]> {
  const { data, error } = await supabase.rpc('match_knowledge_chunks', {
    query_embedding: queryEmbedding,
    match_agent_type: agentType,
    match_count: matchCount,
  });

  if (error) {
    logger.error('knowledge match_knowledge_chunks failed', { errorMessage: error.message });
    return [];
  }

  // O RPC devolve sempre os top-k mais próximos, mesmo que nenhum responda a
  // pergunta — sem piso, todo turno recebia 4 chunks e o contexto irrelevante
  // diluía o prompt. Abaixo do piso é melhor não mandar contexto nenhum.
  const chunks = (data ?? []) as MatchedKnowledgeChunk[];
  const relevant = chunks.filter((chunk) => chunk.similarity >= env.KNOWLEDGE_MIN_SIMILARITY);

  if (relevant.length < chunks.length) {
    logger.debug('knowledge chunks filtered by similarity floor', {
      agentType,
      kept: relevant.length,
      dropped: chunks.length - relevant.length,
    });
  }

  return relevant;
}
