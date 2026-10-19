# Documentação do OS-SYSTEM

Este índice separa instruções de uso corrente de detalhes de implementação.
Quando houver divergência, o código, os schemas, as migrations e os testes são a
fonte de verdade.

## Guias

- [Desenvolvimento, banco e testes](DEVELOPMENT.md): instalação, PostgreSQL,
  Prisma, seed, execução local e qualidade.
- [Configuração](CONFIGURATION.md): todas as variáveis reconhecidas e sua
  distribuição entre desenvolvimento, testes, Vercel e Render.
- [API](API.md): rotas, autenticação, filtros, corpos, respostas e escopos.
- [Segurança](SECURITY.md): identidades, cookies, CSRF, permissões, ownership,
  rate limiting, RLS, retenção e anonimização.
- [Deploy e operação](DEPLOYMENT.md): proxy Vercel → Render, banco, migrations,
  workers, saúde e checklist de publicação.

## Documentos na raiz

- [`README.md`](../README.md): visão geral e início rápido.
- [`.env.example`](../.env.example): variáveis usadas pelo Docker Compose.
- [`docker-compose.yml`](../docker-compose.yml): PostgreSQL local.
- [`pnpm-workspace.yaml`](../pnpm-workspace.yaml): workspaces e overrides.
- [`turbo.json`](../turbo.json): tarefas compartilhadas.

## Exemplos de ambiente

- [`apps/backend/.env.example`](../apps/backend/.env.example)
- [`apps/backend/.env.test.example`](../apps/backend/.env.test.example)
- [`apps/frontend/.env.example`](../apps/frontend/.env.example)

Arquivos `.env` reais não são documentação e não devem ser versionados.

## Escopo excluído

Os Markdown sob `apps/backend/.agents`, `.claude` e `.windsurf` pertencem a
pacotes auxiliares do Prisma instalados para agentes. Eles não descrevem o
OS-SYSTEM e não devem ser usados como guia operacional do projeto.
