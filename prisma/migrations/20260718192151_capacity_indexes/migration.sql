-- Capacity indexes for fleet-scale reads (100 stores, ~400-800k Package rows/day).
--
-- NOTE: plain CREATE INDEX locks the table for the build. Safe here because it
-- runs before production data exists. Against an already-populated table, run
-- these as CREATE INDEX CONCURRENTLY (outside a transaction) instead.

-- Package list: filter by store (+ optional status), newest first, paginated.
-- The composite serves (storeId) and (storeId, status) equality via its
-- leftmost prefix, so it supersedes the old [storeId, status] index.
DROP INDEX "Package_storeId_status_idx";
CREATE INDEX "Package_storeId_status_updatedAt_idx" ON "Package"("storeId", "status", "updatedAt" DESC);
CREATE INDEX "Package_storeId_updatedAt_idx" ON "Package"("storeId", "updatedAt" DESC);

-- Date-range report aggregates (received today / last 30 days), chain-wide and
-- per store — without these each dashboard load seq-scans the whole history.
CREATE INDEX "Package_createdAt_idx" ON "Package"("createdAt");
CREATE INDEX "Package_storeId_createdAt_idx" ON "Package"("storeId", "createdAt");
