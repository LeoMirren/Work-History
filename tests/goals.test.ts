/**
 * Progression goals: every goal fires from exactly its event, one award per
 * signal, and completion persists through a save/load round-trip.
 */
import { describe, expect, it } from 'vitest';
import { Block } from '../src/world/blocks';
import { GOALS, GoalTracker, type GoalEvent } from '../src/world/goals';

/** One synthetic event per goal id, tailored to trigger it and nothing else. */
const EVENT_FOR: Readonly<Record<string, GoalEvent>> = {
  'first-timber': { kind: 'break', id: Block.log },
  'cobbled-together': { kind: 'craft', name: 'stone pickaxe' },
  hearthfire: { kind: 'craft', name: 'furnace' },
  'iron-age': { kind: 'smelt', name: 'iron ingot' },
  'green-thumb': { kind: 'harvest', id: Block.cropRipe },
  'night-watch': { kind: 'sleep' },
  'deep-delver': { kind: 'depth', y: 12 },
  gilded: { kind: 'smelt', name: 'gold ingot' },
  'gem-hunter': { kind: 'break', id: Block.crystal },
  wayfarer: { kind: 'trade' },
  'reef-diver': { kind: 'break', id: Block.coralRose },
  'rift-walker': { kind: 'dimension', dimension: 'underworld' },
  'first-blood': { kind: 'kill', what: 'hostile' },
  'vault-breaker': { kind: 'kill', what: 'guardian' },
};

function eventFor(id: string): GoalEvent {
  const e = EVENT_FOR[id];
  if (!e) throw new Error(`no synthetic event for goal ${id}`);
  return e;
}

describe('goal definitions', () => {
  it('defines 14 goals with unique ids', () => {
    expect(GOALS.length).toBe(14);
    expect(new Set(GOALS.map((g) => g.id)).size).toBe(GOALS.length);
    for (const goal of GOALS) {
      expect(goal.title.length).toBeGreaterThan(0);
      expect(goal.text.length).toBeGreaterThan(0);
    }
  });

  it('every goal matches exactly its own synthetic event', () => {
    for (const goal of GOALS) {
      for (const other of GOALS) {
        expect(goal.test(eventFor(other.id))).toBe(goal.id === other.id);
      }
    }
  });

  it('the second coral variant also counts for reef-diver', () => {
    const reef = GOALS.find((g) => g.id === 'reef-diver');
    expect(reef?.test({ kind: 'break', id: Block.coralTeal })).toBe(true);
  });

  it('deep-delver requires strictly below y 20', () => {
    const deep = GOALS.find((g) => g.id === 'deep-delver');
    expect(deep?.test({ kind: 'depth', y: 20 })).toBe(false);
    expect(deep?.test({ kind: 'depth', y: 19 })).toBe(true);
  });
});

describe('GoalTracker.signal', () => {
  it('each goal is reachable by its event on a fresh tracker', () => {
    for (const goal of GOALS) {
      const tracker = new GoalTracker();
      expect(tracker.signal(eventFor(goal.id))?.id).toBe(goal.id);
      expect(tracker.completed).toEqual([goal.id]);
    }
  });

  it('awards at most one goal per call and decrements remaining', () => {
    const tracker = new GoalTracker();
    expect(tracker.remaining).toBe(GOALS.length);
    for (let i = 0; i < GOALS.length; i++) {
      const goal = GOALS[i];
      if (!goal) throw new Error('missing goal');
      const before = tracker.completed.length;
      expect(tracker.signal(eventFor(goal.id))?.id).toBe(goal.id);
      expect(tracker.completed.length).toBe(before + 1);
      expect(tracker.remaining).toBe(GOALS.length - i - 1);
    }
    expect(tracker.remaining).toBe(0);
  });

  it('returns null once a goal is already completed', () => {
    const tracker = new GoalTracker();
    expect(tracker.signal({ kind: 'break', id: Block.log })?.id).toBe('first-timber');
    expect(tracker.signal({ kind: 'break', id: Block.log })).toBeNull();
    expect(tracker.completed).toEqual(['first-timber']);
  });

  it('returns null for events no goal cares about', () => {
    const tracker = new GoalTracker();
    expect(tracker.signal({ kind: 'break', id: Block.stone })).toBeNull();
    expect(tracker.signal({ kind: 'craft', name: 'planks' })).toBeNull();
    expect(tracker.signal({ kind: 'catch' })).toBeNull();
    expect(tracker.completed).toEqual([]);
    expect(tracker.remaining).toBe(GOALS.length);
  });

  it('late-progression goals fire even with earlier goals open', () => {
    const tracker = new GoalTracker();
    expect(tracker.signal({ kind: 'kill', what: 'guardian' })?.id).toBe('vault-breaker');
    expect(tracker.remaining).toBe(GOALS.length - 1);
  });
});

describe('GoalTracker persistence', () => {
  it('round-trips completed ids through load()', () => {
    const first = new GoalTracker();
    first.signal({ kind: 'break', id: Block.log });
    first.signal({ kind: 'sleep' });
    first.signal({ kind: 'trade' });

    const restored = new GoalTracker();
    restored.load(first.completed);
    expect(restored.completed).toEqual(first.completed);
    expect(restored.remaining).toBe(GOALS.length - 3);
    // Already-earned goals do not fire again after a restore.
    expect(restored.signal({ kind: 'sleep' })).toBeNull();
    // Unearned goals still do.
    expect(restored.signal({ kind: 'craft', name: 'furnace' })?.id).toBe('hearthfire');
  });

  it('ignores unknown ids in load()', () => {
    const tracker = new GoalTracker();
    tracker.load(['not-a-goal', 'first-timber', 'creeper-hug']);
    expect(tracker.completed).toEqual(['first-timber']);
    expect(tracker.remaining).toBe(GOALS.length - 1);
  });

  it('treats load(undefined) as a no-op', () => {
    const tracker = new GoalTracker();
    tracker.signal({ kind: 'trade' });
    tracker.load(undefined);
    expect(tracker.completed).toEqual(['wayfarer']);
  });
});
