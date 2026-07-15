import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PriceTableVariant } from '../../agents/commercial/commercial.schema.js';

const ASSETS_DIR = resolve(process.cwd(), 'assets/price-table');

interface PriceTableImage {
  fileName: string;
  base64: string;
  mimeType: string;
}

// Sempre manda tabela-01 (visao geral: 12m + 6m + sem fidelizacao, particular
// e turma, tudo junto numa imagem so) — nunca as variantes por plano
// isolado (tabela-02/03/04), mesmo que o parametro `variant` peca outra
// coisa. Decisao: uma unica foto com todos os valores em vez de mandar
// varias fotos por turno.
const GERAL_FILE = 'tabela-01.jpeg';

const cache = new Map<string, PriceTableImage>();

function mimeTypeFor(fileName: string): string {
  return fileName.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
}

export function getPriceTableImage(_variant: PriceTableVariant): PriceTableImage {
  const fileName = GERAL_FILE;

  const cached = cache.get(fileName);
  if (cached) return cached;

  const image: PriceTableImage = {
    fileName,
    base64: readFileSync(resolve(ASSETS_DIR, fileName)).toString('base64'),
    mimeType: mimeTypeFor(fileName),
  };
  cache.set(fileName, image);
  return image;
}
