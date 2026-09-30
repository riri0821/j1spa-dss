-- =====================================================================
--  J1SPA  Postgres/Supabase schema (PERN migration)
--
--  Single-schema design: replaces the old MySQL ops+warehouse split.
--  There is no scheduler/ETL anymore, so:
--    - the `synced_dw` watermark columns and `etl_runs` table are gone
--    - the old star schema (fact_transactions, dim_date, ...) is gone
--    - the three reporting views it fed (vw_daily_sales, vw_monthly_sales,
--      vw_product_velocity) are kept, but now query the operational
--      tables directly, computed on read instead of synced on a timer.
--
--  Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New
--  query -> paste -> Run). Safe to re-run: it drops and recreates.
-- =====================================================================

drop view  if exists vw_product_velocity;
drop view  if exists vw_monthly_sales;
drop view  if exists vw_daily_sales;
drop table if exists alerts;
drop table if exists stock_movements;
drop table if exists sale_items;
drop table if exists sales;
drop table if exists products;
drop table if exists users;

drop type if exists user_role;
drop type if exists sale_status;
drop type if exists movement_type;
drop type if exists alert_type;
drop type if exists alert_severity;

create type user_role      as enum ('owner', 'staff');
create type sale_status    as enum ('confirmed', 'voided');
create type movement_type  as enum ('stock_in', 'adjustment', 'sale_decrement', 'void_increment');
create type alert_type     as enum ('low_stock', 'stockout_imminent', 'demand_spike', 'overstock');
create type alert_severity as enum ('info', 'warning', 'critical');

-- Postgres has no `ON UPDATE CURRENT_TIMESTAMP` column option like MySQL;
-- this trigger function does the equivalent, attached to any table with
-- an `updated_at` column below.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------- RBAC (owner / staff) ----------
-- Auth itself moves to Supabase Auth in Phase 1 (this table becomes a
-- `profiles` table keyed on auth.users.id). Kept close to the original
-- shape for now so Phase 0 has something to point the schema at.
create table users (
  user_id       bigint generated always as identity primary key,
  username      varchar(64)  not null unique,
  full_name     varchar(128) not null,
  password_hash varchar(255) not null,
  role          user_role    not null,
  is_active     boolean      not null default true,
  created_at    timestamptz  not null default now()
);

