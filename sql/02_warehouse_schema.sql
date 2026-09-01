-- =====================================================================
--  J1SPA  Analytical Data Warehouse  --  MySQL star schema (OLAP).
--  Maps to Figure 3.3.1: central fact_transactions + six dimensions
--  (dim_date, dim_product, dim_category, dim_brand, dim_supplier, dim_source).
-- =====================================================================
CREATE DATABASE IF NOT EXISTS j1spa_dw
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE j1spa_dw;

SET FOREIGN_KEY_CHECKS = 0;
DROP VIEW  IF EXISTS vw_daily_sales;
DROP VIEW  IF EXISTS vw_monthly_sales;
DROP VIEW  IF EXISTS vw_product_velocity;
DROP TABLE IF EXISTS fact_stock_movement;
DROP TABLE IF EXISTS fact_transactions;
DROP TABLE IF EXISTS dim_product;
DROP TABLE IF EXISTS dim_supplier;
DROP TABLE IF EXISTS dim_brand;
DROP TABLE IF EXISTS dim_category;
DROP TABLE IF EXISTS dim_source;
DROP TABLE IF EXISTS dim_date;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------- dimensions ----------------
CREATE TABLE dim_date (
  date_key     INT PRIMARY KEY,          -- yyyymmdd
  full_date    DATE NOT NULL,
  year         SMALLINT NOT NULL,
  quarter      TINYINT  NOT NULL,
  month        TINYINT  NOT NULL,
  month_name   VARCHAR(12) NOT NULL,
  week_of_year TINYINT NOT NULL,
  day_of_month TINYINT NOT NULL,
  day_of_week  TINYINT NOT NULL,         -- 1=Mon .. 7=Sun
  day_name     VARCHAR(12) NOT NULL,
  is_weekend   TINYINT(1) NOT NULL,
  UNIQUE KEY uq_dim_date_full (full_date)
) ENGINE=InnoDB;

CREATE TABLE dim_source (
  source_key  INT AUTO_INCREMENT PRIMARY KEY,
  source_type VARCHAR(40) NOT NULL UNIQUE   -- 'Direct Sales Entry' | 'Historical Migration'
) ENGINE=InnoDB;

