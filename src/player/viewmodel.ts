/**
 * First-person held item: a camera-attached rig showing what's in your hand —
 * blocks as a mini 3D cube with the block's real per-face tiles and baked
 * face shading, items as the classic flat sprite. Bobs while walking, swings
 * on clicks. Purely visual; no gameplay state lives here.
 */
import * as THREE from 'three';
import { ATLAS_TILES, TILE_PX, tileUVRect } from '../engine/atlas';
import { FACE_TILES } from '../world/blocks';
import { iconTileFor, isBlockId } from '../world/items';

const BASE_POS = { x: 0.44, y: -0.38, z: -0.72 };
const BASE_ROT = { x: 0.1, y: -0.5, z: 0.12 };
const SWING_SECONDS = 0.24;
const CUBE_SIZE = 0.34;
/** Baked face brightness [+x, -x, +y, -y, +z, -z] — makes the cube read 3D. */
const CUBE_FACE_SHADE = [0.8, 0.8, 1.0, 0.55, 0.88, 0.88] as const;

/**
 * The 48 UV floats pinning each BoxGeometry face to its block tile.
 * BoxGeometry emits faces in [+x, -x, +y, -y, +z, -z] order — the same order
 * as FACE_TILES — with per-face corners at (0,1) (1,1) (0,0) (1,0).
 * Exported for tests.
 */
