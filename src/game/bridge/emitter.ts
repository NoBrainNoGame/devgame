/**
 * The Node-style `on`/`off`/`emit` trio, so Booyah chips can `_subscribe` to
 * an object and be unsubscribed automatically when they terminate.
 *
 * Shared by the session, which announces applied actions, and the reveal set,
 * which announces what the graph may now draw. `_subscribe` looks these three
 * names up by string, so they are the names to keep.
 */

export type Listener = (...args: unknown[]) => void;

export class Emitter {
  private readonly listeners = new Map<string, Set<Listener>>();

  on(type: string, listener: Listener): void {
    const bucket = this.listeners.get(type) ?? new Set<Listener>();
    bucket.add(listener);
    this.listeners.set(type, bucket);
  }

  once(type: string, listener: Listener): void {
    const wrapped: Listener = (...args) => {
      this.off(type, wrapped);
      listener(...args);
    };
    this.on(type, wrapped);
  }

  off(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, ...args: unknown[]): void {
    const bucket = this.listeners.get(type);
    if (bucket === undefined) return;
    for (const listener of [...bucket]) listener(...args);
  }

  /** Drops every listener. Called when the owner is disposed. */
  protected clearListeners(): void {
    this.listeners.clear();
  }
}
