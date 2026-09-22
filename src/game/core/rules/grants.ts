import { RELICS, type RelicId, type SkillId } from "@/game/content";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { addDebt } from "@/game/core/rules/debt";
import { gainEnergy, syncEnergyMax } from "@/game/core/rules/energy";

/**
 * Handing the player something permanent. Every path goes through here because
 * gaining a skill can raise the energy ceiling, and forgetting to top the bar
 * up afterwards is the kind of bug that only shows as "Café feels weak".
 */

export function grantSkill(context: RuleContext, skillId: SkillId): void {
  if (context.state.skills.includes(skillId)) return;

  context.state.skills.push(skillId);
  context.state.skills.sort();
  context.refresh();
  syncEnergyMax(context);

  emit(context, { type: "skill_gained", skillId });
}

export function grantRelic(context: RuleContext, relicId: RelicId): void {
  if (context.state.relics.includes(relicId)) return;

  context.state.relics.push(relicId);
  context.state.relics.sort();
  context.refresh();
  syncEnergyMax(context);

  emit(context, { type: "relic_chosen", relicId });

  const grant = RELICS[relicId].grant;
  if (grant === undefined) return;

  if (grant.skillPoints !== undefined) grantSkillPoints(context, grant.skillPoints);
  if (grant.energy !== undefined) gainEnergy(context, grant.energy, "relic");
  if (grant.debt !== undefined) addDebt(context, grant.debt);
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
