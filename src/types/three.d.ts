/**
 * Minimal hand-vendored type declarations for the subset of three.js this
 * project uses. The three package ships no types and `@types/three` is outside
 * the allowed dependency list, so per the spec we vendor instead. Signatures
 * mirror three r180 exactly; extend this file when new API surface is needed.
 */
declare module 'three' {
  export type TypedArray =
    | Float32Array
    | Float64Array
    | Uint8Array
    | Uint8ClampedArray
    | Uint16Array
    | Uint32Array
    | Int8Array
    | Int16Array
    | Int32Array;

  export const NearestFilter: number;
  export const DoubleSide: number;
  export const FrontSide: number;
  export const SRGBColorSpace: string;

  export class Vector3 {
    x: number;
    y: number;
    z: number;
    constructor(x?: number, y?: number, z?: number);
    set(x: number, y: number, z: number): this;
    copy(v: Vector3): this;
  }

  export class Euler {
    x: number;
    y: number;
    z: number;
    order: string;
    set(x: number, y: number, z: number, order?: string): this;
  }

  export class Color {
    r: number;
    g: number;
    b: number;
    constructor(color?: string | number);
    set(color: string | number): this;
    setScalar(scalar: number): this;
    copy(c: Color): this;
    multiplyScalar(s: number): this;
    lerpColors(a: Color, b: Color, t: number): this;
    getHexString(): string;
  }

  export class Sphere {
    center: Vector3;
    radius: number;
    constructor(center?: Vector3, radius?: number);
  }

  export class Object3D {
    position: Vector3;
    rotation: Euler;
    visible: boolean;
    renderOrder: number;
    frustumCulled: boolean;
    matrixAutoUpdate: boolean;
    readonly children: Object3D[];
    updateMatrix(): void;
    add(...objects: Object3D[]): this;
    remove(...objects: Object3D[]): this;
    traverse(callback: (object: Object3D) => void): void;
  }

  export class Scene extends Object3D {
    fog: Fog | null;
  }

  export class PerspectiveCamera extends Object3D {
    fov: number;
    aspect: number;
    near: number;
    far: number;
    constructor(fov?: number, aspect?: number, near?: number, far?: number);
    updateProjectionMatrix(): void;
  }

  export class Fog {
    color: Color;
    near: number;
    far: number;
    constructor(color: Color | number | string, near?: number, far?: number);
  }

  export class BufferAttribute {
    constructor(array: TypedArray, itemSize: number, normalized?: boolean);
  }

  export class BufferGeometry {
    boundingSphere: Sphere | null;
    setAttribute(name: string, attribute: BufferAttribute): this;
    setIndex(index: BufferAttribute | null): this;
    computeBoundingSphere(): void;
    dispose(): void;
  }

  export class BoxGeometry extends BufferGeometry {
    constructor(width?: number, height?: number, depth?: number);
  }

  export class EdgesGeometry extends BufferGeometry {
    constructor(geometry: BufferGeometry, thresholdAngle?: number);
  }

  export class Texture {
    magFilter: number;
    minFilter: number;
    generateMipmaps: boolean;
    colorSpace: string;
    needsUpdate: boolean;
  }

  export class CanvasTexture extends Texture {
    constructor(canvas: HTMLCanvasElement);
  }

  export interface MaterialParameters {
    color?: Color | string | number;
    transparent?: boolean;
    opacity?: number;
    depthWrite?: boolean;
    side?: number;
    fog?: boolean;
  }

  export class Material {
    transparent: boolean;
    opacity: number;
    depthWrite: boolean;
    side: number;
    dispose(): void;
  }

  export interface MeshBasicMaterialParameters extends MaterialParameters {
    map?: Texture | null;
    vertexColors?: boolean;
    alphaTest?: number;
  }

  export class MeshBasicMaterial extends Material {
    color: Color;
    map: Texture | null;
    vertexColors: boolean;
    alphaTest: number;
    constructor(parameters?: MeshBasicMaterialParameters);
  }

  export interface LineBasicMaterialParameters extends MaterialParameters {
    linewidth?: number;
  }

  export class LineBasicMaterial extends Material {
    color: Color;
    constructor(parameters?: LineBasicMaterialParameters);
  }

  export class Mesh extends Object3D {
    geometry: BufferGeometry;
    material: Material;
    constructor(geometry?: BufferGeometry, material?: Material);
  }

  export class LineSegments extends Object3D {
    geometry: BufferGeometry;
    material: Material;
    constructor(geometry?: BufferGeometry, material?: Material);
  }

  export interface WebGLInfo {
    render: {
      calls: number;
      triangles: number;
      frame: number;
    };
    memory: {
      geometries: number;
      textures: number;
    };
  }

  export interface WebGLRendererParameters {
    canvas?: HTMLCanvasElement;
    antialias?: boolean;
  }

  export class WebGLRenderer {
    info: WebGLInfo;
    constructor(parameters?: WebGLRendererParameters);
    setPixelRatio(value: number): void;
    setSize(width: number, height: number, updateStyle?: boolean): void;
    setClearColor(color: Color | number | string, alpha?: number): void;
    render(scene: Object3D, camera: PerspectiveCamera): void;
  }
}
