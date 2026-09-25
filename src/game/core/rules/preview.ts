import {
  ACQUISITIONS,
  DEV_RANK,
  NARRATIVE_EVENTS,
  TREE,
  treeCost,
  UPGRADES,
  upgradeCost,
  upgradeUnlocked,
} from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { type I18nText, money, ref, signed, text } from "@/game/core/i18n";
import { commitKindFor } from "@/game/core/rules/commit";
import { hackOffer } from "@/game/core/rules/hack";
import {
  commitChance,
  conflictChance,
  gatherEffects,
  mergeEventChance,
  nodeEnergyCost,
  restRegen,
  reviewCleanCount,
  reviewEnergyCost,
  wipExtra,
} from "@/game/core/rules/modifiers";
import { choiceCost } from "@/game/core/rules/narrative";
import { canBuySkillPoint, skillPointPrice } from "@/game/core/rules/shop";
import { devCapacity, hireCostFor, maxSeats } from "@/game/core/rules/team";
import {
  behindOf,
  currentTicket,
  getTicket,
  mostIndebtedOn,
  unreadAiOn,
} from "@/game/core/rules/tickets";
import { tierScale } from "@/game/core/rules/tier";
import { treeUnlocked } from "@/game/core/rules/tree";
import { pointsFor } from "@/game/core/rules/write";
import type { ActionPreview, PlayerAction, RunState } from "@/game/core/types";

/**
 * What an action will cost and what it might do, worked out before the player
 * commits to it.
 *
 * The original design kept the dice hidden. Showing them does not remove the
 * dilemma — a 70 % gamble that saves two energy against a 92 % one that costs
 * three is still a decision — it just moves the difficulty from "guess the
 * rules" to "weigh the odds", which is the game worth playing.
 */
