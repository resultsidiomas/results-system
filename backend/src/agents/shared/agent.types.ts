export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  at: string;
}

export interface AgentTurnResult {
  reply: string;
  leadScore: number;
}
