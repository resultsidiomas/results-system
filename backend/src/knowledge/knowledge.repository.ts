import { supabase } from '../config/supabase.js';
import { env } from '../config/env.js';
import { logger } from '../shared/logger.js';
import type { KnowledgeAgentType, KnowledgeChunk, MatchedKnowledgeChunk } from './knowledge.schema.js';

export async function deleteChunksBySource(source: string): Promise<void> {
  const { error } = await supabase.from('knowledge_chunks').delete().eq('source', source);
  if (error) throw new Error(`failed to delete existing chunks for ${source}: ${error.message}`);
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

  return (data ?? []) as MatchedKnowledgeChunk[];
}
