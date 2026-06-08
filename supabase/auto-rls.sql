-- HabitTracker — auto-RLS safety net
-- Paste into Supabase dashboard → SQL Editor → New query → Run (once).
--
-- Recreates what the project-creation "Enable automatic RLS" checkbox would have done:
-- an event trigger that turns ON Row-Level Security for every NEW table created in the
-- `public` schema. This does NOT add policies (a table with RLS on but no policies
-- denies all access by default — which is the safe failure mode); you still write the
-- per-user policies for each new table, as in schema.sql.
--
-- Existing tables (habits, challenges, settings) already have RLS enabled explicitly,
-- so this only affects tables created from now on.

create or replace function public.enable_rls_on_new_tables()
returns event_trigger
language plpgsql
as $$
declare
  obj record;
begin
  for obj in
    select * from pg_event_trigger_ddl_commands()
    where command_tag = 'CREATE TABLE'
      and object_type = 'table'
  loop
    -- Only touch tables in the public schema.
    if obj.schema_name = 'public' then
      execute format('alter table %s enable row level security;', obj.object_identity);
    end if;
  end loop;
end;
$$;

-- (Re)create the trigger idempotently.
drop event trigger if exists trg_enable_rls_on_new_tables;
create event trigger trg_enable_rls_on_new_tables
  on ddl_command_end
  when tag in ('CREATE TABLE')
  execute function public.enable_rls_on_new_tables();
