-- The Vercel Hobby plan only accepts daily cron jobs. Notifications need a
-- one-minute scheduler, so Supabase Cron invokes the existing protected worker.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.configure_notification_cron()
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  worker_url text;
  worker_secret text;
  existing_job_id bigint;
  new_job_id bigint;
begin
  select decrypted_secret
    into worker_url
    from vault.decrypted_secrets
   where name = 'notification_worker_url';

  select decrypted_secret
    into worker_secret
    from vault.decrypted_secrets
   where name = 'notification_cron_secret';

  if worker_url is null or worker_url !~ '^https://[^/]+/api/jobs/send-due-notifications$' then
    raise exception 'Vault secret notification_worker_url is missing or invalid';
  end if;

  if worker_secret is null or pg_catalog.length(worker_secret) < 16 then
    raise exception 'Vault secret notification_cron_secret is missing or shorter than 16 characters';
  end if;

  select jobid
    into existing_job_id
    from cron.job
   where jobname = 'send-due-notifications-every-minute';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  select cron.schedule(
    'send-due-notifications-every-minute',
    '* * * * *',
    $cron$
      select net.http_get(
        url := (
          select decrypted_secret
            from vault.decrypted_secrets
           where name = 'notification_worker_url'
        ),
        headers := jsonb_build_object(
          'Authorization',
          'Bearer ' || (
            select decrypted_secret
              from vault.decrypted_secrets
             where name = 'notification_cron_secret'
          )
        ),
        timeout_milliseconds := 55000
      ) as request_id;
    $cron$
  ) into new_job_id;

  return new_job_id;
end;
$function$;

revoke all on function private.configure_notification_cron() from public, anon, authenticated;

comment on function private.configure_notification_cron() is
  'Registers the protected notification worker in Supabase Cron after its URL and shared secret exist in Vault.';
