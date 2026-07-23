import { z } from 'zod';

export const PRICE_TABLE_VARIANTS = ['geral', '12_meses', '6_meses', 'sem_fidelizacao'] as const;
export type PriceTableVariant = (typeof PRICE_TABLE_VARIANTS)[number];

export const commercialTurnSchema = z.object({
  reply: z.string().min(1),
  send_price_table: z.boolean(),
  price_table_variant: z.enum(PRICE_TABLE_VARIANTS),
  collected_data: z.object({
    interested_course: z.string().nullable(),
    availability: z.string().nullable(),
    objective: z.string().nullable(),
    urgency: z.enum(['alta', 'baixa']).nullable(),
    has_tried_before: z.boolean().nullable(),
    price_asked: z.boolean().nullable(),
    wants_to_schedule: z.boolean().nullable(),
    lead_source: z.string().nullable(),
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
      send_price_table: { type: 'boolean' },
      price_table_variant: { type: 'string', enum: PRICE_TABLE_VARIANTS },
      collected_data: {
        type: 'object',
        properties: {
          interested_course: { type: ['string', 'null'] },
          availability: { type: ['string', 'null'] },
          objective: { type: ['string', 'null'] },
          urgency: { type: ['string', 'null'], enum: ['alta', 'baixa', null] },
          has_tried_before: { type: ['boolean', 'null'] },
          price_asked: { type: ['boolean', 'null'] },
          wants_to_schedule: { type: ['boolean', 'null'] },
          lead_source: { type: ['string', 'null'] },
        },
        required: [
          'interested_course',
          'availability',
          'objective',
          'urgency',
          'has_tried_before',
          'price_asked',
          'wants_to_schedule',
          'lead_source',
        ],
        additionalProperties: false,
      },
    },
    required: ['reply', 'send_price_table', 'price_table_variant', 'collected_data'],
    additionalProperties: false,
  },
} as const;
