import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { BadRequestError, NotFoundError } from '../shared/http-errors.js';
import { logger } from '../shared/logger.js';
import { requireAdmin } from './admin.auth.js';
import {
  listPromptBlocks,
  getPromptBlock,
  updatePromptBlock,
  listPromptVersions,
  restorePromptVersion,
  previewSystemPrompt,
} from '../agents/shared/agent.prompt.repository.js';
import { PROMPT_COMPOSITION, type AgentType } from '../agents/shared/agent.prompt.manifest.js';

const agentTypeSchema = z.enum(['commercial', 'support']);

const updateBodySchema = z.object({
  content: z.string().min(1, 'conteúdo não pode ficar vazio').max(100_000),
});

const restoreBodySchema = z.object({
  version: z.number().int().positive(),
});

/**
 * O `block_key` é o caminho do bloco (`shared/persona.md`), então vem na URL
 * como parâmetro coringa. Validado contra a lista fechada de blocos existentes
 * pelo próprio banco (a consulta simplesmente não acha uma chave inventada).
 */
function parseBlockKey(request: FastifyRequest): string {
  const params = request.params as { '*'?: string };
  const key = params['*'];
  if (!key) throw new BadRequestError('block key ausente');
  return decodeURIComponent(key);
}

export async function adminPromptRoutes(app: FastifyInstance) {
  /** Lista todos os blocos, com metadados para agrupar na tela. */
  app.get('/api/v1/admin/prompts', async (request: FastifyRequest, reply: FastifyReply) => {
    await requireAdmin(request);
    const blocks = await listPromptBlocks();

    return reply.send({
      blocks,
      composition: PROMPT_COMPOSITION,
    });
  });

  /** Prévia do prompt final, exatamente como o modelo recebe. */
  app.get('/api/v1/admin/prompts/preview/:agentType', async (request: FastifyRequest, reply: FastifyReply) => {
    await requireAdmin(request);

    const parsed = agentTypeSchema.safeParse((request.params as { agentType: string }).agentType);
    if (!parsed.success) throw new BadRequestError('agente inválido');

    const prompt = await previewSystemPrompt(parsed.data as AgentType);
    return reply.send({ agentType: parsed.data, prompt, characters: prompt.length });
  });

  app.get('/api/v1/admin/prompts/block/*', async (request: FastifyRequest, reply: FastifyReply) => {
    await requireAdmin(request);
    const blockKey = parseBlockKey(request);

    const block = await getPromptBlock(blockKey);
    if (!block) throw new NotFoundError(`bloco ${blockKey} não encontrado`);

    return reply.send(block);
  });

  app.put('/api/v1/admin/prompts/block/*', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireAdmin(request);
    const blockKey = parseBlockKey(request);

    const parsed = updateBodySchema.safeParse(request.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? 'conteúdo inválido');

    const existing = await getPromptBlock(blockKey);
    if (!existing) throw new NotFoundError(`bloco ${blockKey} não encontrado`);

    const block = await updatePromptBlock(blockKey, parsed.data.content, user.email);

    logger.info('prompt editado pelo painel', { blockKey, by: user.email, version: block.version });
    return reply.send(block);
  });

  app.get('/api/v1/admin/prompts/versions/*', async (request: FastifyRequest, reply: FastifyReply) => {
    await requireAdmin(request);
    const blockKey = parseBlockKey(request);

    return reply.send({ versions: await listPromptVersions(blockKey) });
  });

  app.post('/api/v1/admin/prompts/restore/*', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireAdmin(request);
    const blockKey = parseBlockKey(request);

    const parsed = restoreBodySchema.safeParse(request.body);
    if (!parsed.success) throw new BadRequestError('versão inválida');

    const block = await restorePromptVersion(blockKey, parsed.data.version, user.email);

    logger.info('prompt restaurado', { blockKey, by: user.email, restored: parsed.data.version });
    return reply.send(block);
  });
}
