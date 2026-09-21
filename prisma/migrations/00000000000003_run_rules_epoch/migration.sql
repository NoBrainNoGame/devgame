-- Which rules a run was played under.
--
-- A score from before a rules change describes a different game, so the boards
-- filter on this rather than ranking two incomparable runs against each other.
-- Existing rows get epoch 0: they were played before the column existed, which
-- is exactly the situation it is there to record.
ALTER TABLE "Run" ADD COLUMN "rulesEpoch" INTEGER NOT NULL DEFAULT 0;

DROP INDEX IF EXISTS "Run_mode_status_score_finishedAt_idx";
DROP INDEX IF EXISTS "Run_dailyDate_status_score_idx";

CREATE INDEX "Run_rulesEpoch_mode_status_score_finishedAt_idx"
  ON "Run" ("rulesEpoch", "mode", "status", "score" DESC, "finishedAt");
CREATE INDEX "Run_rulesEpoch_dailyDate_status_score_idx"
  ON "Run" ("rulesEpoch", "dailyDate", "status", "score" DESC);
