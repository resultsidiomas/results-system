import type { PriceTableVariant } from '../commercial/commercial.schema.js';
import type { EscalationReason } from '../support/support.schema.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  at: string;
}

export interface AgentTurnResult {
  reply: string;
  leadScore: number;
  /** Gi foi avisada neste turno. */
  handoff: boolean;
  /** IA sai da conversa até intervenção humana — só em pedido explícito. */
  pauseAi: boolean;
  sendPriceTable: boolean;
  priceTableVariant: PriceTableVariant;
}

export interface SupportTurnResult {
  reply: string;
  handoff: boolean;
  pauseAi: boolean;
  escalationReason: EscalationReason | null;
}
