/**
 * Chunk shader materials. A small raw shader replaces MeshBasicMaterial so
 * the two baked light channels combine per-pixel with the live day/night
 * brightness: final = albedo × tint × max(blockLight, skyLight × brightness).
 * Fog is applied manually (gamma-space, matching the sky clear color).
 */
import * as THREE from 'three';

const VERTEX = `
precision highp float;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
attribute vec3 position;
attribute vec2 uv;
attribute vec3 color;
attribute vec2 light;
varying vec2 vUv;
varying vec3 vColor;
varying vec2 vLight;
varying float vDepth;
varying vec3 vPos;
void main() {
  vUv = uv;
  vColor = color;
  vLight = light;
  vPos = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

function fragment(kind: 'opaque' | 'cutout' | 'water'): string {
  return `
precision highp float;
uniform sampler2D map;
uniform float uBrightness;
uniform float uTime;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
varying vec2 vUv;
varying vec3 vColor;
varying vec2 vLight;
varying float vDepth;
varying vec3 vPos;
void main() {
  vec4 tex = texture2D(map, vUv);
${kind === 'cutout' ? '  if (tex.a < 0.5) discard;' : ''}
  float lit = max(vLight.y, vLight.x * uBrightness);
  lit = max(lit, 0.04);
${kind === 'water' ? '  // Rolling shimmer anchored to mesh space (not UVs), so waves travel\n  // across the surface instead of stamping one stripe onto every face.\n  lit *= 0.92 + 0.05 * sin(uTime * 1.7 + (vPos.x + vPos.z) * 0.9) + 0.03 * sin(uTime * 2.6 - vPos.x * 1.3 + vPos.z * 0.7);' : ''}
  vec3 col = tex.rgb * vColor * lit;
  // Warm torch/lantern glow: where block light beats the (dimmed) sky light,
  // shift the palette toward firelight — caves and nights get golden pools.
  float warm = clamp(vLight.y - vLight.x * uBrightness, 0.0, 1.0);
  col *= mix(vec3(1.0), vec3(1.16, 1.02, 0.82), warm);
  // Cheap gamma encode (the texture sampler decodes sRGB to linear).
  col = sqrt(col);
  float f = clamp((vDepth - fogNear) / (fogFar - fogNear), 0.0, 1.0);
  gl_FragColor = vec4(mix(col, fogColor, f), ${kind === 'water' ? 'tex.a' : '1.0'});
}
`;
}

export interface ChunkUniforms {
  [uniform: string]: { value: unknown };
  map: { value: THREE.Texture | null };
  uBrightness: { value: number };
  uTime: { value: number };
  fogColor: { value: THREE.Color };
  fogNear: { value: number };
  fogFar: { value: number };
}

export type ChunkMaterial = THREE.RawShaderMaterial & { uniforms: ChunkUniforms };

export interface ChunkMaterialSet {
  opaque: ChunkMaterial;
  cutout: ChunkMaterial;
  water: ChunkMaterial;
}

function makeUniforms(): ChunkUniforms {
  return {
    map: { value: null },
    uBrightness: { value: 1 },
    uTime: { value: 0 },
    fogColor: { value: new THREE.Color('#8ecae6') },
    fogNear: { value: 70 },
    fogFar: { value: 122 },
  };
}

function make(kind: 'opaque' | 'cutout' | 'water'): ChunkMaterial {
  const material = new THREE.RawShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: fragment(kind),
    uniforms: makeUniforms(),
  }) as ChunkMaterial;
  if (kind === 'water') {
    material.transparent = true;
    material.depthWrite = false;
    material.side = THREE.DoubleSide;
  } else if (kind === 'cutout') {
    // Double-sided so plant cross-quads show from behind (and leaf/glass
    // interiors read correctly when peered into).
    material.side = THREE.DoubleSide;
  }
  return material;
}

/** The three shared chunk materials; every chunk mesh reuses these. */
export function createChunkMaterials(): ChunkMaterialSet {
  return { opaque: make('opaque'), cutout: make('cutout'), water: make('water') };
}
