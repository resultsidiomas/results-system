const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { internalAuth } = require('./middleware/auth');
const healthRouter = require('./routes/health');
const agentRouter = require('./routes/agent');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(helmet());
app.use(express.json({ limit: '1mb' }));

app.use(healthRouter);

const agentRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/agent', agentRateLimit, internalAuth, agentRouter);

app.listen(PORT, () => {
  console.log(`agent-service ouvindo na porta ${PORT}`);
});
