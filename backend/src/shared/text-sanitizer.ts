import { env } from '../config/env.js';

/**
 * Um emoji "de verdade" pro contador: pictográfico base + modificadores
 * (variation selector, tom de pele, sequência ZWJ, keycap). Sem agrupar isso,
 * um emoji composto contaria como 2–3 e o corte ficaria no meio da sequência,
 * deixando byte órfão na mensagem.
 */
const EMOJI_SEQUENCE =
  /\p{Extended_Pictographic}(?:️|⃣|\p{Emoji_Modifier})*(?:‍\p{Extended_Pictographic}(?:️|⃣|\p{Emoji_Modifier})*)*/gu;

/** Linha que é só separador visual (`---`, `***`, `___`, `===`). */
const HORIZONTAL_RULE = /^\s*(?:[-*_=]\s*){3,}$/;

/**
 * Remove travessão (—) e meia-risca (–) da resposta.
 *
 * A regra "nunca usar travessão" já existia em `persona.md` e
 * `forbidden-phrases.md`, mas só como instrução — e o modelo continuou usando,
 * observado na revisão de conversa real. O motivo é que o próprio prompt
 * ensinava o hábito: os exemplos de fala dentro de `commercial/prompt-v1.md`
 * eram escritos com travessão ("Perfeito, particular então — vou te mandar a
 * tabela"). Os exemplos foram reescritos, e este corte determinístico garante
 * o resto: instrução sozinha não segurou o comportamento nenhuma das vezes.
 *
 * No meio da frase o travessão vira vírgula (mantém a pausa que ele fazia);
 * no começo da linha ele é marcador de lista disfarçado e sai inteiro.
 */
function stripEmDash(text: string): string {
  return text
    .replace(/^[ \t]*[—–][ \t]*/gm, '')
    .replace(/[ \t]*[—–][ \t]*/g, ', ')
    .replace(/,\s*([,.;:!?])/g, '$1')
    .replace(/[ \t]*,[ \t]*$/gm, '');
}

/**
 * Remove a formatação que o modelo copia do system prompt (que é markdown) e
 * que no WhatsApp chega como lixo literal pro lead.
 *
 * Observado em produção: `---` sozinho numa bolha, `**texto**` com asterisco
 * duplo (WhatsApp usa um só), `##` de cabeçalho e `<!-- fonte: ... -->` do
 * separador de seções do prompt.
 */
function stripMarkdown(text: string): string {
  const withoutBlocks = text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/`([^`]+)`/g, '$1');

  return withoutBlocks
    .split('\n')
    .filter((line) => !HORIZONTAL_RULE.test(line))
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s*/, '')
        .replace(/^\s{0,3}>\s?/, '')
        .replace(/^(\s*)[-*+]\s+/, '$1')
        .replace(/\*\*\*(.+?)\*\*\*/g, '*$1*')
        .replace(/\*\*(.+?)\*\*/g, '*$1*')
        .replace(/__(.+?)__/g, '*$1*')
        .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '$1: $2')
        .trimEnd(),
    )
    .join('\n');
}

/**
 * Corta emoji além do limite (`AGENT_MAX_EMOJIS`, default 1 por resposta).
 *
 * Regra de prompt não resolveu: os exemplos do próprio prompt terminavam em
 * emoji, então o modelo aprendia a fechar toda bolha com um. Limite
 * determinístico aqui é a única garantia — vale pra resposta inteira, não por
 * bolha, senão cada fração ganharia o seu.
 */
function capEmojis(text: string, max: number): string {
  let kept = 0;

  const capped = text.replace(EMOJI_SEQUENCE, (match) => {
    kept += 1;
    return kept <= max ? match : '';
  });

  if (kept <= max) return text;

  // Sobra de espaço/pontuação órfã onde o emoji saiu ("certinha  ." → "certinha.")
  return capped
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([,.;:!?])/g, '$1')
    .replace(/[ \t]+\n/g, '\n');
}

/**
 * Normaliza a resposta do modelo antes de qualquer split ou envio.
 *
 * 1. `"\n"` literal (barra + n): o modelo às vezes devolve os dois caracteres
 *    dentro do JSON, sobrevive ao JSON.parse e chega cru pro lead.
 * 2. Markdown → texto puro de WhatsApp.
 * 3. Travessão removido.
 * 4. Emoji limitado — o orçamento vem de quem chama, porque depende da posição
 *    na conversa (ver `emojiBudget` em `agent.emoji-budget.ts`), não do texto.
 * 5. Excesso de linha em branco colapsado (3+ viram 1 separação de bolha).
 */
export function sanitizeOutgoingText(text: string, maxEmojis = env.AGENT_MAX_EMOJIS): string {
  const unescaped = text
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\r\n/g, '\n');

  const plain = stripEmDash(stripMarkdown(unescaped));

  return capEmojis(plain, maxEmojis).replace(/\n{3,}/g, '\n\n').trim();
}
