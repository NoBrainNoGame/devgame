import { LINKS } from "@/lib/links";

/**
 * Who made the game. Names are names: they are written here once and never
 * translated; the roles are message keys (`settings.credits.roles.*`).
 * `upcoming` marks work credited before it ships — the music and the sounds
 * are the author's, and are not in the game yet.
 */

export type CreditRole = "making" | "soundtrack" | "assistant" | "studio";

export interface Credit {
  role: CreditRole;
  name: string;
  href?: string;
  upcoming?: boolean;
}

const AUTHOR = "Camille ABELLA aka Ghom";

export const CREDITS: readonly Credit[] = [
  { role: "making", name: AUTHOR },
  { role: "soundtrack", name: AUTHOR, upcoming: true },
  { role: "assistant", name: "Claude Code (Anthropic)", href: "https://claude.com/claude-code" },
  { role: "studio", name: "NoBrainNoGame", href: LINKS.repository },
];

/** What the game is built on, credited by name. */
export const BUILT_WITH = ["Next.js", "PixiJS", "Booyah", "Zustand", "Prisma"] as const;
