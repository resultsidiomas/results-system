/**
 * Registro único de tudo que o agente lê.
 *
 * Antes esta informação estava espalhada: a lista de blocos vivia hardcoded
 * dentro de `commercial.service.ts` e `support.service.ts`, os títulos não
 * existiam em lugar nenhum e não havia como saber, olhando um só arquivo, o
 * que compõe o prompt de cada agente. Editar exigia caçar o `composeSystemPrompt`
 * de cada service.
 *
 * Este arquivo é a fonte estrutural (quais blocos existem, o que cada um é,
 * em que ordem entram); o **conteúdo** editável vive em `agent_prompt_blocks`
 * no Supabase, semeado a partir dos `.md` daqui. Os `.md` continuam no git
 * como versão de referência e fallback se o banco estiver fora.
 */

export type AgentType = 'commercial' | 'support';
export type AgentScope = AgentType | 'shared';
export type BlockCategory =
  | 'comportamento'
  | 'comercial'
  | 'suporte'
  | 'regras'
  | 'conhecimento';

export interface PromptBlockDefinition {
  /** Igual ao caminho relativo dentro de `backend/agents/` — casa banco e disco. */
  key: string;
  title: string;
  scope: AgentScope;
  category: BlockCategory;
  /** Explica ao humano que edita o que aquele bloco controla. */
  description: string;
  /**
   * `false` = referência para consulta/RAG, não entra no system prompt.
   * Aparece no painel para leitura, mas não é enviado ao modelo a cada turno.
   */
  inPrompt: boolean;
}

export const PROMPT_BLOCKS: readonly PromptBlockDefinition[] = [
  {
    key: 'commercial/prompt-v1.md',
    title: 'Comercial — instrução principal',
    scope: 'commercial',
    category: 'comercial',
    description:
      'Fluxo da conversa do agente comercial: abertura, qualificação, conexão, quando mandar a tabela de preços e como conduzir para a aula experimental.',
    inPrompt: true,
  },
  {
    key: 'support/prompt-v1.md',
    title: 'Suporte — instrução principal',
    scope: 'support',
    category: 'suporte',
    description:
      'Fluxo do agente de suporte ao aluno: dúvidas, reagendamento, retenção e quando escalar para a equipe.',
    inPrompt: true,
  },
  {
    key: 'shared/persona.md',
    title: 'Persona e tom de voz',
    scope: 'shared',
    category: 'comportamento',
    description:
      'Identidade (Jessica), tom, tamanho das bolhas, política de emoji, proibição de travessão e markdown. Vale para os dois agentes.',
    inPrompt: true,
  },
  {
    key: 'shared/forbidden-phrases.md',
    title: 'Regras rígidas — nunca fazer',
    scope: 'shared',
    category: 'regras',
    description:
      'Lista do que o agente nunca pode fazer: inventar preço/prazo/horário, negociar fora da tabela, afirmar ser humana, pedir dado sensível.',
    inPrompt: true,
  },
  {
    key: 'shared/school-info.md',
    title: 'Dados da escola e do método',
    scope: 'shared',
    category: 'conhecimento',
    description:
      'Fatos confirmados sobre a Results e o Método Callan que o agente pode afirmar sem consultar a equipe.',
    inPrompt: true,
  },
  {
    key: 'commercial/objections.md',
    title: 'Comercial — objeções',
    scope: 'commercial',
    category: 'comercial',
    description: 'Como responder às objeções mais comuns sem inventar desconto nem validar comparação com concorrente.',
    inPrompt: true,
  },
  {
    key: 'commercial/handoff-rules.md',
    title: 'Comercial — regras de handoff',
    scope: 'commercial',
    category: 'comercial',
    description: 'Quando a conversa sai da IA e vai para uma pessoa da equipe.',
    inPrompt: true,
  },
  {
    key: 'support/rescheduling-rules.md',
    title: 'Suporte — regras de reagendamento',
    scope: 'support',
    category: 'suporte',
    description: 'Política de remarcação de aula: prazo mínimo de 3 horas, custo adicional e o que vale para turma.',
    inPrompt: true,
  },
  {
    key: 'support/retention-flow.md',
    title: 'Suporte — fluxo de retenção',
    scope: 'support',
    category: 'suporte',
    description: 'Como conduzir quando o aluno sinaliza cancelamento ou insatisfação.',
    inPrompt: true,
  },
  {
    key: 'support/faq.md',
    title: 'Suporte — FAQ',
    scope: 'support',
    category: 'suporte',
    description:
      'Perguntas frequentes do aluno. Vai no prompt (e não na busca semântica) porque é o assunto mais frequente do suporte e a recuperação falhando fazia o agente inventar fluxo de senha.',
    inPrompt: true,
  },

  // Referência: aparece no painel para leitura e edição, mas não é injetado no
  // prompt a cada turno — chega ao agente pela busca semântica (RAG) ou é
  // consumido por código (scoring).
  {
    key: 'commercial/knowledge-base.md',
    title: 'Comercial — base de conhecimento',
    scope: 'commercial',
    category: 'conhecimento',
    description:
      'Planos, modalidades e política comercial. Chega ao agente pela busca semântica, não vai inteiro no prompt.',
    inPrompt: false,
  },
  {
    key: 'support/knowledge-base.md',
    title: 'Suporte — base de conhecimento',
    scope: 'support',
    category: 'conhecimento',
    description: 'Informação operacional do aluno. Chega ao agente pela busca semântica.',
    inPrompt: false,
  },
  {
    key: 'commercial/scoring-rules.md',
    title: 'Comercial — regras de score',
    scope: 'commercial',
    category: 'conhecimento',
    description:
      'Documentação de como o lead é pontuado. O cálculo real está em código (`commercial.scoring.ts`); editar aqui não muda o score.',
    inPrompt: false,
  },
] as const;

/**
 * Ordem de montagem do system prompt por agente.
 *
 * A instrução principal vem primeiro e as regras compartilhadas logo em
 * seguida: o prefixo precisa ser estável entre turnos para o prompt caching da
 * OpenAI valer (o CONTEXTO RELEVANTE dinâmico é anexado no fim, ver
 * `agent.prompt.ts`).
 */
export const PROMPT_COMPOSITION: Readonly<Record<AgentType, readonly string[]>> = {
  commercial: [
    'commercial/prompt-v1.md',
    'shared/persona.md',
    'shared/forbidden-phrases.md',
    'shared/school-info.md',
    'commercial/objections.md',
    'commercial/handoff-rules.md',
  ],
  support: [
    'support/prompt-v1.md',
    'shared/persona.md',
    'shared/forbidden-phrases.md',
    'shared/school-info.md',
    'support/rescheduling-rules.md',
    'support/retention-flow.md',
    'support/faq.md',
  ],
} as const;

const BLOCKS_BY_KEY = new Map(PROMPT_BLOCKS.map((block) => [block.key, block]));

export function findBlockDefinition(key: string): PromptBlockDefinition | undefined {
  return BLOCKS_BY_KEY.get(key);
}
