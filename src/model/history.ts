/**
 * Snapshot-based undo/redo over immutable values. Snapshots share structure
 * (they come from immer), so keeping every step is cheap — history is unlimited.
 *
 * Gestures (a drag, a camera move) are grouped: `begin` remembers the state
 * before the gesture and `end` records a single step if anything changed.
 */
export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  private gestureStart: T | null = null;

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get inGesture(): boolean {
    return this.gestureStart !== null;
  }

  /** Records `prev` as an undo step before a discrete change. */
  record(prev: T): void {
    if (this.gestureStart !== null) return;
    this.past.push(prev);
    this.future = [];
  }

  begin(current: T): void {
    if (this.gestureStart === null) this.gestureStart = current;
  }

  end(current: T): void {
    const start = this.gestureStart;
    this.gestureStart = null;
    if (start !== null && start !== current) {
      this.past.push(start);
      this.future = [];
    }
  }

  undo(current: T): T | null {
    if (this.gestureStart !== null) this.end(current);
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(current);
    return prev;
  }

  redo(current: T): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(current);
    return next;
  }

  clear(): void {
    this.past = [];
    this.future = [];
    this.gestureStart = null;
  }
}
