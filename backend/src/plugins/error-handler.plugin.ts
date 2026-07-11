import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { HttpError } from '../shared/http-errors.js';
import { logger } from '../shared/logger.js';
import { env } from '../config/env.js';

export default fp(async (app: FastifyInstance) => {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      logger.warn('request failed', { path: request.url, statusCode: error.statusCode });
      reply.status(error.statusCode).send({ error: error.message });
      return;
    }

    logger.error('unhandled error', {
      path: request.url,
      errorMessage: error.message,
    });

    const body =
      env.NODE_ENV === 'production'
        ? { error: 'Internal Server Error' }
        : { error: error.message, stack: error.stack };

    reply.status(500).send(body);
  });
});
