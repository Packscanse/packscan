-- Enable Row Level Security on every table, with no policies (deny-all).
--
-- Why: on hosted Postgres providers that auto-expose the public schema over
-- a REST API (e.g. Supabase PostgREST), tables without RLS are readable and
-- writable by anyone holding the project's anon key. This app never uses
-- that API — all access goes through Prisma as the table owner, and table
-- owners bypass RLS — so deny-all costs nothing and closes that door.

ALTER TABLE "Store" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Package" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScanEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;

-- Prisma's bookkeeping table doesn't exist during shadow-database replay,
-- so guard it (it holds no app data, but no reason to leave it exposed).
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = '_prisma_migrations') THEN
    EXECUTE 'ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;