export function getActionPreview(state: RunState, action: PlayerAction): ActionPreview {
  const effects = gatherEffects(state);

  switch (action.type) {
    case "start": {
      const ticket = getTicket(state, action.ticketId);
      const notes: I18nText[] = [];
      if (ticket.skillId !== undefined) notes.push(text("notes.grants_skill"));
      return { action, energyCost: 0, consumesTurn: false, notes };
    }

    case "checkout":
      return { action, energyCost: 0, consumesTurn: false, notes: [] };

    case "commit": {
      const ticket = currentTicket(state);
      if (ticket === null) return { action, energyCost: 0, consumesTurn: true, notes: [] };

      // Priced as the thing it would become: a refactor's odds and its price
      // are the refactor's, not the plain commit's it is offered beside.
      const kind = commitKindFor(ticket, action.kind);

      const cost = nodeEnergyCost(state, kind, action.mode);
      const chance = commitChance(state, action.mode, kind, effects);
      const notes: I18nText[] = [...cost.notes, ...chance.notes];

      let debt = 0;
      if (action.mode === "ai") {
        // Documentation pays the debt of the next machine-written commit, so
        // the preview shows the covered price rather than the rate.
        if (state.player.docsCharges > 0) {
          notes.push(text("notes.documented", { count: state.player.docsCharges }));
        } else {
          debt = Math.max(0, BALANCE.debt.perAiCommit - effects.aiDebtDiscount);
        }
      } else {
        debt = BALANCE.debt.perCraftCommit;
      }
      if (kind === "risky") debt += BALANCE.debt.perRiskyNode;
      if (kind === "refactor") {
        const targetId = mostIndebtedOn(state, ticket);
        const repaid =
          targetId === null
            ? BALANCE.debt.refactorRepay
            : (state.nodes[targetId]?.commit.debt ?? BALANCE.debt.refactorRepay);
        debt -= repaid;
        if (targetId !== null) notes.push(text("notes.refactor_target", { debt: repaid }));
      }

      if (kind === "fix") notes.push(text("notes.fix_bug"));

      if (kind === "rebase") {
        notes.push(text("notes.rebase_why", { count: behindOf(state, ticket) }));
        if (!effects.absorbRebase) {
          notes.push(text("notes.rebase_risk", { debt: BALANCE.rebase.failureDebt }));
        }
      }

      const points = pointsFor(ticket, action.mode, kind);

      return {
        action,
        energyCost: cost.value,
        successPct: chance.value,
        points: [points, points],
        debtDelta: [debt, debt],
        consumesTurn: true,
        notes,
      };
    }

    case "review": {
      const ticket = currentTicket(state);
      const cost = reviewEnergyCost(state, effects);
      const unreviewed = ticket === null ? 0 : unreadAiOn(state, ticket).length;
      const cleaned = Math.min(unreviewed, reviewCleanCount(state, effects));
      // `-0` would be correct arithmetic and a nuisance everywhere downstream.
      const repaid = cleaned * BALANCE.review.repayPerCommit;
      const delta = repaid === 0 ? 0 : -repaid;

      const notes: I18nText[] = [...cost.notes];
      if (state.player.aiChain >= BALANCE.review.chainLength) notes.push(text("notes.fresh"));

      return {
        action,
        energyCost: cost.value,
        debtDelta: [delta, delta],
        consumesTurn: true,
        notes,
      };
    }

    case "submit": {
      const ticket = currentTicket(state);
      const notes: I18nText[] = [];
      if (ticket !== null) {
        const unread = unreadAiOn(state, ticket).length;
        if (unread > 0) notes.push(text("notes.unread_risk", { count: unread }));
        if (state.debt > BALANCE.acceptance.maxDebt) {
          notes.push(
            text("notes.health_refusal", { floor: BALANCE.debt.max - BALANCE.acceptance.maxDebt }),
          );
        }
      }
      // The review itself is free; the merge that follows an acceptance is
      // priced on its own button, and a refusal costs the turn.
      return { action, energyCost: 0, consumesTurn: true, notes };
    }

    case "merge": {
      const ticket =
        state.phase.kind === "pr_accepted"
          ? getTicket(state, state.phase.ticketId)
          : currentTicket(state);
      // An obstacle lands on its feature: no event on the way, nothing back.
      const obstacle = ticket?.parentId !== undefined;
      const cost = nodeEnergyCost(state, obstacle ? "obstacle_merge" : "feature_merge", undefined);
      const notes: I18nText[] = [...cost.notes];
      if (ticket !== null && !obstacle) {
        const risk = mergeEventChance(state, ticket);
        if (risk > 0) notes.push(text("notes.merge_risk", { percent: risk }));
        const behind = behindOf(state, ticket);
        if (behind > 0) notes.push(text("notes.behind_dev", { count: behind }));
      }
      if (obstacle) {
        notes.push(text("notes.obstacle_merge"));
      } else {
        const regen = BALANCE.energy.featureMergeRegen + effects.mergeRegenBonus;
        notes.push(text("notes.merge_regen", { energy: regen }));
      }

      return { action, energyCost: cost.value, consumesTurn: true, notes };
    }

    case "restart":
    case "resume":
      return { action, energyCost: 0, consumesTurn: false, notes: [] };

    case "rest": {
      const regen = restRegen(state);
      const notes: I18nText[] = [text("notes.rest_regen", { energy: regen })];
      if (wipExtra(state) > 0) notes.push(text("notes.rest_wip", { count: wipExtra(state) }));
      return { action, energyCost: 0, consumesTurn: true, notes };
    }

    case "tree": {
      const level = state.tree[action.id] ?? 0;
      const cost = treeCost(action.id, level);
      const missing = (TREE[action.id].requires ?? []).find(
        (req) => (state.tree[req.id] ?? 0) < req.level,
      );

      return {
        action,
        energyCost: 0,
        consumesTurn: false,
        notes: [text("notes.tree_cost", { points: cost ?? 0 })],
        ...(cost === undefined
          ? { blocked: text("notes.tree_maxed", { max: TREE[action.id].maxLevel }) }
          : !treeUnlocked(state, action.id) && missing !== undefined
            ? {
                blocked: text("notes.tree_requires", {
                  node: ref(`tree.${missing.id}.name`),
                  level: missing.level,
                }),
              }
            : cost > state.skillPoints
              ? { blocked: text("notes.tree_too_expensive", { points: cost }) }
              : {}),
      };
    }

    case "buy": {
      const def = UPGRADES[action.id];
      const level = state.upgrades[action.id] ?? 0;
      const cost = upgradeCost(action.id, level);
      const notes: I18nText[] = [text("notes.price", { money: money(cost ?? 0) })];
      if (def.upkeep > 0) notes.push(text("notes.upkeep", { money: money(def.upkeep) }));
      if (def.perLevel.infraCapacity !== undefined) {
        notes.push(text("notes.capacity_gain", { users: def.perLevel.infraCapacity }));
      }
      if (def.perLevel.infraCapacityPct !== undefined) {
        notes.push(text("notes.capacity_gain_pct", { pct: def.perLevel.infraCapacityPct }));
      }
      if (def.perLevel.teamSeats !== undefined) {
        notes.push(text("notes.seats", { count: def.perLevel.teamSeats }));
      }
      if (def.hires !== undefined) {
        notes.push(
          text("notes.brings_team", {
            count: def.hires.count,
            rank: ref(`ranks.${def.hires.rank}.name`),
          }),
        );
      }

      return {
        action,
        energyCost: 0,
        consumesTurn: false,
        notes,
        ...(!upgradeUnlocked(action.id, state.tier)
          ? { blocked: text("notes.tier_locked", { tier: def.tier }) }
          : cost === undefined
            ? { blocked: text("notes.tree_maxed", { max: def.maxLevel ?? 0 }) }
            : cost > state.money
              ? { blocked: text("notes.too_expensive", { money: money(cost) }) }
              : {}),
      };
    }

    case "buy_point": {
      const price = skillPointPrice(state);
      return {
        action,
        energyCost: 0,
        consumesTurn: false,
        notes: [text("notes.price", { money: money(price) })],
        ...(canBuySkillPoint(state)
          ? {}
          : { blocked: text("notes.too_expensive", { money: money(price) }) }),
      };
    }

    case "hire": {
      const cost = hireCostFor(effects, action.rank);
      const capacity = devCapacity(
        {
          id: "",
          name: "",
          rank: action.rank,
          hiredRank: action.rank,
          delivered: 0,
          hiredSprint: 0,
        },
        effects,
      );
      return {
        action,
        energyCost: 0,
        consumesTurn: false,
        notes: [
          text("notes.price", { money: money(cost) }),
          text("notes.salary", { money: money(DEV_RANK[action.rank].salary) }),
          text("notes.capacity", { count: capacity }),
        ],
        ...(DEV_RANK[action.rank].tier > state.tier
          ? { blocked: text("notes.tier_locked", { tier: DEV_RANK[action.rank].tier }) }
          : state.devs.length >= maxSeats(effects)
            ? { blocked: text("notes.team_full", { max: maxSeats(effects) }) }
            : cost > state.money
              ? { blocked: text("notes.too_expensive", { money: money(cost) }) }
              : {}),
      };
    }

    case "acquire": {
      const def = ACQUISITIONS[action.id];
      const notes: I18nText[] = [
        text("notes.price", { money: money(def.cost) }),
        text("notes.brings_team", {
          count: def.devs.count,
          rank: ref(`ranks.${def.devs.rank}.name`),
        }),
        text("notes.brings_features", { count: def.features.count, points: def.features.points }),
        text("notes.brings_debt", { debt: def.debt }),
      ];
      if (def.incident) notes.push(text("notes.brings_incident"));
      return {
        action,
        energyCost: 0,
        consumesTurn: false,
        notes,
        ...(def.tier > state.tier
          ? { blocked: text("notes.tier_locked", { tier: def.tier }) }
          : state.acquisitions.includes(action.id)
            ? { blocked: text("notes.already_acquired") }
            : def.cost > state.money
              ? { blocked: text("notes.too_expensive", { money: money(def.cost) }) }
              : {}),
      };
    }

    case "hack": {
      const kind = hackOffer(state, effects);
      const notes: I18nText[] =
        kind === null ? [] : [text(`notes.hack_win.${kind}`), text(`notes.hack_lose.${kind}`)];
      return {
        action,
        energyCost: 0,
        successPct: BALANCE.hack.chancePct,
        consumesTurn: true,
        notes,
        ...(kind === null ? { blocked: text("notes.hack_unavailable") } : {}),
      };
    }

    case "answer": {
      const choice = NARRATIVE_EVENTS[action.eventId].choices.find((c) => c.id === action.choice);
      const notes: I18nText[] = [];
      const cost = choiceCost(state, action.eventId, action.choice);
      if (cost > 0) notes.push(text("notes.price", { money: money(cost) }));
      const scale = tierScale(state.tier, BALANCE.economy.tier.mrrGrowth);
      const e = choice?.effect ?? {};
      if (e.money !== undefined)
        notes.push(text("notes.event_money", { money: money(e.money * scale) }));
      if (e.energy !== undefined) notes.push(text("notes.event_energy", { delta: e.energy }));
      // As the gauges show them: debt costs the code's health, impatience
      // costs production's patience.
      if (e.debt !== undefined) notes.push(text("notes.event_health", { delta: signed(-e.debt) }));
      if (e.quality !== undefined) {
        notes.push(text("notes.event_patience", { delta: signed(-e.quality) }));
      }
      if (e.share !== undefined) notes.push(text("notes.event_share", { delta: e.share }));
      if (e.competitor !== undefined)
        notes.push(text("notes.event_competitor", { pct: e.competitor }));
      if (e.ticket !== undefined)
        notes.push(text("notes.event_ticket", { kind: ref(`tickets.${e.ticket}.name`) }));
      if (e.devLeaves === true) notes.push(text("notes.event_dev_leaves"));
      if (e.skillPoints !== undefined)
        notes.push(text("notes.event_points", { count: e.skillPoints }));
      if (e.priceWar === true) notes.push(text("notes.event_price_war"));
      if (e.flag !== undefined) notes.push(text(`notes.event_flag.${e.flag}`));
      return {
        action,
        energyCost: 0,
        consumesTurn: false,
        notes,
        ...(cost > state.money
          ? { blocked: text("notes.too_expensive", { money: money(cost) }) }
          : {}),
      };
    }

    case "resolve_conflict": {
      if (action.how === "manual") {
        const chance = conflictChance(state, effects);
        return {
          action,
          energyCost: BALANCE.failure.conflictManualEnergy,
          successPct: chance.value,
          consumesTurn: true,
          notes: chance.notes,
        };
      }

      return {
        action,
        energyCost: 0,
        debtDelta: [BALANCE.debt.perAiConflictFix, BALANCE.debt.perAiConflictFix],
        consumesTurn: true,
        notes: [text("notes.hidden_bug_risk", { percent: BALANCE.failure.conflictAiHiddenBugPct })],
      };
    }

    case "choose_relic":
      return { action, energyCost: 0, consumesTurn: false, notes: [] };
  }
}

