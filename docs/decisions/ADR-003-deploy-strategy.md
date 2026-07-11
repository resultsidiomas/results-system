# ADR-003: Estratégia de Deploy — EasyPanel (VPS)

## Status
**Aceito** — 2026-06-28

## Contexto

Precisamos de um ambiente de produção que:
- Hospede o backend Node.js (Fastify)
- Hospede o frontend React (Codex)
- Seja simples de gerenciar para equipe pequena
- Suporte múltiplos serviços (backend, frontend, N8n se usado)
- Tenha SSL automático
- Não exija conhecimento profundo de DevOps

## Decisão

**EasyPanel na VPS**

EasyPanel é um painel de controle de VPS que:
- Gerencia containers Docker com interface visual
- SSL automático via Let's Encrypt
- Deploy via GitHub (push-to-deploy)
- Suporte nativo a Node.js, React, e apps Docker
- Muito mais simples que configurar nginx + Docker manualmente

## Alternativas Descartadas

### Deploy manual (nginx + Docker na VPS)
- Mais controle, mas exige DevOps
- Rejeitado: overhead desnecessário no ritmo de 5 semanas

### Vercel + Railway
- Prós: zero DevOps
- Contras: custo variável, vendor lock-in, latência maior (Brasil)
- Rejeitado em favor de VPS com controle de custo previsível

### Render / Fly.io
- Prós: simples
- Contras: mesmo problema de vendor lock-in e custo variável
- Rejeitado

## Consequências

- VPS com EasyPanel pré-instalado (ou instalar via script oficial)
- Backend: serviço Node.js no EasyPanel, deploy via GitHub
- Frontend: serviço React (build estático) no EasyPanel
- N8n: serviço Docker no EasyPanel (se usado)
- Variáveis de ambiente gerenciadas pelo EasyPanel (não commitar .env)
- SSL automático para todos os domínios/subdomínios

## Estrutura de Serviços no EasyPanel

```
EasyPanel
├── results-backend     → Node.js (Fastify) — api.results.com
├── results-frontend    → React build — app.results.com
└── results-n8n         → N8n Docker — n8n.results.com (se usado)
```

## Deploy Workflow

```
1. Push para branch develop
2. EasyPanel detecta via webhook do GitHub
3. Build automático
4. Deploy sem downtime (rolling)
5. Rollback via EasyPanel UI se necessário
```

## Requisitos da VPS

- Ubuntu 22.04 LTS
- Mín. 4GB RAM, 2 vCPU, 40GB SSD
- EasyPanel instalado: `curl -sSL https://get.easypanel.io | sh`
