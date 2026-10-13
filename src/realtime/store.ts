import "@/lib/server-only";

import type { RunState } from "@/game/core/types";
import type { CompanyEntry, CompanyStart } from "@/game/dto/company";

/**
 * What the realtime server keeps, in terms of the world and not of any
 * database. `MemoryStore` serves the tests; `PrismaStore` serves production.
 * The server is the only writer, and it writes in batches: one transaction
 * per tick, so a company never has a round on disk without its hash.
 */

export type { CompanyStart };

export interface StoredEntry {
  seq: number;
  worldRound?: number;
  entry: CompanyEntry;
  hash: string;
}

export interface StoredMember {
  profileId: string;
  seat: number;
  name: string;
  site: string;
  left: boolean;
  finalScore: number;
  missesInRow: number;
  autopilot: boolean;
}

export interface StoredCompany {
  id: string;
  name: string;
  start: CompanyStart;
  rulesEpoch: number;
  crewEpoch: number;
  status: "open" | "closed";
  closeReason?: string;
  score: number;
  seq: number;
  snapshot: { seq: number; state: RunState } | null;
  /** Entries after the snapshot, or all of them without one. */
  entries: StoredEntry[];
  members: StoredMember[];
}

export interface StoredWorld {
  id: string;
  seed: string;
  round: number;
  rng: number;
  lastEventRound: number;
}

export interface CompanyWrite {
  id: string;
  /** Present the first time a company is written. */
  created?: { name: string; start: CompanyStart; rulesEpoch: number; crewEpoch: number };
  entries: StoredEntry[];
  score: number;
  seq: number;
  status: "open" | "closed";
  closeReason?: string;
  snapshot?: { seq: number; state: RunState };
  /** Every member as they stand now; the store upserts by seat. */
  members: StoredMember[];
}

export interface TickBatch {
  world?: Pick<StoredWorld, "round" | "rng" | "lastEventRound">;
  companies: CompanyWrite[];
}

export interface Store {
  /** The world and its open companies, or null for a first boot. */
  load(): Promise<{ world: StoredWorld; companies: StoredCompany[] } | null>;
  create(world: Omit<StoredWorld, "round" | "rng" | "lastEventRound">): Promise<StoredWorld>;
  /** Atomic: all of it or none of it. */
  commit(batch: TickBatch): Promise<void>;
}

/** Everything in memory: for the tests, and for the server without a database. */
export class MemoryStore implements Store {
  world: StoredWorld | null = null;
  readonly companies = new Map<string, StoredCompany>();
  /** Set to make the next commits fail, to test the backlog. */
  failing = 0;
  commits = 0;

  async load(): Promise<{ world: StoredWorld; companies: StoredCompany[] } | null> {
    if (this.world === null) return null;
    return {
      world: structuredClone(this.world),
      companies: [...this.companies.values()]
        .filter((company) => company.status === "open")
        .map((company) => structuredClone(company)),
    };
  }

  async create(world: Omit<StoredWorld, "round" | "rng" | "lastEventRound">): Promise<StoredWorld> {
    this.world = { ...world, round: 0, rng: 0, lastEventRound: 0 };
    return structuredClone(this.world);
  }

  async commit(batch: TickBatch): Promise<void> {
    if (this.failing > 0) {
      this.failing -= 1;
      throw new Error("the store is down");
    }
    this.commits += 1;
    if (batch.world !== undefined && this.world !== null) Object.assign(this.world, batch.world);
    for (const write of batch.companies) {
      let company = this.companies.get(write.id);
      if (company === undefined) {
        if (write.created === undefined) throw new Error(`unknown company ${write.id}`);
        company = {
          id: write.id,
          name: write.created.name,
          start: write.created.start,
          rulesEpoch: write.created.rulesEpoch,
          crewEpoch: write.created.crewEpoch,
          status: "open",
          score: 0,
          seq: 0,
          snapshot: null,
          entries: [],
          members: [],
        };
        this.companies.set(write.id, company);
      }
      company.entries.push(...structuredClone(write.entries));
      company.score = write.score;
      company.seq = write.seq;
      company.status = write.status;
      if (write.closeReason !== undefined) company.closeReason = write.closeReason;
      const snapshot = write.snapshot;
      if (snapshot !== undefined) {
        company.snapshot = structuredClone(snapshot);
        company.entries = company.entries.filter((entry) => entry.seq > snapshot.seq);
      }
      company.members = structuredClone(write.members);
    }
  }
}
