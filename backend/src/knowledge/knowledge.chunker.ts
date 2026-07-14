import type { KnowledgeChunk } from './knowledge.schema.js';

const MAX_CHUNK_CHARS = 2800; // ~700 tokens
const OVERLAP_PARAGRAPHS = 1; // carrega o último parágrafo do chunk anterior pro próximo, mantém continuidade

interface Section {
  heading: string | null;
  body: string;
}

function splitByHeading(markdown: string): Section[] {
  const lines = markdown.split('\n');
  const sections: Section[] = [];
  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    const match = line.match(/^##\s+(.+)$/);
    if (match) {
      if (currentLines.some((l) => l.trim().length > 0)) {
        sections.push({ heading: currentHeading, body: currentLines.join('\n').trim() });
      }
      currentHeading = match[1].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentLines.some((l) => l.trim().length > 0)) {
    sections.push({ heading: currentHeading, body: currentLines.join('\n').trim() });
  }

  return sections.filter((s) => s.body.length > 0);
}

function splitSection(body: string): string[] {
  if (body.length <= MAX_CHUNK_CHARS) return [body];

  const paragraphs = body.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLength = 0;

  for (const paragraph of paragraphs) {
    if (currentLength + paragraph.length > MAX_CHUNK_CHARS && current.length > 0) {
      chunks.push(current.join('\n\n'));
      current = current.slice(-OVERLAP_PARAGRAPHS);
      currentLength = current.reduce((sum, p) => sum + p.length, 0);
    }
    current.push(paragraph);
    currentLength += paragraph.length;
  }
  if (current.length > 0) chunks.push(current.join('\n\n'));

  return chunks;
}

export function chunkMarkdown(source: string, markdown: string): KnowledgeChunk[] {
  const sections = splitByHeading(markdown);
  const chunks: KnowledgeChunk[] = [];

  for (const section of sections) {
    const parts = splitSection(section.body);
    for (const content of parts) {
      chunks.push({ source, heading: section.heading, content });
    }
  }

  return chunks;
}
