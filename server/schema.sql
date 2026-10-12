-- Medivra - Phase 1 schema (organizations + users)
-- Safe to re-run: only CREATE TABLE IF NOT EXISTS. It never drops, truncates or alters data.
-- Run against the existing `medivra` database (see README). If a table already exists
-- with a different structure, IF NOT EXISTS skips it - see the "Existing tables" note in README.

CREATE TABLE IF NOT EXISTS organizations (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(150) NOT NULL,
  type        ENUM('DISTRIBUTOR','PHARMACY') NOT NULL,
  status      ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_organizations_type_name (type, name),   -- case-insensitive via collation
  UNIQUE KEY uq_organizations_id_type (id, type),       -- target for users' composite FK
  KEY idx_organizations_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id     BIGINT UNSIGNED NULL,
  org_type            ENUM('DISTRIBUTOR','PHARMACY') NULL,   -- copy of organizations.type, enforced by FK
  name                VARCHAR(100) NOT NULL,
  email               VARCHAR(254) NOT NULL,                 -- stored lowercase/trimmed by the app
  phone               VARCHAR(20) NULL,
  role                ENUM('ADMIN','DISTRIBUTOR','PHARMACY') NOT NULL,
  password_hash       CHAR(128) NOT NULL,                    -- SHA-512, lowercase hex
  password_salt       CHAR(64)  NOT NULL,                    -- 32 random bytes, lowercase hex, unique per user
  status              ENUM('ACTIVE','INACTIVE','SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
  failed_login_count  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until        DATETIME(3) NULL,
  last_login_at       DATETIME(3) NULL,
  created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_password_salt (password_salt),
  KEY idx_users_organization (organization_id),
  KEY idx_users_role_status (role, status),
  CONSTRAINT fk_users_organization FOREIGN KEY (organization_id, org_type)
    REFERENCES organizations (id, type),
  -- ADMIN: no organization. DISTRIBUTOR/PHARMACY: must belong to an organization of the same type.
  CONSTRAINT chk_users_role_org CHECK (
    (role = 'ADMIN' AND organization_id IS NULL AND org_type IS NULL)
    OR (role <> 'ADMIN' AND organization_id IS NOT NULL AND org_type IS NOT NULL AND CAST(role AS CHAR) = CAST(org_type AS CHAR))
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
