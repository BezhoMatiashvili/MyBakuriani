-- C18: never mirror a notification by SMS to an e2e test account.
--
-- The e2e fixtures (e2e/helpers/seed.ts) carry real-format Georgian mobile
-- numbers (+995599000001..9) and staging has no SMS recipient allow-list, so
-- every seed or lifecycle run that wrote an allow-listed notification (a
-- cleaning call, a payment...) texted a number nobody on the team controls and
-- spent platform credit. Test accounts are recognised by the address
-- createTestUser gives them (test-<role>-<id>@e2e.mybakuriani.test). Generated
-- from the LIVE body: the only change is the inserted block after the phone
-- lookup.

do $migration$
declare
  v_def text := pg_get_functiondef('public.notifications_enqueue_sms()'::regprocedure);
  v_anchor text := E'    if v_phone is null then\n      return null;\n    end if;\n';
  v_block text := E'\n    -- E2E fixtures (real-format numbers) are never texted.\n'
    || E'    if exists (select 1 from auth.users u\n'
    || E'                where u.id = new.user_id\n'
    || E'                  and lower(u.email) like ''%@e2e.mybakuriani.test'') then\n'
    || E'      return null;\n'
    || E'    end if;\n';
begin
  if position('@e2e.mybakuriani.test' in v_def) > 0 then
    return; -- already applied
  end if;
  if length(v_def) - length(replace(v_def, v_anchor, '')) <> length(v_anchor) then
    raise exception 'notifications_enqueue_sms: phone anchor not found exactly once';
  end if;
  execute replace(v_def, v_anchor, v_anchor || v_block);
end
$migration$;

revoke all on function public.notifications_enqueue_sms() from public, anon, authenticated;
grant execute on function public.notifications_enqueue_sms() to service_role;
