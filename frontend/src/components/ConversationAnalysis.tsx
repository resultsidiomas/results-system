import type { ConversationPhase } from '../lib/api';

/** Ordem do "Fluxo da conversa" em `commercial/prompt-v1.md`. */
export const PHASES: Array<{ key: ConversationPhase; label: string }> = [
  { key: 'abertura', label: 'Abertura' },
  { key: 'qualificacao', label: 'Qualificação' },
  { key: 'conexao', label: 'Conexão' },
  { key: 'preco', label: 'Preço' },
  { key: 'experimental', label: 'Experimental' },
  { key: 'objecao', label: 'Objeção' },
];

interface Props {
  phase: ConversationPhase | null;
  leadScore: number;
  pausarIa: string;
  noteCount: number;
  collectedData: Record<string, unknown>;
}

export default function ConversationAnalysis({
  phase,
  leadScore,
  pausarIa,
  noteCount,
  collectedData,
}: Props) {
  const current = PHASES.find((item) => item.key === phase);
  const collected = Object.entries(collectedData).filter(
    ([, value]) => value !== null && value !== undefined && value !== '',
  );

  return (
    <>
      <h3>Fase da conversa</h3>
      <ol className="phases">
        {PHASES.map((item) => (
          <li key={item.key} className={item.key === phase ? 'active' : ''}>
            {item.label}
          </li>
        ))}
      </ol>
      <p className="muted small">
        {current
          ? `O agente declarou estar em "${current.label}" no último turno.`
          : 'Sem fase declarada. Conversas anteriores a essa versão e o agente de suporte não usam esse fluxo.'}
      </p>

      <h3>Análise da conversa</h3>
      <dl>
        <dt>Score do lead</dt>
        <dd>{leadScore} / 10</dd>

        <dt>IA pausada</dt>
        <dd className={pausarIa === 'Sim' ? 'flag' : ''}>{pausarIa}</dd>

        <dt>Observações registradas</dt>
        <dd>{noteCount}</dd>
      </dl>

      <h3>Dados coletados</h3>
      {collected.length === 0 ? (
        <p className="muted">Nada coletado ainda.</p>
      ) : (
        <dl>
          {collected.map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{String(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}
