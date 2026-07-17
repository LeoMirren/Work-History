/**
 * Progression goals (§ achievements): an ordered ledger of survival "firsts".
 * Gameplay code emits small GoalEvents (a block broke, a recipe crafted, a
 * night slept…); the GoalTracker awards each goal exactly once, in definition
 * order, and persists as nothing more than a list of completed ids.
 */
import { Block } from './blocks';

/** One gameplay moment worth telling the goal tracker about. */
export type GoalEvent =
  | { kind: 'break'; id: number }
  | { kind: 'craft'; name: string }
  | { kind: 'smelt'; name: string }
  | { kind: 'trade' }
  | { kind: 'sleep' }
  | { kind: 'depth'; y: number }
  | { kind: 'dimension'; dimension: string }
  | { kind: 'kill'; what: 'hostile' | 'guardian' | 'king' | 'titan' | 'tyrant' | 'monarch' }
  | { kind: 'harvest'; id: number }
  | { kind: 'catch' };

/** A single achievement: stable id, display strings, and its trigger test. */
export interface Goal {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  readonly test: (e: GoalEvent) => boolean;
}

/** Player must dip below this world-y to count as "deep". */
const DEEP_Y = 40; // the abyss: far below the post-Deepening surface (~116)

/**
 * The fourteen goals, in rough progression order — from punching out a first
 * log all the way to felling an underworld vault guardian.
 */
export const GOALS: readonly Goal[] = [
  {
    id: 'first-timber',
    title: 'First Timber',
    text: 'Fell a tree and pocket a log.',
    test: (e) => e.kind === 'break' && e.id === Block.log,
  },
  {
    id: 'cobbled-together',
    title: 'Cobbled Together',
    text: 'Craft a stone pickaxe.',
    test: (e) => e.kind === 'craft' && e.name === 'stone pickaxe',
  },
  {
    id: 'hearthfire',
    title: 'Hearthfire',
    text: 'Craft a furnace to smelt and cook.',
    test: (e) => e.kind === 'craft' && e.name === 'furnace',
  },
  {
    id: 'iron-age',
    title: 'Iron Age',
    text: 'Smelt your first iron ingot.',
    test: (e) => e.kind === 'smelt' && e.name === 'iron ingot',
  },
  {
    id: 'green-thumb',
    title: 'Green Thumb',
    text: 'Harvest a fully ripened crop.',
    test: (e) => e.kind === 'harvest' && e.id === Block.cropRipe,
  },
  {
    id: 'night-watch',
    title: 'Night Watch',
    text: 'Sleep in a bed to see out the night.',
    test: (e) => e.kind === 'sleep',
  },
  {
    id: 'deep-delver',
    title: 'Deep Delver',
    text: `Descend below depth ${DEEP_Y}.`,
    test: (e) => e.kind === 'depth' && e.y < DEEP_Y,
  },
  {
    id: 'gilded',
    title: 'Gilded',
    text: 'Smelt a gleaming gold ingot.',
    test: (e) => e.kind === 'smelt' && e.name === 'gold ingot',
  },
  {
    id: 'gem-hunter',
    title: 'Gem Hunter',
    text: 'Mine a crystal from a geode heart.',
    test: (e) => e.kind === 'break' && e.id === Block.crystal,
  },
  {
    id: 'wayfarer',
    title: 'Wayfarer',
    text: 'Find a village and strike a trade.',
    test: (e) => e.kind === 'trade',
  },
  {
    id: 'reef-diver',
    title: 'Reef Diver',
    text: 'Break a piece of living coral.',
    test: (e) => e.kind === 'break' && (e.id === Block.coralRose || e.id === Block.coralTeal),
  },
  {
    id: 'rift-walker',
    title: 'Rift Walker',
    text: 'Step through a rift into the underworld.',
    test: (e) => e.kind === 'dimension' && e.dimension === 'underworld',
  },
  {
    id: 'first-blood',
    title: 'First Blood',
    text: 'Slay a hostile creature.',
    test: (e) => e.kind === 'kill' && e.what === 'hostile',
  },
  {
    id: 'vault-breaker',
    title: 'Vault Breaker',
    text: 'Defeat a vault guardian.',
    test: (e) => e.kind === 'kill' && e.what === 'guardian',
  },
  {
    id: 'king-slayer',
    title: 'King Slayer',
    text: 'Fell the Sunken King in the deep dark.',
    test: (e) => e.kind === 'kill' && e.what === 'king',
  },
  {
    id: 'titan-feller',
    title: 'Titan Feller',
    text: 'Bring down a roaming Stone Colossus.',
    test: (e) => e.kind === 'kill' && e.what === 'titan',
  },
  {
    id: 'tyrant-ender',
    title: 'Tyrant Ender',
    text: 'Silence the Hollow Tyrant at its own altar.',
    test: (e) => e.kind === 'kill' && e.what === 'tyrant',
  },
  {
    id: 'realm-sovereign',
    title: 'Realm Sovereign',
    text: 'Fell the Ashen Monarch on its own throne.',
    test: (e) => e.kind === 'kill' && e.what === 'monarch',
  },
];

/**
 * Tracks which goals a player has completed. Feed it events via signal();
 * it returns a goal at most once per call (the first uncompleted match in
 * GOALS order) so callers can surface exactly one toast per moment.
 */
export class GoalTracker {
  private readonly done = new Set<string>();

  /**
   * Report one gameplay event. Returns the goal this event newly completed
   * (first uncompleted match wins, at most one per call) or null.
   */
  signal(e: GoalEvent): Goal | null {
    for (const goal of GOALS) {
      if (this.done.has(goal.id)) continue;
      if (!goal.test(e)) continue;
      this.done.add(goal.id);
      return goal;
    }
    return null;
  }

  /** Completed goal ids, in GOALS definition order (stable for saves). */
  get completed(): readonly string[] {
    return GOALS.filter((g) => this.done.has(g.id)).map((g) => g.id);
  }

  /**
   * Restore from a save. Replaces the completed set with the known ids in
   * the list; unknown ids are dropped. undefined (no saved data) is a no-op.
   */
  load(ids: readonly string[] | undefined): void {
    if (!ids) return;
    this.done.clear();
    for (const id of ids) {
      if (GOALS.some((g) => g.id === id)) this.done.add(id);
    }
  }

  /** How many goals are still open. */
  get remaining(): number {
    return GOALS.length - this.done.size;
  }
}
