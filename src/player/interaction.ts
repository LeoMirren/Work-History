/**
 * Block targeting and editing (§4.8): per-frame raycast drives the outline;
 * clicks break (LMB) or place (RMB) with placement rejected inside the player
 * AABB or into non-air/water cells.
 *
 * Creative: instant break, infinite placement from the fixed hotbar.
 * Survival: hold-to-break with tool-adjusted times, drops collected into the
 * inventory, placement consumes from the selected stack.
 *
 * Also owned here: the mining crack overlay (a UV-swapped cube drawn over the
 * block being dug) and `targetHint`, the contextual "what does a click do
 * here" string that main polls and forwards to the HUD.
 */
import * as THREE from 'three';
import { Tiles, tileUVRect } from '../engine/atlas';
import { Block, BREAKABLE, SOLID } from '../world/blocks';
import { CHUNK_HEIGHT } from '../world/chunk';
import { raycast, type RaycastHit } from '../world/raycast';
import { bonusDropFor, breakSecondsFor, dropFor, foodValue, isBlockId, isFood, isThrowable, isToolId, Item, useBucketOn } from '../world/items';
import { isCrop, plantResult, tillResult } from '../world/farming';
import { forEachTreeBlock } from '../world/worldgen';
import { blockIntersectsBody, EYE_HEIGHT, MAX_HUNGER, type Body } from './physics';
import type { Input } from '../engine/input';
import { ANIMAL_HALF_WIDTH, ANIMAL_HEIGHT, type AnimalSystem } from '../entities/animals';
import { STALKER_HALF_WIDTH, STALKER_HEIGHT, type HostileSystem } from '../entities/hostiles';
import type { FishSystem } from '../entities/fish';
import { VILLAGER_HALF_WIDTH, VILLAGER_HEIGHT, type Villager, type VillagerSystem } from '../entities/villagers';
import { BOSS_SUMMON_MAX_Y, type BossSystem } from '../entities/boss';
import { GUARDIAN_HALF_WIDTH, GUARDIAN_HEIGHT, type GuardianSystem } from '../entities/guardians';
import type { GameMode, PlayerController } from './controller';
import type { Inventory } from './inventory';
import type { World } from '../world/world';

export const REACH = 5.0;
/** Creative builds from further out — flying keeps you off the surface. */
export const CREATIVE_REACH = 8.0;

/** Crops are walk-through but still click-targetable (harvesting). */
const isTargetable = (id: number): boolean => SOLID[id] === 1 || isCrop(id);
/** Buckets scoop water, so their ray stops at a water source too. */
const isWaterOrSolid = (id: number): boolean => id === Block.water || SOLID[id] === 1;

/** §4.8 placement rules, pure for testability. */
export function canPlaceAt(currentId: number, bx: number, by: number, bz: number, body: Body): boolean {
  if (by < 0 || by >= CHUNK_HEIGHT) return false;
  if (currentId !== Block.air && currentId !== Block.water) return false;
  return !blockIntersectsBody(bx, by, bz, body);
}

/** Crack-overlay cube edge: a hair over a block so it draws outside the faces. */
export const CRACK_SCALE = 1.004;
/** Number of crack tiles in the atlas (Tiles.crack0..crack3). */
const CRACK_STAGES = 4;

// `targetHint` is recomputed every frame; reuse interned constants so polling
// it never allocates.
const HINT_ATTACK = 'left-click: attack';
const HINT_OPEN_CHEST = 'right-click: open chest';
const HINT_SLEEP = 'right-click: sleep & set respawn';
const HINT_TRAVEL = 'right-click: travel between realms';
const HINT_SMELT = 'open inventory (E) nearby to smelt';
const HINT_HARVEST = 'left-click: harvest';
const HINT_PLANT = 'right-click: plant seeds';
const HINT_TILL = 'right-click: till farmland';
const HINT_BARTER = 'right-click: barter';
// Click-failure feedback — the difference between "broken" and "out of range".
const FEEDBACK_TOO_FAR = 'out of reach — get closer to a surface';
const FEEDBACK_BLOCKED = "can't place there — aim at a face beside open space";
const FEEDBACK_EMPTY = 'select a block in the hotbar (1-9)';
const FEEDBACK_TOTEM_SHALLOW = 'the totem only wakes the King in the deep dark (y<30)';

/**
 * Crack stage shown for a hold-to-break progress value: quarters of the 0..1
 * progress map to tiles crack0..crack3. -1 means "no overlay" (not mining).
 */
export function crackStageFor(progress: number): number {
  if (progress <= 0) return -1;
  return Math.min(CRACK_STAGES - 1, Math.floor(progress * CRACK_STAGES));
}

