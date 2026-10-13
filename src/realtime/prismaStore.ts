import "@/lib/server-only";

import { hashState } from "@/game/core/run";
import type { RunState } from "@/game/core/types";
import { CompanyEntrySchema } from "@/game/dto/company";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type {
  CompanyStart,
  CompanyWrite,
  Store,
  StoredCompany,
  StoredEntry,
  StoredMember,
  StoredWorld,
  TickBatch,
} from "@/realtime/store";

const WORLD_ID = "main";

/** What a snapshot looks like in the JSON column: the state and the hash it had. */
interface SnapshotJson {
  state: unknown;
  hash: string;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/** The realtime server is the only writer, and it writes one transaction per tick. */
export class PrismaStore implements Store {
  async load(): Promise<{ world: StoredWorld; companies: StoredCompany[] } | null> {
    const world = await prisma.world.findUnique({ where: { id: WORLD_ID } });
    if (world === null) return null;

    const rows = await prisma.company.findMany({
      where: { worldId: WORLD_ID, status: "open" },
      include: { members: true },
      orderBy: { createdAt: "asc" },
    });

    const companies: StoredCompany[] = [];
    for (const row of rows) {
      const snapshot = readSnapshot(row.snapshot, row.snapshotSeq);
      if (snapshot === "corrupt") {
        console.error(`realtime: company ${row.id} has a snapshot that does not match its hash`);
        continue;
      }
      const entryRows = await prisma.companyEntry.findMany({
        where: { companyId: row.id, seq: { gt: snapshot?.seq ?? 0 } },
        orderBy: { seq: "asc" },
      });
      const entries: StoredEntry[] = [];
      let intact = true;
      for (const entry of entryRows) {
        const parsed = CompanyEntrySchema.safeParse(entry.entry);
        if (!parsed.success) {
          intact = false;
          break;
        }
        entries.push({
          seq: entry.seq,
          ...(entry.worldRound === null ? {} : { worldRound: entry.worldRound }),
          entry: parsed.data,
          hash: entry.hash,
        });
      }
      if (!intact) {
        console.error(`realtime: company ${row.id} has an entry the schema refuses`);
        continue;
      }
      companies.push({
        id: row.id,
        name: row.name,
        start: row.start as unknown as CompanyStart,
        rulesEpoch: row.rulesEpoch,
        crewEpoch: row.crewEpoch,
        status: "open",
        score: row.score,
        seq: row.seq,
        snapshot,
        entries,
        members: row.members.map(
          (member): StoredMember => ({
            profileId: member.profileId,
            seat: member.seat,
            name: member.name,
            site: member.site,
            left: member.leftAt !== null,
            finalScore: member.finalScore,
            missesInRow: member.missesInRow,
            autopilot: member.autopilot,
          }),
        ),
      });
    }

    return {
      world: {
        id: world.id,
        seed: world.seed,
        round: world.round,
        rng: world.rng,
        lastEventRound: world.lastEventRound,
      },
      companies,
    };
  }

  async create(world: Omit<StoredWorld, "round" | "rng" | "lastEventRound">): Promise<StoredWorld> {
    const row = await prisma.world.upsert({
      where: { id: WORLD_ID },
      create: { id: WORLD_ID, seed: world.seed },
      update: {},
    });
    return {
      id: row.id,
      seed: row.seed,
      round: row.round,
      rng: row.rng,
      lastEventRound: row.lastEventRound,
    };
  }

  async commit(batch: TickBatch): Promise<void> {
    await prisma.$transaction(async (tx) => {
      if (batch.world !== undefined) {
        await tx.world.update({ where: { id: WORLD_ID }, data: batch.world });
      }
      for (const write of batch.companies) await this.write(tx, write);
    });
  }

  private async write(tx: Prisma.TransactionClient, write: CompanyWrite): Promise<void> {
    if (write.created !== undefined) {
      await tx.company.create({
        data: {
          id: write.id,
          worldId: WORLD_ID,
          name: write.created.name,
          seed: write.created.start.seed,
          rulesEpoch: write.created.rulesEpoch,
          crewEpoch: write.created.crewEpoch,
          start: toJson(write.created.start),
        },
      });
    }

    if (write.entries.length > 0) {
      await tx.companyEntry.createMany({
        data: write.entries.map((row) => ({
          companyId: write.id,
          seq: row.seq,
          worldRound: row.worldRound ?? null,
          entry: toJson(row.entry),
          hash: row.hash,
        })),
        skipDuplicates: true,
      });
    }

    const snapshot = write.snapshot;
    await tx.company.update({
      where: { id: write.id },
      data: {
        score: write.score,
        seq: write.seq,
        status: write.status,
        ...(write.closeReason === undefined
          ? {}
          : { closeReason: write.closeReason, closedAt: new Date() }),
        ...(snapshot === undefined
          ? {}
          : {
              snapshot: toJson({
                state: snapshot.state,
                hash: hashState(snapshot.state),
              }),
              snapshotSeq: snapshot.seq,
            }),
      },
    });
    // Everything the snapshot stands after is folded into it.
    if (snapshot !== undefined) {
      await tx.companyEntry.deleteMany({
        where: { companyId: write.id, seq: { lte: snapshot.seq } },
      });
    }

    for (const member of write.members) {
      const data = {
        name: member.name,
        site: member.site,
        finalScore: member.finalScore,
        missesInRow: member.missesInRow,
        autopilot: member.autopilot,
      };
      const updated = await tx.companyMember.updateMany({
        where: { companyId: write.id, seat: member.seat },
        data,
      });
      if (updated.count === 0) {
        await tx.companyMember.create({
          data: {
            companyId: write.id,
            profileId: member.profileId,
            seat: member.seat,
            ...data,
            leftAt: member.left ? new Date() : null,
          },
        });
      } else if (member.left) {
        // Only the first time: when they left is not rewritten by every later tick.
        await tx.companyMember.updateMany({
          where: { companyId: write.id, seat: member.seat, leftAt: null },
          data: { leftAt: new Date() },
        });
      }
    }
  }
}

function readSnapshot(
  json: unknown,
  seq: number | null,
): { seq: number; state: RunState } | null | "corrupt" {
  if (json === null || json === undefined || seq === null) return null;
  const candidate = json as Partial<SnapshotJson>;
  if (candidate.state === undefined || typeof candidate.hash !== "string") return "corrupt";
  const state = candidate.state as unknown as RunState;
  return hashState(state) === candidate.hash ? { seq, state } : "corrupt";
}
