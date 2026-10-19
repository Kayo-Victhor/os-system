# Variáveis de ambiente

Nunca reutilize segredos entre finalidades nem versione valores reais. Os
placeholders dos arquivos `.example` são deliberadamente não funcionais.

## Arquivos e precedência

| Arquivo/ambiente | Uso |
|---|---|
| `.env` na raiz | Somente interpolação do Docker Compose |
| `apps/backend/.env` | Backend, Prisma e seed locais |
| `apps/backend/.env.test` | Vitest, migrations de teste e E2E |
| `apps/frontend/.env` | Vite local e configuração server-side da Function local |
| Render | Variáveis server-side do backend em produção |
| Vercel | `API_PROXY_TARGET` e segredo server-side; variáveis `VITE_` entram no bundle |

## Docker Compose

| Variável | Obrigatória | Finalidade |
|---|---:|---|
| `POSTGRES_USER` | sim | Usuário inicial do contêiner |
| `POSTGRES_PASSWORD` | sim | Senha local do usuário |
| `POSTGRES_DB` | sim | Banco de desenvolvimento criado na primeira inicialização |

Essas variáveis não configuram automaticamente o backend; mantenha
`DATABASE_URL` coerente.

## Backend e Prisma

| Variável | Obrigatoriedade e padrão | Ambientes | Finalidade |
|---|---|---|---|
| `PORT` | opcional; padrão `3333`; inteiro de 1 a 65535 | dev/prod | porta HTTP em que o Express escuta |
| `DATABASE_URL` | obrigatória | todos | URL PostgreSQL usada por Prisma |
| `JWT_ACCESS_SECRET` | obrigatória no startup | todos | assinatura HS256 dos access tokens |
| `JWT_REFRESH_SECRET` | obrigatória no startup | todos | HMAC dos refresh tokens opacos |
| `EMAIL_VERIFICATION_SECRET` | obrigatória para cadastro público | dev/prod | HMAC dos tokens de confirmação |
| `PASSWORD_RESET_SECRET` | obrigatória para recuperação | dev/prod | HMAC de tokens de redefinição internos e de clientes |
| `NODE_ENV` | `development`, `test` ou `production` | todos | cookies, CORS, workers e proteções de produção |
| `CORS_ORIGIN` | obrigatória em produção; opcional em dev | dev/prod | única origem web adicional aceita |
| `API_BASE_PATH` | vazio por padrão | dev/prod | prefixo visto pelo navegador para o caminho dos cookies de refresh |
| `INTERNAL_PROXY_SECRET` | obrigatório quando acesso direto não está permitido; mínimo 32 bytes | prod | HMAC compartilhado Vercel → Render |
| `ALLOW_DIRECT_API_REQUESTS` | aceito apenas fora de produção; padrão efetivo `false` | dev/test | permite navegador → Express sem proxy assinado |

`API_BASE_PATH` não monta as rotas Express. Localmente deixe vazio; no Render,
quando o navegador usa `/api`, defina `/api` para alinhar o `Path` dos cookies.

Em produção, `ALLOW_DIRECT_API_REQUESTS=true` é ignorado. Não use prefixo
`VITE_` em segredos server-side.

Valor vazio de `PORT` usa 3333. Valores parciais, decimais, negativos, zero ou
acima de 65535 interrompem o startup com uma mensagem de configuração clara.
Ao mudar a porta local, mantenha `VITE_API_URL` coerente.

## E-mail

| Variável | Obrigatoriedade e padrão | Finalidade |
|---|---|---|
| `EMAIL_PROVIDER` | deve ser `brevo` fora de testes para entrega real | Seleciona o provedor implementado |
| `BREVO_API_KEY` | obrigatória para envio real | Credencial server-side da API Brevo |
| `EMAIL_FROM` | obrigatória para envio real | Remetente autorizado no Brevo |
| `APP_BASE_URL` | padrão `http://localhost:5173`; HTTPS obrigatório em produção | Origem dos links de confirmação e recuperação |

O código não possui segundo provedor. Em `NODE_ENV=test`, chamadas externas são
substituídas para manter a suíte determinística.

## Worker da outbox

Todas são opcionais e devem ser inteiros positivos:

| Variável | Padrão | Finalidade |
|---|---:|---|
| `EMAIL_OUTBOX_POLL_INTERVAL_MS` | `5000` | Intervalo entre ciclos |
| `EMAIL_OUTBOX_BATCH_SIZE` | `10` | Máximo reclamado por ciclo |
| `EMAIL_OUTBOX_MAX_ATTEMPTS` | `5` | Tentativas antes de falha permanente |
| `EMAIL_OUTBOX_BACKOFF_BASE_MS` | `5000` | Base do backoff exponencial |

A lease interna é de 60 segundos e o backoff é limitado a uma hora; esses dois
valores não são configuráveis por ambiente.

## Limpeza de retenção

| Variável | Padrão | Finalidade |
|---|---:|---|
| `CLEANUP_POLL_INTERVAL_MS` | `3600000` | Intervalo entre ciclos |
| `CLEANUP_BATCH_SIZE` | `100` | Limite por categoria em cada ciclo |

O worker é desativado em `NODE_ENV=test`. Os períodos internos atuais são uma
hora para cadastros pendentes já expirados e 24 horas adicionais para tokens e
famílias de sessão expiradas/revogadas.

## Seed

| Variável | Obrigatória para o seed | Finalidade |
|---|---:|---|
| `ADMIN_EMAIL` | sim | E-mail normalizado do administrador principal |
| `SEED_ADMIN_PASSWORD` | sim | Senha inicial, processada com Argon2id |

Essas variáveis não criam contas durante o startup normal; são lidas somente por
`pnpm --filter backend seed`.

## Frontend e Function Vercel

| Variável | Onde | Obrigatoriedade | Finalidade |
|---|---|---|---|
| `VITE_API_URL` | bundle Vite | opcional em dev | URL direta do Express; padrão `http://localhost:3333` |
| `API_PROXY_TARGET` | Function server-side | obrigatória em produção | origem HTTPS do Render, sem caminho |
| `INTERNAL_PROXY_SECRET` | Function server-side | obrigatória em produção, mínimo 32 bytes | assina método, caminho/query, IP e timestamp |

Em build de produção, o cliente ignora `VITE_API_URL` e usa `/api`. A Function
remove seus parâmetros internos, preserva a query legítima e encaminha para
`API_PROXY_TARGET`. O mesmo `INTERNAL_PROXY_SECRET` deve existir na Vercel e no
Render e nunca pode chegar ao JavaScript do navegador.

## Testes

`apps/backend/.env.test` deve conter uma `DATABASE_URL` local e descartável. Os
valores JWT fictícios do exemplo atendem o E2E; Vitest sobrescreve seus segredos
com valores fixos não sensíveis em `vitest.config.ts`.

Não copie `.env` de produção para os testes. A suíte apaga dados.
