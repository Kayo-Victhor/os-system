# Deploy e operação

Este guia descreve o que o repositório suporta. A presença de configuração não
prova que um serviço externo esteja ativo; confirme o estado nos provedores antes
de cada publicação.

## Topologia prevista

```text
Vercel (React/Vite + Function /api/proxy)
               │ HTTPS + HMAC
               ▼
Render (Express, porta 3333)
               │ Prisma / Supavisor
               ▼
Supabase PostgreSQL
```

## Frontend na Vercel

A configuração versionada está em `apps/frontend/vercel.json` e pressupõe o
diretório raiz `apps/frontend` no projeto Vercel.

- build: script `pnpm build` do workspace frontend;
- saída: `dist`;
- `/api/:proxyPath*`: rewrite para `/api/proxy` com captura interna;
- demais caminhos: fallback para `/index.html` da SPA.

Variáveis server-side:

```text
API_PROXY_TARGET=https://backend.exemplo.com
INTERNAL_PROXY_SECRET=<segredo aleatório de pelo menos 32 bytes>
```

`API_PROXY_TARGET` aceita somente a origem HTTPS, sem caminho, query ou
credenciais. A Function preserva método, corpo, cookies, CSRF, query legítima e
`Set-Cookie`; parâmetros internos de rewrite são removidos antes do upstream.

## Backend no Render

Não há `render.yaml` versionado; configuração de Dashboard deve ser conferida
manualmente. Os scripts disponíveis suportam:

```bash
pnpm install --frozen-lockfile
pnpm --filter backend build
pnpm --filter backend start
```

O artefato é `apps/backend/dist` e o processo executa `dist/server.js`. O código
atual escuta 3333; o serviço precisa encaminhar essa porta.

Configure no Render todas as variáveis obrigatórias descritas em
[CONFIGURATION.md](CONFIGURATION.md), com atenção a:

```text
NODE_ENV=production
CORS_ORIGIN=https://frontend.exemplo.com
API_BASE_PATH=/api
ALLOW_DIRECT_API_REQUESTS=false
INTERNAL_PROXY_SECRET=<mesmo valor server-side da Vercel>
DATABASE_URL=<conexão PostgreSQL de produção>
APP_BASE_URL=https://frontend.exemplo.com
```

Não configure `VITE_API_URL`, `API_PROXY_TARGET` ou chaves públicas no Render.

## Banco e migrations

Faça backup e confira o destino antes de aplicar migrations. A operação de
release usa o histórico versionado:

```bash
pnpm --filter backend exec prisma migrate status
pnpm --filter backend exec prisma migrate deploy
```

Não execute `migrate dev`, `migrate reset` ou `db push` em produção. Publique a
versão do backend que dependa de uma migration somente depois que o schema
compatível estiver aplicado.

## Ordem segura do proxy

Em primeira configuração ou rotação coordenada:

1. gere um segredo independente com ao menos 32 bytes;
2. configure-o somente nos ambientes server-side da Vercel e do Render;
3. confirme `API_PROXY_TARGET` e `CORS_ORIGIN`;
4. publique a Function/rewrite;
5. publique o backend com validação de proxy;
6. valide `/health` diretamente e uma rota `/api/*` pelo frontend;
7. confirme que acesso direto não assinado às rotas protegidas retorna 403.

Não troque o segredo em um único lado. O valor nunca deve usar prefixo `VITE_`.

## Saúde e workers

`GET /health` retorna:

```json
{ "status": "ok", "service": "os-system-api" }
```

Esse endpoint fica fora da exigência HMAC. Ele confirma o processo HTTP, não a
conectividade completa do banco ou da Brevo.

O mesmo processo backend inicia:

- worker da outbox de e-mail;
- worker de limpeza de retenção.

Ambos coordenam concorrência por locks/claims no PostgreSQL. Em desligamento
`SIGTERM`/`SIGINT`, o servidor para de agendar ciclos, aguarda o ciclo corrente,
fecha conexões HTTP e desconecta Prisma, com limite de 15 segundos para conexões.

## Checklist pré-publicação

- [ ] `git status` contém somente mudanças revisadas.
- [ ] exemplos e segredos reais continuam separados.
- [ ] `pnpm lint`, `pnpm test` e `pnpm build` passaram.
- [ ] `pnpm test:e2e:typecheck` e `pnpm test:e2e` passaram quando o fluxo foi afetado.
- [ ] migration necessária foi revisada e testada em banco descartável.
- [ ] `prisma migrate status` aponta para o banco pretendido.
- [ ] segredos têm valores diferentes por finalidade e ambiente.
- [ ] Vercel e Render compartilham somente `INTERNAL_PROXY_SECRET`.
- [ ] remetente Brevo e `APP_BASE_URL` estão corretos.
- [ ] CORS aceita somente a origem pública do frontend.
- [ ] cookies de refresh usam `API_BASE_PATH=/api` em produção.
- [ ] `/health`, login, refresh, logout e uma operação autenticada foram validados.
- [ ] logs não exibem tokens, senhas, cookies ou credenciais.

## Rollback

Reverter aplicação não reverte schema automaticamente. Antes de publicar uma
migration, confirme compatibilidade com a versão anterior. Em incidente, faça
rollback do código pelo provedor e trate reversão de banco como operação separada
e deliberada; nunca edite o histórico aplicado para simular rollback.
