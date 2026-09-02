-- SEMrush bronze + silver tables.
-- Nightly ingest pulls domain overview, top organic keywords, and backlinks
-- overview for atwork.com.au (au database). One snapshot per date per domain.

create table if not exists bronze.semrush_domain_snapshot (
  snapshot_date   date        not null,
  domain          text        not null,
  db              text        not null default 'au',
  rank            bigint,
  organic_keywords bigint,
  organic_traffic bigint,
  organic_cost    numeric,
  adwords_keywords bigint,
  adwords_traffic bigint,
  adwords_cost    numeric,
  ingested_at     timestamptz not null default now(),
  primary key (snapshot_date, domain, db)
);
alter table bronze.semrush_domain_snapshot enable row level security;

create table if not exists bronze.semrush_organic_keywords (
  snapshot_date  date        not null,
  domain         text        not null,
  db             text        not null default 'au',
  keyword        text        not null,
  position       int,
  previous_position int,
  search_volume  bigint,
  cpc            numeric,
  url            text,
  traffic_pct    numeric,
  ingested_at    timestamptz not null default now(),
  primary key (snapshot_date, domain, db, keyword)
);
alter table bronze.semrush_organic_keywords enable row level security;
create index if not exists idx_semrush_org_kw_snapshot on bronze.semrush_organic_keywords (snapshot_date, domain);

create table if not exists bronze.semrush_backlinks_overview (
  snapshot_date   date        not null,
  domain          text        not null,
  total_backlinks bigint,
  referring_domains bigint,
  referring_ips   bigint,
  follows_num     bigint,
  nofollows_num   bigint,
  score           numeric,
  trust_score     numeric,
  urls_num        bigint,
  ingested_at     timestamptz not null default now(),
  primary key (snapshot_date, domain)
);
alter table bronze.semrush_backlinks_overview enable row level security;

-- ── Silver views ──────────────────────────────────────────────────────────

create or replace view silver.semrush_domain_snapshot as
select
  snapshot_date,
  domain,
  db,
  coalesce(rank, 0)             as rank,
  coalesce(organic_keywords, 0) as organic_keywords,
  coalesce(organic_traffic, 0)  as organic_traffic,
  coalesce(organic_cost, 0)     as organic_cost,
  coalesce(adwords_keywords, 0) as adwords_keywords,
  coalesce(adwords_traffic, 0)  as adwords_traffic,
  coalesce(adwords_cost, 0)     as adwords_cost
from bronze.semrush_domain_snapshot;
alter view silver.semrush_domain_snapshot set (security_invoker = true);

create or replace view silver.semrush_organic_keywords as
select
  snapshot_date,
  domain,
  db,
  keyword,
  position,
  previous_position,
  coalesce(search_volume, 0)      as search_volume,
  coalesce(cpc, 0)                as cpc,
  url,
  coalesce(traffic_pct, 0)        as traffic_pct
from bronze.semrush_organic_keywords;
alter view silver.semrush_organic_keywords set (security_invoker = true);

create or replace view silver.semrush_backlinks_overview as
select
  snapshot_date,
  domain,
  coalesce(total_backlinks, 0)   as total_backlinks,
  coalesce(referring_domains, 0) as referring_domains,
  coalesce(referring_ips, 0)     as referring_ips,
  coalesce(follows_num, 0)       as follows_num,
  coalesce(nofollows_num, 0)     as nofollows_num,
  coalesce(score, 0)             as score,
  coalesce(trust_score, 0)       as trust_score,
  coalesce(urls_num, 0)          as urls_num
from bronze.semrush_backlinks_overview;
alter view silver.semrush_backlinks_overview set (security_invoker = true);
