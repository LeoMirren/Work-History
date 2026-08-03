/**
 * Programmatically-readable debug state, exposed on window.__debug so
 * acceptance checks can poll it from the console or automation.
 */
export interface DebugInfo {
  fps: number;
  x: number;
  y: number;
  z: number;
  facing: string;
  chunkX: number;
  chunkZ: number;
  chunksLoaded: number;
  chunksMeshed: number;
  genQueued: number;
  meshQueued: number;
  jobsInFlight: number;
  uploadsQueued: number;
  triangles: number;
  drawCalls: number;
  geometries: number;
}

declare global {
  interface Window {
    __debug: DebugInfo;
  }
}

export const debugInfo: DebugInfo = {
  fps: 0,
  x: 0,
  y: 0,
  z: 0,
  facing: 'N 0°',
  chunkX: 0,
  chunkZ: 0,
  chunksLoaded: 0,
  chunksMeshed: 0,
  genQueued: 0,
  meshQueued: 0,
  jobsInFlight: 0,
  uploadsQueued: 0,
  triangles: 0,
  drawCalls: 0,
  geometries: 0,
};

export function exposeDebug(): void {
  window.__debug = debugInfo;
}

/** 1-second rolling FPS counter. Call tick() once per rendered frame. */
export class FpsCounter {
  private frames = 0;
  private windowStart = performance.now();
  fps = 0;

  tick(): void {
    this.frames++;
    const now = performance.now();
    const elapsed = now - this.windowStart;
    if (elapsed >= 1000) {
      this.fps = Math.round((this.frames * 1000) / elapsed);
      this.frames = 0;
      this.windowStart = now;
      debugInfo.fps = this.fps;
    }
  }
}
