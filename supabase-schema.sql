-- ============================================================================
-- Saurabh Wellness Center — Class Booking System (Supabase Schema)
-- FIXED VERSION — removes duplicate table/policy definitions, fixes table
-- creation order (bookings <-> payments circular reference), and fixes the
-- invalid "create policy if not exists" syntax.
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. EXTENSIONS
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. ENUMS
-- ----------------------------------------------------------------------------
drop type if exists public.payment_status cascade;
drop type if exists public.booking_status cascade;

create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');
create type public.booking_status as enum ('pending', 'confirmed', 'cancelled');

-- ----------------------------------------------------------------------------
-- 2. USERS TABLE
-- Mirrors auth.users but also holds phone + display name for booking contact.
-- ----------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. CLASSES TABLE
-- One row per scheduled offering. `type` distinguishes group classes from
-- 1:1 private sessions / consultations (both are bookable & paid).
-- ----------------------------------------------------------------------------
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  instructor text not null,
  level text not null default 'All levels',
  type text not null default 'class' check (type in ('class', 'session')),
  room text,
  class_date date not null,
  start_time time not null,
  end_time time not null,
  duration_minutes int not null check (duration_minutes > 0),
  price numeric(10, 2) not null check (price >= 0),
  currency text not null default 'INR',
  total_spots int not null check (total_spots > 0),
  available_spots int not null check (available_spots >= 0 and available_spots <= total_spots),
  status text not null default 'open' check (status in ('open', 'full', 'cancelled')),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. BOOKINGS TABLE
-- Created BEFORE payments, but payment_id has no inline FK yet — the
-- constraint linking it to payments is added in step 6 (below), after the
-- payments table exists. This breaks the circular reference.
-- ----------------------------------------------------------------------------
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_reference text not null unique,
  user_id uuid not null references auth.users (id) on delete cascade,
  class_id uuid not null references public.classes (id),
  payment_id uuid,
  amount_paid numeric(10, 2) not null,
  currency text not null default 'INR',
  payment_status public.payment_status not null default 'pending',
  booking_status public.booking_status not null default 'pending',
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 5. PAYMENTS TABLE
-- Razorpay transaction reference. Linked to a booking via foreign key.
-- ----------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings (id) on delete cascade,
  razorpay_order_id text not null unique,          -- returned by create-order
  razorpay_payment_id text unique,                 -- set when captured
  gateway text not null default 'razorpay',
  method text,                                      -- card / upi / netbanking / wallet
  amount numeric(10, 2) not null,
  currency text not null default 'INR',
  status public.payment_status not null default 'pending',
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 6. Now that payments exists, link bookings.payment_id to it.
-- ----------------------------------------------------------------------------
alter table public.bookings
  drop constraint if exists bookings_payment_id_fkey;

alter table public.bookings
  add constraint bookings_payment_id_fkey
  foreign key (payment_id) references public.payments (id);

-- ----------------------------------------------------------------------------
-- 7. INDEXES
-- ----------------------------------------------------------------------------
create index if not exists bookings_user_id_idx on public.bookings (user_id);
create index if not exists bookings_class_id_idx on public.bookings (class_id);
create index if not exists bookings_payment_status_idx on public.bookings (payment_status);
create index if not exists payments_order_id_idx on public.payments (razorpay_order_id);
create index if not exists classes_date_idx on public.classes (class_date, start_time);

-- ============================================================================
-- 8. HELPER FUNCTION — atomically decrement available_spots
-- ============================================================================
create or replace function public.decrement_class_spots(p_class_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), 'anon');
  v_spots int;
begin
  if v_role <> 'service_role' then
    if not exists (
      select 1 from public.bookings b
      where b.user_id = auth.uid()
        and b.class_id = p_class_id
        and b.booking_status = 'confirmed'
    ) then
      return 0;
    end if;
  end if;

  update public.classes
  set available_spots = available_spots - 1,
      status = case when available_spots - 1 <= 0 then 'full' else status end
  where id = p_class_id and available_spots > 0
  returning available_spots into v_spots;

  return coalesce(v_spots, 0);
end;
$$;

