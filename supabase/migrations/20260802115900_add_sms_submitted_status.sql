-- Enum labels must commit before a later migration can use them in indexes,
-- function bodies, comparisons, or writes.

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typnamespace = 'public'::regnamespace
      and t.typname = 'sms_outbound_status'
      and e.enumlabel = 'submitted'
  ) then
    alter type public.sms_outbound_status add value 'submitted' after 'approved';
  end if;
end $$;

notify pgrst, 'reload schema';
