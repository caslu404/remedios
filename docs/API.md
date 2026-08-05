# API do MVP

Todas as rotas abaixo, exceto o worker, exigem sessão Supabase.

| Método | Rota | Uso |
|---|---|---|
| POST | `/api/checkins` | Criar/atualizar check-in. |
| GET | `/api/checkins/today` | Ler check-in de hoje. |
| POST | `/api/schedules/generate` | Gerar e versionar cronograma. |
| GET | `/api/schedules/today` | Ler último cronograma do dia. |
| POST | `/api/schedules/:id/confirm` | Confirmar e criar jobs futuros. |
| POST | `/api/doses/:id/taken` | Registrar horário real, idempotente. |
| POST | `/api/doses/:id/skipped` | Registrar não tomada sem compensação. |
| POST | `/api/doses/:id/snooze` | Adiar apenas o lembrete por 10 min. |
| POST | `/api/doses/:id/reschedule` | Retorna 409 enquanto a política não estiver confirmada. |
| GET | `/api/history` | Listar versões e snapshots. |
| GET | `/api/rules` | Ler fases e regras efetivas. |
| PATCH | `/api/rules/:id` | Confirmar intervalos ou política, exigindo fonte. |
| POST/DELETE | `/api/push/subscribe` | Registrar/desativar dispositivo. |
| POST | `/api/push/test` | Enviar teste ao dispositivo atual. |
| POST | `/api/offline/sync` | Aplicar eventos idempotentes do IndexedDB. |
| GET | `/api/export` | Exportar dados e eventos em JSON. |
| DELETE | `/api/account` | Excluir conta e dados em cascata. |
| GET | `/api/jobs/send-due-notifications` | Worker protegido por `CRON_SECRET`. |

Erros clínicos/conservadores usam códigos estáveis como `RESCHEDULE_POLICY_UNCONFIRMED` e não retornam recomendações de dose.
