import Fastify from 'fastify';
import { env } from './src/config/env.js';
import corsPlugin from './src/plugins/cors.plugin.js';
import errorHandlerPlugin from './src/plugins/error-handler.plugin.js';
import { uazapiWebhookRoute } from './src/whatsapp/uazapi/uazapi.webhook.js';
import { testChatRoutes } from './src/testing/test-chat.routes.js';
import { n8nAgentRoutes } from './src/integrations/n8n-agent/n8n-agent.routes.js';
import { adminPromptRoutes } from './src/admin/prompt.routes.js';
import {
  adminTestChatRoutes,
  adminTestSaveRoutes,
  adminRealConversationRoutes,
} from './src/admin/test-chat.routes.js';
import { logger } from './src/shared/logger.js';

const app = Fastify({ logger: false });

await app.register(corsPlugin);
await app.register(errorHandlerPlugin);
await app.register(uazapiWebhookRoute);
await app.register(testChatRoutes);
await app.register(n8nAgentRoutes);
await app.register(adminPromptRoutes);
await app.register(adminTestChatRoutes);
await app.register(adminTestSaveRoutes);
await app.register(adminRealConversationRoutes);

app.get('/health', async () => ({ status: 'ok' }));

app
  .listen({ port: env.PORT, host: '0.0.0.0' })
  .then(() => logger.info('server started', { port: env.PORT }))
  .catch((err) => {
    logger.error('server failed to start', { message: err.message });
    process.exit(1);
  });
