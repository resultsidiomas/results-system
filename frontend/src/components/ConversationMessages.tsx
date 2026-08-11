import { useState } from 'react';
import type { AgentType, TaggedMessage } from '../lib/api';

const AGENT_LABELS: Record<AgentType, string> = {
  commercial: 'Comercial',
  support: 'Suporte',
};

interface Props {
  messages: TaggedMessage[];
  /** Conversa salva é congelada: mostra observação mas não deixa editar. */
  readOnly?: boolean;
  sending?: boolean;
  emptyText: string;
  onSaveNote?: (messageIndex: number, note: string) => Promise<void>;
}

/**
 * Linha do tempo da conversa, igual para teste e atendimento real.
 *
 * As mensagens chegam já mescladas e marcadas com o agente que as tratou (o
 * roteador pode trocar no meio da conversa) — ver `mergeConversations` no
 * backend.
 */
export default function ConversationMessages({
  messages,
  readOnly = false,
  sending = false,
  emptyText,
  onSaveNote,
}: Props) {
  const [noteFor, setNoteFor] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(messageIndex: number) {
    if (!onSaveNote) return;
    setSaving(true);
    try {
      await onSaveNote(messageIndex, draft.trim());
      setNoteFor(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bubbles">
      {messages.length === 0 && <p className="muted">{emptyText}</p>}

      {messages.map((message, position) => {
        const previous = messages[position - 1];
        // Só marca a troca de agente, não repete a etiqueta em toda bolha: o que
        // interessa observar é o momento em que o roteador trocou.
        const switched = message.role === 'assistant' && previous?.agentType !== message.agentType;

        return (
          <div key={`${message.index}-${position}`} className={`turn ${message.role}`}>
            {switched && (
              <div className={`agent-divider ${message.agentType}`}>
                <span>Agente {AGENT_LABELS[message.agentType]}</span>
              </div>
            )}

            <div
              className={message.role === 'user' ? 'bubble lead' : `bubble agente ${message.agentType}`}
            >
              {message.content}
            </div>

            {message.role === 'assistant' && message.index >= 0 && (
              <div className="bubble-tools">
                {message.note && <p className="note">{message.note}</p>}

                {noteFor === message.index ? (
                  <div className="note-editor">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="O que você observou nessa resposta?"
                      rows={3}
                      autoFocus
                    />
                    <div className="note-actions">
                      <button
                        className="primary"
                        onClick={() => void submit(message.index)}
                        disabled={saving}
                      >
                        {saving ? 'Salvando…' : 'Salvar'}
                      </button>
                      <button onClick={() => setNoteFor(null)}>Cancelar</button>
                      {message.note && (
                        <span className="muted small">Apagar o texto remove a observação.</span>
                      )}
                    </div>
                  </div>
                ) : (
                  !readOnly &&
                  onSaveNote && (
                    <button
                      className="link"
                      onClick={() => {
                        setNoteFor(message.index);
                        setDraft(message.note ?? '');
                      }}
                    >
                      {message.note ? 'Editar observação' : 'Adicionar observação'}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        );
      })}

      {sending && (
        <div className="turn assistant">
          <div className="bubble agente pending">digitando…</div>
        </div>
      )}
    </div>
  );
}
