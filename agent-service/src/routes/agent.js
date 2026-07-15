const express = require('express');
const OpenAI = require('openai');
const { runAgent } = require('../services/openai');
const { getHistory, appendTurn } = require('../services/memory');

const router = express.Router();

function validateBody(body) {
  if (!body || typeof body.message !== 'string' || body.message.trim().length === 0) {
    return 'campo "message" e obrigatorio e deve ser string nao vazia';
  }
  if (body.sessionId !== undefined && typeof body.sessionId !== 'string') {
    return 'campo "sessionId" deve ser string';
  }
  if (body.contexto !== undefined && (typeof body.contexto !== 'object' || Array.isArray(body.contexto))) {
    return 'campo "contexto" deve ser objeto';
  }
  return null;
}

router.post('/run', async (req, res) => {
  const validationError = validateBody(req.body);
  if (validationError) {
    return res.status(422).json({ error: validationError });
  }

  const { message, sessionId, contexto } = req.body;
  const history = getHistory(sessionId);

  try {
    const reply = await runAgent(history, message, contexto);
    appendTurn(sessionId, message, reply);
    return res.json({ reply, sessionId: sessionId || null });
  } catch (error) {
    if (error instanceof OpenAI.RateLimitError) {
      console.error(`[agent/run] rate limit da OpenAI — sessionId=${sessionId}`);
      return res.status(429).json({ error: 'agente sobrecarregado, tente novamente em instantes' });
    }
    if (error instanceof OpenAI.APIConnectionTimeoutError) {
      console.error(`[agent/run] timeout na chamada OpenAI — sessionId=${sessionId}`);
      return res.status(504).json({ error: 'tempo esgotado ao chamar o agente' });
    }
    if (error instanceof OpenAI.APIConnectionError) {
      console.error(`[agent/run] erro de conexao com OpenAI — sessionId=${sessionId} — ${error.message}`);
      return res.status(502).json({ error: 'falha de rede ao chamar o agente' });
    }
    if (error instanceof OpenAI.APIError) {
      console.error(`[agent/run] erro OpenAI status=${error.status} — sessionId=${sessionId} — ${error.message}`);
      return res.status(502).json({ error: 'falha ao chamar o agente' });
    }
    console.error(`[agent/run] erro inesperado — sessionId=${sessionId} —`, error);
    return res.status(500).json({ error: 'erro interno' });
  }
});

module.exports = router;
