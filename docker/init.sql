-- Performance extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- trigram for LIKE searches

-- Trigram index for fast product name search (LIKE '%...%')
-- Created after Sequelize sync
-- CREATE INDEX CONCURRENTLY idx_products_name_trgm ON products USING GIN (name gin_trgm_ops);
-- CREATE INDEX CONCURRENTLY idx_products_sku_trgm  ON products USING GIN (sku gin_trgm_ops);
