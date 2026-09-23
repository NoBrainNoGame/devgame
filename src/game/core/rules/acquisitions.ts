import { ACQUISITIONS, type AcquisitionId, featureNameKey } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { fnv1a } from "@/game/core/hash";
import { headOf } from "@/game/core/map/graph";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { addDebt } from "@/game/core/rules/debt";
import { recordIncident } from "@/game/core/rules/events";
import { buyStrongestCompetitor } from "@/game/core/rules/market";
import { changeMoney } from "@/game/core/rules/money";
import { addDev } from "@/game/core/rules/team";
import { tierScale } from "@/game/core/rules/tier";
import type { RunState, Ticket, TicketId } from "@/game/core/types";

/**
 * Buying a company. The money goes, the team walks in through the same
 * door as any hire, and the features arrive already merged: no commit, no
 * node on the graph, a revenue and a load like any shipped feature, and
 * nothing towards the score — bought is not delivered. The debt comes with
 * the code, and the large ones break something on the way in.
 *
 * Nothing is drawn but what the debt gauge draws for its own display: a
 * feature bought has the plain revenue of its points, no jitter, so the
 * purchase moves no other seed's stream.
 */

export function canAcquire(state: RunState, id: AcquisitionId): boolean {
  const def = ACQUISITIONS[id];
  return def.tier <= state.tier && !state.acquisitions.includes(id) && def.cost <= state.money;
}

export function acquire(context: RuleContext, id: AcquisitionId): void {
  const { state } = context;
  const def = ACQUISITIONS[id];
  if (def.tier > state.tier) throw new Error(`${id} is for sale from tier ${def.tier}`);
  if (state.acquisitions.includes(id)) throw new Error(`${id} was already bought`);
  if (def.cost > state.money) throw new Error(`${id} costs ${def.cost}, you have ${state.money}`);

  changeMoney(context, -def.cost, "acquisition");
  state.acquisitions.push(id);

  const devIds = [];
  for (let i = 0; i < def.devs.count; i += 1) {
    devIds.push(addDev(context, def.devs.rank, { acquisition: id }).id);
  }

  const ticketIds: TicketId[] = [];
  const { economy } = BALANCE;
  for (let i = 0; i < def.features.count; i += 1) {
    const ticketId: TicketId = `t${state.nextTicketSerial}`;
    state.nextTicketSerial += 1;
    const ticket: Ticket = {
      id: ticketId,
      kind: "feature",
      status: "merged",
      origin: "acquired",
      points: def.features.points,
      filled: def.features.points,
      rework: 0,
      debtAdded: 0,
      rejections: 0,
      tier: state.tier,
      mrr:
        def.features.points * economy.mrrPerPoint * tierScale(state.tier, economy.tier.mrrGrowth),
      load:
        def.features.points *
        economy.infra.usersPerPoint *
        tierScale(Math.min(state.tier, economy.tier.loadTierCap), economy.tier.loadGrowth),
      sprintArrived: state.sprint,
      devMergesAtOpen: state.devMerges,
      nodeIds: [],
      nameKey: featureNameKey(state.tier, fnv1a(`${state.seed}:${ticketId}`)),
    };
    state.tickets[ticketId] = ticket;
    ticketIds.push(ticketId);
  }

  emit(context, { type: "acquired", id, devIds, ticketIds });
  // The two big ones are rivals off the market: the strongest one standing.
  if (def.incident) buyStrongestCompetitor(context);

  addDebt(context, def.debt);
  // The incident lands on the head of `dev`: what was bought is in
  // production now, and production is where it breaks.
  if (def.incident) recordIncident(context, "acquisition", headOf(state).id);
}
