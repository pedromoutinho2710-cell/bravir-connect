# Agente IA Local — Bravir Connect

Script Node.js que roda localmente no seu PC e implementa solicitações aprovadas automaticamente.

## Como funciona

1. Ouve o Supabase Realtime por novas solicitações
2. Analisa automaticamente (Claude Code SDK gera plano)
3. Você revisa o plano na tela `/meu-agente` e clica **Aprovar**
4. Script implementa os arquivos, roda `npm run build` + `tsc`, e faz `git push origin main`
5. Vercel deploya automaticamente

## Setup

```bash
cd agent
npm install
cp .env.example .env
```

Preencha o `.env` com as chaves reais (busque no `.env` da raiz do projeto).

## Rodar

```bash
node index.js
```

Deixe rodando em segundo plano enquanto trabalha. Para parar: `Ctrl+C`.

## Variáveis de ambiente

| Variável | Onde encontrar |
|---|---|
| `SUPABASE_URL` | `.env` da raiz do projeto |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env` da raiz do projeto |
| `ANTHROPIC_API_KEY` | `.env` da raiz do projeto |
| `PROJECT_PATH` | Caminho absoluto da pasta do projeto |
