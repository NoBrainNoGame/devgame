import "@/lib/server-only";

import { prisma } from "@/lib/db";

/**
 * The multiplayer board, read from the tables the realtime server writes.
 * The server persists scores each tick, so this is as live as a page
 * reload; it never computes a score itself, and nothing the client sent is
 * in these columns.
 */

export interface BoardCompany {
  id: string;
  name: string;
  score: number;
  members: number;
}

export interface BoardPlayer {
  profileId: string;
  name: string;
  company: string;
  score: number;
  present: boolean;
}

export interface MultiBoard {
  companies: BoardCompany[];
  players: BoardPlayer[];
}

const LIMIT = 50;

export async function getMultiBoard(): Promise<MultiBoard> {
  const companies = await prisma.company.findMany({
    where: { status: "open" },
    orderBy: [{ score: "desc" }, { id: "asc" }],
    take: LIMIT,
    select: {
      id: true,
      name: true,
      score: true,
      _count: { select: { members: { where: { leftAt: null } } } },
    },
  });

  const players = await prisma.companyMember.findMany({
    where: { company: { status: "open" } },
    orderBy: [{ finalScore: "desc" }, { profileId: "asc" }],
    take: LIMIT,
    select: {
      profileId: true,
      name: true,
      finalScore: true,
      leftAt: true,
      company: { select: { name: true } },
    },
  });

  return {
    companies: companies.map((company) => ({
      id: company.id,
      name: company.name,
      score: company.score,
      members: company._count.members,
    })),
    players: players.map((player) => ({
      profileId: player.profileId,
      name: player.name,
      company: player.company.name,
      score: player.finalScore,
      present: player.leftAt === null,
    })),
  };
}
