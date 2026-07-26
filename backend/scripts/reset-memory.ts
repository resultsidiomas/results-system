/**
 * Reseta a memória de conversa dos agentes.
 *
 * Apaga as linhas de `conversations` (histórico, score, collected_data) e
 * destrava `pausar_ia` — **mantém** `contacts`, que é cadastro de CRM, não
 * memória. Grava um backup JSON antes de apagar qualquer coisa.
 *
 * A memória em Redis (`chat:*`, `pause_until:*`, `*_block`, `seen:*`, `join:*`)
 * **não** é tocada aqui: o Redis roda em rede interna do Docker na VPS e não é
 * alcançável de fora. Rodar lá (ver instruções no fim da saída).
 *
 * Rodar: npx tsx --env-file=../.env scripts/reset-memory.ts [--dry-run]
 */
import { writeFileSync } from 'node:fs';
import { supabase } from '../src/config/supabase.js';

const dryRun = process.argv.includes('--dry-run');
const backupPath =
  process.env.RESET_BACKUP_PATH ?? `./reset-memory-backup-${Date.now()}.json`;

const { data: conversations, error: convError } = await supabase.from('conversations').select('*');
if (convError) throw convError;

const { data: contacts, error: contactError } = await supabase.from('contacts').select('*');
if (contactError) throw contactError;

const paused = (contacts ?? []).filter((c) => c.pausar_ia === 'Sim');

writeFileSync(
  backupPath,
  JSON.stringify({ takenAt: new Date().toISOString(), conversations, contacts }, null, 2),
  'utf-8',
);

console.log(`backup: ${backupPath}`);
console.log(`conversas a apagar: ${conversations?.length ?? 0}`);
console.log(`contatos a destravar (pausar_ia='Sim' -> 'Não'): ${paused.length}`);
console.log(`contatos preservados: ${contacts?.length ?? 0}`);

if (dryRun) {
  console.log('\n--dry-run: nada foi alterado');
  process.exit(0);
}

// `neq` com uuid impossível = "todas as linhas" sem precisar de delete sem filtro
// (o supabase-js exige filtro em delete/update pra evitar acidente).
const { error: deleteError } = await supabase
  .from('conversations')
  .delete()
  .neq('id', '00000000-0000-0000-0000-000000000000');
if (deleteError) throw deleteError;

const { error: unpauseError } = await supabase
  .from('contacts')
  .update({ pausar_ia: 'Não' })
  .eq('pausar_ia', 'Sim');
if (unpauseError) throw unpauseError;

const { count: remaining } = await supabase
  .from('conversations')
  .select('*', { count: 'exact', head: true });
const { count: stillPaused } = await supabase
  .from('contacts')
  .select('*', { count: 'exact', head: true })
  .eq('pausar_ia', 'Sim');

console.log('\nDEPOIS:');
console.log(`  conversas restantes: ${remaining} (esperado 0)`);
console.log(`  contatos ainda pausados: ${stillPaused} (esperado 0)`);
console.log('\nFalta o Redis (rodar no console do serviço Redis na VPS/EasyPanel):');
console.log(
  '  redis-cli --scan --pattern "chat:*" | xargs -r redis-cli DEL\n' +
    '  redis-cli --scan --pattern "pause_until:*" | xargs -r redis-cli DEL\n' +
    '  redis-cli --scan --pattern "*_block" | xargs -r redis-cli DEL\n' +
    '  redis-cli --scan --pattern "join:*" | xargs -r redis-cli DEL\n' +
    '  redis-cli --scan --pattern "seen:*" | xargs -r redis-cli DEL\n' +
    '  redis-cli --scan --pattern "handoff_alert:*" | xargs -r redis-cli DEL',
);
