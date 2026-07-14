import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ASSETS_DIR = resolve(process.cwd(), 'assets/price-table');

interface PriceTableImage {
  fileName: string;
  base64: string;
  mimeType: string;
}

let cache: PriceTableImage[] | null = null;

function mimeTypeFor(fileName: string): string {
  return fileName.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
}

export function getPriceTableImages(): PriceTableImage[] {
  if (cache) return cache;

  cache = readdirSync(ASSETS_DIR)
    .filter((fileName) => /\.(jpe?g|png)$/i.test(fileName))
    .sort()
    .map((fileName) => ({
      fileName,
      base64: readFileSync(resolve(ASSETS_DIR, fileName)).toString('base64'),
      mimeType: mimeTypeFor(fileName),
    }));

  return cache;
}
