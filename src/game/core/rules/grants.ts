import type { SkillId } from "@/game/content";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { syncEnergyMax } from "@/game/core/rules/energy";

/**
 * Handing the player something permanent. Gaining a skill can raise the
 * energy ceiling, and forgetting to top the bar up afterwards is the kind of
 * bug that only shows as "Café feels weak". Sprint bonuses have their own
 * door in `rules/relics.ts`.
 */

export function grantSkill(context: RuleContext, skillId: SkillId): void {
  if (context.state.skills.includes(skillId)) return;

  context.state.skills.push(skillId);
  context.state.skills.sort();
  context.refresh();
  syncEnergyMax(context);

  emit(context, { type: "skill_gained", skillId });
}

export function grantSkillPoints(context: RuleContext, amount: number): void {
  if (amount === 0) return;

  context.state.skillPoints = Math.max(0, context.state.skillPoints + amount);
  emit(context, {
    type: "skill_points",
    delta: amount,
    value: context.state.skillPoints,
  });
}
