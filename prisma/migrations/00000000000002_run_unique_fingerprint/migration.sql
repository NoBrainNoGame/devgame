-- A fingerprint of seed + actions, so the same run cannot be submitted over and
-- over for credit under a fresh client-chosen idempotency key.
--
-- Backfilled with the empty string: the rows that exist predate the column and
-- are development data. The default is dropped immediately so nothing new can
-- be written without one.
ALTER TABLE "Run" ADD COLUMN "fingerprint" VARCHAR(32) NOT NULL DEFAULT '';
ALTER TABLE "Run" ALTER COLUMN "fingerprint" DROP DEFAULT;

CREATE INDEX "Run_profileId_fingerprint_idx" ON "Run" ("profileId", "fingerprint");

-- One finished submission per player per run. Hand-written, like
-- `Run_one_in_progress`: Prisma cannot express a partial index, will not
-- reproduce it in a diff, and will not warn you if it goes missing.
-- An abandoned run and the finished submission of the same game legitimately
-- share a fingerprint, which is why this covers only finished rows.
CREATE UNIQUE INDEX "Run_one_finished_per_fingerprint"
  ON "Run" ("profileId", "fingerprint")
  WHERE "status" = 'finished';
