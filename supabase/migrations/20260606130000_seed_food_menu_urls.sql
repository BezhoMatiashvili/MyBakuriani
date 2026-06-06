-- Seed a demo menu URL on the demo food venues so the menu link renders on the
-- /food/[id] detail page. The PDF lives in the public `restaurant-menus` bucket
-- (uploaded via supabase/seed/upload-sample-menu.mjs).
--
-- Idempotent and non-destructive: only fills rows where menu_url is null, scoped
-- to the 12 demo venues (a0000003-…-001 … -012). Never overwrites a real menu.
update public.services
set menu_url = 'https://yuwyrmxccrpfjvidwhhg.supabase.co/storage/v1/object/public/restaurant-menus/demo/sample-menu.pdf'
where category = 'food'
  and id between 'a0000003-0000-4000-8000-000000000001'
            and 'a0000003-0000-4000-8000-000000000012'
  and menu_url is null;
