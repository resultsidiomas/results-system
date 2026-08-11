import { z } from 'zod';

export const PRICE_TABLE_VARIANTS = ['geral', '12_meses', '6_meses', 'sem_fidelizacao'] as const;
export type PriceTableVariant = (typeof PRICE_TABLE_VARIANTS)[number];

/**
 * Etapas do "Fluxo da conversa" do `commercial/prompt-v1.md`, na ordem.
 *
 * Declarado pelo próprio modelo, não derivado de `collected_data`: os dados
 * coletados dizem o que o lead já respondeu, não onde a conversa está. Um lead
 * que responde qualificação inteira e depois levanta objeção continuaria
 * marcado como "qualificação" por qualquer heurística baseada em campo
 * preenchido.
 */
export const CONVERSATION_PHASES = [
  'abertura',
  'qualificacao',
  'conexao',
  'preco',
  'experimental',
  'objecao',
] as const;
export type ConversationPhase = (typeof CONVERSATION_PHASES)[number];

export const commercialTurnSchema = z.object({
  reply: z.string().min(1),
  send_price_table: z.boolean(),
  price_table_variant: z.enum(PRICE_TABLE_VARIANTS),
  conversation_phase: z.enum(CONVERSATION_PHASES),
  collected_data: z.object({
    interested_course: z.string().nullable(),
    availability: z.string().nullable(),
    objective: z.string().nullable(),
    urgency: z.enum(['alta', 'baixa']).nullable(),
    has_tried_before: z.boolean().nullable(),
    price_asked: z.boolean().nullable(),
    wants_to_schedule: z.boolean().nullable(),
    /** Lead disse "sim" pra falar com um consultor da equipe — ver ADR-014. */
    accepted_consultant: z.boolean().nullable(),
    lead_source: z.string().nullable(),
    full_name: z.string().nullable(),
    email: z.string().nullable(),
    needs_human: z.boolean().nullable(),
  }),
});

export type CommercialTurn = z.infer<typeof commercialTurnSchema>;
export type CommercialCollectedData = CommercialTurn['collected_data'];

export const EMPTY_COLLECTED_DATA: CommercialCollectedData = {
  interested_course: null,
  availability: null,
  objective: null,
  urgency: null,
  has_tried_before: null,
  price_asked: null,
  wants_to_schedule: null,
  accepted_consultant: null,
  lead_source: null,
  full_name: null,
  email: null,
  needs_human: null,
};

/**
 * Booleanos de evento: uma vez verdadeiros, nunca voltam pra falso. O modelo
 * costuma omitir/zerar esses campos em turnos seguintes, e sem trava o score
 * oscilava e o handoff virava sorteio.
 */
const LATCHING_FLAGS = [
  'price_asked',
  'wants_to_schedule',
  'accepted_consultant',
  'needs_human',
] as const;

/**
 * Junta o que já foi coletado antes com o que veio no turno atual.
 *
 * Necessário porque o spread simples (`{...previous, ...incoming}`) deixa um
 * `null` do turno novo sobrescrever um valor real já coletado — o lead informa
 * o idioma no turno 2, o modelo não repete no turno 5, e o dado somem do CRM
 * (e o score cai junto). Aqui `null` do turno novo nunca apaga valor anterior.
 */
export function mergeCollectedData(
  previous: Record<string, unknown>,
  incoming: CommercialCollectedData,
): CommercialCollectedData {
  const merged = { ...EMPTY_COLLECTED_DATA };

  for (const key of Object.keys(EMPTY_COLLECTED_DATA) as Array<keyof CommercialCollectedData>) {
    const previousValue = previous[key] ?? null;
    const incomingValue = incoming[key] ?? null;

    const value = (LATCHING_FLAGS as readonly string[]).includes(key)
      ? previousValue === true || incomingValue === true
      : (incomingValue ?? previousValue);

    (merged as Record<string, unknown>)[key] = value;
  }

  return merged;
}

export const commercialResponseJsonSchema = {
  name: 'commercial_turn',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      reply: { type: 'string' },
      send_price_table: { type: 'boolean' },
      price_table_variant: { type: 'string', enum: PRICE_TABLE_VARIANTS },
      conversation_phase: { type: 'string', enum: CONVERSATION_PHASES },
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
          accepted_consultant: { type: ['boolean', 'null'] },
          lead_source: { type: ['string', 'null'] },
          full_name: { type: ['string', 'null'] },
          email: { type: ['string', 'null'] },
          needs_human: { type: ['boolean', 'null'] },
        },
        required: [
          'interested_course',
          'availability',
          'objective',
          'urgency',
          'has_tried_before',
          'price_asked',
          'wants_to_schedule',
          'accepted_consultant',
          'lead_source',
          'full_name',
          'email',
          'needs_human',
        ],
        additionalProperties: false,
      },
    },
    required: [
      'reply',
      'send_price_table',
      'price_table_variant',
      'conversation_phase',
      'collected_data',
    ],
    additionalProperties: false,
  },
} as const;
