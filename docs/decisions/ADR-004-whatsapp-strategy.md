# ADR-004: Estratégia WhatsApp — UAZAPI + API Oficial Meta

## Status
**Aceito** — 2026-06-28

## Contexto

O sistema precisa de duas capacidades distintas no WhatsApp:

1. **Recebimento e resposta de mensagens** — conversas em tempo real com leads e alunos (agentes M1 e M2). Exige integração bidirecional, baixa latência, sem custo por mensagem.

2. **Disparos em massa** — campanhas sazonais, follow-ups programados, lembretes de cobrança (M5). Exige templates aprovados pela Meta e conformidade com política de disparo.

A API Oficial Meta para conversas reativas tem custo por mensagem e processo de aprovação lento. Para o volume inicial da Results, isso seria desnecessariamente caro e burocrático.

## Decisão

**Arquitetura dual:**

| Camada | Tecnologia | Uso |
|--------|-----------|-----|
| Conversas (entrada + saída) | **UAZAPI** | Receber mensagens de leads/alunos → processar nos agentes → responder |
| Disparos em massa | **WhatsApp Business API Oficial (Meta)** | Campanhas, follow-ups em massa, templates aprovados |

### UAZAPI
- Wrapper não-oficial sobre WhatsApp Web
- Self-hosted na VPS via Docker (EasyPanel)
- Webhook recebe mensagens em tempo real → backend Fastify processa
- Sem custo por mensagem
- Sem aprovação de templates para conversas reativas
- Conexão via QR Code (número existente da escola)

### API Oficial Meta
- Contratada pela Results (CNPJ + BM verificada)
- Usada exclusivamente para disparos iniciados pelo sistema
- Templates pré-aprovados para: cobrança, indicação, reativação, campanhas sazonais, aniversário, pós-aula experimental
- Custo por template enviado (controlado — apenas disparos programados)

## Fluxo de mensagens

```
ENTRADA (lead/aluno escreve):
WhatsApp → UAZAPI webhook → backend/whatsapp/uazapi.webhook.ts
  → agent.router.ts → M1 ou M2 → resposta via UAZAPI

SAÍDA (sistema dispara):
automation.scheduler.ts → backend/whatsapp/official.sender.ts
  → Meta API → entrega via template aprovado
```

## Consequências

- UAZAPI roda como serviço Docker no EasyPanel ao lado do backend
- Variáveis: `UAZAPI_URL`, `UAZAPI_TOKEN`, `UAZAPI_INSTANCE`
- Meta API vars mantidas para disparos: `WA_API_TOKEN`, `WA_PHONE_NUMBER_ID`, `WA_BUSINESS_ACCOUNT_ID`
- Dois módulos distintos no backend: `uazapi/` e `whatsapp-official/`
- Se UAZAPI cair → fallback manual para Gi (alerta automático)
- QR Code da UAZAPI precisa ser re-escaneado se sessão expirar (monitorar)

## Riscos

| Risco | Mitigação |
|-------|-----------|
| UAZAPI pode ser bloqueada pela Meta | Número com boa reputação, sem spam. Monitorar. |
| Sessão expira sem aviso | Health check periódico + alerta para Gi |
| Número banido | Usar número dedicado da escola, não pessoal |

## Variáveis de Ambiente

```env
# UAZAPI (conversas)
UAZAPI_URL=http://localhost:8083
UAZAPI_TOKEN=...
UAZAPI_INSTANCE=results-principal

# Meta API Oficial (disparos)
WA_API_TOKEN=...
WA_PHONE_NUMBER_ID=...
WA_BUSINESS_ACCOUNT_ID=...
```
