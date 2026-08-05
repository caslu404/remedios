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
   - `supabase/migrations/202608050002_notification_cron.sql`
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

Configure `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` e `CRON_SECRET` na Vercel. No iPhone, o Web Push requer iOS 16.4 ou posterior e o app adicionado à Tela de Início.

O plano Vercel Hobby não aceita cron por minuto. Por isso, a migration instala Supabase Cron (`pg_cron` + `pg_net`) e fornece uma função administrativa para registrar o worker sem expor segredos.

Depois do primeiro deploy, abra o SQL Editor do Supabase e execute uma vez, usando a URL pública final e o mesmo valor de `CRON_SECRET` configurado na Vercel:

```sql
select vault.create_secret(
  'https://SEU-DOMINIO.vercel.app/api/jobs/send-due-notifications',
  'notification_worker_url',
  'URL do worker de Web Push'
);

select vault.create_secret(
  'SUBSTITUA-PELO-MESMO-CRON_SECRET-DA-VERCEL',
  'notification_cron_secret',
  'Segredo compartilhado do worker de Web Push'
);

select private.configure_notification_cron();
```

Confirme que o job está ativo e acompanhe suas execuções:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname = 'send-due-notifications-every-minute';

select status, return_message, start_time, end_time
from cron.job_run_details
where jobid = (
  select jobid from cron.job
  where jobname = 'send-due-notifications-every-minute'
)
order by start_time desc
limit 20;
```

Essa continua sendo uma fila **best effort**: o scheduler consulta os jobs uma vez por minuto e o iOS decide quando apresenta o push. Como contingência, QStash também pode chamar a mesma rota com `Authorization: Bearer <CRON_SECRET>`, mas uma chamada por minuto excede o limite diário gratuito atual do serviço.

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
- [Supabase — Cron](https://supabase.com/docs/guides/cron)
- [Supabase — Vault](https://supabase.com/docs/guides/database/vault)
- [Apple — Web Push](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)
- [Vercel — limites de Cron Jobs](https://vercel.com/docs/cron-jobs/usage-and-pricing)

## Aviso

Este aplicativo é um organizador de rotina e registro. Em caso de divergência, prevalecem a receita e a orientação do médico ou farmacêutico.
