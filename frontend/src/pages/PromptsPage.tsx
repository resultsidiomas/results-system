import { useEffect, useMemo, useState } from 'react';
import { api, type PromptBlock, type PromptVersion } from '../lib/api';

const CATEGORY_LABELS: Record<PromptBlock['category'], string> = {
  comportamento: 'Comportamento e tom de voz',
  regras: 'Regras rígidas',
  comercial: 'Informações comerciais',
  suporte: 'Informações de suporte',
  conhecimento: 'Base de conhecimento',
};

const CATEGORY_ORDER: Array<PromptBlock['category']> = [
  'comportamento',
  'regras',
  'comercial',
  'suporte',
  'conhecimento',
];

export default function PromptsPage() {
  const [blocks, setBlocks] = useState<PromptBlock[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{ agent: string; text: string; chars: number } | null>(null);

  const selected = blocks.find((block) => block.block_key === selectedKey) ?? null;
  const dirty = selected !== null && draft !== selected.content;

  const grouped = useMemo(() => {
    return CATEGORY_ORDER.map((category) => ({
      category,
      items: blocks.filter((block) => block.category === category),
    })).filter((group) => group.items.length > 0);
  }, [blocks]);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await api.listPrompts();
      setBlocks(data.blocks);
      setSelectedKey((current) => current ?? data.blocks[0]?.block_key ?? null);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selected) setDraft(selected.content);
    setShowVersions(false);
    setStatus(null);
  }, [selectedKey, selected?.version]);

  function selectBlock(key: string) {
    // Trocar de bloco com edição pendente perderia o texto sem aviso — quem
    // edita prompt costuma reescrever parágrafos inteiros antes de salvar.
    if (dirty && !window.confirm('Você tem alterações não salvas. Descartar?')) return;
    setSelectedKey(key);
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    setStatus(null);

    try {
      const updated = await api.savePrompt(selected.block_key, draft);
      setBlocks((current) =>
        current.map((block) => (block.block_key === updated.block_key ? { ...block, ...updated } : block)),
      );
      setStatus(`Salvo. Versão ${updated.version}. O agente passa a usar em até 30 segundos.`);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function openVersions() {
    if (!selected) return;
    try {
      const data = await api.listVersions(selected.block_key);
      setVersions(data.versions);
      setShowVersions(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function restore(version: number) {
    if (!selected) return;
    if (!window.confirm(`Restaurar a versão ${version}? O conteúdo atual vira histórico.`)) return;

    try {
      const updated = await api.restoreVersion(selected.block_key, version);
      setBlocks((current) =>
        current.map((block) => (block.block_key === updated.block_key ? { ...block, ...updated } : block)),
      );
      setDraft(updated.content);
      setShowVersions(false);
      setStatus(`Versão ${version} restaurada.`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function loadPreview(agent: 'commercial' | 'support') {
    try {
      const data = await api.previewPrompt(agent);
      setPreview({ agent, text: data.prompt, chars: data.characters });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (loading) return <p className="muted">Carregando…</p>;

  return (
    <div className="prompts-layout">
      <aside className="block-list">
        {grouped.map((group) => (
          <div key={group.category} className="block-group">
            <h3>{CATEGORY_LABELS[group.category]}</h3>
            {group.items.map((block) => (
              <button
                key={block.block_key}
                className={block.block_key === selectedKey ? 'block-item active' : 'block-item'}
                onClick={() => selectBlock(block.block_key)}
              >
                <span className="block-title">{block.title}</span>
                <span className="block-meta">
                  {block.in_prompt ? 'no prompt' : 'consulta'} · v{block.version}
                </span>
              </button>
            ))}
          </div>
        ))}

        <div className="block-group">
          <h3>Prompt final</h3>
          <button className="block-item" onClick={() => void loadPreview('commercial')}>
            <span className="block-title">Ver prompt do comercial</span>
            <span className="block-meta">como o modelo recebe</span>
          </button>
          <button className="block-item" onClick={() => void loadPreview('support')}>
            <span className="block-title">Ver prompt do suporte</span>
            <span className="block-meta">como o modelo recebe</span>
          </button>
        </div>
      </aside>

      <section className="editor">
        {error && <p className="error">{error}</p>}

        {preview ? (
          <>
            <header className="editor-header">
              <div>
                <h2>Prompt final — {preview.agent === 'commercial' ? 'comercial' : 'suporte'}</h2>
                <p className="muted">
                  {preview.chars.toLocaleString('pt-BR')} caracteres. Somente leitura: é o resultado da
                  junção dos blocos, na ordem em que o agente lê.
                </p>
              </div>
              <button onClick={() => setPreview(null)}>Fechar</button>
            </header>
            <textarea className="prompt-area" value={preview.text} readOnly />
          </>
        ) : selected ? (
          <>
            <header className="editor-header">
              <div>
                <h2>{selected.title}</h2>
                <p className="muted">{selected.description}</p>
                <p className="muted small">
                  {selected.block_key} · versão {selected.version}
                  {selected.updated_by ? ` · última edição por ${selected.updated_by}` : ''}
                  {selected.used_by.length > 0
                    ? ` · usado por: ${selected.used_by.join(', ')}`
                    : ' · não entra no prompt (consulta/RAG)'}
                </p>
              </div>
              <div className="editor-actions">
                <button onClick={() => void openVersions()}>Histórico</button>
                <button className="primary" onClick={() => void save()} disabled={!dirty || saving}>
                  {saving ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </header>

            {status && <p className="status">{status}</p>}

            <textarea
              className="prompt-area"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
            />

            {showVersions && (
              <div className="versions">
                <h3>Histórico de versões</h3>
                {versions.length === 0 && <p className="muted">Nenhuma edição anterior.</p>}
                {versions.map((version) => (
                  <div key={version.version} className="version-row">
                    <span>
                      v{version.version} · {new Date(version.created_at).toLocaleString('pt-BR')}
                      {version.updated_by ? ` · ${version.updated_by}` : ''}
                    </span>
                    <button onClick={() => void restore(version.version)}>Restaurar</button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="muted">Selecione um bloco à esquerda.</p>
        )}
      </section>
    </div>
  );
}
