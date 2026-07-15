const HISTORY_LIMIT = parseInt(process.env.SESSION_HISTORY_LIMIT || '20', 10);
const SESSION_TTL_MS = parseInt(process.env.SESSION_TTL_MS || '3600000', 10);

const sessions = new Map();

function getHistory(sessionId) {
  if (!sessionId) return [];
  const session = sessions.get(sessionId);
  if (!session) return [];
  if (Date.now() - session.updatedAt > SESSION_TTL_MS) {
    sessions.delete(sessionId);
    return [];
  }
  return session.messages;
}

function appendTurn(sessionId, userMessage, assistantReply) {
  if (!sessionId) return;
  const session = sessions.get(sessionId) || { messages: [], updatedAt: Date.now() };
  session.messages.push({ role: 'user', content: userMessage });
  session.messages.push({ role: 'assistant', content: assistantReply });
  if (session.messages.length > HISTORY_LIMIT) {
    session.messages = session.messages.slice(-HISTORY_LIMIT);
  }
  session.updatedAt = Date.now();
  sessions.set(sessionId, session);
}

module.exports = { getHistory, appendTurn };
