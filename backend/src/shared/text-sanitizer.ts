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
 * 3. Emoji limitado.
 * 4. Excesso de linha em branco colapsado (3+ viram 1 separação de bolha).
 */
export function sanitizeOutgoingText(text: string, maxEmojis = env.AGENT_MAX_EMOJIS): string {
  const unescaped = text
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\r\n/g, '\n');

  const plain = stripMarkdown(unescaped);

  return capEmojis(plain, maxEmojis).replace(/\n{3,}/g, '\n\n').trim();
}