-- DEMO MODE ONLY — lets the booking page persist a fallback demo class into
-- the database so it becomes bookable. Insert-only (never updates existing
-- rows). REMOVE this function in production; staff manages classes directly.
create or replace function public.ensure_demo_class(p_class jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := (p_class->>'id')::uuid;
begin
  if auth.uid() is null then
    return null;
  end if;

  insert into public.classes
    (id, name, description, instructor, level, type, room,
     class_date, start_time, end_time, duration_minutes, price,
     currency, total_spots, available_spots, status)
  values (
    v_id,
    p_class->>'name',
    p_class->>'description',
    p_class->>'instructor',
    p_class->>'level',
    p_class->>'type',
    p_class->>'room',
    (p_class->>'class_date')::date,
    (p_class->>'start_time')::time,
    (p_class->>'end_time')::time,
    (p_class->>'duration_minutes')::int,
    (p_class->>'price')::numeric,
    coalesce(p_class->>'currency', 'INR'),
    (p_class->>'total_spots')::int,
    (p_class->>'available_spots')::int,
    'open'
  )
  on conflict (id) do nothing;

  return v_id;
end;
$$;

-- ============================================================================
-- 9. ROW LEVEL SECURITY (RLS)
-- ============================================================================
alter table public.users enable row level security;
alter table public.classes enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;

-- --- USERS ---
drop policy if exists "users_select_own" on public.users;
create policy "users_select_own" on public.users
  for select using (auth.uid() = id);

drop policy if exists "users_insert_own" on public.users;
create policy "users_insert_own" on public.users
  for insert with check (auth.uid() = id);

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own" on public.users
  for update using (auth.uid() = id);

-- --- CLASSES ---
drop policy if exists "classes_select_public" on public.classes;
create policy "classes_select_public" on public.classes
  for select using (true);

-- No client inserts/updates/deletes on classes (managed by staff / edge functions)

-- --- BOOKINGS ---
drop policy if exists "bookings_select_own" on public.bookings;
create policy "bookings_select_own" on public.bookings
  for select using (auth.uid() = user_id);

drop policy if exists "bookings_insert_own" on public.bookings;
create policy "bookings_insert_own" on public.bookings
  for insert with check (auth.uid() = user_id);

drop policy if exists "bookings_update_own" on public.bookings;
create policy "bookings_update_own" on public.bookings
  for update using (auth.uid() = user_id);

-- --- PAYMENTS ---
drop policy if exists "payments_select_own" on public.payments;
create policy "payments_select_own" on public.payments
  for select using (
    exists (
      select 1 from public.bookings b
      where b.id = payments.booking_id
        and b.user_id = auth.uid()
    )
  );

-- DEMO MODE ONLY — lets a user record a payment against their own booking
-- so the booking flow can be tested WITHOUT Razorpay. REMOVE this policy once
-- the Razorpay webhook (service role) is the only writer in production.
drop policy if exists "payments_insert_own_demo" on public.payments;
create policy "payments_insert_own_demo" on public.payments
  for insert with check (
    exists (
      select 1 from public.bookings b
      where b.id = payments.booking_id
        and b.user_id = auth.uid()
    )
  );

-- Note: in production, inserts/updates on payments and bookings status
-- changes are done ONLY by the Edge Functions (service role).

-- ============================================================================
-- 10. SEED DATA — classes
-- Adjust dates to upcoming sessions as needed.
-- ============================================================================
insert into public.classes
  (id, name, description, instructor, level, type, room, class_date, start_time, end_time, duration_minutes, price, total_spots, available_spots)
values
  ('11111111-1111-4111-8111-111111111101', 'Vinyasa Flow', 'Breath-led practice with clear sequencing, steady pace, and grounded movement.', 'Saurabh Negi', 'Intermediate', 'class', 'Main Studio', current_date + interval '1 day', '19:00', '19:50', 50, 499.00, 13, 13),
  ('11111111-1111-4111-8111-111111111102', 'Hatha Harmony', 'Gentle session with calm alignment, breath support, and mindful pacing.', 'Mohan Lal', 'All levels', 'class', 'Wellness Loft', current_date + interval '1 day', '19:30', '20:20', 50, 399.00, 8, 8),
  ('11111111-1111-4111-8111-111111111103', 'Power & Pulse', 'Heat and strength practice keeping space for grounding breath and focus.', 'Ashish Rayal', 'Beginner', 'class', 'Calm Corner', current_date + interval '2 days', '20:45', '21:30', 45, 599.00, 12, 12),
  ('11111111-1111-4111-8111-111111111104', 'Morning Meditation & Pranayama', 'Guided breathwork and seated meditation to start the day with stillness.', 'Saurabh Negi', 'All levels', 'class', 'Main Studio', current_date + interval '3 days', '06:30', '07:15', 45, 299.00, 15, 15),
  ('11111111-1111-4111-8111-111111111201', 'Private 1:1 Yoga Session', 'A personalised hour focused on your body, goals, and practice.', 'Saurabh Negi', 'All levels', 'session', 'Private Studio', current_date + interval '2 days', '10:00', '11:00', 60, 1499.00, 3, 3),
  ('11111111-1111-4111-8111-111111111202', 'Panchakarma Consultation', 'Ayurvedic consultation to design your personal cleanse & routine.', 'Mohan Lal', 'All levels', 'session', 'Wellness Loft', current_date + interval '4 days', '11:30', '12:15', 45, 2999.00, 5, 5),
  ('11111111-1111-4111-8111-111111111203', 'Meditation Mentoring', 'One-on-one guided practice to build a sustainable meditation habit.', 'Saurabh Negi', 'All levels', 'session', 'Calm Corner', current_date + interval '5 days', '09:00', '09:45', 45, 899.00, 6, 6)
on conflict (id) do nothing;