-- The rivals are gone; what a run delivers is tickets.
--
-- Written by hand: `prisma migrate dev` reads a rename as a drop and an add,
-- which would zero every profile's count. Nothing is lost here — the column
-- keeps its rows, it only changes what it is called.
ALTER TABLE "Profile" RENAME COLUMN "botsFired" TO "ticketsDelivered";
ALTER TABLE "Run" RENAME COLUMN "botsFired" TO "ticketsDelivered";
