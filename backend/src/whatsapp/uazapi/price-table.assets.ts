import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PriceTableVariant } from '../../agents/commercial/commercial.schema.js';

const ASSETS_DIR = resolve(process.cwd(), 'assets/price-table');

interface PriceTableImage {
  fileName: string;
  base64: string;
  mimeType: string;
}

// tabela-01 = visao geral (12m + 6m + sem fidelizacao juntos, mesmo dado
// dos outros 3, so que numa imagem so) — usada quando o lead ainda nao
// falou qual duracao de plano prefere. tabela-02/03/04 = cartao isolado de
// cada plano, usado quando o lead ja deixou claro a preferencia.
const FILE_BY_VARIANT: Record<PriceTableVariant, string> = {
  geral: 'tabela-01.jpeg',
  sem_fidelizacao: 'tabela-02.jpeg',
  '6_meses': 'tabela-03.jpeg',
  '12_meses': 'tabela-04.jpeg',
};

const cache = new Map<string, PriceTableImage>();

function mimeTypeFor(fileName: string): string {
  return fileName.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
}

export function getPriceTableImage(variant: PriceTableVariant): PriceTableImage {
  const fileName = FILE_BY_VARIANT[variant] ?? FILE_BY_VARIANT.geral;

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
