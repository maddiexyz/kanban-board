CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -------------------------------------------------------------
-- CORE USERS TABLE (Auth + Dedicated DB Target)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- Dedicated Database Routing
    database_name VARCHAR(63) UNIQUE,
    db_host VARCHAR(255) NOT NULL DEFAULT 'localhost',
    db_port INT NOT NULL DEFAULT 5432,
    db_status VARCHAR(30) NOT NULL DEFAULT 'pending',

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- PostgreSQL DB name validation (starts with letter/underscore, alphanumeric)
    CONSTRAINT chk_valid_db_name 
        CHECK (database_name IS NULL OR database_name ~ '^[a-zA-Z_][a-zA-Z0-9_]*$'),
        
    -- Allowed provisioning states
    CONSTRAINT chk_db_status 
        CHECK (db_status IN ('pending', 'provisioning', 'ready', 'suspended', 'deprovisioned'))
);

-- Index for async provisioning workers finding unready DBs
CREATE INDEX IF NOT EXISTS idx_users_db_status 
    ON users (db_status) 
    WHERE db_status != 'ready';

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();