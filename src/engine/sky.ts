/**
 * Procedural sky: a gradient dome, an orbiting sun/moon pair, and a seeded
 * night star field, replacing the old flat clear color. Everything is built
 * at unit scale inside one group that follows the player on (x, z) and is
 * scaled to ~far*0.92 via setRadius so it always fits the camera frustum.
 * All parts draw behind the world: negative renderOrder, no depth writes.
 *
 * Palette (sRGB triples, blended by the day/night brightness curve):
 * - day:   zenith "fjord azure"  (0.10, 0.32, 0.61)
 *          horizon "milk haze"   (0.62, 0.80, 0.90) — sits near the chunk fog
 *          color #8ecae6 so distant terrain fades into the horizon cleanly.
 * - night: zenith "void indigo"  (0.010, 0.014, 0.045)
 *          horizon "cold slate"  (0.075, 0.095, 0.15)
 * - dawn/dusk (brightness 0.25..0.55): the horizon warms toward
 *          "ember amber"         (0.93, 0.54, 0.22), peaking at 0.40.
 */
import * as THREE from 'three';
import { rngFromSeed } from '../world/noise';

/** An sRGB color triple in 0..1. */
export type Rgb = readonly [number, number, number];

const NIGHT_ZENITH: Rgb = [0.01, 0.014, 0.045];
const NIGHT_HORIZON: Rgb = [0.075, 0.095, 0.15];
const DAY_ZENITH: Rgb = [0.1, 0.32, 0.61];
const DAY_HORIZON: Rgb = [0.62, 0.8, 0.9];
const EMBER: Rgb = [0.93, 0.54, 0.22];
/** How strongly the dawn/dusk ember tints the horizon at its peak. */
const EMBER_STRENGTH = 0.8;
/** Brightness band in which dawn/dusk warming applies (peak in the middle). */
const DUSK_LO = 0.25;
const DUSK_PEAK = 0.4;
const DUSK_HI = 0.55;

/** How many stars the night sky carries. */
export const STAR_COUNT = 350;
/** Star shell radius in unit-dome space (just inside the dome surface). */
const STAR_SHELL = 0.96;
/** Minimum star elevation (unit y) so none straddle the horizon line. */
const STAR_MIN_Y = 0.03;
/** Sun/moon orbit radius in unit-dome space. */
const BODY_SHELL = 0.9;
const SUN_SIZE = 0.16;
const MOON_SIZE = 0.12;
const MOON_MAX_OPACITY = 0.9;
/** Used until the first setRadius; small enough for the shortest far plane. */
const DEFAULT_RADIUS = 100;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

