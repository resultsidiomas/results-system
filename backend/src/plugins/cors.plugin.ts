import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';

export default fp(async (app: FastifyInstance) => {
  await app.register(cors, {
    origin: true,
  });
});
