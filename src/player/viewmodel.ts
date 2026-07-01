/**
 * First-person held item: a camera-attached quad textured with the selected
 * item's atlas tile, bobbing while walking and swinging on clicks — the
 * classic viewmodel that makes "what am I holding / did my click register"
 * legible. Purely visual; no gameplay state lives here.
 */
import * as THREE from 'three';
import { ATLAS_TILES, TILE_PX } from '../engine/atlas';
import { iconTileFor } from '../world/items';

const BASE_POS = { x: 0.44, y: -0.38, z: -0.72 };
const SWING_SECONDS = 0.24;

export class ViewModel {
  private readonly mesh: THREE.Mesh;
  private readonly canvas: HTMLCanvasElement;
  private readonly texture: THREE.CanvasTexture;
  private shownId = -1;
  private bobT = 0;
  private swingT = 1; // >= 1 means idle

  constructor(camera: THREE.Camera) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = TILE_PX;
    this.canvas.height = TILE_PX;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
      depthTest: false, // always drawn over the world, like a real viewmodel
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), material);
    this.mesh.name = 'entity';
    this.mesh.renderOrder = 999;
    this.mesh.position.set(BASE_POS.x, BASE_POS.y, BASE_POS.z);
    this.mesh.rotation.set(0.1, -0.5, 0.12);
    this.mesh.visible = false;
    camera.add(this.mesh);
  }

  /** Show the selected item's tile (no-op when unchanged; hides on empty hand). */
  setItem(id: number, atlasCanvas: HTMLCanvasElement): void {
    if (id === this.shownId) return;
    this.shownId = id;
    this.mesh.visible = id > 0;
    if (id <= 0) return;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, TILE_PX, TILE_PX);
    const tile = iconTileFor(id);
    ctx.drawImage(atlasCanvas, (tile % ATLAS_TILES) * TILE_PX, Math.floor(tile / ATLAS_TILES) * TILE_PX, TILE_PX, TILE_PX, 0, 0, TILE_PX, TILE_PX);
    this.texture.needsUpdate = true;
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
    if (!this.mesh.visible) return;
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
    this.mesh.position.set(BASE_POS.x, BASE_POS.y + bob - dip * 0.4, BASE_POS.z - dip);
    this.mesh.rotation.set(0.1 - tilt, -0.5, 0.12);
  }
}
