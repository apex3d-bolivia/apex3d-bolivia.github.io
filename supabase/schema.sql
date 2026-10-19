create table if not exists public.allowed_users (
  email text primary key check (email = lower(btrim(email)) and position('@' in email) > 1),
  slot smallint not null unique check (slot between 1 and 3)
);

alter table public.allowed_users enable row level security;
revoke all on table public.allowed_users from anon, authenticated;

create or replace function public.limit_allowed_users()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  available_slot smallint;
begin
  new.email := lower(btrim(new.email));
  select slots.slot into available_slot
  from generate_series(1, 3) as slots(slot)
  where not exists (
    select 1 from public.allowed_users as allowed
    where allowed.slot = slots.slot
  )
  order by slots.slot
  limit 1;
  if available_slot is null then
    raise exception 'APEx3D access is limited to three accounts.';
  end if;
  new.slot := available_slot;
  return new;
end;
$$;

drop trigger if exists allowed_users_maximum_three on public.allowed_users;
create trigger allowed_users_maximum_three
before insert on public.allowed_users
for each row execute function public.limit_allowed_users();

create or replace function public.is_allowed_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.allowed_users
      where email = lower((select auth.jwt() ->> 'email'))
    );
$$;

revoke all on function public.is_allowed_user() from public, anon;
grant execute on function public.is_allowed_user() to authenticated;

create table if not exists public.orders (
  id uuid primary key,
  product_name text not null check (length(btrim(product_name)) > 0),
  photo_path text,
  features text not null default '',
  quantity integer not null check (quantity > 0),
  customer_name text not null check (length(btrim(customer_name)) > 0),
  customer_phone text not null default '',
  delivery_date date not null,
  delivery_method text not null check (delivery_method in ('En persona', 'Paquetería', 'Encomienda')),
  printer text not null default '',
  total_cost numeric(12, 2) not null check (total_cost >= 0),
  amount_paid numeric(12, 2) not null default 0 check (amount_paid >= 0 and amount_paid <= total_cost),
  observations text not null default '',
  status text not null check (status in ('Planeación', 'Imprimiendo', 'Concluido', 'Entregado')),
  created_at timestamptz not null default now()
);

alter table public.orders enable row level security;
revoke all on table public.orders from anon;
grant select, insert, update, delete on table public.orders to authenticated;

drop policy if exists orders_select_allowed on public.orders;
create policy orders_select_allowed on public.orders
for select to authenticated using (public.is_allowed_user());

drop policy if exists orders_insert_allowed on public.orders;
create policy orders_insert_allowed on public.orders
for insert to authenticated with check (public.is_allowed_user());

drop policy if exists orders_update_allowed on public.orders;
create policy orders_update_allowed on public.orders
for update to authenticated
using (public.is_allowed_user())
with check (public.is_allowed_user());

drop policy if exists orders_delete_allowed on public.orders;
create policy orders_delete_allowed on public.orders
for delete to authenticated using (public.is_allowed_user());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-photos', 'order-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists order_photos_select_allowed on storage.objects;
create policy order_photos_select_allowed on storage.objects
for select to authenticated
using (bucket_id = 'order-photos' and public.is_allowed_user());

drop policy if exists order_photos_insert_allowed on storage.objects;
create policy order_photos_insert_allowed on storage.objects
for insert to authenticated
with check (bucket_id = 'order-photos' and public.is_allowed_user());

drop policy if exists order_photos_update_allowed on storage.objects;
create policy order_photos_update_allowed on storage.objects
for update to authenticated
using (bucket_id = 'order-photos' and public.is_allowed_user())
with check (bucket_id = 'order-photos' and public.is_allowed_user());

drop policy if exists order_photos_delete_allowed on storage.objects;
create policy order_photos_delete_allowed on storage.objects
for delete to authenticated
using (bucket_id = 'order-photos' and public.is_allowed_user());
