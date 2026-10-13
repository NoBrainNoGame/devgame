-- Multiplayer: the persistent world, its companies, their humans and their logs.
CREATE TYPE "CompanyStatus" AS ENUM ('open', 'closed');

CREATE TABLE "World" (
    "id" TEXT NOT NULL,
    "seed" VARCHAR(64) NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 0,
    "rng" INTEGER NOT NULL DEFAULT 0,
    "lastEventRound" INTEGER NOT NULL DEFAULT -20,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "World_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "name" VARCHAR(24) NOT NULL,
    "seed" VARCHAR(64) NOT NULL,
    "status" "CompanyStatus" NOT NULL DEFAULT 'open',
    "closeReason" VARCHAR(16),
    "rulesEpoch" INTEGER NOT NULL,
    "crewEpoch" INTEGER NOT NULL,
    "start" JSONB NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "snapshot" JSONB,
    "snapshotSeq" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyMember" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "seat" INTEGER NOT NULL,
    "name" VARCHAR(24) NOT NULL,
    "site" VARCHAR(40) NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "finalScore" INTEGER NOT NULL DEFAULT 0,
    "missesInRow" INTEGER NOT NULL DEFAULT 0,
    "autopilot" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CompanyMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyEntry" (
    "companyId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "worldRound" INTEGER,
    "entry" JSONB NOT NULL,
    "hash" VARCHAR(16) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyEntry_pkey" PRIMARY KEY ("companyId","seq")
);

CREATE INDEX "Company_worldId_status_score_idx" ON "Company"("worldId", "status", "score" DESC);
CREATE INDEX "CompanyMember_profileId_leftAt_idx" ON "CompanyMember"("profileId", "leftAt");

ALTER TABLE "Company" ADD CONSTRAINT "Company_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyMember" ADD CONSTRAINT "CompanyMember_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyMember" ADD CONSTRAINT "CompanyMember_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyEntry" ADD CONSTRAINT "CompanyEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written, because Prisma cannot express a partial unique index, will not
-- reproduce it in a diff and will not warn when it is missing.
--
-- One live occupant per seat of a company. A seat is never reused, so this is
-- a safety net against two writers, not a rule players can reach.
CREATE UNIQUE INDEX "CompanyMember_one_live_occupant_per_seat"
    ON "CompanyMember"("companyId", "seat")
    WHERE "leftAt" IS NULL;

-- One live seat per profile: a player is in one company at a time.
CREATE UNIQUE INDEX "CompanyMember_one_live_seat_per_profile"
    ON "CompanyMember"("profileId")
    WHERE "leftAt" IS NULL;
