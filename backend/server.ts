import Fastify from 'fastify';
import { env } from './src/config/env.js';
import corsPlugin from './src/plugins/cors.plugin.js';
import errorHandlerPlugin from './src/plugins/error-handler.plugin.js';
import { logger } from './src/shared/logger.js';

const app = Fastify({ logger: false });

await app.register(corsPlugin);
await app.register(errorHandlerPlugin);

app.get('/health', async () => ({ status: 'ok' }));

app
  .listen({ port: env.PORT, host: '0.0.0.0' })
  .then(() => logger.info('server started', { port: env.PORT }))
  .catch((err) => {
    logger.error('server failed to start', { message: err.message });
    process.exit(1);
  });
