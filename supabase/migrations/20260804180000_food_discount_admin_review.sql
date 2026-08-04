-- Restaurant discounts are paid only after an MFA-protected admin approval.
-- The submitted price/duration are quoted from pricing_packages and stay fixed
-- for that request, so a later package edit cannot surprise the requester.

alter table public.content_change_requests
  add column if not exists request_kind text not null default 'content',
  add column if not exists pricing_package_id uuid references public.pricing_packages(id) on delete restrict,
  add column if not exists quoted_amount_gel numeric(12,2),
  add column if not exists quoted_duration_hours integer,
  add column if not exists payment_error text,
  add column if not exists request_metadata jsonb not null default '{}'::jsonb;

alter table public.content_change_requests
  drop constraint if exists content_change_request_kind_check;
alter table public.content_change_requests
  add constraint content_change_request_kind_check
    check (request_kind in ('content', 'food_discount'));
alter table public.content_change_requests
  drop constraint if exists content_change_food_discount_target_check;
alter table public.content_change_requests
  add constraint content_change_food_discount_target_check check (
    request_kind <> 'food_discount'
    or (
      target_type = 'service'
      and quoted_amount_gel is not null and quoted_amount_gel >= 0
      and quoted_duration_hours is not null and quoted_duration_hours > 0
      and pricing_package_id is not null
    )
  );

drop index if exists public.content_change_one_pending_target;
create unique index if not exists content_change_one_pending_target_kind
  on public.content_change_requests(target_type, target_id, request_kind)
  where status = 'pending';

