# Frontend do OS-SYSTEM

SPA React 19 + TypeScript + Vite responsável pelas interfaces da equipe e do
portal do cliente. Regras de autorização e ownership permanecem no backend.

## Execução

Na raiz do monorepo:

```bash
pnpm install
cp apps/frontend/.env.example apps/frontend/.env
pnpm --filter frontend dev
```

O Vite usa `http://localhost:5173`. Em desenvolvimento, `VITE_API_URL` aponta
para o Express, por padrão `http://localhost:3333`.

```bash
pnpm --filter frontend build
pnpm --filter frontend lint
pnpm --filter frontend preview
```

## Rotas principais

Equipe:

- `/login`, `/esqueci-senha`, `/resetar-senha`;
- `/`, `/service-orders`, `/customers`, `/technicians`, `/users`, `/reports`.

Cliente:

- `/registrar`, `/confirmar-cadastro`;
- `/customer/login`, `/customer/forgot-password`, `/customer/reset-password`;
- `/customer/area`, `/customer/service-orders/:id`.

As páginas são carregadas sob demanda. Guards de rota e permissões melhoram a
experiência, mas respostas 401/403 do backend são a autoridade.

## API em desenvolvimento e produção

- desenvolvimento: o cliente usa `VITE_API_URL` e envia cookies diretamente ao
  Express;
- produção: o bundle usa `/api`; `vercel.json` reescreve para a Function
  `/api/proxy`, que assina e encaminha a requisição ao Render.

`API_PROXY_TARGET` e `INTERNAL_PROXY_SECRET` são server-side e nunca devem usar
prefixo `VITE_`.

Documentação completa:

- [Visão geral](../../README.md)
- [Configuração](../../docs/CONFIGURATION.md)
- [API](../../docs/API.md)
- [Deploy](../../docs/DEPLOYMENT.md)
