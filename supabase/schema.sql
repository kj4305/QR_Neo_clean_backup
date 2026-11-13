-- QR Studio shared community and private QR history schema.
-- Run this file once in Supabase SQL Editor before connecting the browser client.

create extension if not exists pgcrypto;

create table if not exists public.reviews (
    id uuid primary key default gen_random_uuid(),
    author_id uuid not null references auth.users(id) on delete cascade,
    author_name text not null check (char_length(btrim(author_name)) between 1 and 40),
    rating smallint not null check (rating between 1 and 5),
    content text not null check (char_length(btrim(content)) between 1 and 1200),
    created_at timestamptz not null default now()
);

create table if not exists public.questions (
    id uuid primary key default gen_random_uuid(),
    author_id uuid not null references auth.users(id) on delete cascade,
    author_name text not null check (char_length(btrim(author_name)) between 1 and 40),
    title text not null check (char_length(btrim(title)) between 1 and 160),
    body text not null check (char_length(btrim(body)) between 1 and 4000),
    answer text check (answer is null or char_length(answer) <= 4000),
    answered_at timestamptz,
    created_at timestamptz not null default now()
);

create table if not exists public.qr_history (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    qr_data text not null check (char_length(qr_data) between 1 and 4096),
    qr_options jsonb not null default '{}'::jsonb,
    image_path text not null unique,
    created_at timestamptz not null default now()
);

create index if not exists reviews_created_at_idx on public.reviews (created_at desc);
create index if not exists questions_created_at_idx on public.questions (created_at desc);
create index if not exists qr_history_user_created_at_idx on public.qr_history (user_id, created_at desc);

alter table public.reviews enable row level security;
alter table public.questions enable row level security;
alter table public.qr_history enable row level security;

revoke all privileges on table public.reviews, public.questions, public.qr_history from anon, authenticated;
grant select on public.reviews, public.questions to anon, authenticated;
grant insert (author_id, author_name, rating, content) on public.reviews to authenticated;
grant insert (author_id, author_name, title, body) on public.questions to authenticated;
revoke update on public.questions from anon, authenticated;
grant update (answer, answered_at) on public.questions to authenticated;
grant select on public.qr_history to authenticated;
grant insert (id, user_id, qr_data, qr_options, image_path) on public.qr_history to authenticated;

drop policy if exists "Public can read reviews" on public.reviews;
create policy "Public can read reviews"
    on public.reviews for select to anon, authenticated
    using (true);

drop policy if exists "Signed-in visitors can post reviews" on public.reviews;
create policy "Signed-in visitors can post reviews"
    on public.reviews for insert to authenticated
    with check (author_id = (select auth.uid()));

drop policy if exists "Public can read questions" on public.questions;
create policy "Public can read questions"
    on public.questions for select to anon, authenticated
    using (true);

drop policy if exists "Signed-in visitors can post questions" on public.questions;
create policy "Signed-in visitors can post questions"
    on public.questions for insert to authenticated
    with check (author_id = (select auth.uid()));

drop policy if exists "Admins can answer questions" on public.questions;
create policy "Admins can answer questions"
    on public.questions for update to authenticated
    using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Users can read their own QR history" on public.qr_history;
create policy "Users can read their own QR history"
    on public.qr_history for select to authenticated
    using (user_id = (select auth.uid()));

drop policy if exists "Users can save their own QR history" on public.qr_history;
create policy "Users can save their own QR history"
    on public.qr_history for insert to authenticated
    with check (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('qr-history', 'qr-history', false, 5242880, array['image/png'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can upload their own QR images" on storage.objects;
create policy "Users can upload their own QR images"
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'qr-history'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

drop policy if exists "Users can read their own QR images" on storage.objects;
create policy "Users can read their own QR images"
    on storage.objects for select to authenticated
    using (
        bucket_id = 'qr-history'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

drop policy if exists "Users can remove their own QR images" on storage.objects;
create policy "Users can remove their own QR images"
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'qr-history'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

-- After creating the center's administrator account in Authentication > Users,
-- grant its trusted app_metadata role from the SQL Editor. Replace the address:
-- update auth.users
-- set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
-- where lower(email) = lower('admin@example.com');
-- The administrator must sign out and sign in again to refresh their access token.