create or replace function public.submit_food_discount_request(
  p_requester_id uuid,
  p_service_id uuid,
  p_package_id uuid,
  p_discount_percent integer,
  p_quantity integer default 1
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_service public.services%rowtype;
  v_package public.pricing_packages%rowtype;
  v_balance numeric := 0;
  v_duration integer;
  v_amount numeric;
  v_request public.content_change_requests%rowtype;
begin
  if p_requester_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if p_discount_percent is null or p_discount_percent < 1 or p_discount_percent > 90 then
    raise exception 'invalid_discount_percent' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 365 then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;

  select * into v_service from public.services
  where id = p_service_id for update;
  if not found then raise exception 'service_not_found' using errcode = 'P0002'; end if;
  if v_service.owner_id <> p_requester_id then
    raise exception 'service_forbidden' using errcode = '42501';
  end if;
  if v_service.category <> 'food' or v_service.status <> 'active' then
    raise exception 'active_food_service_required' using errcode = '22023';
  end if;

  select * into v_package from public.pricing_packages
  where id = p_package_id for share;
  if not found then raise exception 'package_not_found' using errcode = 'P0002'; end if;
  if not v_package.is_enabled
     or v_package.category <> 'vip'
     or coalesce(v_package.meta ->> 'tier', '') <> 'discount' then
    raise exception 'discount_package_required' using errcode = '22023';
  end if;
  v_duration := coalesce(nullif(v_package.meta ->> 'duration_hours', '')::integer, 24) * p_quantity;
  if v_duration < 1 or v_duration > 8760 then
    raise exception 'invalid_package_duration' using errcode = '22023';
  end if;
  v_amount := v_package.amount_gel * p_quantity;

  select coalesce(amount, 0) into v_balance
  from public.balances where user_id = p_requester_id;
  if v_balance < v_amount then
    raise exception 'insufficient_balance' using errcode = '22023';
  end if;

  select * into v_request
  from public.content_change_requests
  where target_type = 'service'
    and target_id = p_service_id
    and request_kind = 'food_discount'
    and status = 'pending'
  for update;

  if found then
    update public.content_change_requests set
      requester_id = p_requester_id,
      before_snapshot = jsonb_build_object(
        'discount_percent', v_service.discount_percent,
        'discount_expires_at', v_service.discount_expires_at
      ),
      proposed_values = jsonb_build_object('discount_percent', p_discount_percent),
      field_diff = jsonb_build_object(
        'discount_percent', jsonb_build_object(
          'before', v_service.discount_percent,
          'after', p_discount_percent
        )
      ),
      pricing_package_id = v_package.id,
      quoted_amount_gel = v_amount,
      quoted_duration_hours = v_duration,
      payment_error = null,
      request_metadata = '{}'::jsonb
    where id = v_request.id
    returning * into v_request;
  else
    insert into public.content_change_requests (
      requester_id, target_type, target_id, request_kind,
      before_snapshot, proposed_values, field_diff,
      pricing_package_id, quoted_amount_gel, quoted_duration_hours
    ) values (
      p_requester_id, 'service', p_service_id, 'food_discount',
      jsonb_build_object(
        'discount_percent', v_service.discount_percent,
        'discount_expires_at', v_service.discount_expires_at
      ),
      jsonb_build_object('discount_percent', p_discount_percent),
      jsonb_build_object(
        'discount_percent', jsonb_build_object(
          'before', v_service.discount_percent,
          'after', p_discount_percent
        )
      ),
      v_package.id, v_amount, v_duration
    ) returning * into v_request;
  end if;

  return jsonb_build_object(
    'id', v_request.id,
    'status', v_request.status,
    'discount_percent', p_discount_percent,
    'quoted_amount_gel', v_amount,
    'quoted_duration_hours', v_duration,
    'created_at', v_request.created_at
  );
end;
$$;

create or replace function public.approve_food_discount_request(
  p_request_id uuid,
  p_admin_id uuid
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  r public.content_change_requests%rowtype;
  v_service public.services%rowtype;
  v_balance numeric;
  v_percent integer;
  v_expires_at timestamptz;
  v_notify_payment_issue boolean;
begin
  if not exists (
    select 1 from public.profiles where id = p_admin_id and role = 'admin'
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  select * into r from public.content_change_requests
  where id = p_request_id for update;
  if not found then raise exception 'request_not_found' using errcode = 'P0002'; end if;
  if r.status <> 'pending' then raise exception 'request_not_pending' using errcode = 'P0001'; end if;
  if r.request_kind <> 'food_discount' then
    raise exception 'food_discount_request_required' using errcode = '22023';
  end if;

  select * into v_service from public.services where id = r.target_id for update;
  if not found or v_service.owner_id <> r.requester_id then
    update public.content_change_requests set
      status = 'superseded', reviewed_by = p_admin_id, reviewed_at = now(),
      rejection_reason = 'target_missing_or_owner_changed'
    where id = r.id;
    return jsonb_build_object('status', 'superseded', 'reason', 'target_missing_or_owner_changed');
  end if;
  if v_service.category <> 'food' or v_service.status <> 'active' then
    update public.content_change_requests set
      status = 'superseded', reviewed_by = p_admin_id, reviewed_at = now(),
      rejection_reason = 'active_food_service_required'
    where id = r.id;
    return jsonb_build_object('status', 'superseded', 'reason', 'active_food_service_required');
  end if;
  if (r.before_snapshot -> 'discount_percent') is distinct from coalesce(to_jsonb(v_service.discount_percent), 'null'::jsonb)
     or (r.before_snapshot -> 'discount_expires_at') is distinct from coalesce(to_jsonb(v_service.discount_expires_at), 'null'::jsonb) then
    update public.content_change_requests set
      status = 'superseded', reviewed_by = p_admin_id, reviewed_at = now(),
      rejection_reason = 'stale_discount_state'
    where id = r.id;
    insert into public.notifications(user_id,type,title,message,action_url,dashboard_scope)
    values (r.requester_id,'content_change_superseded','ფასდაკლების მოთხოვნა ვადაგასულია',
      'რესტორნის ფასდაკლების მდგომარეობა შეიცვალა. გთხოვთ, მოთხოვნა ხელახლა გაგზავნოთ.',
      '/dashboard/food/orders','food');
    return jsonb_build_object('status', 'superseded', 'reason', 'stale_discount_state');
  end if;

  v_percent := nullif(r.proposed_values ->> 'discount_percent', '')::integer;
  if v_percent is null or v_percent < 1 or v_percent > 90
     or r.quoted_amount_gel is null or r.quoted_amount_gel < 0
     or r.quoted_duration_hours is null or r.quoted_duration_hours < 1 then
    raise exception 'invalid_discount_request' using errcode = '22023';
  end if;

  insert into public.balances(user_id, amount, sms_remaining)
  values (r.requester_id, 0, 0) on conflict (user_id) do nothing;
  select amount into v_balance from public.balances
  where user_id = r.requester_id for update;
  if v_balance < r.quoted_amount_gel then
    v_notify_payment_issue := r.payment_error is distinct from 'insufficient_balance';
    update public.content_change_requests
    set payment_error = 'insufficient_balance'
    where id = r.id;
    if v_notify_payment_issue then
      insert into public.notifications(user_id,type,title,message,action_url,dashboard_scope)
      values (r.requester_id,'payment_required','ფასდაკლებისთვის ბალანსი არასაკმარისია',
        format('დასამტკიცებლად საჭიროა %s ₾. შეავსეთ ბალანსი და ადმინი შეძლებს მოთხოვნის ხელახლა დამტკიცებას.', r.quoted_amount_gel),
        '/dashboard/food/balance','food');
    end if;
    return jsonb_build_object(
      'status', 'payment_required',
      'reason', 'insufficient_balance',
      'required', r.quoted_amount_gel,
      'available', v_balance
    );
  end if;

  v_expires_at := now() + make_interval(hours => r.quoted_duration_hours);
  update public.balances
  set amount = amount - r.quoted_amount_gel, updated_at = now()
  where user_id = r.requester_id;
  update public.services
  set discount_percent = v_percent,
      discount_expires_at = v_expires_at,
      updated_at = now()
  where id = r.target_id;
  insert into public.transactions(user_id, amount, type, description, reference_id)
  values (
    r.requester_id,
    -r.quoted_amount_gel,
    'discount_badge',
    format('რესტორნის ფასდაკლება %s%% (%s სთ)', v_percent, r.quoted_duration_hours),
    r.id
  );

  perform set_config('mybakuriani.food_discount_approval', r.id::text, true);
  update public.content_change_requests set
    status = 'approved', reviewed_by = p_admin_id, reviewed_at = now(),
    rejection_reason = null, payment_error = null
  where id = r.id;
  insert into public.notifications(user_id,type,title,message,action_url,dashboard_scope)
  values (r.requester_id,'content_change_approved','ფასდაკლება დამტკიცდა',
    format('%s%% ფასდაკლება გააქტიურდა %s საათით.', v_percent, r.quoted_duration_hours),
    '/dashboard/food/orders','food');

  return jsonb_build_object(
    'status', 'approved',
    'target_type', 'service',
    'target_id', r.target_id,
    'discount_percent', v_percent,
    'expires_at', v_expires_at,
    'charged', r.quoted_amount_gel
  );
end;
$$;

-- Only the specialised approval RPC may transition a food-discount request to
-- approved. This also prevents the generic editorial RPC from marking it paid
-- without touching the service or wallet.
create or replace function public.guard_food_discount_approval()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if old.request_kind = 'food_discount'
     and old.status = 'pending'
     and new.status = 'approved'
     and coalesce(current_setting('mybakuriani.food_discount_approval', true), '') <> old.id::text then
    raise exception 'specialized_food_discount_approval_required' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_food_discount_approval() from public, anon, authenticated;
drop trigger if exists guard_food_discount_approval on public.content_change_requests;
create trigger guard_food_discount_approval
  before update on public.content_change_requests
  for each row execute function public.guard_food_discount_approval();

revoke all on function public.submit_food_discount_request(uuid,uuid,uuid,integer,integer)
  from public, anon, authenticated;
revoke all on function public.approve_food_discount_request(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.submit_food_discount_request(uuid,uuid,uuid,integer,integer)
  to service_role;
grant execute on function public.approve_food_discount_request(uuid,uuid)
  to service_role;

-- Convert the legacy pending menu.promotions request into a real percentage
-- request without charging it. The known live request contains "2%" in title;
-- any malformed legacy row is superseded explicitly rather than published.
do $$
declare
  v_package public.pricing_packages%rowtype;
begin
  select * into v_package from public.pricing_packages
  where category = 'vip' and code = 'discount' and is_enabled
    and coalesce(meta ->> 'tier', '') = 'discount';
  if not found then
    raise exception 'enabled vip/discount pricing package is required';
  end if;

  with legacy as (
    select c.id, c.proposed_values,
      nullif(substring(
        c.proposed_values -> 'menu' -> 'promotions' -> 0 ->> 'title'
        from '([0-9]{1,2})[[:space:]]*%'
      ), '')::integer as percent
    from public.content_change_requests c
    where c.status = 'pending'
      and c.target_type = 'service'
      and c.request_kind = 'content'
      and jsonb_typeof(c.proposed_values -> 'menu' -> 'promotions') = 'array'
  )
  update public.content_change_requests c set
    request_kind = 'food_discount',
    before_snapshot = jsonb_build_object(
      'discount_percent', s.discount_percent,
      'discount_expires_at', s.discount_expires_at
    ),
    proposed_values = jsonb_build_object('discount_percent', legacy.percent),
    field_diff = jsonb_build_object(
      'discount_percent', jsonb_build_object(
        'before', s.discount_percent,
        'after', legacy.percent
      )
    ),
    pricing_package_id = v_package.id,
    quoted_amount_gel = v_package.amount_gel,
    quoted_duration_hours = coalesce(nullif(v_package.meta ->> 'duration_hours', '')::integer, 24),
    request_metadata = jsonb_build_object('legacy_promotion', legacy.proposed_values),
    payment_error = null
  from legacy, public.services s
  where c.id = legacy.id and s.id = c.target_id
    and legacy.percent between 1 and 90;

  with malformed as (
    update public.content_change_requests c set
      status = 'superseded',
      rejection_reason = 'legacy_promotion_has_no_valid_percentage',
      reviewed_at = now()
    where c.status = 'pending'
      and c.target_type = 'service'
      and c.request_kind = 'content'
      and jsonb_typeof(c.proposed_values -> 'menu' -> 'promotions') = 'array'
    returning requester_id
  )
  insert into public.notifications(user_id,type,title,message,action_url,dashboard_scope)
  select distinct requester_id,'content_change_superseded','აქციის მოთხოვნა საჭიროებს განახლებას',
    'ძველ მოთხოვნაში ფასდაკლების სწორი პროცენტი ვერ მოიძებნა. გთხოვთ, მოთხოვნა ხელახლა გაგზავნოთ.',
    '/dashboard/food/orders','food'
  from malformed;
end;
$$;

-- Append an orderable, privacy-safe active flag to the public read model.
create or replace view public.public_services
with (security_invoker = false) as
select s.id, s.category, s.title, s.description, s.price, s.price_unit, s.currency, s.photos,
       s.location, s.schedule, s.discount_percent, s.is_vip, s.views_count, s.driver_name,
       s.vehicle_capacity, s.route, s.cuisine_type, s.has_delivery, s.operating_hours, s.menu,
       s.position, s.salary_range, s.experience_required, s.employment_schedule, s.created_at,
       s.updated_at, s.is_new, s.avg_check, s.menu_url, s.has_kids_area, s.has_lounge,
       s.has_live_music, s.employment_type, s.work_schedule, s.salary_type, s.salary_min,
       s.salary_max, s.salary_daily, s.accommodation, s.meals, s.requirements, s.languages,
       s.service_field, s.provider_name, s.rating, s.reviews_count, s.safety_notes, s.activity_type,
       s.activity_category, s.duration, s.age_min, s.good_for, s.coords, s.restaurant_type,
       s.is_super_vip, s.vip_expires_at, s.menu_views_count, s.vehicle_color, s.features,
       s.route_pricing, s.discount_expires_at,
       p.display_name as profile_display_name, p.avatar_url as profile_avatar_url,
       p.is_verified as profile_is_verified,
       regexp_replace(coalesce(s.whatsapp, ''), '[^0-9]', '', 'g') ~ '^(995)?5[0-9]{8}$' as has_whatsapp,
       coalesce(s.discount_percent, 0) > 0
         and (s.discount_expires_at is null or s.discount_expires_at > now()) as has_active_discount
from public.services s
left join public.profiles p on p.id = s.owner_id
where s.status = 'active';

revoke all on public.public_services from public;
grant select on public.public_services to anon, authenticated;

notify pgrst, 'reload schema';
