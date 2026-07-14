import { openai } from '../config/openai.js';
import { env } from '../config/env.js';

export async function embedText(text: string): Promise<number[]> {
  const result = await openai.embeddings.create({
    model: env.OPENAI_EMBEDDING_MODEL,
    input: text,
  });
  return result.data[0].embedding;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const result = await openai.embeddings.create({
    model: env.OPENAI_EMBEDDING_MODEL,
    input: texts,
  });
  return result.data.map((d) => d.embedding);
}
