-- Cross-device cleaner schedule sync is now a product requirement: a personal
-- job created on the schedule must appear on the overview (and another open
-- device) without a reload. Both clients subscribe with cleaner_id filters.

alter table public.cleaner_manual_tasks replica identity full;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'cleaner_manual_tasks'
  ) then
    alter publication supabase_realtime add table public.cleaner_manual_tasks;
  end if;
end
$$;

notify pgrst, 'reload schema';
