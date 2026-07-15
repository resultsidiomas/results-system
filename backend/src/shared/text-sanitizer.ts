/**
 * Modelo às vezes devolve "\n" como dois caracteres literais (barra + n) em
 * vez de quebra de linha real dentro do JSON — sobrevive ao JSON.parse e
 * aparece pro lead como "\n" cru na mensagem. Normaliza pra quebra de linha
 * de verdade antes de qualquer split ou envio.
 */
export function sanitizeOutgoingText(text: string): string {
  return text
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n');
}