/**
 * Contextual crosshair hint: what clicking the current target would do, pure
 * for testability. `blockId` is the targeted block (Block.air when none),
 * `heldId` the selected stack's id (0 when empty-handed or in creative) and
 * `entityAimed` whether a creature sits nearer along the view ray than the
 * block — entities win the crosshair, so they win the hint too. Water is
 * never targetable so it needs no case. Null = nothing worth saying.
 */
export function hintForTarget(blockId: number, heldId: number, entityAimed: boolean): string | null {
  if (entityAimed) return HINT_ATTACK;
  switch (blockId) {
    case Block.chest:
      return HINT_OPEN_CHEST;
    case Block.bed:
      return HINT_SLEEP;
    case Block.riftframe:
      return HINT_TRAVEL;
    case Block.furnace:
      return HINT_SMELT;
    case Block.cropRipe:
      return HINT_HARVEST;
    case Block.farmland:
      return heldId === Item.seeds ? HINT_PLANT : null;
    case Block.grass:
    case Block.dirt:
      return heldId === Item.hoe ? HINT_TILL : null;
    default:
      return null;
  }
}

/**
 * The 48 UV floats (6 faces x 4 corners) pinning every face of a BoxGeometry
 * to a single atlas tile. BoxGeometry emits each face's corners in
 * UV-fraction order (0,1) (1,1) (0,0) (1,0) — top-left, top-right,
 * bottom-left, bottom-right — so writing the tile rect in that order keeps
 * the crack upright on all six sides. Exported for tests.
 */
export function crackUVsFor(tile: number): Float32Array {
  const { u0, v0, u1, v1 } = tileUVRect(tile);
  const uvs = new Float32Array(48);
  for (let face = 0; face < 6; face++) {
    const o = face * 8;
    uvs[o] = u0;
    uvs[o + 1] = v1;
    uvs[o + 2] = u1;
    uvs[o + 3] = v1;
    uvs[o + 4] = u0;
    uvs[o + 5] = v0;
    uvs[o + 6] = u1;
    uvs[o + 7] = v0;
  }
  return uvs;
}

/** One cube geometry per crack stage; the overlay mesh swaps between them. */
function buildCrackGeometries(): THREE.BufferGeometry[] {
  const geometries: THREE.BufferGeometry[] = [];
  for (let stage = 0; stage < CRACK_STAGES; stage++) {
    const geometry = new THREE.BoxGeometry(CRACK_SCALE, CRACK_SCALE, CRACK_SCALE);
    geometry.setAttribute('uv', new THREE.BufferAttribute(crackUVsFor(Tiles.crack0 + stage), 2));
    geometries.push(geometry);
  }
  return geometries;
}

export interface HotbarState {
  /** Placement block in creative mode. */
  creativeBlock: number;
  /** Survival inventory (null in creative). */
  inventory: Inventory | null;
  /** Selected hotbar slot index. */
  slot: number;
}