function smoothstep(edge0: number, edge1: number, v: number): number {
  const t = clamp01((v - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function mix3(a: Rgb, b: Rgb, t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** The two dome gradient stops for a given brightness (see palette above). */
export function skyColors(brightness: number): { zenith: Rgb; horizon: Rgb } {
  const b = clamp01(brightness);
  // Full night below 0.15, full day above 0.95 (brightnessAt floors at 0.18).
  const t = smoothstep(0.15, 0.95, b);
  const zenith = mix3(NIGHT_ZENITH, DAY_ZENITH, t);
  let horizon = mix3(NIGHT_HORIZON, DAY_HORIZON, t);
  const ember = smoothstep(DUSK_LO, DUSK_PEAK, b) * (1 - smoothstep(DUSK_PEAK, DUSK_HI, b));
  horizon = mix3(horizon, EMBER, EMBER_STRENGTH * ember);
  return { zenith, horizon };
}

/**
 * Opacity of a celestial body from the sine of its altitude: fully visible a
 * little above the horizon, fading out just below it.
 */
export function horizonFade(sinAltitude: number): number {
  return clamp01((sinAltitude + 0.04) / 0.14);
}

/** Stars only show at night: opacity is (1 - brightness), clamped to 0..1. */
export function starOpacity(brightness: number): number {
  return clamp01(1 - brightness);
}

/**
 * Deterministic star positions: `count` points uniformly spread over the
 * upper hemisphere of radius `radius` (y kept off the horizon). Same seed,
 * same sky — the stream is salted so it never correlates with worldgen.
 */
export function starVertices(seed: string, count: number, radius: number): Float32Array {
  const rng = rngFromSeed(seed, 'sky:stars');
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Uniform-on-sphere: y uniform in [min, 1); azimuth uniform in [0, 2π).
    const y = STAR_MIN_Y + (1 - STAR_MIN_Y) * rng();
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = rng() * Math.PI * 2;
    out[i * 3] = Math.cos(phi) * r * radius;
    out[i * 3 + 1] = y * radius;
    out[i * 3 + 2] = Math.sin(phi) * r * radius;
  }
  return out;
}

const SKY_VERTEX = `
precision highp float;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
attribute vec3 position;
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAGMENT = `
precision highp float;
uniform vec3 zenithColor;
uniform vec3 horizonColor;
varying vec3 vDir;
void main() {
  // Height above the horizon; below it the horizon color fills the void.
  float h = clamp(normalize(vDir).y, 0.0, 1.0);
  float t = pow(h, 0.65); // widen the horizon band
  gl_FragColor = vec4(mix(horizonColor, zenithColor, t), 1.0);
}
`;

interface SkyUniforms {
  [uniform: string]: { value: unknown };
  zenithColor: { value: THREE.Color };
  horizonColor: { value: THREE.Color };
}

type SkyDomeMaterial = THREE.RawShaderMaterial & { uniforms: SkyUniforms };

export class Sky {
  /** Unit-scale root; scaled by setRadius, re-centred on the player. */
  private readonly group: THREE.Group;
  /** Sun/moon carrier; rotated about z by the day angle each frame. */
  private readonly orbit: THREE.Group;
  private readonly dome: SkyDomeMaterial;
  private readonly sunMaterial: THREE.MeshBasicMaterial;
  private readonly moonMaterial: THREE.MeshBasicMaterial;
  private readonly starMaterial: THREE.PointsMaterial;
  private readonly stars: THREE.Points;

  constructor(scene: THREE.Scene, seed: string) {
    this.group = new THREE.Group();
    this.group.name = 'entity';

    // 1. Gradient dome: inward-facing unit sphere, drawn first of everything.
    this.dome = new THREE.RawShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      uniforms: {
        zenithColor: { value: new THREE.Color() },
        horizonColor: { value: new THREE.Color() },
      },
      side: THREE.BackSide,
      depthWrite: false,
    }) as SkyDomeMaterial;
    const domeMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), this.dome);
    domeMesh.name = 'entity';
    domeMesh.frustumCulled = false;
    domeMesh.renderOrder = -3;
    this.group.add(domeMesh);

    // 3. Stars: fixed seeded directions on the upper hemisphere.
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(starVertices(seed, STAR_COUNT, STAR_SHELL), 3),
    );
    this.starMaterial = new THREE.PointsMaterial({
      color: '#dfe9ff',
      size: 1.6,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.stars = new THREE.Points(starGeometry, this.starMaterial);
    this.stars.name = 'entity';
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -2;
    this.group.add(this.stars);

    // 2. Sun and moon: quads on opposite ends of one rotating carrier, each
    // pre-rotated to face the dome center (the camera) at all orbit angles.
    this.orbit = new THREE.Group();
    this.orbit.name = 'entity';
    this.sunMaterial = new THREE.MeshBasicMaterial({
      color: '#ffe7b3', // warm white-gold
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const sun = new THREE.Mesh(new THREE.PlaneGeometry(SUN_SIZE, SUN_SIZE), this.sunMaterial);
    sun.name = 'entity';
    sun.frustumCulled = false;
    sun.renderOrder = -1;
    sun.position.set(BODY_SHELL, 0, 0);
    sun.rotation.set(0, -Math.PI / 2, 0); // plane normal +z -> -x (inward)

    this.moonMaterial = new THREE.MeshBasicMaterial({
      color: '#cdd6e4', // pale silver
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const moon = new THREE.Mesh(new THREE.PlaneGeometry(MOON_SIZE, MOON_SIZE), this.moonMaterial);
    moon.name = 'entity';
    moon.frustumCulled = false;
    moon.renderOrder = -1;
    moon.position.set(-BODY_SHELL, 0, 0);
    moon.rotation.set(0, Math.PI / 2, 0); // plane normal +z -> +x (inward)

    this.orbit.add(sun, moon);
    this.group.add(this.orbit);

    this.setRadius(DEFAULT_RADIUS);
    scene.add(this.group);
  }

  /** Fit the sky inside the camera far plane (callers pass ~far * 0.92). */
  setRadius(radius: number): void {
    const r = Math.max(1, radius);
    this.group.scale.set(r, r, r);
  }

  /**
   * Per-frame: rotate sun (angle = dayFraction*2π, east -> zenith -> west in
   * the x/y plane) with the moon opposite, fade bodies at the horizon, show
   * stars by darkness, drive the gradient stops, and follow the player.
   */
  update(dayFraction: number, brightness: number, x: number, z: number): void {
    const angle = dayFraction * Math.PI * 2;
    this.orbit.rotation.set(0, 0, angle);
    const sinAltitude = Math.sin(angle);
    this.sunMaterial.opacity = horizonFade(sinAltitude);
    this.moonMaterial.opacity = MOON_MAX_OPACITY * horizonFade(-sinAltitude);

    const starAlpha = starOpacity(brightness);
    this.starMaterial.opacity = starAlpha;
    this.stars.visible = starAlpha > 0.02;

    const { zenith, horizon } = skyColors(brightness);
    this.dome.uniforms.zenithColor.value.setRGB(zenith[0], zenith[1], zenith[2]);
    this.dome.uniforms.horizonColor.value.setRGB(horizon[0], horizon[1], horizon[2]);

    // Follow the player horizontally; the world's vertical range is small
    // relative to the dome, so the center stays at y=0.
    this.group.position.set(x, 0, z);
  }
}
