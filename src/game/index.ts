/**
 * The game's public surface.
 *
 * Everything the app is allowed to use lives here. Importing a chip or a rule
 * module from outside `src/game` means the boundary has been crossed and
 * something that should have been a handle method was not.
 *
 * Note what is safe where: `dto` and `core` are pure and run on the server,
 * which is what `replayRun` depends on. `mountGame` pulls in Pixi and Booyah
 * and is browser-only — import it through a `next/dynamic` chunk.
 */

export type { GameHandle, MountOptions } from "@/game/bridge/mount";
export { mountGame } from "@/game/bridge/mount";
export type { PlayerView, RunSnapshot, TicketView } from "@/game/bridge/snapshot";
export type { GameStore, ReviewEvent } from "@/game/bridge/store";
export { gameStore, resetGameStore, useGameStore } from "@/game/bridge/store";
export type { I18nParam, I18nText } from "@/game/core/i18n";
export { ref, renderText, text } from "@/game/core/i18n";
export { actionKey } from "@/game/core/rules/preview";
export { levelForXp, xpForLevel } from "@/game/core/score";
export type {
  ActionPreview,
  CommitMode,
  GameEvent,
  LogLine,
  NodeId,
  NodeKind,
  Phase,
  PlayerAction,
  RunMode,
  TicketId,
} from "@/game/core/types";
export type { MetaProgressDto, SettingsDto, StatPointsDto } from "@/game/dto/meta";
export { emptyMeta, META_VERSION, MetaProgressSchema } from "@/game/dto/meta";
export type { ReplayResult, ReplayStats } from "@/game/dto/replay";
export { isCurrentRules, replayRun, runFingerprint } from "@/game/dto/replay";
export type { PlayerActionDto, RunSaveDto } from "@/game/dto/run";
export { MAX_ACTIONS, PlayerActionSchema, RunSaveSchema } from "@/game/dto/run";
export { RULES_EPOCH, RULES_FINGERPRINT, SAVE_VERSION } from "@/game/dto/version";
export { labelledKind } from "@/game/render/theme";
