-- Impression / click counters for ads.
--
-- `ads.views_count` and `ads.clicks_count` have existed since the table was
-- created and have never been incremented by anything, so the admin CTR tile
-- has always read 0.0%. Now that ads actually render publicly (contract C12),
-- these are the write path.
--
-- SECURITY DEFINER because the caller is anonymous: the "ads admin all" policy
-- restricts writes to admins, and we do not want to widen it just to bump a
-- counter. The function is deliberately narrow — it can ONLY increment one of
-- two integer columns on one row, and returns nothing.

create or replace function public.increment_ad_metric(
  p_ad_id uuid,
  p_event text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_event not in ('view', 'click') then
    raise exception 'invalid event %', p_event using errcode = '22023';
  end if;

  update public.ads
  set
    views_count = views_count + case when p_event = 'view' then 1 else 0 end,
    clicks_count = clicks_count + case when p_event = 'click' then 1 else 0 end
  where id = p_ad_id
    -- Only count a creative that was actually eligible to be on screen. Stops
    -- a replayed beacon from inflating a paused or long-expired campaign.
    and status = 'active'
    and start_at <= now()
    and end_at >= now();
end;
$$;

revoke all on function public.increment_ad_metric(uuid, text) from public;
grant execute on function public.increment_ad_metric(uuid, text) to anon, authenticated;

comment on function public.increment_ad_metric(uuid, text) is
  'Increments ads.views_count / clicks_count for an in-window active ad. Called by POST /api/banner-slots/track.';
