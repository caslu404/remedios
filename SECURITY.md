# Segurança e privacidade

## Dados tratados

O app armazena identidade, rotina, cronogramas e registros de doses. Não há analytics no MVP e nomes/doses não são enviados a ferramentas de telemetria.

## Controles

- HTTPS obrigatório em produção.
- Supabase Auth com magic link e PKCE.
- Row Level Security e cascata por usuário.
- CSRF por validação de origem nas mutações.
- Rate limiting no banco para operações sensíveis.
- Validação Zod nas entradas HTTP.
- Chaves VAPID privada, service role e segredo do cron somente no servidor.
- Cabeçalhos de segurança no Next.js.
- Exportação e exclusão de conta.

## Relatar vulnerabilidade

Não abra uma issue pública com dados pessoais ou clínicos. Contate o mantenedor do repositório por um canal privado do GitHub e inclua apenas os passos mínimos para reproduzir.

## Limitações antes da produção

O deploy deve passar por teste de RLS com usuários distintos, revisão de retenção/backups e teste de push em iPhone real. Logs do servidor devem guardar códigos técnicos, nunca o conteúdo clínico completo.
