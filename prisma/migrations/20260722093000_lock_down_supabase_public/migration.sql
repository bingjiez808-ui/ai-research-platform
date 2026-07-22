-- The application accesses PostgreSQL only from its trusted server connection.
-- Supabase's public PostgREST roles must never read or mutate these tables.
DO $$
DECLARE
  item record;
  role_name text;
BEGIN
  FOR item IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', item.schema_name, item.table_name);
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I', item.schema_name, item.table_name, role_name);
      END IF;
    END LOOP;
  END LOOP;

  FOR item IN
    SELECT sequence_schema AS schema_name, sequence_name
    FROM information_schema.sequences
    WHERE sequence_schema = 'public'
  LOOP
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %I.%I FROM %I', item.schema_name, item.sequence_name, role_name);
      END IF;
    END LOOP;
  END LOOP;

  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE USAGE ON SCHEMA public FROM %I', role_name);
    END IF;
  END LOOP;
END $$;

-- No permissive policies are created: PostgREST receives zero rows and cannot write.
-- The table owner used by Prisma continues to work because RLS is not forced on owners.
