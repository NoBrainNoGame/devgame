import "@/lib/server-only";

export interface RankableCompany {
  id: string;
  name: string;
  score: number;
  members: number;
}

export interface RankablePlayer {
  profileId: string;
  name: string;
  company: string;
  score: number;
}

export interface Ranking {
  companies: RankableCompany[];
  players: RankablePlayer[];
  mine: {
    companyId: string | null;
    companyRank: number;
    companyTotal: number;
    playerRank: number;
    playerTotal: number;
  };
}

const TOP = 10;

/** Best first; ties go to the smaller key, so two sockets never see two orders. */
function byScore<T>(score: (value: T) => number, key: (value: T) => string) {
  return (a: T, b: T): number => {
    const diff = score(b) - score(a);
    if (diff !== 0) return diff;
    const ka = key(a);
    const kb = key(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  };
}

/**
 * The ranking as one socket sees it: the top ten of companies and of
 * players, and where the viewer's own company and the viewer stand, whether
 * or not they are in the top. Ranks start at 1; 0 means "not ranked".
 */
export function rankingFor(
  companies: readonly RankableCompany[],
  players: readonly RankablePlayer[],
  viewer: { profileId: string; companyId: string | null },
): Ranking {
  const sortedCompanies = [...companies].sort(
    byScore(
      (company) => company.score,
      (company) => company.id,
    ),
  );
  const sortedPlayers = [...players].sort(
    byScore(
      (player) => player.score,
      (player) => player.profileId,
    ),
  );

  const companyIndex = sortedCompanies.findIndex((company) => company.id === viewer.companyId);
  const playerIndex = sortedPlayers.findIndex((player) => player.profileId === viewer.profileId);

  return {
    companies: sortedCompanies.slice(0, TOP),
    players: sortedPlayers.slice(0, TOP),
    mine: {
      companyId: viewer.companyId,
      companyRank: companyIndex + 1,
      companyTotal: sortedCompanies.length,
      playerRank: playerIndex + 1,
      playerTotal: sortedPlayers.length,
    },
  };
}
