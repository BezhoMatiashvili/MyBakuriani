-- C18: shorter SMS texts (MyBakuriani_SMS_Optimization_Spec-2.md).
--
-- Georgian goes out as UCS-2: 70 UTF-16 units in one SMS, 67 per segment once it
-- is split. The check-in, review, win-back and consent texts are built in
-- supabase/functions/sms-automation-run/domain.ts and change with the edge
-- function and the app. This migration changes the three texts that live in the
-- database:
--   1. price_drop (sms_materialize_due_price_drop_events):
--      "ფასი შემცირდა! [Title]: [Old]→[New]₾. [Link] — MyBakuriani". The title is
--      cut to 25 characters, prices lose their trailing zeros (numeric(12,2)
--      printed "150000.00") and the symbol is the listing's own currency.
--   2. membership payment received (purchase_renter_membership): shorter text.
--   3. the 'notification' mirror (notifications_enqueue_sms): 70 characters in
--      total instead of 130, i.e. 'MyBakuriani: ' (13) + a title of at most 57.
--
-- Every function is patched from its LIVE definition, so nothing else in it can
-- drift. Each anchor must occur exactly once; a function that already carries
-- every new text is left alone. A missing function or a drifted anchor raises,
-- so a project that is behind this one fails loudly instead of keeping the old
-- text. CREATE OR REPLACE keeps each function's grants.

do $migration$
declare
  r record;
  v_oid oid;
  v_def text;
  v_count integer;
  i integer;
begin
  for r in
    select * from (values
      (
        'sms_materialize_due_price_drop_events',
        array[
          $a$'ფასი შემცირდა! %s: %s-დან %s-მდე. ნახეთ: %s/sales/%s — MyBakuriani.ge'$a$,
          $a$left(v_property.title,100),v_event.baseline_price,v_property.sale_price,rtrim(p_site_url,'/'),v_property.id$a$
        ],
        array[
          $a$'ფასი შემცირდა! %s: %s→%s%s. %s/sales/%s — MyBakuriani'$a$,
          $a$left(v_property.title,25),trim_scale(v_event.baseline_price),trim_scale(v_property.sale_price),coalesce(nullif(btrim(v_property.currency),''),'₾'),rtrim(p_site_url,'/'),v_property.id$a$
        ]
      ),
      (
        'purchase_renter_membership',
        array[$a$'MyBakuriani: საწევროს გადახდა მიღებულია და ადმინის დადასტურებას ელოდება.'$a$],
        array[$a$'MyBakuriani: საწევრო გადახდილია. ელოდება დადასტურებას.'$a$]
      ),
      (
        'notifications_enqueue_sms',
        array[
          $a$-- Title only, one line, <= 130 chars in total (about two UCS-2 segments).$a$,
          E'if char_length(v_title) > 117 then\n      v_title := left(v_title, 116)'
        ],
        array[
          $a$-- Title only, one line, <= 70 chars in total (one UCS-2 segment).$a$,
          E'if char_length(v_title) > 57 then\n      v_title := left(v_title, 56)'
        ]
      )
    ) as t(fn, olds, news)
  loop
    select count(*), (array_agg(p.oid))[1] into v_count, v_oid
      from pg_proc p
     where p.proname = r.fn and p.pronamespace = 'public'::regnamespace;
    if v_count <> 1 then
      raise exception '%: expected exactly one function, found % (apply the earlier migrations first)', r.fn, v_count;
    end if;
    v_def := pg_get_functiondef(v_oid);

    if (select bool_and(position(n in v_def) > 0) from unnest(r.news) n)
       and (select bool_and(position(o in v_def) = 0) from unnest(r.olds) o) then
      raise notice '%: already patched', r.fn;
      continue;
    end if;

    for i in 1 .. array_length(r.olds, 1) loop
      v_count := (length(v_def) - length(replace(v_def, r.olds[i], ''))) / length(r.olds[i]);
      if v_count <> 1 then
        raise exception '%: anchor % occurs % times (expected exactly 1)', r.fn, i, v_count;
      end if;
      v_def := replace(v_def, r.olds[i], r.news[i]);
    end loop;

    execute v_def;
  end loop;
end
$migration$;