export function blockCubeUVs(blockId: number): Float32Array {
  const uvs = new Float32Array(48);
  for (let f = 0; f < 6; f++) {
    const { u0, v0, u1, v1 } = tileUVRect(FACE_TILES[blockId * 6 + f] ?? 0);
    const o = f * 8;
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

/** Per-vertex face shading for the mini cube (24 verts × rgb). */
function cubeShadeColors(): Float32Array {
  const colors = new Float32Array(72);
  for (let f = 0; f < 6; f++) {
    const s = CUBE_FACE_SHADE[f] ?? 1;
    for (let v = 0; v < 4; v++) {
      const o = (f * 4 + v) * 3;
      colors[o] = s;
      colors[o + 1] = s;
      colors[o + 2] = s;
    }
  }
  return colors;
}

export class ViewModel {
  /** Both hand meshes ride this group; bob/swing move the group. */
  private readonly rig: THREE.Group;
  private readonly sprite: THREE.Mesh;
  private readonly cube: THREE.Mesh;
  private readonly cubeMaterial: THREE.MeshBasicMaterial;
  private readonly cubeGeometries = new Map<number, THREE.BufferGeometry>();
  private readonly canvas: HTMLCanvasElement;
  private readonly texture: THREE.CanvasTexture;
  private cubeAtlas: HTMLCanvasElement | null = null;
  private cubeTexture: THREE.CanvasTexture | null = null;
  private shownId = -1;
  private bobT = 0;
  private swingT = 1; // >= 1 means idle

  constructor(camera: THREE.Camera) {
    this.rig = new THREE.Group();
    this.rig.name = 'entity';
    this.rig.position.set(BASE_POS.x, BASE_POS.y, BASE_POS.z);
    this.rig.rotation.set(BASE_ROT.x, BASE_ROT.y, BASE_ROT.z);
    camera.add(this.rig);

    // Flat sprite for items (tools, food, materials).
    this.canvas = document.createElement('canvas');
    this.canvas.width = TILE_PX;
    this.canvas.height = TILE_PX;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.42),
      new THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        alphaTest: 0.1,
        side: THREE.DoubleSide,
        depthTest: false, // always drawn over the world, like a real viewmodel
      }),
    );
    this.sprite.name = 'entity';
    this.sprite.renderOrder = 999;
    this.sprite.visible = false;
    this.rig.add(this.sprite);

    // Mini cube for blocks: per-face tiles + baked shading via vertex colors.
    this.cubeMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      depthTest: false,
    });
    this.cube = new THREE.Mesh(new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE), this.cubeMaterial);
    this.cube.name = 'entity';
    this.cube.renderOrder = 999;
    this.cube.rotation.set(0.16, 0.7, 0); // corner-on, tops visible
    this.cube.visible = false;
    this.rig.add(this.cube);
  }

  /**
   * Follow the scene's lighting: the held item dims with the day/night
   * cycle (plus a floor so it never goes pitch black in hand).
   */
  setBrightness(b: number): void {
    const level = 0.35 + 0.65 * Math.max(0, Math.min(1, b));
    this.cubeMaterial.color.setScalar(level);
    (this.sprite.material as THREE.MeshBasicMaterial).color.setScalar(level);
  }

  /** Cached UV-pinned cube geometry per block id. */
  private cubeGeometryFor(blockId: number): THREE.BufferGeometry {
    let geometry = this.cubeGeometries.get(blockId);
    if (!geometry) {
      geometry = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
      geometry.setAttribute('uv', new THREE.BufferAttribute(blockCubeUVs(blockId), 2));
      geometry.setAttribute('color', new THREE.BufferAttribute(cubeShadeColors(), 3));
      this.cubeGeometries.set(blockId, geometry);
    }
    return geometry;
  }

  /** Show the selected id (no-op when unchanged; hides on empty hand). */
  setItem(id: number, atlasCanvas: HTMLCanvasElement): void {
    if (id === this.shownId && atlasCanvas === this.cubeAtlas) return;
    this.shownId = id;
    if (id <= 0) {
      this.sprite.visible = false;
      this.cube.visible = false;
      return;
    }
    if (isBlockId(id)) {
      // Blocks: the full atlas texture drives the per-face UVs.
      if (this.cubeAtlas !== atlasCanvas || !this.cubeTexture) {
        this.cubeTexture?.dispose();
        this.cubeTexture = new THREE.CanvasTexture(atlasCanvas);
        this.cubeTexture.magFilter = THREE.NearestFilter;
        this.cubeTexture.minFilter = THREE.NearestFilter;
        this.cubeTexture.generateMipmaps = false;
        this.cubeTexture.colorSpace = THREE.SRGBColorSpace;
        this.cubeMaterial.map = this.cubeTexture;
        this.cubeMaterial.needsUpdate = true;
        this.cubeAtlas = atlasCanvas;
      }
      this.cube.geometry = this.cubeGeometryFor(id);
      this.cube.visible = true;
      this.sprite.visible = false;
      return;
    }
    // Items: redraw the single-tile sprite.
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, TILE_PX, TILE_PX);
    const tile = iconTileFor(id);
    ctx.drawImage(atlasCanvas, (tile % ATLAS_TILES) * TILE_PX, Math.floor(tile / ATLAS_TILES) * TILE_PX, TILE_PX, TILE_PX, 0, 0, TILE_PX, TILE_PX);
    this.texture.needsUpdate = true;
    this.sprite.visible = true;
    this.cube.visible = false;
  }

  /** Kick off one swing (re-triggers when already idle). */
  swing(): void {
    if (this.swingT >= 1) this.swingT = 0;
  }

  /**
   * Per-frame: walk bob plus the swing arc. `mining` retriggers the swing
   * continuously (hold-to-break feedback).
   */
  update(dt: number, walking: boolean, mining: boolean): void {
    if (!this.sprite.visible && !this.cube.visible) return;
    if (mining && this.swingT >= 1) this.swingT = 0;
    if (walking) this.bobT += dt * 9;
    const bob = walking ? Math.sin(this.bobT) * 0.014 : 0;
    let dip = 0;
    let tilt = 0;
    if (this.swingT < 1) {
      this.swingT = Math.min(1, this.swingT + dt / SWING_SECONDS);
      const arc = Math.sin(this.swingT * Math.PI);
      dip = arc * 0.16;
      tilt = arc * 0.9;
    }
    this.rig.position.set(BASE_POS.x, BASE_POS.y + bob - dip * 0.4, BASE_POS.z - dip);
    this.rig.rotation.set(BASE_ROT.x - tilt, BASE_ROT.y, BASE_ROT.z);
  }
}
