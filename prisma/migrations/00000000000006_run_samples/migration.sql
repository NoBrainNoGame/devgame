-- Anonymous runs, kept for balancing: the save, and the summary the server
-- replayed it into.
CREATE TYPE "SampleKind" AS ENUM ('final', 'checkpoint', 'abandoned');

CREATE TABLE "RunSample" (
    "id" TEXT NOT NULL,
    "clientRunId" VARCHAR(36) NOT NULL,
    "kind" "SampleKind" NOT NULL,
    "sprint" INTEGER NOT NULL,
    "rules" VARCHAR(16) NOT NULL,
    "locale" VARCHAR(8) NOT NULL,
    "save" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "sessionMs" INTEGER NOT NULL DEFAULT 0,
    "idle" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunSample_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RunSample_clientRunId_kind_sprint_key" ON "RunSample"("clientRunId", "kind", "sprint");
CREATE INDEX "RunSample_rules_kind_createdAt_idx" ON "RunSample"("rules", "kind", "createdAt" DESC);
