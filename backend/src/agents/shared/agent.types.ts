import type { PriceTableVariant } from '../commercial/commercial.schema.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  at: string;
}

export interface AgentTurnResult {
  reply: string;
  leadScore: number;
  handoff: boolean;
  sendPriceTable: boolean;
  priceTableVariant: PriceTableVariant;
}
