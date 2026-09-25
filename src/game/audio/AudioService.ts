import type { SfxId } from "@/game/audio/sfx";

/**
 * What the game asks of a sound engine, and nothing more: play a named
 * effect, set how many ambient layers are on and how tense the drone is,
 * set the music and the effects apart, mute. The engine never touches it — the storyboard turns events into
 * `sfx` steps and a scene chip drives the ambience — so the whole of the
 * audio can be swapped, or absent, without a rule knowing.
 *
 * `NullAudioService` is the only implementation wired today. A Web Audio
 * one comes later: a context created on the first gesture, a gain per
 * layer, a low-pass and a detune on the base loop driven by the tension.
 */
export interface AudioService {
  play(sfx: SfxId): void;
  /** Ambient loops on top of the base one: one per ticket held beside the first. */
  setAmbientLayers(count: number): void;
  /** 0 calm to 1 dread: how far the unsettling layer is faded in. */
  setTension(value: number): void;
  setMuted(muted: boolean): void;
  /** The player's levels, 0 to 1: the ambience is the music, everything `play`s is an effect. */
  setVolumes(volumes: AudioVolumes): void;
  dispose(): void;
}

export interface AudioVolumes {
  music: number;
  sfx: number;
}

export class NullAudioService implements AudioService {
  play(): void {}
  setAmbientLayers(): void {}
  setTension(): void {}
  setMuted(): void {}
  setVolumes(): void {}
  dispose(): void {}
}

/** The service the page mounted last; the null one until it does. */
let current: AudioService = new NullAudioService();

export function audioService(): AudioService {
  return current;
}

export function setAudioService(service: AudioService): void {
  current = service;
}