/** Previews for everything currently legal, keyed for the HUD. */
export function previewAll(
  state: RunState,
  actions: readonly PlayerAction[],
): Record<string, ActionPreview> {
  const out: Record<string, ActionPreview> = {};
  for (const action of actions) out[actionKey(action)] = getActionPreview(state, action);
  return out;
}

/** A stable string for an action, so React can key on it. */
export function actionKey(action: PlayerAction): string {
  switch (action.type) {
    case "start":
      return `start:${action.ticketId}`;
    case "checkout":
      return `checkout:${action.ticketId}`;
    case "commit":
      return action.kind === undefined
        ? `commit:${action.mode}`
        : `commit:${action.mode}:${action.kind}`;
    case "tree":
      return `tree:${action.id}`;
    case "buy":
      return `buy:${action.id}`;
    case "hire":
      return `hire:${action.rank}`;
    case "acquire":
      return `acquire:${action.id}`;
    case "answer":
      return `answer:${action.eventId}:${action.choice}`;
    case "resolve_conflict":
      return `conflict:${action.how}`;
    case "choose_relic":
      return `relic:${action.relicId}`;
    case "review":
    case "rest":
    case "submit":
    case "merge":
    case "restart":
    case "resume":
    case "buy_point":
    case "hack":
      return action.type;
  }
}
