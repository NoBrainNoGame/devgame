/**
 * What a sprint asks of you, beyond the box of turns. One is drawn at every
 * sprint's start; the release settles it before the bugs ship. A reward
 * for making it — money of the tier, a skill point, one more relic on
 * offer — and, for the one about rest, a cost for not.
 */

export const OBJECTIVE_IDS = [
  "deliver_n",
  "zero_incident",
  "review_all",
  "debt_under",
  "deliver_vip",
  "no_rest",
  "by_hand",
  "deliver_bug",
] as const;

export type ObjectiveId = (typeof OBJECTIVE_IDS)[number];

export type ObjectiveReward = "money" | "point" | "relics";

export interface ObjectiveDef {
  id: ObjectiveId;
  weight: number;
  minTier: number;
  /** A ticket of this kind must be waiting when the objective is drawn. */
  requires?: "vip" | "client_bug";
  reward: ObjectiveReward;
  /** Production's patience lost when it is not met. */
  failPatience?: number;
}

export const OBJECTIVES: Record<ObjectiveId, ObjectiveDef> = {
  /** Land this many tickets yourself; the target follows the board. */
  deliver_n: { id: "deliver_n", weight: 4, minTier: 0, reward: "money" },
  zero_incident: { id: "zero_incident", weight: 3, minTier: 0, reward: "point" },
  /** Nothing the machine wrote ships unread. */
  review_all: { id: "review_all", weight: 2, minTier: 0, reward: "point" },
  /** The debt under thirty when the sprint closes. */
  debt_under: { id: "debt_under", weight: 2, minTier: 1, reward: "relics" },
  deliver_vip: { id: "deliver_vip", weight: 3, minTier: 0, requires: "vip", reward: "relics" },
  /** Not one turn resting: the one objective that costs when missed. */
  no_rest: { id: "no_rest", weight: 2, minTier: 1, reward: "relics", failPatience: 10 },
  /** Not one commit by the machine. */
  by_hand: { id: "by_hand", weight: 2, minTier: 0, reward: "point" },
  deliver_bug: {
    id: "deliver_bug",
    weight: 3,
    minTier: 0,
    requires: "client_bug",
    reward: "money",
  },
};

export function isObjectiveId(value: string): value is ObjectiveId {
  return Object.hasOwn(OBJECTIVES, value);
}
