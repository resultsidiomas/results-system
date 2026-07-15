const OpenAI = require('openai');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const MAX_TOKENS = parseInt(process.env.OPENAI_MAX_TOKENS || '1024', 10);

async function runAgent(history, message, contexto) {
  const messages = [];

  if (contexto && Object.keys(contexto).length) {
    messages.push({
      role: 'system',
      content: `Contexto adicional fornecido pelo chamador: ${JSON.stringify(contexto)}`,
    });
  }

  messages.push(...history, { role: 'user', content: message });

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages,
    max_tokens: MAX_TOKENS,
  });

  const reply = completion.choices[0]?.message?.content;
  if (!reply) {
    throw new Error('Resposta da OpenAI sem conteudo');
  }

  return reply;
}

module.exports = { runAgent, MODEL };
