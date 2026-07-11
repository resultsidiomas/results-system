# ADR-002: Banco de Dados — Supabase Client + Zod

## Status
**Aceito** — 2026-06-28

## Contexto

Precisamos de:
- Banco relacional (leads, alunos, conversas, turmas, professores)
- Acesso type-safe a partir do backend TypeScript
- Realtime para notificações no CRM (opcional mas desejável)
- Hosting gerenciado (equipe pequena, sem ops)
- RLS para segurança por row

## Decisão

**Supabase (PostgreSQL) com Supabase JS Client + Zod para validação**

Sem ORM adicional. Supabase CLI gera types TypeScript automaticamente a partir
do schema. Zod valida dados na borda (entrada de webhooks, payloads externos).

## Alternativas Consideradas

### Prisma + Supabase
- Prós: DX excelente, migrations gerenciadas, relations type-safe
- Contras: overhead extra (dois toolings para sincronizar), Prisma tem
  limitações com features Postgres-específicas que vamos usar (RLS, realtime)
- Rejeitado: complexidade desnecessária para o escopo

### Drizzle ORM
- Prós: ultra leve, TypeScript-nativo, queries SQL-like
- Contras: ecossistema menor, equipe menos familiarizada
- Rejeitado em favor da simplicidade do client direto

## Consequências

- Migrations via Supabase CLI (`supabase migration new`)
- Types gerados: `supabase gen types typescript --local > src/types/database.ts`
- RLS habilitado em todas as tabelas com dados sensíveis
- Zod schemas para validar payloads externos antes de persistir
- Realtime disponível para o CRM sem configuração extra

## Comandos Padrão

```bash
# Gerar types após mudança de schema
supabase gen types typescript --project-id <id> > backend/src/types/database.ts

# Nova migration
supabase migration new <nome-descritivo>

# Aplicar migrations
supabase db push
```
