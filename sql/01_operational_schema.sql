-- =====================================================================
--  J1SPA  Operational (OLTP) schema  --  written by the direct sales
--  entry interface. Maps to Figure 3.3.2 of the paper.
-- =====================================================================
CREATE DATABASE IF NOT EXISTS j1spa_ops
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE j1spa_ops;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS alerts;
DROP TABLE IF EXISTS etl_runs;
DROP TABLE IF EXISTS stock_movements;
DROP TABLE IF EXISTS sale_items;
DROP TABLE IF EXISTS sales;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------- RBAC (paper 1.5.1: Owner/Administrator vs Staff) ----------
CREATE TABLE users (
  user_id       INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(64)  NOT NULL UNIQUE,
  full_name     VARCHAR(128) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('owner','staff') NOT NULL,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------- item catalog ----------
CREATE TABLE products (
  product_id     INT AUTO_INCREMENT PRIMARY KEY,
  sku            VARCHAR(40)  NOT NULL UNIQUE,
  name           VARCHAR(160) NOT NULL,
  category       VARCHAR(80)  NOT NULL DEFAULT 'Uncategorized',
  brand          VARCHAR(80)  NOT NULL DEFAULT 'Generic',
  vehicle_compat VARCHAR(160) NULL,
  supplier       VARCHAR(120) NOT NULL DEFAULT 'Unknown',
  unit_cost      DECIMAL(12,2) NOT NULL DEFAULT 0,
  unit_price     DECIMAL(12,2) NOT NULL DEFAULT 0,
  reorder_point  INT NOT NULL DEFAULT 0,
  stock_on_hand  INT NOT NULL DEFAULT 0,
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  source_type    VARCHAR(40) NOT NULL DEFAULT 'Direct Sales Entry',
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    ON UPDATE CURRENT_TIMESTAMP,
  INDEX ix_products_name (name),
  INDEX ix_products_active (is_active)
) ENGINE=InnoDB;

-- ---------- sales header (one row per confirmed sale) ----------
CREATE TABLE sales (
  sale_id       BIGINT AUTO_INCREMENT PRIMARY KEY,
  sale_ts       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- system-generated
  user_id       INT NOT NULL,
  user_role     ENUM('owner','staff') NOT NULL,
  total_amount  DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_cost    DECIMAL(14,2) NOT NULL DEFAULT 0,
  status        ENUM('confirmed','voided') NOT NULL DEFAULT 'confirmed',
  voided_ts     DATETIME NULL,
  note          VARCHAR(255) NULL,
  synced_dw     TINYINT(1) NOT NULL DEFAULT 0,   -- ETL watermark flag
  CONSTRAINT fk_sales_user FOREIGN KEY (user_id) REFERENCES users(user_id),
  INDEX ix_sales_ts (sale_ts),
  INDEX ix_sales_sync (synced_dw, status)
) ENGINE=InnoDB;

-- ---------- sale line items (one row per product per sale) ----------
CREATE TABLE sale_items (
  sale_item_id  BIGINT AUTO_INCREMENT PRIMARY KEY,
  sale_id       BIGINT NOT NULL,
  product_id    INT NOT NULL,
  sku           VARCHAR(40) NOT NULL,
  quantity      INT NOT NULL,
  unit_price    DECIMAL(12,2) NOT NULL,
  unit_cost     DECIMAL(12,2) NOT NULL,
  line_revenue  DECIMAL(14,2) NOT NULL,
  line_cost     DECIMAL(14,2) NOT NULL,
  CONSTRAINT fk_si_sale    FOREIGN KEY (sale_id)    REFERENCES sales(sale_id) ON DELETE CASCADE,
  CONSTRAINT fk_si_product FOREIGN KEY (product_id) REFERENCES products(product_id),
  INDEX ix_si_sale (sale_id),
  INDEX ix_si_product (product_id)
) ENGINE=InnoDB;

-- ---------- stock movements (stock-in receipts + adjustments + auto sale decrements) ----------
CREATE TABLE stock_movements (
  movement_id   BIGINT AUTO_INCREMENT PRIMARY KEY,
  movement_ts   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- system-generated
  product_id    INT NOT NULL,
  sku           VARCHAR(40) NOT NULL,
  movement_type ENUM('stock_in','adjustment','sale_decrement','void_increment') NOT NULL,
  quantity      INT NOT NULL,           -- signed: +receipt / -sale
  balance_after INT NOT NULL,
  user_id       INT NOT NULL,
  reference     VARCHAR(80) NULL,       -- e.g. sale_id, PO number
  note          VARCHAR(255) NULL,
  synced_dw     TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT fk_sm_product FOREIGN KEY (product_id) REFERENCES products(product_id),
  CONSTRAINT fk_sm_user    FOREIGN KEY (user_id)    REFERENCES users(user_id),
  INDEX ix_sm_ts (movement_ts),
  INDEX ix_sm_sync (synced_dw)
) ENGINE=InnoDB;

-- ---------- ETL bookkeeping + quality metrics (paper 3.2: DCR, DRR, LSR) ----------
CREATE TABLE etl_runs (
  run_id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  run_type       ENUM('historical_import','incremental') NOT NULL,
  trigger_source ENUM('scheduled','manual','deployment') NOT NULL,
  started_ts     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_ts    DATETIME NULL,
  status         ENUM('running','success','failed') NOT NULL DEFAULT 'running',
  rows_read      INT NOT NULL DEFAULT 0,
  rows_loaded    INT NOT NULL DEFAULT 0,
  dcr            DECIMAL(6,2) NULL,   -- Data Completeness Rate  %
  drr            DECIMAL(6,2) NULL,   -- Duplicate Reduction Rate %
  lsr            DECIMAL(6,2) NULL,   -- Load Success Rate %
  message        TEXT NULL,
  INDEX ix_etl_started (started_ts)
) ENGINE=InnoDB;

-- ---------- rule-based DSS alert snapshot (paper 3.6) ----------
CREATE TABLE alerts (
  alert_id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  generated_ts      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  batch_id          VARCHAR(32) NOT NULL,
  product_id        INT NOT NULL,
  sku               VARCHAR(40) NOT NULL,
  product_name      VARCHAR(160) NOT NULL,
  alert_type        ENUM('low_stock','stockout_imminent','demand_spike','overstock') NOT NULL,
  severity          ENUM('info','warning','critical') NOT NULL,
  stock_on_hand     INT NOT NULL,
  reorder_point     INT NOT NULL,
  forecast_30d      DECIMAL(12,2) NULL,
  days_to_depletion DECIMAL(8,2) NULL,
  recommendation    VARCHAR(255) NOT NULL,
  rule_trace        VARCHAR(255) NOT NULL,
  CONSTRAINT fk_alert_product FOREIGN KEY (product_id) REFERENCES products(product_id),
  INDEX ix_alert_batch (batch_id),
  INDEX ix_alert_gen (generated_ts)
) ENGINE=InnoDB;
