# Desenvolvimento, banco e testes

## Estrutura do monorepo

```text
apps/backend/
  prisma/                 schema, seed e migrations
  src/routes/             composição HTTP
  src/controllers/        validação de entrada e resposta
  src/schemas/            contratos Zod
  src/services/           regras de negócio e acesso a dados
  src/middlewares/        autenticação, autorização, CSRF e limites
  tests/                  testes unitários e de integração
apps/frontend/
  api/                    Function server-side usada na Vercel
  src/api/                cliente HTTP e tipos
  src/components/         componentes compartilhados
  src/pages/              páginas React
e2e/                      cenários Playwright
scripts/                  verificações de desenvolvimento e E2E
```

`apps/backend/src/generated/prisma` e diretórios `dist` são gerados; não os
edite manualmente.

## Instalação

```bash
pnpm install
cp .env.example .env
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
```

Gere segredos diferentes para cada finalidade. Um exemplo local de geração é:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Consulte [CONFIGURATION.md](CONFIGURATION.md) antes de preencher os arquivos.

## PostgreSQL local

### Com Docker

O serviço versionado chama-se `postgres`, usa a imagem `postgres:18`, publica a
porta 5432 e persiste dados no volume `postgres_data`.

```bash
docker compose up -d postgres
docker compose ps
docker compose logs postgres
```

As credenciais vêm do `.env` da raiz. O Compose cria somente `POSTGRES_DB`; crie
separadamente o banco descartável de teste, por exemplo:

```sql
CREATE DATABASE os_system_test;
```

### PostgreSQL instalado no sistema

O Docker não é obrigatório. Aponte `DATABASE_URL` para a instância local e
garanta que o usuário possua permissão para aplicar as migrations. Mantenha os
bancos de desenvolvimento e teste separados.

Não copie uma URL de produção para `.env.test`.

## Prisma e migrations

Execute comandos Prisma no workspace do backend:

```bash
pnpm --filter backend exec prisma validate
pnpm --filter backend exec prisma generate
pnpm --filter backend exec prisma migrate status
```

Para aplicar o histórico existente no desenvolvimento:

```bash
pnpm --filter backend exec prisma migrate deploy
```

Para criar uma alteração estrutural deliberada:

```bash
pnpm --filter backend exec prisma migrate dev --name nome_descritivo
```

Antes de `migrate dev`, confirme visualmente que `apps/backend/.env` aponta para
o banco local de desenvolvimento. Não edite migrations aplicadas, não use
`db push` para substituir o histórico e não adote `migrate reset` como fluxo
normal.

O `prisma.config.ts` define schema, diretório de migrations, `DATABASE_URL` e a
inicialização da tabela `_prisma_migrations` no shadow database.

### Modelos principais

- `User`, `RefreshToken` e `PasswordResetToken`: equipe interna;
- `Customer` e `CustomerAccount`: cadastro operacional e identidade do cliente;
- `CustomerSession` e `CustomerSessionRefreshToken`: sessões do portal;
- `PendingCustomerRegistration` e token associado: cadastro antes da confirmação;
- `EmailOutbox`: entrega assíncrona de confirmação e recuperação;
- `ServiceOrder`, `ServiceOrderEvent` e `ServiceOrderNote`: operação, timeline e
  notas internas.

Relações históricas usam `SetNull` para preservar eventos/notas quando o autor é
removido e `Cascade` de eventos/notas quando a própria OS é excluída.

## Seed

```bash
pnpm --filter backend seed
```

O seed exige `ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD`. Ele é idempotente para o
administrador principal: cria ou atualiza uma única identidade `ADMIN`, preserva
seu identificador e não gera dados demonstrativos.

## Execução local

```bash
pnpm dev
```

O script `scripts/dev-check.mjs`:

1. confirma os `node_modules` dos workspaces;
2. exige `apps/backend/.env`;
3. testa, sem bloquear, se host e porta de `DATABASE_URL` respondem;
4. inicia `turbo dev` para backend e frontend.

Ele não inicia PostgreSQL, não aplica migration e não executa seed.

Execução separada:

```bash
pnpm --filter backend dev
pnpm --filter frontend dev
```

O backend escuta a porta fixa 3333 e o Vite usa 5173 por padrão.

## Banco de teste

Copie o exemplo dedicado:

```bash
cp apps/backend/.env.test.example apps/backend/.env.test
```

Use uma URL PostgreSQL local e um banco descartável chamado
`os_system_test`. Existem duas proteções complementares:

- Vitest recusa uma `DATABASE_URL` que não contenha `test`;
- E2E exige protocolo PostgreSQL, host `localhost`, `127.0.0.1` ou `::1` e
  nome terminado em `_test`.

Os testes de integração apagam todas as linhas antes de cada caso. Não execute
duas suítes simultaneamente contra o mesmo banco.

## Testes e qualidade

Preparar schema do banco de teste:

```bash
pnpm test:migrate
```

Esse script lê explicitamente `apps/backend/.env.test` e executa `prisma migrate
deploy`; não usa o banco configurado no `.env` principal.

Testes do backend:

```bash
pnpm test
pnpm --filter backend test
pnpm --filter backend test:watch
```

Vitest executa `tests/*.test.ts` e `tests/integration/*.test.ts`. Os arquivos são
serializados porque compartilham um PostgreSQL real; os testes unitários podem
substituir Prisma por mocks por arquivo.

E2E:

```bash
pnpm exec playwright install chromium
pnpm test:e2e:typecheck
pnpm test:e2e
```

O E2E verifica o banco e as portas 3333/5173, aplica migrations no banco de
teste, inicia ambos os servidores e executa um worker Chromium. Não reutiliza
servidores existentes. Artefatos de falha ficam em `test-results/`; o relatório
HTML fica em `playwright-report/` e pode ser aberto com:

```bash
pnpm test:e2e:report
```

Build e lint:

```bash
pnpm lint
pnpm build
git diff --check
```

O Turbo executa o build do backend (`tsc`) e do frontend (`tsc -b && vite
build`). Atualmente apenas o frontend possui script próprio de lint.

## Diagnóstico

- `JWT_ACCESS_SECRET ... precisam estar configurados`: preencha segredos não
  vazios em `apps/backend/.env`.
- `Acesso não permitido` local: habilite acesso direto somente no ambiente
  local com `ALLOW_DIRECT_API_REQUESTS=true`.
- Falha no envio: confira Brevo, remetente verificado e os registros da outbox;
  a solicitação HTTP pode ter sido aceita antes da entrega assíncrona.
- Prisma usa o banco errado: execute o comando a partir da raiz com
  `--filter backend` e confira o arquivo de ambiente correspondente.
