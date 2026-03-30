-- Add rxcui to medications for drug database linkage
ALTER TABLE medications ADD COLUMN IF NOT EXISTS rxcui text;

-- Add NPI and address to providers for registry linkage
ALTER TABLE providers ADD COLUMN IF NOT EXISTS npi text;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS address text;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_medications_rxcui ON medications(rxcui) WHERE rxcui IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_providers_npi ON providers(npi) WHERE npi IS NOT NULL;
