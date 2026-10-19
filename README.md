# OS-SYSTEM

Sistema web para gestão de clientes e ordens de serviço, com fila operacional,
atribuição de técnicos, histórico auditável, notas internas e relatórios.

## Funcionalidades atuais

- identidades internas separadas por `ADMIN`, `ATTENDANT` e `TECHNICIAN`;
- conta de cliente independente (`CustomerAccount`) e portal próprio;
- cadastro público de cliente com confirmação de e-mail;
- login, renovação, logout e recuperação de senha para equipe e clientes;
- clientes com pesquisa, paginação, suspensão, reativação e anonimização;
- ordens de serviço com prioridades, estados, filtros e paginação;
- atribuição, reatribuição e remoção de técnico;
- timeline automática de eventos operacionais;
- notas internas append-only, invisíveis no portal do cliente;
- relatórios por período, status, prioridade e carga atual da equipe;
- outbox transacional de e-mail e limpeza periódica de registros expirados;
- testes de integração com PostgreSQL real e testes E2E com Playwright.

## Arquitetura

```text
Navegador
   │
   ├── desenvolvimento: Vite → Express
   │
   └── produção: Vercel → Function /api/* → HMAC → Render/Express
                                                   │
                                                   ▼
                                            Prisma → PostgreSQL
```

O monorepo utiliza pnpm workspaces e Turborepo:

```text
apps/frontend  React 19 + Vite 8 + React Router 7
apps/backend   Express 5 + TypeScript 6 + Prisma 7
e2e            Playwright
scripts        verificações de desenvolvimento e E2E
```

O PostgreSQL local pode ser executado pelo `docker-compose.yml`. A arquitetura
de produção prevista no repositório usa frontend na Vercel, backend no Render e
PostgreSQL no Supabase. Supabase Auth não é utilizado.

## Documentação

Os guias especializados são a fonte principal para detalhes operacionais:

- [Índice da documentação](docs/README.md)
- [Desenvolvimento, banco e testes](docs/DEVELOPMENT.md)
- [Variáveis de ambiente](docs/CONFIGURATION.md)
- [Contratos da API](docs/API.md)
- [Segurança, papéis e ciclo de vida](docs/SECURITY.md)
- [Deploy e operação](docs/DEPLOYMENT.md)

## Requisitos

- Node.js 22 ou versão compatível com as dependências atuais;
- pnpm 11.21.0 (fixado no `packageManager` da raiz);
- PostgreSQL 18 para reproduzir o contêiner versionado;
- Docker com Compose, caso o PostgreSQL não seja instalado diretamente;
- Chromium do Playwright apenas para a suíte E2E.

Não use `npm install` ou `yarn`: `pnpm-lock.yaml` é o lockfile oficial.

## Instalação rápida

Na raiz do repositório:

```bash
pnpm install
cp .env.example .env
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
docker compose up -d postgres
pnpm --filter backend exec prisma migrate deploy
pnpm --filter backend exec prisma generate
pnpm --filter backend seed
pnpm dev
```

Antes do seed, preencha `ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD` em
`apps/backend/.env`. O seed cria ou atualiza somente o administrador principal;
não cria clientes, atendentes ou técnicos de exemplo.

Serviços locais:

- frontend: `http://localhost:5173`;
- backend padrão: `http://localhost:3333`;
- saúde padrão da API: `http://localhost:3333/health`;
- PostgreSQL do Compose: `localhost:5432`.

O `pnpm dev` verifica dependências, presença de `apps/backend/.env` e alcance
TCP do PostgreSQL, depois inicia os dois workspaces. Ele não inicia nem altera o
banco automaticamente.

Execução individual:

```bash
pnpm --filter backend dev
pnpm --filter frontend dev
```

Consulte o [guia de desenvolvimento](docs/DEVELOPMENT.md) antes de criar
migrations ou executar testes que limpam dados.

## Comandos principais

| Comando | Finalidade |
|---|---|
| `pnpm dev` | Inicia backend e frontend após as verificações locais |
| `pnpm build` | Compila todos os workspaces pelo Turbo |
| `pnpm lint` | Executa o lint disponível no monorepo |
| `pnpm test:migrate` | Aplica migrations exclusivamente no banco de teste configurado |
| `pnpm test` | Executa testes unitários e de integração do backend, em série |
| `pnpm test:e2e:typecheck` | Valida os arquivos TypeScript da suíte E2E |
| `pnpm test:e2e` | Prepara o banco local de teste e executa Playwright |
| `pnpm test:e2e:ui` | Abre o modo interativo do Playwright |
| `pnpm test:e2e:report` | Abre o último relatório HTML do Playwright |

