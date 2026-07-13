import { z } from 'zod';

export const commercialTurnSchema = z.object({
  reply: z.string().min(1),
  collected_data: z.object({
    interested_course: z.string().nullable(),
    availability: z.string().nullable(),
    objective: z.string().nullable(),
    urgency: z.enum(['alta', 'baixa']).nullable(),
    has_tried_before: z.boolean().nullable(),
    price_asked: z.boolean().nullable(),
  }),
});

export type CommercialTurn = z.infer<typeof commercialTurnSchema>;
export type CommercialCollectedData = CommercialTurn['collected_data'];

export const commercialResponseJsonSchema = {
  name: 'commercial_turn',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      reply: { type: 'string' },
      collected_data: {
        type: 'object',
        properties: {
          interested_course: { type: ['string', 'null'] },
          availability: { type: ['string', 'null'] },
          objective: { type: ['string', 'null'] },
          urgency: { type: ['string', 'null'], enum: ['alta', 'baixa', null] },
          has_tried_before: { type: ['boolean', 'null'] },
          price_asked: { type: ['boolean', 'null'] },
        },
        required: [
          'interested_course',
          'availability',
          'objective',
          'urgency',
          'has_tried_before',
          'price_asked',
        ],
        additionalProperties: false,
      },
    },
    required: ['reply', 'collected_data'],
    additionalProperties: false,
  },
} as const;
