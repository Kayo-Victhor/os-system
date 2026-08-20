# OS System

Sistema de gerenciamento de ordens de serviço: clientes, técnicos, ordens de
serviço e controle de acesso por papel (ADMIN / USER / TECHNICIAN).

## Sumário

- [Arquitetura](#arquitetura)
- [Tecnologias](#tecnologias)
- [Requisitos](#requisitos)
- [Instalação](#instalação)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Banco de dados e migrations](#banco-de-dados-e-migrations)
- [Executando em desenvolvimento](#executando-em-desenvolvimento)
- [Testes](#testes)
- [Build](#build)
- [Papéis e permissões](#papéis-e-permissões)
- [Segurança](#segurança)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Limitações conhecidas](#limitações-conhecidas)

## Arquitetura

Monorepo (pnpm workspaces + Turborepo) com duas aplicações:

- **`apps/backend`** — API REST em Express + TypeScript, Prisma como ORM
  sobre PostgreSQL.
- **`apps/frontend`** — SPA em React 19 + Vite, consumindo a API do backend.

O frontend não tem lógica de autorização própria além de esconder/mostrar
controles de UI; toda decisão de segurança real é feita no backend.

## Tecnologias

**Backend:** Express 5, Prisma 7, PostgreSQL, Zod (validação), Argon2id
(hash de senha), JWT (access token), express-rate-limit, helmet,
cookie-parser, Vitest + Supertest (testes).

**Frontend:** React 19, React Router 7, Vite, TypeScript, CSS puro (sem
framework de UI).

## Requisitos

- Node.js 22+
- pnpm 11+
- PostgreSQL 16+ (ou Docker, veja abaixo)

## Instalação

```bash
pnpm install
```

## Variáveis de ambiente

Cada app tem seu próprio `.env.example`. Copie e preencha antes de rodar:

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
cp .env.example .env   # apenas se for usar o docker-compose incluso
```

### `apps/backend/.env`

| Variável              | Descrição                                                                 |
| ---------------------- | -------------------------------------------------------------------------- |
| `DATABASE_URL`         | Connection string do PostgreSQL usada pelo Prisma                          |
| `JWT_ACCESS_SECRET`     | Assina o access token (JWT, 15 min de validade)                            |
| `JWT_REFRESH_SECRET`   | Usado para HMAC dos refresh tokens antes de persistir no banco             |
| `CORS_ORIGIN`          | Origem do frontend autorizada a fazer requisições com cookies. **Obrigatório em produção** |
| `NODE_ENV`             | `development` \| `production`                                              |
| `SEED_ADMIN_PASSWORD`  | Sobrescreve a senha do admin criado pelo seed (veja abaixo)                 |

Gere segredos fortes com:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### `apps/frontend/.env`

| Variável       | Descrição                          |
| -------------- | ------------------------------------ |
| `VITE_API_URL` | URL base da API backend             |

## Banco de dados e migrations

Subindo um PostgreSQL local via Docker (opcional):

```bash
docker compose up -d
```

Aplicando as migrations:

```bash
cd apps/backend
pnpm prisma migrate dev
```

> A migration `20260813200000_add_refresh_token` (tabela `RefreshToken`,
> necessária para o fluxo de sessão) foi escrita manualmente, pois não havia
> um banco de dados disponível no ambiente em que ela foi criada para gerá-la
> via `prisma migrate dev`. Ela ainda **precisa ser validada** rodando o
> comando acima contra um banco descartável antes de aplicar em qualquer
> ambiente real.

Populando um usuário administrador inicial:

```bash
pnpm seed
```

Isso cria `admin@os-system.local` com a senha definida em
`SEED_ADMIN_PASSWORD` (ou `admin123456` como padrão de desenvolvimento, se a
variável não estiver definida — **defina-a** em qualquer ambiente
compartilhado).

## Executando em desenvolvimento

Da raiz do monorepo (sobe backend e frontend juntos via Turborepo):

```bash
pnpm dev
```

Ou individualmente:

```bash
pnpm --filter backend dev    # API em http://localhost:3333
pnpm --filter frontend dev   # SPA em http://localhost:5173
```

## Testes

```bash
pnpm --filter backend test
```

Os testes do backend rodam contra um mock do Prisma
(`apps/backend/tests/helpers/prisma-mock.ts`), sem necessidade de um banco de
dados real. Cobrem autenticação (login, sessão, refresh, logout),
autorização por papel, CSRF, e as regras de negócio principais (um
TECHNICIAN só altera status de ordens atribuídas a ele; proteções contra
excluir/rebaixar o último ADMIN; erros de duplicidade retornando 409).

O frontend ainda não tem suíte de testes automatizados — veja
[Limitações conhecidas](#limitações-conhecidas).

## Build

```bash
pnpm build
```

Roda `tsc` + `vite build` no frontend e `tsc` no backend via Turborepo.

## Papéis e permissões

| Recurso                  | ADMIN | USER (atendente) | TECHNICIAN |
| ------------------------- | :---: | :---------------: | :---------: |
| Usuários — criar/editar/excluir | ✅ | ❌ | ❌ |
| Usuários — visualizar     | ✅    | ❌                 | ❌          |
| Clientes — criar/editar   | ✅    | ✅                 | ❌          |
| Clientes — excluir        | ✅    | ❌                 | ❌          |
| Clientes — visualizar     | ✅    | ✅                 | ✅          |
| Ordens de serviço — criar | ✅    | ✅                 | ❌          |
| Ordens de serviço — editar (título/descrição/prioridade) | ✅ | ❌ | ❌ |
| Ordens de serviço — excluir | ✅  | ❌                 | ❌          |
| Ordens de serviço — visualizar | ✅ | ✅              | ✅          |
| Ordens de serviço — atribuir técnico | ✅ | ❌         | ❌          |
| Ordens de serviço — alterar status | ✅ | ❌           | ✅ (apenas as suas) |

Não existe um papel `CUSTOMER` com login próprio — clientes são registros
gerenciados pela equipe (ADMIN/USER), não contas de usuário. Essa é a
estrutura que já existia no projeto original e foi preservada.

## Segurança

Resumo do que está implementado (detalhes no código, especialmente
`apps/backend/src/lib/` e `apps/backend/src/middlewares/`):

- **Senhas:** Argon2id (`memoryCost: 19456`, `timeCost: 2`), nunca texto puro.
- **Sessão:** access token JWT (15 min) em cookie `httpOnly`; refresh token
  opaco (não-JWT), com hash HMAC persistido no banco, rotacionado a cada uso,
  com detecção de reuso (revoga toda a família de tokens do usuário se um
  token já rotacionado for reapresentado).
- **CSRF:** double-submit cookie (`csrf_token` legível por JS + header
  `x-csrf-token`), aplicado a toda requisição mutável autenticada por cookie.
- **Rate limiting:** limite estrito em `/auth/login` e `/auth/refresh`
  (10 req/15 min), limite geral no restante da API (120 req/min). Usa
  armazenamento em memória — **não é adequado para múltiplas instâncias**
  sem um backend compartilhado (ex. Redis).
- **CORS:** origem explícita via `CORS_ORIGIN`, obrigatória em produção;
  `credentials: true`.
- **Headers:** `helmet()` com a configuração padrão.
- **Autorização:** verificada no backend em toda rota, nunca apenas no
  frontend. Inclui verificação de propriedade de recurso (ex. um TECHNICIAN
  só altera status de ordens atribuídas a ele mesmo).
- **Erros:** mensagens genéricas em falhas de login (não revela se o e-mail
  existe); stack traces nunca retornam ao cliente.

## Estrutura do projeto

```
apps/
  backend/
    prisma/            schema, migrations, seed
    src/
      config/          permissões por papel
      controllers/      handlers HTTP
      services/         regras de negócio / acesso ao Prisma
      schemas/           validação (zod)
      middlewares/       auth, CSRF, rate limit, permissões
      lib/               tokens, cookies, hash de senha, erros do Prisma
      routes/
    tests/
      helpers/           mock do Prisma, helpers de autenticação para testes
  frontend/
    src/
      api/               cliente HTTP, funções por recurso, tipos
      context/           AuthContext (sessão, permissões)
      components/         layout, guards de rota, componentes compartilhados
      pages/
```

## Limitações conhecidas

Documentadas aqui em vez de escondidas — para que o próximo passo seja
óbvio, não uma surpresa:

- **Migration do `RefreshToken` não validada contra um banco real** (veja
  [Banco de dados e migrations](#banco-de-dados-e-migrations)) — escrita à
  mão porque o ambiente onde foi criada não tinha PostgreSQL disponível.
- **Sem paginação** nos endpoints de listagem (apenas filtros). Adequado
  para o volume atual; deve ser revisitado antes de produção com dados em
  escala.
- **Rate limiting em memória**, não compartilhado entre instâncias — ver
  nota em [Segurança](#segurança).
- **`SETTINGS_READ`/`SETTINGS_UPDATE`** existem como permissões declaradas
  em `config/permissions.ts` mas não têm rota, controller ou funcionalidade
  associada — aparentemente um placeholder de uma feature de configurações
  do sistema que nunca foi definida. Não implementado aqui por não haver
  escopo claro do que essa funcionalidade deveria fazer.
- **Frontend sem suíte de testes automatizados** — o app foi construído e
  revisado manualmente (resolução de imports, uso de tipos sob
  `verbatimModuleSyntax`, regras de hooks), mas não há testes de componente
  ou end-to-end.
- **Sem backend de lint configurado** (`apps/backend` não tem ESLint) — o
  frontend tem; o backend depende apenas do `tsc` para checagem estática.
- Nenhum comando que requer instalação de dependências (`pnpm install`,
  `typecheck`, `test`, `build`, `prisma migrate`) pôde ser executado no
  ambiente onde este trabalho foi feito (sem acesso à rede). Todo o código
  foi revisado estaticamente com o máximo de cuidado possível, mas **precisa
  ser validado localmente** antes de ir para produção.
