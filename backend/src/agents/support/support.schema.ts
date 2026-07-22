import { z } from 'zod';

export const ESCALATION_REASONS = [
  'reagendamento',
  'cancelamento',
  'falta_professor',
  'reclamacao',
  'outro',
] as const;
export type EscalationReason = (typeof ESCALATION_REASONS)[number];

export const supportTurnSchema = z.object({
  reply: z.string().min(1),
  needs_human: z.boolean(),
  escalation_reason: z.enum(ESCALATION_REASONS).nullable(),
});

export type SupportTurn = z.infer<typeof supportTurnSchema>;

export const supportResponseJsonSchema = {
  name: 'support_turn',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      reply: { type: 'string' },
      needs_human: { type: 'boolean' },
      escalation_reason: {
        type: ['string', 'null'],
        enum: [...ESCALATION_REASONS, null],
      },
    },
    required: ['reply', 'needs_human', 'escalation_reason'],
    additionalProperties: false,
  },
} as const;
