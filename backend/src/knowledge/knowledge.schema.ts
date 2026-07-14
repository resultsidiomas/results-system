import { z } from 'zod';

export const knowledgeAgentTypeSchema = z.enum(['commercial', 'support', 'shared']);
export type KnowledgeAgentType = z.infer<typeof knowledgeAgentTypeSchema>;

export interface KnowledgeChunk {
  source: string;
  heading: string | null;
  content: string;
}

export interface MatchedKnowledgeChunk {
  id: string;
  source: string;
  heading: string | null;
  content: string;
  similarity: number;
}
