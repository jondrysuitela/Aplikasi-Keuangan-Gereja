-- Schema Supabase untuk integrasi sync transaksi
-- Gunakan service role key hanya di backend.

-- 1) Tabel transaksi utama untuk dashboard publik
-- Nama tabel: transactions

create table if not exists public.transactions (
  uuid uuid primary key,

  -- domain fields
  tanggal timestamptz not null,
  no text not null,
  uraian text not null,
  kode_anggaran text not null,
  mata_anggaran text not null,
  lembar_id text null,
  penerimaan numeric not null default 0,
  pengeluaran numeric not null default 0,

  -- sync metadata
  sync_status text not null default 'pending' check (sync_status in ('pending','synced','failed')),

  is_public boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,

  created_by text null,
  updated_by text null,
  deleted_by text null
);

-- 2) Index untuk query ringkas dashboard
create index if not exists idx_transactions_tanggal on public.transactions (tanggal);
create index if not exists idx_transactions_is_public on public.transactions (is_public);
create index if not exists idx_transactions_deleted_at on public.transactions (deleted_at);
create index if not exists idx_transactions_kode_anggaran on public.transactions (kode_anggaran);
create index if not exists idx_transactions_updated_at on public.transactions (updated_at);

-- 3) Trigger otomatis updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_transactions_updated_at on public.transactions;
create trigger trg_transactions_updated_at
before update on public.transactions
for each row
execute function public.set_updated_at();

-- 4) RLS: dashboard publik hanya baca data is_public=true dan deleted_at is null
alter table public.transactions enable row level security;

-- Policy untuk publik: boleh select hanya baris publik
-- (dashboard backend juga bisa pakai admin client, tapi public website harus pakai anon key)
create policy "public_read_public_rows"
on public.transactions
for select
to public
using (is_public = true and deleted_at is null);

-- Policy untuk insert/update/delete:
-- Non-admin (anon/public) ditolak. Backend pakai service role (bypass RLS).
create policy "public_no_write"
on public.transactions
for all
to public
using (false)
with check (false);

-- 5) Supabase RPC/REST upsert by uuid
-- Tidak butuh function tambahan; upsert langsung pakai onConflict (uuid)