As contagens de testes variam com a evolução do projeto e não são fixadas nesta
documentação.

## Papéis e acesso

| Papel | Escopo resumido |
|---|---|
| `ADMIN` | Administração de equipe, ciclo de vida de clientes, operação completa de OS e relatórios |
| `ATTENDANT` | Cadastro e atualização de clientes, criação/edição/atribuição de OS, notas e relatórios |
| `TECHNICIAN` | Clientes e OS ligados à própria fila, transições permitidas e notas internas |
| Cliente | Apenas o próprio perfil, as próprias OS e o histórico público correspondente |

O backend é a autoridade de autorização. Ocultar um item no frontend não concede
nem remove permissão. A matriz detalhada está em [Segurança](docs/SECURITY.md).

## Banco e migrations

O schema está em `apps/backend/prisma/schema.prisma`; o histórico fica em
`apps/backend/prisma/migrations/`. Não edite migrations aplicadas.

```bash
pnpm --filter backend exec prisma validate
pnpm --filter backend exec prisma generate
pnpm --filter backend exec prisma migrate status
```

Para produzir uma nova migration durante desenvolvimento, use `prisma migrate
dev` somente com `DATABASE_URL` apontando para o banco local de desenvolvimento.
Em deploy, aplique o histórico existente com `prisma migrate deploy` antes de
subir uma versão que dependa do novo schema.

Nunca use o banco de desenvolvimento ou produção para a suíte de testes. O banco
de teste deve ser local, descartável e terminar em `_test` para o E2E.

## Segurança em resumo

- senhas protegidas com Argon2id;
- access tokens JWT curtos e refresh tokens opacos, rotativos e armazenados por HMAC;
- cookies de sessão HttpOnly; cookie CSRF legível apenas para double-submit;
- sessões internas e de cliente isoladas;
- validação de ownership no backend;
- limites globais, de escrita, autenticação, cadastro e recuperação;
- proxy Vercel → Render autenticado por HMAC em produção;
- outbox de e-mail com retry e deduplicação;
- tabelas históricas e notas internas sem acesso direto das roles `anon` e
  `authenticated` do Supabase.

Tokens, senhas, chaves Brevo e segredos de proxy nunca devem ser versionados ou
registrados em logs.

## Limitações conhecidas

- relatórios de conclusão usam somente eventos reais `STATUS_CHANGED →
  COMPLETED`; ordens concluídas antes da timeline podem não aparecer na série
  histórica;
- notas internas não possuem edição nem exclusão pela API;
- o portal do cliente não exibe notas internas nem eventos operacionais
  classificados como internos;
- ao alterar `PORT`, atualize também `VITE_API_URL` e as verificações de saúde
  que apontam para o backend;
- não há especificação OpenAPI gerada: [docs/API.md](docs/API.md) documenta os
  contratos confirmados no código e nos testes.

## Solução rápida de problemas

- `pnpm dev` informa `.env` ausente: copie `apps/backend/.env.example` e
  configure as variáveis obrigatórias.
- A API retorna `403 Acesso não permitido` localmente: confirme
  `ALLOW_DIRECT_API_REQUESTS=true` e `NODE_ENV=development`.
- Prisma não conecta: confira `DATABASE_URL`, usuário/senha do `.env` da raiz e
  se `docker compose ps` mostra o PostgreSQL ativo.
- Testes recusam o banco: use `apps/backend/.env.test`, um host local e um banco
  chamado, por exemplo, `os_system_test`.
- E2E informa porta ocupada: encerre processos nas portas 3333 e 5173; a suíte
  não reutiliza servidores existentes.
- Cookies não renovam em produção: confira `API_BASE_PATH=/api`, HTTPS, origem
  CORS e o mesmo `INTERNAL_PROXY_SECRET` nos dois componentes server-side.

## Contribuição segura

Antes de enviar uma alteração:

```bash
pnpm lint
pnpm test
pnpm build
pnpm test:e2e:typecheck
pnpm test:e2e
git diff --check
```

Execute os comandos compatíveis com o escopo da mudança, preserve o histórico de
migrations e nunca inclua arquivos `.env` reais.
