/**
 * Player look state and movement intent. M1 scope: mouse look plus a no-clip
 * fly camera (no collision). Real physics integration arrives in M3.
 */
import type { PerspectiveCamera } from 'three';
import type { Input } from '../engine/input';

const PITCH_LIMIT = Math.PI / 2 - 0.01;
const NOCLIP_SPEED = 18;

export class PlayerController {
  x = 0;
  y = 0;
  z = 0;
  /** yaw 0 looks toward -Z; positive pitch looks up. */
  yaw = 0;
  pitch = 0;

  setPosition(x: number, y: number, z: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  look(dx: number, dy: number, sensitivity: number): void {
    this.yaw -= dx * sensitivity;
    this.pitch -= dy * sensitivity;
    if (this.pitch > PITCH_LIMIT) this.pitch = PITCH_LIMIT;
    if (this.pitch < -PITCH_LIMIT) this.pitch = -PITCH_LIMIT;
  }

  /** Free flight along the view plane; Space/Shift move straight up/down. */
  noclipUpdate(input: Input, dt: number): void {
    const fwd = (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0);
    const strafe = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
    const up = (input.isDown('Space') ? 1 : 0) - (input.isDown('ShiftLeft') ? 1 : 0);
    const len = Math.hypot(fwd, strafe);
    if (len > 0) {
      const fx = -Math.sin(this.yaw) / len;
      const fz = -Math.cos(this.yaw) / len;
      const rx = Math.cos(this.yaw) / len;
      const rz = -Math.sin(this.yaw) / len;
      this.x += (fx * fwd + rx * strafe) * NOCLIP_SPEED * dt;
      this.z += (fz * fwd + rz * strafe) * NOCLIP_SPEED * dt;
    }
    this.y += up * NOCLIP_SPEED * dt;
  }

  applyToCamera(camera: PerspectiveCamera): void {
    camera.position.set(this.x, this.y, this.z);
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
