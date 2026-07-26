import { env } from '../../config/env.js';

/** Fragmento que não é mensagem: separador, pontuação solta, emoji órfão. */
const NOT_A_MESSAGE = /^[\s\p{P}\p{S}]*$/u;

/**
 * Quebra a resposta em bolhas de WhatsApp.
 *
 * Antes só quebrava em linha em branco: o modelo escreve as bolhas separadas
 * por uma quebra simples e o lead recebia tudo num parágrafo só, contrariando
 * a persona ("mensagens curtas e fracionadas, sempre"). Agora quebra em
 * qualquer linha — seguro pra URL, porque link nunca contém quebra de linha
 * (era esse o risco registrado em `persona.md`).
 *
 * Fragmento que é só separador/pontuação é descartado (é daí que vinha a bolha
 * com `---` sozinho); fragmento minúsculo ("Ok!", ":)") gruda no anterior em
 * vez de virar bolha própria; acima de `AGENT_MAX_BUBBLES` o resto é fundido
 * na última pra não metralhar o lead.
 */
export function fractureMessage(text: string, maxBubbles = env.AGENT_MAX_BUBBLES): string[] {
  const fragments = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !NOT_A_MESSAGE.test(line));

  const bubbles: string[] = [];

  for (const fragment of fragments) {
    const previous = bubbles[bubbles.length - 1];
    const tooSmallToStandAlone = fragment.length < 12;

    if (previous !== undefined && (tooSmallToStandAlone || bubbles.length >= maxBubbles)) {
      bubbles[bubbles.length - 1] = `${previous}\n${fragment}`;
      continue;
    }

    bubbles.push(fragment);
  }

  return bubbles;
}
