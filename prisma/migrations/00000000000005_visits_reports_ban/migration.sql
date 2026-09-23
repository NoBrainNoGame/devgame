-- Three things at once, because they arrived together: a page-view counter
-- with nobody in it, bug reports from signed-in players, and the ban an
-- administrator can put on a profile.

ALTER TABLE "Profile" ADD COLUMN "bannedAt" TIMESTAMP(3);
ALTER TABLE "Profile" ADD COLUMN "banReason" VARCHAR(200);

CREATE TABLE "VisitDay" (
    "day" DATE NOT NULL,
    "path" VARCHAR(64) NOT NULL,
    "locale" VARCHAR(8) NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "visits" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VisitDay_pkey" PRIMARY KEY ("day","path","locale")
);

CREATE TYPE "ReportStatus" AS ENUM ('open', 'acknowledged', 'closed');

CREATE TABLE "BugReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(4000) NOT NULL,
    "page" VARCHAR(64),
    "seed" VARCHAR(64),
    "status" "ReportStatus" NOT NULL DEFAULT 'open',
    "note" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BugReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BugReport_userId_createdAt_idx" ON "BugReport"("userId", "createdAt" DESC);
CREATE INDEX "BugReport_status_createdAt_idx" ON "BugReport"("status", "createdAt" DESC);

ALTER TABLE "BugReport" ADD CONSTRAINT "BugReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
