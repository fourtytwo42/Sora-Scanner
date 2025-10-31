-- Create read-only user for website access
-- This user can only SELECT data, cannot modify or delete anything

-- Create the user (will fail gracefully if user already exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'sora_readonly') THEN
    CREATE USER sora_readonly WITH PASSWORD 'CHANGE_THIS_PASSWORD';
    RAISE NOTICE 'User sora_readonly created';
  ELSE
    RAISE NOTICE 'User sora_readonly already exists';
  END IF;
END
$$;

-- Grant connect privilege on the database
GRANT CONNECT ON DATABASE sora_feed TO sora_readonly;

-- Grant usage on the public schema
GRANT USAGE ON SCHEMA public TO sora_readonly;

-- Grant SELECT on all existing tables
GRANT SELECT ON ALL TABLES IN SCHEMA public TO sora_readonly;

-- Grant SELECT on all sequences (for compatibility)
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO sora_readonly;

-- Set default privileges so future tables automatically get SELECT access
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT SELECT ON TABLES TO sora_readonly;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT SELECT ON SEQUENCES TO sora_readonly;

-- Allow the user to see table structures (needed for some queries)
GRANT USAGE ON SCHEMA information_schema TO sora_readonly;
GRANT USAGE ON SCHEMA pg_catalog TO sora_readonly;

-- Revoke any write privileges (just to be safe)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM sora_readonly;
REVOKE CREATE ON SCHEMA public FROM sora_readonly;

