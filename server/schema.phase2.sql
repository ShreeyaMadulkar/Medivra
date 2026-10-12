-- Medivra - Phase 2 schema (batches, inventory, transfers, audit log)
-- Safe to re-run: only CREATE TABLE IF NOT EXISTS. It never drops, truncates or alters existing data.
-- Applied by `npm run db:init` AFTER schema.sql (it needs organizations and users).
--
-- HOW STOCK IS REPRESENTED (no double counting):
--   inventory.quantity            = units physically AVAILABLE at that organization right now.
--   transfers PENDING             = nothing moved, nothing reserved. Stock is only re-checked at dispatch.
--   transfers IN_TRANSIT          = units were deducted from the sender's inventory at dispatch and are
--                                   held ONLY in transfer_items.quantity (not in any inventory row).
--   transfers DELIVERED           = those units were added once to the receiver's inventory at receipt.
--   transfers CANCELLED           = only possible from PENDING, so no stock ever moved (nothing to restore).
--   "In transit" totals are computed from transfer_items of IN_TRANSIT transfers, never stored twice.

CREATE TABLE IF NOT EXISTS batches (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  origin_org_id    BIGINT UNSIGNED NOT NULL,                 -- distributor that registered the batch
  batch_number     VARCHAR(50)  NOT NULL,
  medicine_name    VARCHAR(150) NOT NULL,
  category         ENUM('Analgesic','Antibiotic','Antihistamine','Antidiabetic','Other') NOT NULL DEFAULT 'Other',
  manufacturer     VARCHAR(150) NOT NULL,                    -- batch metadata only (not a role/organization)
  manufacture_date DATE NOT NULL,
  expiry_date      DATE NOT NULL,
  original_quantity INT UNSIGNED NOT NULL,                   -- quantity when first registered
  unit_price       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  notes            VARCHAR(500) NULL,
  created_by       BIGINT UNSIGNED NOT NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_batches_identity (origin_org_id, manufacturer, medicine_name, batch_number),  -- no duplicate batch records
  KEY idx_batches_expiry (expiry_date),
  KEY idx_batches_medicine (medicine_name),
  CONSTRAINT fk_batches_origin FOREIGN KEY (origin_org_id) REFERENCES organizations (id),
  CONSTRAINT fk_batches_creator FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT chk_batches_qty CHECK (original_quantity > 0),
  CONSTRAINT chk_batches_price CHECK (unit_price >= 0),
  CONSTRAINT chk_batches_dates CHECK (expiry_date > manufacture_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory (
  organization_id BIGINT UNSIGNED NOT NULL,
  batch_id        BIGINT UNSIGNED NOT NULL,
  quantity        INT UNSIGNED NOT NULL DEFAULT 0,           -- AVAILABLE units (see header)
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (organization_id, batch_id),                   -- one stock row per organization per batch
  KEY idx_inventory_batch (batch_id),
  CONSTRAINT fk_inventory_org FOREIGN KEY (organization_id) REFERENCES organizations (id),
  CONSTRAINT fk_inventory_batch FOREIGN KEY (batch_id) REFERENCES batches (id),
  CONSTRAINT chk_inventory_qty CHECK (quantity >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transfers (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  from_org_id       BIGINT UNSIGNED NOT NULL,
  from_org_type     ENUM('DISTRIBUTOR','PHARMACY') NOT NULL DEFAULT 'DISTRIBUTOR',
  to_org_id         BIGINT UNSIGNED NOT NULL,
  to_org_type       ENUM('DISTRIBUTOR','PHARMACY') NOT NULL DEFAULT 'PHARMACY',
  status            ENUM('PENDING','IN_TRANSIT','DELIVERED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  notes_encrypted   TEXT NULL,                               -- AES-256-GCM (see utils/fieldCrypto.js)
  expected_delivery DATE NULL,
  created_by        BIGINT UNSIGNED NOT NULL,
  dispatched_by     BIGINT UNSIGNED NULL,
  received_by       BIGINT UNSIGNED NULL,
  cancelled_by      BIGINT UNSIGNED NULL,
  cancel_reason     VARCHAR(300) NULL,
  created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  dispatched_at     DATETIME(3) NULL,
  delivered_at      DATETIME(3) NULL,
  cancelled_at      DATETIME(3) NULL,
  updated_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_transfers_from (from_org_id, status, created_at),
  KEY idx_transfers_to (to_org_id, status, created_at),
  KEY idx_transfers_status (status),
  -- composite FKs force sender = DISTRIBUTOR organization and receiver = PHARMACY organization
  CONSTRAINT fk_transfers_from FOREIGN KEY (from_org_id, from_org_type) REFERENCES organizations (id, type),
  CONSTRAINT fk_transfers_to FOREIGN KEY (to_org_id, to_org_type) REFERENCES organizations (id, type),
  CONSTRAINT fk_transfers_created_by FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT fk_transfers_dispatched_by FOREIGN KEY (dispatched_by) REFERENCES users (id),
  CONSTRAINT fk_transfers_received_by FOREIGN KEY (received_by) REFERENCES users (id),
  CONSTRAINT fk_transfers_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users (id),
  CONSTRAINT chk_transfers_types CHECK (from_org_type = 'DISTRIBUTOR' AND to_org_type = 'PHARMACY'),
  CONSTRAINT chk_transfers_state CHECK (
    (status = 'PENDING'    AND dispatched_at IS NULL AND delivered_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'IN_TRANSIT' AND dispatched_at IS NOT NULL AND delivered_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'DELIVERED'  AND dispatched_at IS NOT NULL AND delivered_at IS NOT NULL AND cancelled_at IS NULL)
    OR (status = 'CANCELLED'  AND dispatched_at IS NULL AND delivered_at IS NULL AND cancelled_at IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transfer_items (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  transfer_id       BIGINT UNSIGNED NOT NULL,
  batch_id          BIGINT UNSIGNED NOT NULL,                -- keeps batch number, expiry and manufacturer traceable
  quantity          INT UNSIGNED NOT NULL,
  received_quantity INT UNSIGNED NULL,                       -- set once, at receipt (= quantity; partial receipt not supported)
  PRIMARY KEY (id),
  UNIQUE KEY uq_transfer_items_batch (transfer_id, batch_id),
  KEY idx_transfer_items_batch (batch_id),
  CONSTRAINT fk_transfer_items_transfer FOREIGN KEY (transfer_id) REFERENCES transfers (id),
  CONSTRAINT fk_transfer_items_batch FOREIGN KEY (batch_id) REFERENCES batches (id),
  CONSTRAINT chk_transfer_items_qty CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id  BIGINT UNSIGNED NULL,
  actor_role     ENUM('ADMIN','DISTRIBUTOR','PHARMACY') NULL,
  organization_id BIGINT UNSIGNED NULL,                      -- the actor's organization (NULL for platform admins)
  action         VARCHAR(50) NOT NULL,
  entity_type    VARCHAR(30) NOT NULL,
  entity_id      BIGINT UNSIGNED NULL,
  details        JSON NULL,                                  -- never contains passwords, tokens, keys or plaintext notes
  ip_address     VARCHAR(45) NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_audit_org_time (organization_id, created_at),
  KEY idx_audit_actor (actor_user_id),
  KEY idx_audit_entity (entity_type, entity_id),
  KEY idx_audit_action (action),
  KEY idx_audit_time (created_at),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_audit_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
