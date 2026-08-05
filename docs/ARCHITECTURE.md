# Arquitetura

## Fluxo principal

```text
iPhone PWA
  ├─ IndexedDB (preferências, dias e fila offline)
  ├─ Service Worker (shell, push e ações rápidas)
  └─ Next.js App Router
       ├─ Supabase Auth (PKCE + cookies)
       ├─ Motor puro de cronograma
       ├─ PostgreSQL + RLS + trilha de eventos
       └─ Fila de notificações → worker → Web Push
```

## Separação do motor

`src/domain/scheduling` não importa React, Next.js, Supabase nem APIs do navegador. Suas entradas contêm data, timezone, rotina, fases, doses anteriores e regras. Suas saídas são valores serializáveis.

Funções públicas obrigatórias:

- `generateDailySchedule(input)`
- `validateSchedule(schedule, rules)`
- `detectConflicts(schedule, rules)`
- `recalculateAfterDoseTaken(event, schedule, rules)`

## Conservadorismo

Um alvo prescrito pode posicionar a agenda. Limites mínimo/máximo e políticas de reagendamento só participam da adaptação quando estão cadastrados e confirmados. Horários que não podem ser determinados sem inferência recebem `scheduledMinute: null`, estado `requires_review` e conflito bloqueante.

## Offline e auditoria

A interface salva primeiro no IndexedDB. Eventos autenticados entram em uma fila idempotente com UUID e são enviados em ordem para `/api/offline/sync`. O servidor mantém `scheduled_at` e `taken_at`, não apaga eventos e conserva versões de cronograma.

## Segurança

- Sessão Supabase em cookies, renovada no `proxy`.
- RLS em todas as tabelas do usuário.
- Checagem de origem para mutações HTTP.
- Rate limiting transacional no PostgreSQL.
- Service role e VAPID privado apenas no servidor.
- Rotas autenticadas usam `auth.getUser()`.
- Sem analytics no MVP.

## Notificações

Confirmar o dia cria pré-lembrete e lembrete principal. Snooze cria um novo job, mas não muda `scheduled_at`. O worker reivindica jobs antes de enviar e desativa subscriptions expiradas (HTTP 404/410).