CREATE TABLE dim_category (
  category_key  INT AUTO_INCREMENT PRIMARY KEY,
  category_name VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE dim_brand (
  brand_key  INT AUTO_INCREMENT PRIMARY KEY,
  brand_name VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE dim_supplier (
  supplier_key  INT AUTO_INCREMENT PRIMARY KEY,
  supplier_name VARCHAR(120) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE dim_product (
  product_key   INT AUTO_INCREMENT PRIMARY KEY,
  product_id    INT NOT NULL,            -- natural key from ops.products
  sku           VARCHAR(40) NOT NULL UNIQUE,
  name          VARCHAR(160) NOT NULL,
  category_key  INT NOT NULL,
  brand_key     INT NOT NULL,
  supplier_key  INT NOT NULL,
  unit_cost     DECIMAL(12,2) NOT NULL,
  unit_price    DECIMAL(12,2) NOT NULL,
  reorder_point INT NOT NULL,
  updated_ts    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_dp_cat   FOREIGN KEY (category_key) REFERENCES dim_category(category_key),
  CONSTRAINT fk_dp_brand FOREIGN KEY (brand_key)    REFERENCES dim_brand(brand_key),
  CONSTRAINT fk_dp_sup   FOREIGN KEY (supplier_key) REFERENCES dim_supplier(supplier_key)
) ENGINE=InnoDB;

-- ---------------- facts ----------------
-- Grain: one row per sale line (product x sale). Natural key = sale_item_id
-- for idempotent upsert by the incremental ETL.
CREATE TABLE fact_transactions (
  fact_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
  date_key     INT NOT NULL,
  product_key  INT NOT NULL,
  source_key   INT NOT NULL,
  sale_id      BIGINT NOT NULL,
  sale_item_id BIGINT NOT NULL UNIQUE,
  quantity     INT NOT NULL,
  revenue      DECIMAL(14,2) NOT NULL,
  cost         DECIMAL(14,2) NOT NULL,
  gross_profit DECIMAL(14,2) NOT NULL,
  CONSTRAINT fk_ft_date    FOREIGN KEY (date_key)    REFERENCES dim_date(date_key),
  CONSTRAINT fk_ft_product FOREIGN KEY (product_key) REFERENCES dim_product(product_key),
  CONSTRAINT fk_ft_source  FOREIGN KEY (source_key)  REFERENCES dim_source(source_key),
  INDEX ix_ft_date (date_key),
  INDEX ix_ft_product (product_key),
  INDEX ix_ft_sale (sale_id)
) ENGINE=InnoDB;

-- Grain: one row per stock movement. Natural key = movement_id.
CREATE TABLE fact_stock_movement (
  fact_id       BIGINT AUTO_INCREMENT PRIMARY KEY,
  date_key      INT NOT NULL,
  product_key   INT NOT NULL,
  source_key    INT NOT NULL,
  movement_id   BIGINT NOT NULL UNIQUE,
  movement_type VARCHAR(20) NOT NULL,
  quantity      INT NOT NULL,
  balance_after INT NOT NULL,
  CONSTRAINT fk_fsm_date    FOREIGN KEY (date_key)    REFERENCES dim_date(date_key),
  CONSTRAINT fk_fsm_product FOREIGN KEY (product_key) REFERENCES dim_product(product_key),
  CONSTRAINT fk_fsm_source  FOREIGN KEY (source_key)  REFERENCES dim_source(source_key),
  INDEX ix_fsm_date (date_key),
  INDEX ix_fsm_product (product_key)
) ENGINE=InnoDB;

-- ---------------- reporting views (consumed by Power BI Desktop) ----------------
CREATE VIEW vw_daily_sales AS
SELECT d.full_date, d.year, d.quarter, d.month, d.month_name,
       d.day_name, d.is_weekend,
       p.sku, p.name AS product_name,
       c.category_name, b.brand_name, sup.supplier_name,
       s.source_type,
       SUM(f.quantity)     AS units,
       SUM(f.revenue)      AS revenue,
       SUM(f.cost)         AS cost,
       SUM(f.gross_profit) AS gross_profit
FROM fact_transactions f
JOIN dim_date     d   ON d.date_key     = f.date_key
JOIN dim_product  p   ON p.product_key  = f.product_key
JOIN dim_category c   ON c.category_key = p.category_key
JOIN dim_brand    b   ON b.brand_key    = p.brand_key
JOIN dim_supplier sup ON sup.supplier_key = p.supplier_key
JOIN dim_source   s   ON s.source_key   = f.source_key
GROUP BY d.full_date, d.year, d.quarter, d.month, d.month_name, d.day_name,
         d.is_weekend, p.sku, p.name, c.category_name, b.brand_name,
         sup.supplier_name, s.source_type;

CREATE VIEW vw_monthly_sales AS
SELECT d.year, d.month, MIN(d.full_date) AS month_start,
       p.sku, p.name AS product_name, c.category_name,
       SUM(f.quantity)     AS units,
       SUM(f.revenue)      AS revenue,
       SUM(f.gross_profit) AS gross_profit
FROM fact_transactions f
JOIN dim_date     d ON d.date_key     = f.date_key
JOIN dim_product  p ON p.product_key  = f.product_key
JOIN dim_category c ON c.category_key = p.category_key
GROUP BY d.year, d.month, p.sku, p.name, c.category_name;

-- Velocity / ABC-style classification by trailing-90-day revenue share.
CREATE VIEW vw_product_velocity AS
SELECT p.sku, p.name AS product_name, c.category_name,
       COALESCE(SUM(f.quantity),0)     AS units_90d,
       COALESCE(SUM(f.revenue),0)      AS revenue_90d,
       COALESCE(SUM(f.gross_profit),0) AS gross_profit_90d
FROM dim_product p
JOIN dim_category c ON c.category_key = p.category_key
LEFT JOIN fact_transactions f ON f.product_key = p.product_key
     AND f.date_key >= CAST(DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 90 DAY), '%Y%m%d') AS UNSIGNED)
GROUP BY p.sku, p.name, c.category_name;