-- ---------- item catalog ----------
create table products (
  product_id     bigint generated always as identity primary key,
  sku            varchar(40)  not null unique,
  name           varchar(160) not null,
  category       varchar(80)  not null default 'Uncategorized',
  brand          varchar(80)  not null default 'Generic',
  vehicle_compat varchar(160),
  supplier       varchar(120) not null default 'Unknown',
  unit_cost      numeric(12,2) not null default 0,
  unit_price     numeric(12,2) not null default 0,
  reorder_point  integer not null default 0,
  stock_on_hand  integer not null default 0,
  is_active      boolean not null default true,
  source_type    varchar(40) not null default 'Direct Sales Entry',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index ix_products_name on products (name);
create index ix_products_active on products (is_active);
create trigger trg_products_updated_at
  before update on products
  for each row execute function set_updated_at();

-- ---------- sales header (one row per confirmed sale) ----------
create table sales (
  sale_id       bigint generated always as identity primary key,
  sale_ts       timestamptz not null default now(),
  user_id       bigint not null references users (user_id),
  user_role     user_role not null,
  total_amount  numeric(14,2) not null default 0,
  total_cost    numeric(14,2) not null default 0,
  status        sale_status not null default 'confirmed',
  voided_ts     timestamptz,
  note          varchar(255)
);
create index ix_sales_ts on sales (sale_ts);

-- ---------- sale line items (one row per product per sale) ----------
create table sale_items (
  sale_item_id  bigint generated always as identity primary key,
  sale_id       bigint not null references sales (sale_id) on delete cascade,
  product_id    bigint not null references products (product_id),
  sku           varchar(40) not null,
  quantity      integer not null,
  unit_price    numeric(12,2) not null,
  unit_cost     numeric(12,2) not null,
  line_revenue  numeric(14,2) not null,
  line_cost     numeric(14,2) not null
);
create index ix_si_sale on sale_items (sale_id);
create index ix_si_product on sale_items (product_id);

-- ---------- stock movements ----------
create table stock_movements (
  movement_id   bigint generated always as identity primary key,
  movement_ts   timestamptz not null default now(),
  product_id    bigint not null references products (product_id),
  sku           varchar(40) not null,
  movement_type movement_type not null,
  quantity      integer not null,
  balance_after integer not null,
  user_id       bigint not null references users (user_id),
  reference     varchar(80),
  note          varchar(255)
);
create index ix_sm_ts on stock_movements (movement_ts);

-- ---------- rule-based DSS alert snapshot ----------
create table alerts (
  alert_id          bigint generated always as identity primary key,
  generated_ts      timestamptz not null default now(),
  batch_id          varchar(32) not null,
  product_id        bigint not null references products (product_id),
  sku               varchar(40) not null,
  product_name      varchar(160) not null,
  alert_type        alert_type not null,
  severity          alert_severity not null,
  stock_on_hand     integer not null,
  reorder_point     integer not null,
  forecast_30d      numeric(12,2),
  days_to_depletion numeric(8,2),
  recommendation    varchar(255) not null,
  rule_trace        varchar(255) not null
);
create index ix_alert_batch on alerts (batch_id);
create index ix_alert_gen on alerts (generated_ts);

-- =====================================================================
--  Reporting views — replace the old synced star schema. These compute
--  straight from sale_items/sales/products on every query instead of
--  from a nightly/15-min ETL job. Fine at this data volume (small shop);
--  if it's ever too slow, turn one into a materialized view + a Supabase
--  scheduled refresh — still no app-level scheduler needed.
-- =====================================================================

create view vw_daily_sales as
select
  s.sale_ts::date                       as full_date,
  extract(year  from s.sale_ts)::int    as year,
  extract(quarter from s.sale_ts)::int  as quarter,
  extract(month from s.sale_ts)::int    as month,
  to_char(s.sale_ts, 'Month')           as month_name,
  to_char(s.sale_ts, 'Day')             as day_name,
  extract(isodow from s.sale_ts) in (6, 7) as is_weekend,
  p.sku,
  p.name                                as product_name,
  p.category                            as category_name,
  p.brand                               as brand_name,
  p.supplier                            as supplier_name,
  p.source_type,
  sum(si.quantity)                      as units,
  sum(si.line_revenue)                  as revenue,
  sum(si.line_cost)                     as cost,
  sum(si.line_revenue - si.line_cost)   as gross_profit
from sale_items si
join sales s    on s.sale_id = si.sale_id
join products p on p.product_id = si.product_id
where s.status = 'confirmed'
group by s.sale_ts::date, year, quarter, month, month_name, day_name,
         is_weekend, p.sku, p.name, p.category, p.brand, p.supplier, p.source_type;

create view vw_monthly_sales as
select
  extract(year  from s.sale_ts)::int as year,
  extract(month from s.sale_ts)::int as month,
  min(s.sale_ts::date)               as month_start,
  p.sku,
  p.name                             as product_name,
  p.category                         as category_name,
  sum(si.quantity)                   as units,
  sum(si.line_revenue)               as revenue,
  sum(si.line_revenue - si.line_cost) as gross_profit
from sale_items si
join sales s    on s.sale_id = si.sale_id
join products p on p.product_id = si.product_id
where s.status = 'confirmed'
group by year, month, p.sku, p.name, p.category;

create view vw_product_velocity as
select
  p.sku,
  p.name     as product_name,
  p.category as category_name,
  coalesce(sum(si.quantity), 0)                     as units_90d,
  coalesce(sum(si.line_revenue), 0)                 as revenue_90d,
  coalesce(sum(si.line_revenue - si.line_cost), 0)  as gross_profit_90d
from products p
left join sale_items si on si.product_id = p.product_id
left join sales s        on s.sale_id = si.sale_id
     and s.status = 'confirmed'
     and s.sale_ts >= now() - interval '90 days'
group by p.sku, p.name, p.category;