export class Interaction {
  hasTarget = false;
  readonly hit: RaycastHit = { bx: 0, by: 0, bz: 0, nx: 0, ny: 0, nz: 0, distance: 0 };
  mode: GameMode = 'creative';
  /** Huntable wildlife (bound by main; punches hit these before blocks). */
  animals: AnimalSystem | null = null;
  /** Hostile mobs (bound by main; struck by the same punch). */
  hostiles: HostileSystem | null = null;
  /** Fish (bound by main; catchable with the same punch). */
  fish: FishSystem | null = null;
  /** Village wardens (bound by main; right-click barters, punches startle). */
  villagers: VillagerSystem | null = null;
  /** Dungeon guardians (bound by main; fought like hostiles, drop loot). */
  guardians: GuardianSystem | null = null;
  /** The great boss (bound by main; melee-hittable with weapon-scaled damage). */
  boss: BossSystem | null = null;
  /** Held-item melee damage for this frame (set in update from the selection). */
  private currentMeleeDamage = 3;
  /** Right-click on a warden: main opens the barter screen. */
  onTradeVillager: ((villager: Villager) => void) | null = null;
  /** Use a Sovereign Totem deep underground: summon the boss at (x,y,z). Returns true if it summoned. */
  onSummonBoss: ((x: number, y: number, z: number) => boolean) | null = null;
  /** A hostile or guardian died to the player's melee (goal tracking). */
  onKill: ((what: 'hostile' | 'guardian') => void) | null = null;
  /** A fish was caught by melee (goal tracking). */
  onCatch: (() => void) | null = null;
  /** Edit notification hook (block-tap audio). */
  onEdit: ((kind: 'break' | 'place', blockId: number) => void) | null = null;
  /** Right-click on a container block (chest): opens it, consumes the click. */
  onOpenContainer: ((x: number, y: number, z: number) => boolean) | null = null;
  /** Right-click a riftframe to travel between dimensions. */
  onActivateRift: ((x: number, y: number, z: number) => boolean) | null = null;
  /** Right-click a bed to sleep / set respawn. */
  onUseBed: ((x: number, y: number, z: number) => boolean) | null = null;
  /** Throw the held throwing-stone from the eye along (dx,dy,dz). */
  onThrow: ((ox: number, oy: number, oz: number, dx: number, dy: number, dz: number) => void) | null = null;
  /** Block placed/broken at a world cell, for container bookkeeping. */
  onBlockChanged: ((kind: 'place' | 'break', id: number, x: number, y: number, z: number) => void) | null = null;
  /**
   * Loot sink: when set, mining/harvest/kill yields spawn as world drops at
   * the given spot instead of teleporting into the inventory.
   */
  onDrop: ((id: number, count: number, x: number, y: number, z: number) => void) | null = null;
  /** Survival hold-to-break progress, 0..1 (for the HUD bar). */
  breakProgress = 0;
  /**
   * Contextual "what does a click do here" hint, recomputed every update();
   * null when there is nothing to say. Main polls it for the HUD — treat as
   * read-only outside this class.
   */
  targetHint: string | null = null;
  /**
   * Transient click-failure feedback ('out of reach', …), shown by main for a
   * beat via the same HUD label; wins over targetHint while set.
   */
  feedback: string | null = null;
  private feedbackTimer = 0;
  private breakX = Number.NaN;
  private breakY = Number.NaN;
  private breakZ = Number.NaN;
  private readonly outline: THREE.LineSegments;
  /** Reddish box drawn around the entity under the crosshair. */
  private readonly entityOutline: THREE.LineSegments;
  /** Mining crack overlay: one cube mesh whose geometry swaps per stage. */
  private readonly crackMesh: THREE.Mesh;
  private readonly crackMaterial: THREE.MeshBasicMaterial;
  private readonly crackGeometries: readonly THREE.BufferGeometry[];
  /** setAtlas() guard: the crack overlay stays hidden until a texture binds. */
  private atlasReady = false;
  private readonly clicks: number[] = [];

