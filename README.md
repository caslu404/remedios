# Tratamento Adaptativo

PWA mobile-first para organizar e registrar o tratamento do Lucas ao redor do horário real de despertar. O produto **não prescreve**, **não altera doses** e **não infere tolerâncias clínicas**.

## Estado do MVP

- Check-in “Acordei agora” e horário manual.
- Motor puro de cronograma, isolado da interface e coberto por testes.
- Fases e datas do tratamento inicial.
- Modo conservador para regras sem validação profissional.
- Confirmação do dia, linha do tempo e próxima ação.
- “Tomei agora”, horário planejado, outro horário, “Não tomei” e snooze de 10 minutos.
- Histórico local e sincronizado, exportação JSON e trilha de eventos.
- Login por magic link, PostgreSQL, RLS e exclusão de conta com Supabase.
- PWA instalável, cache básico, fila IndexedDB e sincronização posterior.
- Web Push com VAPID, fila persistida e worker recorrente.
- Modo demonstração sem credenciais externas.

## Rodar localmente

Requisitos: Node.js 20.9 ou superior e npm.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Sem variáveis do Supabase, o app abre automaticamente em modo demonstração e mantém os dados no IndexedDB do navegador.

Verificações:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Supabase

1. Crie um projeto Supabase.
2. Execute, nessa ordem:
   - `supabase/migrations/202608050001_initial_schema.sql`
   - `supabase/seed.sql`
3. Em Authentication, habilite e-mail por magic link e cadastre as URLs local e de produção.
4. Copie a URL e a chave publicável para `.env.local`.
5. Mantenha a service role somente no ambiente do servidor.

O primeiro cronograma autenticado cria o tratamento inicial para o usuário. As políticas RLS limitam todas as leituras e mutações aos dados do próprio usuário.

## Web Push

Gere as chaves:

```bash
npx web-push generate-vapid-keys
```

Configure `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` e `CRON_SECRET`. No iPhone, o Web Push requer iOS 16.4 ou posterior e o app adicionado à Tela de Início.

O `vercel.json` chama o worker uma vez por minuto. Essa é uma fila **best effort**: atraso típico esperado de 0–2 minutos, sem garantia de entrega exata. O plano da Vercel precisa aceitar cron por minuto; caso contrário, use Supabase `pg_cron`, QStash ou Trigger.dev com a mesma rota protegida.

## Deploy na Vercel

1. Importe o repositório como projeto Next.js.
2. Configure todas as variáveis de `.env.example`.
3. Defina `NEXT_PUBLIC_APP_URL` com a URL pública.
4. Aplique migrations e seed no Supabase antes do primeiro login.
5. Faça o deploy e teste instalação + push em um iPhone real.

## Regras clínicas ausentes

Permanecem sem valor inventado: mínimos/máximos de metronidazol e rifaximina, política de atraso e dose perdida, acordar o usuário, agrupamentos permanentes e antecedência isolada do óleo de orégano. Consulte [Decisões médicas pendentes](docs/MEDICAL_DECISIONS.md).

## Estrutura

```text
src/
  app/                    # páginas e rotas HTTP
  components/             # infraestrutura visual compartilhada
  domain/scheduling/      # motor puro e testes
  features/               # auth, dashboard e notificações
  lib/                    # Supabase, offline, push, tempo e servidor
public/                   # service worker, ícones e cartão social
scripts/                  # geração determinística de ícones
supabase/                 # migration e seed
docs/                     # arquitetura, decisões e testes
```

Documentos: [arquitetura](docs/ARCHITECTURE.md), [API](docs/API.md), [testes](docs/TESTING.md) e [segurança](SECURITY.md).

## Referências oficiais

- [Next.js — Progressive Web Apps](https://nextjs.org/docs/app/guides/progressive-web-apps)
- [Supabase — Auth server-side](https://supabase.com/docs/guides/auth/server-side)
- [Apple — Web Push](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)
- [Vercel — Cron Jobs](https://vercel.com/docs/cron-jobs)

## Aviso

Este aplicativo é um organizador de rotina e registro. Em caso de divergência, prevalecem a receita e a orientação do médico ou farmacêutico.
