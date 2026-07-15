import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { openai } from '../../config/openai.js';
import { logger } from '../../shared/logger.js';
import { HttpError, BadRequestError, UnauthorizedError } from '../../shared/http-errors.js';
import { appendChatMessage, getChatHistory } from '../../agents/shared/agent.memory.redis.js';

const N8N_INSTANCE = 'n8n-agent';

const bodySchema = z.object({
  message: z.string().min(1),
  sessionId: z.string().optional(),
  contexto: z.record(z.string(), z.unknown()).optional(),
});

function requireInternalAuth(request: FastifyRequest): void {
  const token = request.headers['x-internal-key'];
  if (token !== env.INTERNAL_API_KEY) {
    throw new UnauthorizedError('invalid internal key');
  }
}

export async function n8nAgentRoutes(app: FastifyInstance) {
  app.post('/api/v1/n8n-agent/run', async (request: FastifyRequest, reply: FastifyReply) => {
    requireInternalAuth(request);

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) throw new BadRequestError('invalid request body');

    const { message, sessionId, contexto } = parsed.data;
    const history = sessionId ? await getChatHistory(N8N_INSTANCE, sessionId) : [];

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
    if (contexto && Object.keys(contexto).length) {
      messages.push({
        role: 'system',
        content: `Contexto adicional fornecido pelo chamador: ${JSON.stringify(contexto)}`,
      });
    }
    messages.push(...history, { role: 'user', content: message });

    let agentReply: string;
    try {
      const completion = await openai.chat.completions.create({
        model: env.OPENAI_MODEL_COMMERCIAL,
        messages,
        max_tokens: env.OPENAI_MAX_TOKENS,
      });
      agentReply = completion.choices[0]?.message?.content ?? '';
      if (!agentReply) throw new Error('resposta da OpenAI sem conteudo');
    } catch (err) {
      logger.error('n8n-agent turn failed', { sessionId, errorMessage: (err as Error).message });
      throw new HttpError(502, 'falha ao chamar o agente');
    }

    if (sessionId) {
      const at = new Date().toISOString();
      await appendChatMessage(N8N_INSTANCE, sessionId, { role: 'user', content: message, at });
      await appendChatMessage(N8N_INSTANCE, sessionId, { role: 'assistant', content: agentReply, at });
    }

    return reply.send({ reply: agentReply, sessionId: sessionId ?? null });
  });
}
