-- A player may have at most one run in progress per mode. Prisma cannot express
-- a partial unique index, so this one is hand-written and hand-maintained:
-- `prisma migrate dev` will neither drop it nor know about it, and `prisma
-- migrate diff` will not reproduce it. See docs/database.md.
CREATE UNIQUE INDEX "Run_one_in_progress"
  ON "Run" ("profileId", "mode")
  WHERE "status" = 'in_progress';
