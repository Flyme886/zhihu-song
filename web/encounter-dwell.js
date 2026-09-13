// Proximity chooses a target; a content-based relationship chooses the action.
// Only an intentional approach arms this clock. Rendering motion is independent.
export class EncounterDwell {
  constructor(delay = 1500) { this.delay = delay; this.reset(); }
  reset() { this.armed = false; this.cancel(); }
  cancel() { this.target = null; this.kind = null; this.started = null; this.progress = 0; }
  arm() { this.armed = true; this.cancel(); }
  update(node, kind, now, blocked = false) {
    if (!this.armed || blocked || !node || !['similar', 'different'].includes(kind)) {
      this.cancel(); return null;
    }
    if (this.target !== node.id || this.kind !== kind) {
      this.target = node.id; this.kind = kind; this.started = now;
    }
    this.progress = Math.max(0, Math.min(1, (now - this.started) / this.delay));
    if (this.progress < 1) return null;
    this.reset();
    return node;
  }
}