  constructor(scene: THREE.Scene) {
    this.outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
      new THREE.LineBasicMaterial({ color: 0x101010 }),
    );
    this.outline.visible = false;
    scene.add(this.outline);
    this.entityOutline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 0x8a2020 }),
    );
    this.entityOutline.visible = false;
    scene.add(this.entityOutline);
    this.crackGeometries = buildCrackGeometries();
    this.crackMaterial = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.4, depthWrite: false });
    this.crackMesh = new THREE.Mesh(this.crackGeometries[0], this.crackMaterial);
    this.crackMesh.name = 'entity'; // opt out of main's shared-chunk-material dev sweep
    this.crackMesh.renderOrder = 2;
    this.crackMesh.visible = false;
    scene.add(this.crackMesh);
  }

  /**
   * Bind the session's atlas texture to the crack-overlay material. Main
   * calls this once per session; until then the overlay never shows.
   */
  setAtlas(texture: THREE.Texture): void {
    this.crackMaterial.map = texture;
    this.crackMaterial.needsUpdate = true;
    this.atlasReady = true;
  }

  /** Per-frame: refresh the targeted block and apply queued clicks. */
  update(input: Input, world: World, player: PlayerController, dt: number, hotbar: HotbarState): void {
    const body = player.body;
    const eyeY = body.y + EYE_HEIGHT;
    const cosPitch = Math.cos(player.pitch);
    const dirX = -Math.sin(player.yaw) * cosPitch;
    const dirY = Math.sin(player.pitch);
    const dirZ = -Math.cos(player.yaw) * cosPitch;

    const reach = this.mode === 'creative' ? CREATIVE_REACH : REACH;
    this.hasTarget = raycast(world.blockAt, isTargetable, body.x, eyeY, body.z, dirX, dirY, dirZ, reach, this.hit);

    // Aim feedback: if a creature is nearer along the ray than the block,
    // outline the creature instead of the block.
    const animalAim = this.animals?.raycastNearest(body.x, eyeY, body.z, dirX, dirY, dirZ, reach) ?? null;
    const hostileAim = this.hostiles?.raycastNearest(body.x, eyeY, body.z, dirX, dirY, dirZ, reach) ?? null;
    // Nearest creature along the ray (outline + hint); hostiles win ties.
    const guardianAim = this.guardians?.raycastNearest(body.x, eyeY, body.z, dirX, dirY, dirZ, reach) ?? null;
    let aimBody: { x: number; y: number; z: number } | null = null;
    let aimHalf = 0;
    let aimHeight = 0;
    let aimDist = Infinity;
    if (hostileAim) {
      aimBody = hostileAim.stalker.body;
      aimHalf = STALKER_HALF_WIDTH;
      aimHeight = STALKER_HEIGHT;
      aimDist = hostileAim.distance;
    }
    if (guardianAim && guardianAim.distance < aimDist) {
      aimBody = guardianAim.guardian.body;
      aimHalf = GUARDIAN_HALF_WIDTH;
      aimHeight = GUARDIAN_HEIGHT;
      aimDist = guardianAim.distance;
    }
    const bossAim = this.boss?.raycastNearest(body.x, eyeY, body.z, dirX, dirY, dirZ, reach) ?? null;
    if (bossAim && bossAim.distance < aimDist) {
      aimBody = bossAim.boss.body;
      aimHalf = bossAim.boss.spec.halfWidth;
      aimHeight = bossAim.boss.spec.height;
      aimDist = bossAim.distance;
    }
    if (animalAim && animalAim.distance < aimDist) {
      aimBody = animalAim.animal.body;
      aimHalf = ANIMAL_HALF_WIDTH;
      aimHeight = ANIMAL_HEIGHT;
      aimDist = animalAim.distance;
    }
    const entityAimed = aimBody !== null && (!this.hasTarget || aimDist < this.hit.distance);
    // Village wardens win the crosshair only when strictly nearest.
    const villagerAim = this.villagers?.raycastNearest(body.x, eyeY, body.z, dirX, dirY, dirZ, reach) ?? null;
    const villagerAimed =
      villagerAim !== null &&
      villagerAim.distance < aimDist &&
      (!this.hasTarget || villagerAim.distance < this.hit.distance);
    if (villagerAimed && villagerAim) {
      const b = villagerAim.villager.body;
      this.entityOutline.visible = true;
      this.entityOutline.position.set(b.x, b.y + VILLAGER_HEIGHT / 2, b.z);
      this.entityOutline.scale.set(VILLAGER_HALF_WIDTH * 2 + 0.08, VILLAGER_HEIGHT + 0.08, VILLAGER_HALF_WIDTH * 2 + 0.08);
    } else if (entityAimed && aimBody) {
      this.entityOutline.visible = true;
      this.entityOutline.position.set(aimBody.x, aimBody.y + aimHeight / 2, aimBody.z);
      this.entityOutline.scale.set(aimHalf * 2 + 0.08, aimHeight + 0.08, aimHalf * 2 + 0.08);
    } else {
      this.entityOutline.visible = false;
    }

    if (this.hasTarget && !entityAimed && !villagerAimed) {
      this.outline.visible = true;
      this.outline.position.set(this.hit.bx + 0.5, this.hit.by + 0.5, this.hit.bz + 0.5);
    } else {
      this.outline.visible = false;
    }

    // Contextual hint (polled by main, forwarded to the HUD): entities win
    // the crosshair, so they win the hint; otherwise the target block decides.
    const targetId = this.hasTarget ? world.getBlock(this.hit.bx, this.hit.by, this.hit.bz) : Block.air;
    this.targetHint = villagerAimed
      ? HINT_BARTER
      : hintForTarget(targetId, this.heldId(hotbar), entityAimed);

    if (this.feedbackTimer > 0) {
      this.feedbackTimer -= dt;
      if (this.feedbackTimer <= 0) this.feedback = null;
    }

    // Control scheme: EITHER mouse button breaks / attacks; the U key is the
    // single "use" action — place a block, talk/barter, open a chest, use a
    // bed or rift, eat, throw, farm, fill a bucket.
    input.takeClicks(this.clicks);
    const use = input.takePressed('KeyU');
    // Weapon-scaled melee: the King's greataxe hits hardest, tools middling.
    const held = this.heldId(hotbar);
    this.currentMeleeDamage =
      held === Item.earthshaker ? 16 : held === Item.kingsplitter ? 14 : isToolId(held) ? 6 : 3;
    if (this.mode === 'survival' && hotbar.inventory) {
      this.updateTimedBreaking(input, world, dt, hotbar.inventory, hotbar);
      // Every queued click swings at the aimed entity (blocks mine via hold).
      for (let c = 0; c < this.clicks.length; c++) {
        this.tryPunchAnimal(body.x, eyeY, body.z, dirX, dirY, dirZ, hotbar.inventory);
      }
      if (use) {
        if (
          !this.tryTradeVillager(body.x, eyeY, body.z, dirX, dirY, dirZ) &&
          !this.tryActivateRift(world) &&
          !this.tryUseBed(world) &&
          !this.tryOpenContainer(world) &&
          !this.tryUseBucket(world, hotbar, body.x, eyeY, body.z, dirX, dirY, dirZ) &&
          !this.tryFarm(world, hotbar) &&
          !this.tryEat(player, hotbar) &&
          !this.tryThrow(hotbar, body.x, eyeY, body.z, dirX, dirY, dirZ) &&
          !this.trySummonTotem(player, hotbar)
        ) {
          if (this.hasTarget) this.trySurvivalPlace(world, body, hotbar);
          else this.setFeedback(FEEDBACK_TOO_FAR);
        }
      }
    } else {
      // Creative (or inventory-less) frames never hold-to-mine: drop any
      // survival break-in-progress so the crack overlay can't linger across
      // a mode switch.
      this.resetBreaking();
      for (let c = 0; c < this.clicks.length; c++) {
        if (this.tryPunchAnimal(body.x, eyeY, body.z, dirX, dirY, dirZ, null)) continue;
        if (this.hasTarget) this.tryBreak(world);
      }
      if (use) {
        if (!this.tryActivateRift(world) && !this.tryUseBed(world) && !this.tryOpenContainer(world)) {
          if (this.hasTarget) this.tryPlace(world, body, hotbar.creativeBlock);
          else this.setFeedback(FEEDBACK_TOO_FAR);
        }
      }
    }
  }

  /** Surface a click-failure message on the HUD for a moment. */
  private setFeedback(text: string): void {
    this.feedback = text;
    this.feedbackTimer = 1.6;
  }

  /** Yield loot: as a world drop when wired, else straight to the inventory. */
  private award(inventory: Inventory | null, id: number, count: number, x: number, y: number, z: number): void {
    if (this.onDrop) this.onDrop(id, count, x, y, z);
    else if (inventory) inventory.add(id, count);
  }

  /** Right-click a chest: hand off to the container hook. */
  private tryOpenContainer(world: World): boolean {
    if (!this.hasTarget || !this.onOpenContainer) return false;
    const { bx, by, bz } = this.hit;
    if (world.getBlock(bx, by, bz) !== Block.chest) return false;
    return this.onOpenContainer(bx, by, bz);
  }

  /** Right-click a riftframe: hand off to the dimension-travel hook. */
  private tryActivateRift(world: World): boolean {
    if (!this.hasTarget || !this.onActivateRift) return false;
    const { bx, by, bz } = this.hit;
    if (world.getBlock(bx, by, bz) !== Block.riftframe) return false;
    return this.onActivateRift(bx, by, bz);
  }

  /** Right-click a bed: hand off to the sleep / set-respawn hook. */
  private tryUseBed(world: World): boolean {
    if (!this.hasTarget || !this.onUseBed) return false;
    const { bx, by, bz } = this.hit;
    if (world.getBlock(bx, by, bz) !== Block.bed) return false;
    return this.onUseBed(bx, by, bz);
  }

  /** Right-click a warden within reach (and nearer than the block): barter. */
  private tryTradeVillager(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
  ): boolean {
    if (this.mode !== 'survival' || !this.villagers || !this.onTradeVillager) return false;
    const hit = this.villagers.raycastNearest(ox, oy, oz, dx, dy, dz, REACH);
    if (!hit) return false;
    if (this.hasTarget && this.hit.distance < hit.distance) return false;
    this.onTradeVillager(hit.villager);
    return true;
  }

  /** Punch the nearest entity (hostile, animal or fish) if closer than the block. */
  private tryPunchAnimal(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    inventory: Inventory | null,
  ): boolean {
    const animalHit = this.animals?.raycastNearest(ox, oy, oz, dx, dy, dz, REACH) ?? null;
    const hostileHit = this.hostiles?.raycastNearest(ox, oy, oz, dx, dy, dz, REACH) ?? null;
    const fishHit = this.fish?.raycastNearest(ox, oy, oz, dx, dy, dz, REACH) ?? null;
    const villagerHit = this.villagers?.raycastNearest(ox, oy, oz, dx, dy, dz, REACH) ?? null;
    const guardianHit = this.guardians?.raycastNearest(ox, oy, oz, dx, dy, dz, REACH) ?? null;
    const bossHit = this.boss?.raycastNearest(ox, oy, oz, dx, dy, dz, REACH) ?? null;
    // Nearest wins; the boss and hostiles break ties (they're the danger),
    // and wardens are last so a fight never startles one by accident.
    let dist = Infinity;
    let kind: 'boss' | 'hostile' | 'guardian' | 'animal' | 'fish' | 'villager' | null = null;
    if (bossHit && bossHit.distance < dist) {
      dist = bossHit.distance;
      kind = 'boss';
    }
    if (hostileHit && hostileHit.distance < dist) {
      dist = hostileHit.distance;
      kind = 'hostile';
    }
    if (guardianHit && guardianHit.distance < dist) {
      dist = guardianHit.distance;
      kind = 'guardian';
    }
    if (animalHit && animalHit.distance < dist) {
      dist = animalHit.distance;
      kind = 'animal';
    }
    if (fishHit && fishHit.distance < dist) {
      dist = fishHit.distance;
      kind = 'fish';
    }
    if (villagerHit && villagerHit.distance < dist) {
      dist = villagerHit.distance;
      kind = 'villager';
    }
    if (kind === null) return false;
    if (this.hasTarget && this.hit.distance < dist) return false;
    if (kind === 'boss' && bossHit) {
      if (this.boss?.hurt(bossHit.boss, this.currentMeleeDamage, dx, dz)) this.onKill?.('guardian');
    } else if (kind === 'hostile' && hostileHit) {
      if (this.hostiles?.hurt(hostileHit.stalker, dx, dz)) this.onKill?.('hostile');
    } else if (kind === 'guardian' && guardianHit) {
      const loot = this.guardians?.hurt(guardianHit.guardian, dx, dz) ?? null;
      if (loot) {
        const b = guardianHit.guardian.body;
        if (inventory) this.award(inventory, loot.id, loot.count, b.x, b.y + 0.6, b.z);
        this.onKill?.('guardian');
      }
    } else if (kind === 'animal' && animalHit) {
      const drops = this.animals?.hurt(animalHit.animal, dx, dz) ?? null;
      if (drops && inventory) {
        const b = animalHit.animal.body;
        this.award(inventory, drops.id, drops.count, b.x, b.y + 0.4, b.z);
      }
    } else if (kind === 'fish' && fishHit) {
      const drops = this.fish?.hurt(fishHit.fish, dx, dz) ?? null;
      if (drops) {
        const b = fishHit.fish.body;
        if (inventory) this.award(inventory, drops.id, drops.count, b.x, b.y + 0.2, b.z);
        this.onCatch?.();
      }
    } else if (kind === 'villager' && villagerHit) {
      this.villagers?.startle(villagerHit.villager, dx, dz); // no drops, ever
    }
    this.onEdit?.('break', Item.meat); // thud
    return true;
  }

  /** Hoe tills grass/dirt into farmland; seeds plant a sprout above farmland. */
  private tryFarm(world: World, hotbar: HotbarState): boolean {
    const inventory = hotbar.inventory;
    const stack = inventory?.slots[hotbar.slot];
    if (!inventory || !stack || !this.hasTarget) return false;
    const { bx, by, bz } = this.hit;
    const targetId = world.getBlock(bx, by, bz);
    const aboveId = world.getBlock(bx, by + 1, bz);
    const tilled = tillResult(stack.id, targetId);
    if (tilled !== null && aboveId === Block.air) {
      world.setBlock(bx, by, bz, tilled);
      this.onEdit?.('place', tilled);
      return true;
    }
    const planted = plantResult(stack.id, targetId, aboveId);
    if (planted !== null) {
      if (!inventory.consumeOne(hotbar.slot)) return false;
      world.setBlock(bx, by + 1, bz, planted);
      this.onEdit?.('place', planted);
      return true;
    }
    return false;
  }

  /** Crops can't float: breaking their support pops them (seeds in survival). */
  private popCropAbove(world: World, bx: number, by: number, bz: number, inventory: Inventory | null): void {
    const above = world.getBlock(bx, by + 1, bz);
    if (!isCrop(above)) return;
    world.setBlock(bx, by + 1, bz, Block.air);
    if (inventory) {
      const drop = dropFor(above, 0);
      if (drop) this.award(inventory, drop.id, drop.count, bx + 0.5, by + 1.5, bz + 0.5);
    }
  }

  /** Holding food: right-click eats it when hungry. Returns true if consumed. */
  private tryEat(player: PlayerController, hotbar: HotbarState): boolean {
    const inventory = hotbar.inventory;
    const stack = inventory?.slots[hotbar.slot];
    if (!inventory || !stack || !isFood(stack.id)) return false;
    if (player.hunger >= MAX_HUNGER) return false;
    if (!inventory.consumeOne(hotbar.slot)) return false;
    player.eat(foodValue(stack.id));
    this.onEdit?.('place', stack.id);
    return true;
  }

  /** Use a Sovereign Totem: summon the boss when deep enough, consuming it. */
  private trySummonTotem(player: PlayerController, hotbar: HotbarState): boolean {
    const inventory = hotbar.inventory;
    const stack = inventory?.slots[hotbar.slot];
    if (!inventory || !stack || stack.id !== Item.sovereignTotem || !this.onSummonBoss) return false;
    if (player.body.y >= BOSS_SUMMON_MAX_Y) {
      this.setFeedback(FEEDBACK_TOTEM_SHALLOW);
      return true; // consumed the click (don't fall through to placing)
    }
    if (!this.onSummonBoss(player.body.x, player.body.y, player.body.z)) return true;
    inventory.consumeOne(hotbar.slot);
    this.onEdit?.('place', Item.sovereignTotem);
    return true;
  }

  /** Hurl the held throwing stone along the view ray, consuming one. */
  private tryThrow(
    hotbar: HotbarState,
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
  ): boolean {
    const inventory = hotbar.inventory;
    const stack = inventory?.slots[hotbar.slot];
    if (!inventory || !stack || !isThrowable(stack.id) || !this.onThrow) return false;
    if (!inventory.consumeOne(hotbar.slot)) return false;
    // Launch just ahead of the eye so it never collides with the player cell.
    this.onThrow(ox + dx * 0.6, oy + dy * 0.6, oz + dz * 0.6, dx, dy, dz);
    this.onEdit?.('break', stack.id);
    return true;
  }

  private readonly bucketHit: RaycastHit = { bx: 0, by: 0, bz: 0, nx: 0, ny: 0, nz: 0, distance: 0 };

  /**
   * Empty bucket scoops a water source along the view ray; a full bucket pours
   * into the air cell against the targeted block. Buckets are unstackable, so
   * the held stack's id is simply swapped in place.
   */
  private tryUseBucket(
    world: World,
    hotbar: HotbarState,
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
  ): boolean {
    const inventory = hotbar.inventory;
    const stack = inventory?.slots[hotbar.slot];
    if (!inventory || !stack) return false;

    if (stack.id === Item.bucket) {
      if (!raycast(world.blockAt, isWaterOrSolid, ox, oy, oz, dx, dy, dz, REACH, this.bucketHit)) return false;
      const { bx, by, bz } = this.bucketHit;
      const r = useBucketOn(stack.id, world.getBlock(bx, by, bz));
      if (!r) return false;
      world.setBlock(bx, by, bz, r.setCell);
      stack.id = r.newHeld;
      inventory.version++;
      this.onEdit?.('break', Item.bucket);
      return true;
    }

    if (stack.id === Item.waterBucket && this.hasTarget) {
      const bx = this.hit.bx + this.hit.nx;
      const by = this.hit.by + this.hit.ny;
      const bz = this.hit.bz + this.hit.nz;
      const r = useBucketOn(stack.id, world.getBlock(bx, by, bz));
      if (!r) return false;
      world.setBlock(bx, by, bz, r.setCell);
      stack.id = r.newHeld;
      inventory.version++;
      this.onEdit?.('place', Block.water);
      return true;
    }
    return false;
  }

  private heldId(hotbar: HotbarState): number {
    return hotbar.inventory?.slots[hotbar.slot]?.id ?? 0;
  }

  /**
   * The single reset path for hold-to-break: zero the progress, forget the
   * block and hide the crack overlay (idle hand, target lost, block broken,
   * unbreakable target, or a switch to creative).
   */
  private resetBreaking(): void {
    this.breakProgress = 0;
    this.breakX = Number.NaN;
    this.crackMesh.visible = false;
  }

  /** Drape the crack overlay over the mined block at the current stage. */
  private showCrackAt(bx: number, by: number, bz: number): void {
    const geometry: THREE.BufferGeometry | undefined = this.crackGeometries[crackStageFor(this.breakProgress)];
    if (!this.atlasReady || !geometry) {
      this.crackMesh.visible = false;
      return;
    }
    this.crackMesh.geometry = geometry;
    this.crackMesh.position.set(bx + 0.5, by + 0.5, bz + 0.5);
    this.crackMesh.visible = true;
  }

  /** Survival: hold LMB on one block until its tool-adjusted time elapses. */
  private updateTimedBreaking(
    input: Input,
    world: World,
    dt: number,
    inventory: Inventory,
    hotbar: HotbarState,
  ): void {
    if (!this.hasTarget || !input.anyBreakDown) {
      this.resetBreaking();
      return;
    }
    const { bx, by, bz } = this.hit;
    const id = world.getBlock(bx, by, bz);
    if (BREAKABLE[id] !== 1) {
      this.resetBreaking();
      return;
    }
    if (bx !== this.breakX || by !== this.breakY || bz !== this.breakZ) {
      this.breakX = bx;
      this.breakY = by;
      this.breakZ = bz;
      this.breakProgress = 0;
    }
    const held = this.heldId(hotbar);
    const seconds = breakSecondsFor(id, held);
    this.breakProgress += Number.isFinite(seconds) && seconds > 0 ? dt / seconds : 0;
    if (this.breakProgress >= 1) {
      world.setBlock(bx, by, bz, Block.air);
      const drop = dropFor(id, held);
      if (drop) this.award(inventory, drop.id, drop.count, bx + 0.5, by + 0.5, bz + 0.5);
      const bonus = bonusDropFor(id, Math.random());
      if (bonus) this.award(inventory, bonus.id, bonus.count, bx + 0.5, by + 0.5, bz + 0.5);
      this.popCropAbove(world, bx, by, bz, inventory);
      this.onEdit?.('break', id);
      this.onBlockChanged?.('break', id, bx, by, bz);
      this.resetBreaking();
      return;
    }
    this.showCrackAt(bx, by, bz);
  }

  private tryBreak(world: World): void {
    const { bx, by, bz } = this.hit;
    const id = world.getBlock(bx, by, bz);
    // Creative ignores the survival breakability gate — bedrock included.
    if (id === Block.air || id === Block.water) return;
    world.setBlock(bx, by, bz, Block.air);
    this.popCropAbove(world, bx, by, bz, null);
    this.onEdit?.('break', id);
    this.onBlockChanged?.('break', id, bx, by, bz);
  }

  private tryPlace(world: World, body: Body, blockId: number): void {
    const bx = this.hit.bx + this.hit.nx;
    const by = this.hit.by + this.hit.ny;
    const bz = this.hit.bz + this.hit.nz;
    // Only real blocks may enter world data (item ids would corrupt chunks).
    if (blockId <= 0 || !isBlockId(blockId)) {
      this.setFeedback(FEEDBACK_EMPTY);
      return;
    }
    if (!canPlaceAt(world.getBlock(bx, by, bz), bx, by, bz, body)) {
      this.setFeedback(FEEDBACK_BLOCKED);
      return;
    }
    world.setBlock(bx, by, bz, blockId);
    this.onEdit?.('place', blockId);
    this.onBlockChanged?.('place', blockId, bx, by, bz);
  }

  /** Survival placement consumes one item from the selected stack. */
  private trySurvivalPlace(world: World, body: Body, hotbar: HotbarState): void {
    const inventory = hotbar.inventory;
    const stack = inventory?.slots[hotbar.slot];
    if (!inventory || !stack) {
      this.setFeedback(FEEDBACK_EMPTY);
      return;
    }
    // Saplings aren't blocks: plant a tree on top of grass instead.
    if (stack.id === Item.sapling) {
      this.trySurvivalPlantSapling(world, hotbar);
      return;
    }
    if (!isBlockId(stack.id)) return;
    const bx = this.hit.bx + this.hit.nx;
    const by = this.hit.by + this.hit.ny;
    const bz = this.hit.bz + this.hit.nz;
    if (!canPlaceAt(world.getBlock(bx, by, bz), bx, by, bz, body)) {
      this.setFeedback(FEEDBACK_BLOCKED);
      return;
    }
    const blockId = stack.id;
    if (!inventory.consumeOne(hotbar.slot)) return;
    world.setBlock(bx, by, bz, blockId);
    this.onEdit?.('place', blockId);
    this.onBlockChanged?.('place', blockId, bx, by, bz);
  }

  /** Plant a sapling: grow a tree above a grass block, consuming the item. */
  private trySurvivalPlantSapling(world: World, hotbar: HotbarState): void {
    const inventory = hotbar.inventory;
    if (!inventory) return;
    // Must target the top face of a grass block with air above it.
    if (this.hit.ny !== 1 || world.getBlock(this.hit.bx, this.hit.by, this.hit.bz) !== Block.grass) return;
    const bx = this.hit.bx;
    const by = this.hit.by + 1;
    const bz = this.hit.bz;
    if (world.getBlock(bx, by, bz) !== Block.air) return;
    if (!inventory.consumeOne(hotbar.slot)) return;
    growTree(world, bx, by, bz);
    this.onEdit?.('place', Block.log);
  }
}

/** Grow a tree into the air above a planted spot (never destroys blocks). */
export function growTree(world: World, bx: number, by: number, bz: number, trunkHeight = 5): void {
  // The base block (the grass) is at by-1; tree offsets are dy>=1 from it.
  forEachTreeBlock(trunkHeight, (dx, dy, dz, id) => {
    const tx = bx + dx;
    const ty = by - 1 + dy;
    const tz = bz + dz;
    if (world.getBlock(tx, ty, tz) === Block.air) world.setBlock(tx, ty, tz, id);
  });
}
