-- 행사 테이블
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date date not null,
  location text not null default '',
  created_at timestamptz default now()
);

-- 참가자 테이블
create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  number integer not null,
  name text not null,
  organization text not null default '',
  barcode text not null,
  created_at timestamptz default now(),
  unique(event_id, barcode)
);

-- 스캔 로그 테이블
create table if not exists scan_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  barcode text not null,
  scan_type text not null check (scan_type in ('입장', '퇴장', '재입장')),
  scanned_at timestamptz default now()
);

-- 인덱스
create index if not exists idx_participants_event_id on participants(event_id);
create index if not exists idx_participants_barcode on participants(barcode);
create index if not exists idx_scan_logs_event_id on scan_logs(event_id);
create index if not exists idx_scan_logs_barcode on scan_logs(barcode);
create index if not exists idx_scan_logs_scanned_at on scan_logs(scanned_at);

-- RLS 비활성화 (내부 관리용)
alter table events disable row level security;
alter table participants disable row level security;
alter table scan_logs disable row level security;
