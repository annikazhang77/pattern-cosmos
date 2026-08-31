import { Html, Line, OrbitControls, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type {
  ChangedOrbit,
  CosmicEventState,
  DefaultFutureProjection,
  DrawnOrbitPath,
  FutureChoiceDraft,
  FutureChoicePosition,
  GenesisBirth,
  InteractionMode,
  OrbitDrawStage,
  OrbitState,
  Pattern,
} from "./types";

interface ThreeCosmosViewProps {
  patterns: Pattern[];
  selectedPatternId: string | null;
  onSelectPattern: (patternId: string) => void;
  futureChoice: FutureChoiceDraft | null;
  projections: Record<string, DefaultFutureProjection>;
  changedOrbits: Record<string, ChangedOrbit>;
  orbitStates: Record<string, OrbitState>;
  drawnOrbits: Record<string, DrawnOrbitPath>;
  orbitDrawStage: OrbitDrawStage;
  cosmicEvent: CosmicEventState | null;
  onOrbitDrawStart: () => void;
  onOrbitDrawSpeed: (speed: number) => void;
  onOrbitDrawCancel: () => void;
  onOrbitDrawComplete: (points: FutureChoicePosition[], endpoint: FutureChoicePosition) => void;
  interactionMode: InteractionMode;
  genesisBirths: GenesisBirth[];
  emergingPatternId: string | null;
}

type TrajectoryMode = "hidden" | "current" | "drawing" | "changed";

interface NebulaSpec {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  colors: [string, string, string];
}

interface FocusFrame {
  position: [number, number, number];
  normal: [number, number, number];
  right: [number, number, number];
}

type VisualPresetName = "BASELINE" | "A" | "B" | "C" | "D" | "D2";

interface VisualPreset {
  name: VisualPresetName;
  main: NebulaSpec;
  cloudOpacity: [number, number];
  emissionOpacity: number;
  densityBias: number;
  colorGain: number;
  saturation: number;
  emissionGain: number;
  bloomIntensity: number;
  bloomThreshold: number;
  exposure: number;
  camera: [number, number, number];
  fov: number;
  starMultiplier: number;
  starOpacity: number;
}

const SATELLITE_NEBULAE: NebulaSpec[] = [
  {
    position: [4.55, -1.8, -4.2],
    rotation: [-0.34, 0.46, 0.32],
    scale: [0.76, 0.58, 0.6],
    colors: ["#ffad3d", "#e73556", "#47bde8"],
  },
  {
    position: [4.75, 3.25, -6.1],
    rotation: [0.46, -0.2, 0.64],
    scale: [0.6, 0.46, 0.5],
    colors: ["#50cdf2", "#a858d8", "#ee6b55"],
  },
];

const UNIVERSE_ROTATION: [number, number, number] = [0.02, -0.06, -0.015];

const VISUAL_PRESETS: Record<VisualPresetName, VisualPreset> = {
  BASELINE: {
    name: "BASELINE",
    main: {
      position: [-1.45, 0.4, 1.1],
      rotation: [0.2, -0.38, -0.18],
      scale: [1.72, 1.3, 1.2],
      colors: ["#21d4ff", "#f03b78", "#ffb34f"],
    },
    cloudOpacity: [0.96, 0.52],
    emissionOpacity: 0.16,
    densityBias: 0.015,
    colorGain: 1.08,
    saturation: 1.08,
    emissionGain: 1.0,
    bloomIntensity: 0.86,
    bloomThreshold: 0.66,
    exposure: 1.12,
    camera: [0.25, 0.35, 14.8],
    fov: 47,
    starMultiplier: 0.78,
    starOpacity: 0.76,
  },
  A: {
    name: "A",
    main: {
      position: [-1.15, 0.28, 2.55],
      rotation: [0.2, -0.38, -0.18],
      scale: [2.42, 1.83, 1.48],
      colors: ["#17d9ff", "#ff275f", "#ff9a32"],
    },
    cloudOpacity: [1.48, 0.88],
    emissionOpacity: 0.4,
    densityBias: 0.052,
    colorGain: 1.42,
    saturation: 1.55,
    emissionGain: 2.15,
    bloomIntensity: 1.15,
    bloomThreshold: 0.5,
    exposure: 1.22,
    camera: [0.25, 0.35, 14.6],
    fov: 46,
    starMultiplier: 0.92,
    starOpacity: 0.84,
  },
  B: {
    name: "B",
    main: {
      position: [-1.52, 0.34, 2.15],
      rotation: [0.2, -0.38, -0.18],
      scale: [2.16, 1.62, 1.4],
      colors: ["#25c3df", "#d94378", "#d99843"],
    },
    cloudOpacity: [1.2, 0.64],
    emissionOpacity: 0.25,
    densityBias: 0.026,
    colorGain: 1.18,
    saturation: 1.22,
    emissionGain: 1.32,
    bloomIntensity: 0.82,
    bloomThreshold: 0.64,
    exposure: 1.1,
    camera: [0.25, 0.35, 14.6],
    fov: 46,
    starMultiplier: 0.84,
    starOpacity: 0.76,
  },
  C: {
    name: "C",
    main: {
      position: [-1.34, 0.32, 2.34],
      rotation: [0.2, -0.38, -0.18],
      scale: [2.3, 1.72, 1.44],
      colors: ["#1bcfe9", "#ea376f", "#efa044"],
    },
    cloudOpacity: [1.26, 0.7],
    emissionOpacity: 0.28,
    densityBias: 0.039,
    colorGain: 1.2,
    saturation: 1.28,
    emissionGain: 1.42,
    bloomIntensity: 0.92,
    bloomThreshold: 0.6,
    exposure: 1.14,
    camera: [0.25, 0.35, 14.6],
    fov: 46,
    starMultiplier: 0.88,
    starOpacity: 0.8,
  },
  D: {
    // D deliberately inherits A's framing and scene energy. The controlled
    // variable is the dominant nebula renderer, not its position or camera.
    name: "D",
    main: {
      position: [-1.15, 0.28, 2.55],
      rotation: [0.2, -0.38, -0.18],
      scale: [2.42, 1.83, 1.48],
      colors: ["#17d9ff", "#ff275f", "#ff9a32"],
    },
    cloudOpacity: [1.48, 0.88],
    emissionOpacity: 0.4,
    densityBias: 0.052,
    colorGain: 1.42,
    saturation: 1.55,
    emissionGain: 2.15,
    bloomIntensity: 0.78,
    bloomThreshold: 0.7,
    exposure: 1.08,
    camera: [0.05, 0.18, 12.3],
    fov: 42,
    starMultiplier: 0.92,
    starOpacity: 0.84,
  },
  D2: {
    // D2 keeps D's exact front view and photographic balance. Its only new
    // variable is pseudo-depth slicing plus a protected orbit range.
    name: "D2",
    main: {
      position: [-1.15, 0.28, 2.55],
      rotation: [0.2, -0.38, -0.18],
      scale: [2.42, 1.83, 1.48],
      colors: ["#17d9ff", "#ff275f", "#ff9a32"],
    },
    cloudOpacity: [1.48, 0.88],
    emissionOpacity: 0.4,
    densityBias: 0.052,
    colorGain: 1.42,
    saturation: 1.55,
    emissionGain: 2.15,
    bloomIntensity: 0.78,
    bloomThreshold: 0.7,
    exposure: 1.08,
    camera: [0.25, 0.35, 14.6],
    fov: 46,
    starMultiplier: 0.92,
    starOpacity: 0.84,
  },
};

function resolveVisualPreset(): VisualPreset {
  const requested = new URLSearchParams(window.location.search)
    .get("visualPreset")
    ?.toUpperCase();
  if (
    requested === "A"
    || requested === "B"
    || requested === "C"
    || requested === "D"
    || requested === "D2"
  ) {
    return VISUAL_PRESETS[requested];
  }
  // D is the approved and frozen production renderer. Other presets remain
  // queryable only as visual research controls.
  return VISUAL_PRESETS.D;
}

const vertexShader = `
  attribute float aSize;
  attribute float aOpacity;
  attribute float aPhase;
  varying vec3 vColor;
  varying float vOpacity;
  varying float vPhase;
  uniform float uPixelRatio;
  uniform float uSelected;
  uniform float uVisibility;
  uniform float uTime;
  uniform float uCollapse;

  void main() {
    vColor = color;
    vOpacity = aOpacity * mix(0.82, 1.26, uSelected) * uVisibility;
    vPhase = aPhase;
    vec3 drifted = position;
    drifted.y += sin(position.x * 1.7 + aPhase * 6.283 + uTime * 0.08) * 0.018;
    float collapseAngle = atan(position.y * 2.4, position.x);
    float collapseRing = 1.12 + sin(collapseAngle * 5.0 + aPhase * 9.0) * 0.12;
    vec3 collapsedPosition = vec3(
      cos(collapseAngle) * collapseRing,
      sin(collapseAngle) * collapseRing * 0.34,
      position.z * 0.18
    );
    drifted = mix(drifted, collapsedPosition, uCollapse);
    vec4 mvPosition = modelViewMatrix * vec4(drifted, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float depthScale = clamp(115.0 / -mvPosition.z, 4.0, 24.0);
    gl_PointSize = aSize * uPixelRatio * depthScale;
  }
`;

const fragmentShader = `
  varying vec3 vColor;
  varying float vOpacity;
  varying float vPhase;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float angle = atan(uv.y, uv.x);
    float radius = length(uv);
    float edgeNoise = sin(angle * 5.0 + vPhase * 18.0) * 0.045;
    edgeNoise += (hash21(floor((uv + vPhase) * 11.0)) - 0.5) * 0.05;
    float softShape = 1.0 - smoothstep(0.08, 0.49 + edgeNoise, radius);
    float alpha = pow(softShape, 2.1) * vOpacity;
    if (alpha < 0.012) discard;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

const starVertexShader = `
  attribute float aSize;
  attribute float aOpacity;
  attribute float aPhase;
  varying vec3 vColor;
  varying float vOpacity;
  varying float vPhase;
  varying float vHalo;
  uniform float uPixelRatio;
  uniform float uTime;

  void main() {
    vColor = color;
    vPhase = aPhase;
    float twinkle = 0.96 + sin(uTime * (0.16 + aPhase * 0.17) + aPhase * 31.0) * 0.04;
    vOpacity = aOpacity * twinkle;
    vHalo = step(1.18, aSize);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float depthScale = clamp(74.0 / max(2.0, -mvPosition.z), 1.2, 8.0);
    gl_PointSize = clamp(aSize * uPixelRatio * depthScale, 1.0, 11.0);
  }
`;

const starFragmentShader = `
  varying vec3 vColor;
  varying float vOpacity;
  varying float vPhase;
  varying float vHalo;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float radius = length(point);
    if (radius > 0.5) discard;
    float core = 1.0 - smoothstep(0.035, 0.28, radius);
    float body = 1.0 - smoothstep(0.12, 0.47, radius);
    float halo = (1.0 - smoothstep(0.18, 0.5, radius)) * vHalo * 0.28;
    float alpha = (core * 0.82 + body * 0.62 + halo) * vOpacity;
    if (alpha < 0.008) discard;
    gl_FragColor = vec4(vColor * (1.0 + vHalo * 0.2), alpha);
  }
`;

const cloudVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const cloudFragmentShader = `
  precision highp float;
  varying vec2 vUv;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform float uTime;
  uniform float uSeed;
  uniform float uOpacity;
  uniform float uSelected;
  uniform float uVisibility;
  uniform float uDensityBias;
  uniform float uColorGain;
  uniform float uSaturation;
  uniform float uEmissionGain;
  uniform float uCollapse;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise2d(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.52;
    mat2 rotation = mat2(0.82, -0.57, 0.57, 0.82);
    for (int octave = 0; octave < 6; octave++) {
      value += amplitude * noise2d(p);
      p = rotation * p * 2.01 + vec2(8.7, 3.4);
      amplitude *= 0.485;
    }
    return value;
  }

  void main() {
    vec2 centered = (vUv - 0.5) * vec2(1.0, 1.34);
    float collapseRadius = length(centered);
    float collapseAngle = atan(centered.y, centered.x);
    float collapseSwirl = uCollapse * (1.2 - smoothstep(0.12, 0.72, collapseRadius));
    vec2 collapsedUv = vec2(cos(collapseAngle + collapseSwirl), sin(collapseAngle + collapseSwirl));
    collapsedUv /= vec2(1.0, 1.34);
    collapsedUv = 0.5 + collapsedUv * mix(collapseRadius, 0.34 + (collapseRadius - 0.3) * 0.3, uCollapse);
    vec2 p = (mix(vUv, collapsedUv, uCollapse) - 0.5) * vec2(2.62, 1.78);
    float slowTime = uTime * 0.009;
    vec2 warp = vec2(
      fbm(p * 0.82 + vec2(uSeed * 3.1 + slowTime, 1.7)),
      fbm(p * 0.82 + vec2(5.2, uSeed * 2.2 - slowTime))
    );
    vec2 warped = p + (warp - 0.5) * 1.06;
    vec2 curl = vec2(
      fbm(warped * 1.28 + warp * 2.1 + vec2(3.7, uSeed)),
      fbm(warped * 1.28 - warp.yx * 1.9 + vec2(uSeed, 7.3))
    );
    warped += (curl - 0.5) * 0.52;

    float broad = fbm(warped * 0.98 + vec2(uSeed * 2.3, 1.7));
    float middle = fbm(warped * 2.28 + curl * 1.75 + vec2(2.1, uSeed * 4.2));
    float detail = fbm(warped * 5.15 + vec2(middle * 1.4, broad * 1.8));
    float densityField = broad * 0.64 + middle * 0.29 + detail * 0.07;
    float density = smoothstep(0.41 - uDensityBias, 0.69 - uDensityBias * 0.34, densityField);
    float softCore = smoothstep(0.55, 0.76, broad * 0.7 + middle * 0.3);
    float emission = pow(smoothstep(0.58, 0.79, middle * 0.54 + broad * 0.46), 2.1);

    float lobeA = 1.0 - smoothstep(0.34, 1.08, length((p - vec2(-0.52, 0.16)) * vec2(0.78, 1.16)) + (broad - 0.5) * 0.48);
    float lobeB = 1.0 - smoothstep(0.3, 0.92, length((p - vec2(0.42, -0.16)) * vec2(0.88, 1.24)) + (middle - 0.5) * 0.42);
    float lobeC = 1.0 - smoothstep(0.22, 0.76, length((p - vec2(0.04, 0.38)) * vec2(1.12, 0.92)) + (warp.y - 0.5) * 0.36);
    float edge = max(lobeA, max(lobeB * 0.92, lobeC * 0.72));
    float dustField = fbm(warped * 1.86 + curl * 0.9 + vec2(uSeed * 7.0, 2.8));
    float dustContour = abs(dustField - 0.49);
    float dustLane = 1.0 - smoothstep(0.03, 0.12, dustContour);
    dustLane *= smoothstep(0.37, 0.72, broad + middle * 0.22);
    float cavities = smoothstep(0.29, 0.72, middle * 0.72 + detail * 0.28);
    float borderDistance = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    float borderFade = smoothstep(0.0, 0.2, borderDistance);
    float structure = density * mix(0.66, 1.0, cavities);
    float alpha = structure * edge * borderFade * (1.0 - dustLane * 0.94);
    float collapseRing = exp(-pow((collapseRadius - 0.29) / 0.085, 2.0));
    float collapseFlare = smoothstep(0.08, 0.48, uCollapse) * (1.0 - smoothstep(0.58, 0.94, uCollapse));
    alpha *= uOpacity * mix(0.92, 1.34, uSelected) * uVisibility;
    alpha *= mix(1.0, collapseRing, uCollapse * 0.94);

    float colorZone = fbm(warped * 0.82 + vec2(7.2, uSeed * 3.7));
    vec3 color = mix(uColorA, uColorC, smoothstep(0.48, 0.78, colorZone));
    float emissionRegion = smoothstep(0.58, 0.81, middle + broad * 0.14);
    color = mix(color, uColorB, emissionRegion * 0.74);
    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(vec3(luminance), color, uSaturation);
    float luminousKnots = pow(smoothstep(0.48, 0.88, emissionRegion * 0.74 + emission * 0.62), 1.35);
    color *= (0.3 + density * 1.08 + softCore * 0.72 + emission * 1.48 + luminousKnots * uEmissionGain) * uColorGain;
    color *= mix(0.17, 1.0, 1.0 - dustLane);
    color *= 1.0 + collapseFlare * 0.82 + collapseRing * uCollapse * 0.28;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

const hybridNebulaVertexShader = `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uLayer;
  uniform float uCollapse;

  void main() {
    vUv = uv;
    vec3 shaped = position;
    float slow = uTime * 0.025 + uLayer * 1.91;
    float broadBend = sin(uv.x * 5.1 + slow) * cos(uv.y * 4.3 - slow * 0.7);
    float fineBend = sin((uv.x + uv.y) * 13.0 - slow * 1.3) * 0.35;
    shaped.z += (broadBend + fineBend) * (0.035 + uLayer * 0.012);
    float radius = length(shaped.xy);
    float pull = mix(1.0, mix(0.47, 0.78, smoothstep(0.7, 3.0, radius)), uCollapse);
    float twist = uCollapse * (1.18 - smoothstep(0.4, 3.2, radius)) * (1.0 + uLayer * 0.09);
    float cosine = cos(twist);
    float sine = sin(twist);
    shaped.xy = mat2(cosine, -sine, sine, cosine) * shaped.xy * pull;
    shaped.z += sin(radius * 2.7 + uLayer * 1.3) * uCollapse * 0.08;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(shaped, 1.0);
  }
`;

const hybridNebulaFragmentShader = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTexture;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform float uTime;
  uniform float uLayer;
  uniform float uOpacity;
  uniform float uSelected;
  uniform float uVisibility;
  uniform float uCollapse;
  uniform vec2 uUvOffset;
  uniform vec2 uUvScale;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise2d(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float photoLuma(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
  }

  void main() {
    float slow = uTime * 0.006;
    vec2 collapsePoint = (vUv - 0.5) * vec2(1.0, 1.22);
    float collapseRadius = length(collapsePoint);
    float collapseAngle = atan(collapsePoint.y, collapsePoint.x);
    float ringRadius = 0.29 + sin(collapseAngle * 4.0 - uTime * 0.09 + uLayer) * 0.012;
    float sourceRadius = mix(collapseRadius, 0.39 + (collapseRadius - ringRadius) * 0.34, uCollapse);
    float polarTwist = uCollapse * (1.4 - smoothstep(0.12, 0.7, collapseRadius)) + uLayer * 0.035;
    vec2 collapseUv = vec2(cos(collapseAngle + polarTwist), sin(collapseAngle + polarTwist));
    collapseUv /= vec2(1.0, 1.22);
    collapseUv = 0.5 + collapseUv * sourceRadius;
    vec2 flow = vec2(
      noise2d(vUv * 3.4 + vec2(slow, uLayer * 2.7)),
      noise2d(vUv * 3.1 + vec2(8.2 + uLayer, -slow))
    ) - 0.5;
    vec2 baseUv = mix(vUv, collapseUv, uCollapse);
    vec2 uv = (baseUv - 0.5) * uUvScale + 0.5 + uUvOffset + flow * (0.009 + uLayer * 0.002);
    if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) discard;

    vec2 texel = vec2(1.0 / 1757.0, 1.0 / 1417.0);
    vec3 raw = texture2D(uTexture, uv).rgb;
    vec3 nearA = texture2D(uTexture, uv + vec2(texel.x * 14.0, 0.0)).rgb;
    vec3 nearB = texture2D(uTexture, uv - vec2(texel.x * 14.0, 0.0)).rgb;
    vec3 nearC = texture2D(uTexture, uv + vec2(0.0, texel.y * 14.0)).rgb;
    vec3 nearD = texture2D(uTexture, uv - vec2(0.0, texel.y * 14.0)).rgb;
    vec3 blur = (raw * 2.0 + nearA + nearB + nearC + nearD) / 6.0;

    float rawLum = photoLuma(raw);
    float nearLum = photoLuma((nearA + nearB + nearC + nearD) * 0.25);
    float chroma = max(raw.r, max(raw.g, raw.b)) - min(raw.r, min(raw.g, raw.b));
    float borderDistance = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    float borderFade = smoothstep(0.0, 0.14, borderDistance);
    float asymmetricMask = smoothstep(
      0.04,
      0.34,
      photoLuma(blur) + chroma * 0.42 + (noise2d(vUv * 5.2 + 2.0) - 0.5) * 0.11
    );

    vec3 mapped = uColorA * raw.b + uColorB * raw.r + uColorC * raw.g;
    mapped /= max(0.38, raw.r + raw.g + raw.b);
    mapped = mix(raw, mapped, 0.22);
    float selectGain = mix(1.0, 1.18, uSelected);
    float alpha = 0.0;
    vec3 color = mapped;

    if (uLayer < 0.5) {
      color = mix(blur, mapped, 0.22) * 0.48;
      alpha = smoothstep(0.02, 0.36, photoLuma(blur) + chroma * 0.12) * 0.2;
    } else if (uLayer < 1.5) {
      float gas = smoothstep(0.018, 0.44, rawLum + chroma * 0.24);
      float filament = smoothstep(0.012, 0.14, abs(rawLum - nearLum) + chroma * 0.08);
      color = mapped * (0.72 + gas * 0.5 + filament * 0.12);
      alpha = gas * (0.66 + filament * 0.08);
    } else if (uLayer < 2.5) {
      float core = pow(smoothstep(0.2, 0.72, nearLum + chroma * 0.08), 1.65);
      color = mix(mapped, vec3(1.0, 0.88, 0.72), core * 0.14) * (0.88 + core * 0.48);
      alpha = core * 0.32;
    } else {
      float localCanyon = smoothstep(0.04, 0.2, nearLum - rawLum);
      float dust = localCanyon * smoothstep(0.1, 0.46, nearLum + chroma * 0.08);
      color = vec3(0.002, 0.006, 0.013);
      alpha = dust * 0.18;
    }

    float collapseRing = exp(-pow((collapseRadius - ringRadius) / 0.09, 2.0));
    float collapseFlare = smoothstep(0.08, 0.48, uCollapse) * (1.0 - smoothstep(0.58, 0.94, uCollapse));
    alpha *= borderFade * asymmetricMask * uOpacity * selectGain * uVisibility;
    alpha *= mix(1.0, collapseRing * (0.9 + chroma * 0.46), uCollapse * 0.94);
    color *= 1.0 + collapseFlare * 0.78 + uCollapse * collapseRing * 0.26;
    float darkCore = 1.0 - smoothstep(0.09, 0.145, collapseRadius);
    if (uLayer > 0.5 && uLayer < 1.5) {
      color = mix(color, vec3(0.001, 0.002, 0.004), darkCore * uCollapse);
      alpha = max(alpha, darkCore * uCollapse * 0.985);
    }
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

const depthSliceVertexShader = `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uSliceDepth;
  uniform float uSeed;

  void main() {
    vUv = uv;
    vec3 shaped = position;
    float slow = uTime * 0.018 + uSeed * 7.0;
    float broad = sin(uv.x * 4.7 + slow) * cos(uv.y * 4.1 - slow * 0.73);
    float filament = sin((uv.x - uv.y) * 11.0 + uSeed * 9.0) * 0.28;
    shaped.z += (broad + filament) * (0.018 + uSliceDepth * 0.014);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(shaped, 1.0);
  }
`;

const depthSliceFragmentShader = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTexture;
  uniform sampler2D uDepthMap;
  uniform sampler2D uStarMask;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform float uTime;
  uniform float uSliceDepth;
  uniform float uSeed;
  uniform float uSelected;
  uniform float uVisibility;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise2d(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float photoDepthLuma(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
  }

  void main() {
    float slow = uTime * 0.0035;
    vec2 flow = vec2(
      noise2d(vUv * 3.1 + vec2(uSeed * 8.0 + slow, 1.3)),
      noise2d(vUv * 3.3 + vec2(7.1, uSeed * 6.0 - slow))
    ) - 0.5;
    vec2 uv = vUv + flow * (0.0022 + uSliceDepth * 0.0012);
    if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) discard;

    vec2 texel = vec2(1.0 / 1757.0, 1.0 / 1417.0);
    vec3 raw = texture2D(uTexture, uv).rgb;
    vec3 blur = (
      raw * 2.0
      + texture2D(uTexture, uv + vec2(texel.x * 12.0, 0.0)).rgb
      + texture2D(uTexture, uv - vec2(texel.x * 12.0, 0.0)).rgb
      + texture2D(uTexture, uv + vec2(0.0, texel.y * 12.0)).rgb
      + texture2D(uTexture, uv - vec2(0.0, texel.y * 12.0)).rgb
    ) / 6.0;
    float depth = texture2D(uDepthMap, uv).r;
    float photoStar = texture2D(uStarMask, uv).r;
    float rawLum = photoDepthLuma(raw);
    float chroma = max(raw.r, max(raw.g, raw.b)) - min(raw.r, min(raw.g, raw.b));

    float sliceDistance = (depth - uSliceDepth) * 9.5;
    float sliceBand = exp(-sliceDistance * sliceDistance);
    float softDensity = smoothstep(0.018, 0.42, rawLum + chroma * 0.2);
    softDensity = max(softDensity, smoothstep(0.28, 0.82, depth) * 0.22);
    float breakup = mix(
      0.82,
      1.12,
      noise2d(vUv * 4.2 + vec2(uSeed * 13.0, uSliceDepth * 9.0))
    );
    float borderDistance = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    float borderFade = smoothstep(0.0, 0.13, borderDistance);

    vec3 mapped = uColorA * raw.b + uColorB * raw.r + uColorC * raw.g;
    mapped /= max(0.42, raw.r + raw.g + raw.b);
    vec3 sourceColor = mix(raw, mapped, 0.16);
    // Keep most of the photographic micro-detail in every slice. The earlier
    // pass blurred the rear slices so aggressively that the front view lost
    // the crisp gas filaments that make D convincing.
    sourceColor = mix(blur, sourceColor, 0.72 + uSliceDepth * 0.22);

    float starAttenuation = 1.0 - photoStar * 0.58;
    sourceColor *= starAttenuation;
    float emission = smoothstep(0.52, 0.9, depth) * smoothstep(0.16, 0.7, photoDepthLuma(blur));
    sourceColor *= 0.74 + emission * 0.48 + uSliceDepth * 0.08;

    float alpha = sliceBand * softDensity * breakup * borderFade;
    alpha *= (0.135 + uSliceDepth * 0.04) * starAttenuation;
    alpha *= mix(1.0, 1.13, uSelected) * uVisibility;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(sourceColor, alpha);
  }
`;

/* A raymarched volume was tested during the visual spike. It is intentionally
   not used here: the smoother layered cloud shader keeps the scene responsive. */
const volumeFragmentShader = `
  precision highp float;
  varying vec2 vUv;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform float uTime;
  uniform float uSeed;
  uniform float uSelected;

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float noise3d(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash31(i), hash31(i + vec3(1.0, 0.0, 0.0)), f.x),
          mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x),
          mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z
    );
  }

  float fbm3d(vec3 p) {
    float value = 0.0;
    float amplitude = 0.54;
    for (int octave = 0; octave < 3; octave++) {
      value += amplitude * noise3d(p);
      p = p * 2.04 + vec3(5.2, 3.7, 7.1);
      amplitude *= 0.48;
    }
    return value;
  }

  void main() {
    vec2 p = (vUv - 0.5) * vec2(3.0, 1.9);
    float border = smoothstep(0.0, 0.13, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
    vec3 rayOrigin = vec3(p, -1.35);
    vec3 rayDirection = normalize(vec3(p * 0.07, 1.0));
    vec3 accumulated = vec3(0.0);
    float transmittance = 1.0;
    float traveled = 0.0;
    float phase = uSeed * 17.0;

    for (int stepIndex = 0; stepIndex < 24; stepIndex++) {
      vec3 samplePosition = rayOrigin + rayDirection * traveled;
      samplePosition.x += sin(samplePosition.z * 1.55 + phase) * 0.22;
      samplePosition.y += sin(samplePosition.x * 1.35 - phase) * 0.12;
      vec3 shaped = samplePosition * vec3(0.57, 1.02, 0.84);
      float envelopeNoise = noise3d(samplePosition * 0.82 + phase);
      float envelope = 1.0 - smoothstep(0.62, 1.2, length(shaped) + (envelopeNoise - 0.5) * 0.48);
      float broad = fbm3d(samplePosition * 1.18 + vec3(phase, 0.0, uTime * 0.006));
      float detail = fbm3d(samplePosition * 2.45 + vec3(0.0, phase * 0.4, -uTime * 0.008));
      float density = smoothstep(0.47, 0.78, broad * 0.74 + detail * 0.28) * envelope;
      float crack = 1.0 - smoothstep(0.035, 0.14, abs(noise3d(samplePosition * 1.7 + phase) - 0.5));
      density *= 1.0 - crack * 0.82;

      float colorField = noise3d(samplePosition * 0.78 + vec3(4.2, phase, 1.3));
      vec3 sampleColor = mix(uColorC, uColorA, smoothstep(0.34, 0.68, colorField));
      sampleColor = mix(sampleColor, uColorB, smoothstep(0.64, 0.88, detail) * 0.72);
      float emission = pow(density, 2.2) * (0.6 + detail * 0.9);
      float alpha = density * 0.105 * mix(0.94, 1.18, uSelected);
      accumulated += transmittance * sampleColor * alpha * (0.72 + emission * 2.1);
      transmittance *= 1.0 - alpha;
      traveled += 0.12;
    }

    float alpha = (1.0 - transmittance) * border;
    accumulated *= border;
    if (alpha < 0.008) discard;
    gl_FragColor = vec4(accumulated, alpha);
  }
`;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(random: () => number): number {
  const first = Math.max(random(), 0.0001);
  const second = random();
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function createNebulaGeometry(pattern: Pattern, colors: [string, string, string]) {
  const random = mulberry32(hashString(pattern.pattern_id));
  const count = 120 + Math.min(pattern.evidence_count, 8) * 18;
  const positions = new Float32Array(count * 3);
  const particleColors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const opacities = new Float32Array(count);
  const phases = new Float32Array(count);
  const palette = colors.map((value) => new THREE.Color(value));

  for (let index = 0; index < count; index += 1) {
    const lobe = Math.floor(random() * 4);
    const density = Math.pow(random(), 1.55);
    const along = gaussian(random) * (1.25 + density * 1.35);
    const cross = gaussian(random) * (0.28 + density * 0.62);
    const depth = gaussian(random) * (0.32 + density * 0.62);
    const lobeOffset = (lobe - 1.5) * 0.52;
    const curl = Math.sin(along * 1.32 + lobe * 1.73) * (0.32 + density * 0.42);
    const taper = Math.max(0.16, 1 - Math.abs(along) / 5.4);

    positions[index * 3] = along + Math.sin(depth * 2.1) * 0.34 + lobeOffset * 0.3;
    positions[index * 3 + 1] = cross * taper + curl + lobeOffset;
    positions[index * 3 + 2] = depth + Math.cos(along * 0.88 + lobe) * 0.38;

    const colorIndex = random() < 0.54 ? 0 : random() < 0.76 ? 1 : 2;
    const color = palette[colorIndex].clone();
    color.offsetHSL((random() - 0.5) * 0.032, (random() - 0.5) * 0.04, (random() - 0.5) * 0.13);
    particleColors[index * 3] = color.r;
    particleColors[index * 3 + 1] = color.g;
    particleColors[index * 3 + 2] = color.b;
    const scaleRoll = random();
    sizes[index] = scaleRoll < 0.1
      ? 0.12 + random() * 0.2
      : scaleRoll < 0.68
        ? 0.055 + random() * 0.13
        : 0.025 + random() * 0.05;
    opacities[index] = scaleRoll < 0.1
      ? 0.005 + density * 0.009
      : 0.006 + density * 0.018 + random() * 0.005;
    phases[index] = random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(particleColors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aOpacity", new THREE.BufferAttribute(opacities, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

function colorWithAlpha(color: THREE.Color, alpha: number): string {
  const red = Math.round(color.r * 255);
  const green = Math.round(color.g * 255);
  const blue = Math.round(color.b * 255);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function createNebulaTexture(pattern: Pattern, colors: [string, string, string]) {
  const random = mulberry32(hashString(`${pattern.pattern_id}-gas-texture`));
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 640;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const palette = colors.map((value) => new THREE.Color(value));
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = "lighter";

  for (let index = 0; index < 150; index += 1) {
    const progress = random() * 2 - 1;
    const lobe = Math.floor(random() * 4) - 1.5;
    const centerX = canvas.width * 0.5 + progress * 322 + gaussian(random) * 44;
    const centerY = canvas.height * 0.5 + Math.sin(progress * 3.5 + lobe * 0.7) * 88 + lobe * 38 + gaussian(random) * 38;
    const radiusX = 44 + random() * 144;
    const radiusY = 26 + random() * 82;
    const colorRoll = random();
    const paletteColor = palette[colorRoll < 0.53 ? 0 : colorRoll < 0.8 ? 1 : 2];
    const alpha = 0.007 + Math.pow(random(), 1.8) * 0.03;
    context.save();
    context.translate(centerX, centerY);
    context.rotate((random() - 0.5) * 1.15 + progress * 0.28);
    context.scale(radiusX, radiusY);
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);
    gradient.addColorStop(0, colorWithAlpha(paletteColor, alpha));
    gradient.addColorStop(0.32, colorWithAlpha(paletteColor, alpha * 0.7));
    gradient.addColorStop(0.68, colorWithAlpha(paletteColor, alpha * 0.2));
    gradient.addColorStop(1, colorWithAlpha(paletteColor, 0));
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(0, 0, 1, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  context.globalCompositeOperation = "destination-out";
  context.lineCap = "round";
  for (let index = 0; index < 6; index += 1) {
    const startX = 90 + random() * 230;
    const startY = 120 + random() * 390;
    context.beginPath();
    context.moveTo(startX, startY);
    context.bezierCurveTo(
      330 + random() * 100,
      30 + random() * 570,
      620 + random() * 120,
      40 + random() * 540,
      900 + random() * 60,
      110 + random() * 410,
    );
    context.strokeStyle = `rgba(0,0,0,${0.26 + random() * 0.42})`;
    context.lineWidth = 14 + random() * 36;
    context.shadowColor = "rgba(0,0,0,0.58)";
    context.shadowBlur = 14 + random() * 25;
    context.stroke();
  }
  context.shadowBlur = 0;
  for (let index = 0; index < 16; index += 1) {
    const centerX = 110 + random() * 804;
    const centerY = 100 + random() * 440;
    const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, 38 + random() * 92);
    gradient.addColorStop(0, `rgba(0,0,0,${0.24 + random() * 0.32})`);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  context.globalCompositeOperation = "lighter";
  for (let index = 0; index < 18; index += 1) {
    const centerX = 145 + random() * 734;
    const centerY = 120 + random() * 400;
    const radius = 20 + random() * 68;
    const paletteColor = palette[index % 5 === 0 ? 2 : index % 3 === 0 ? 1 : 0];
    const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    gradient.addColorStop(0, colorWithAlpha(paletteColor, 0.16 + random() * 0.14));
    gradient.addColorStop(0.22, colorWithAlpha(paletteColor, 0.08));
    gradient.addColorStop(1, colorWithAlpha(paletteColor, 0));
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function createExperiencePositions(pattern: Pattern, volumetric = false) {
  const random = mulberry32(hashString(`${pattern.pattern_id}-experiences`));
  const supporting = pattern.supporting_experience_ids.map((id, index) => ({
    id,
    contradiction: false,
    position: new THREE.Vector3(
      gaussian(random) * 1.35,
      gaussian(random) * 0.55 + Math.sin(index * 1.7) * 0.36,
      THREE.MathUtils.clamp(
        gaussian(random) * (volumetric ? 0.92 : 0.55),
        volumetric ? -1.08 : -0.8,
        volumetric ? 1.08 : 0.8,
      ),
    ),
  }));
  const contradictions = pattern.contradicting_experience_ids.map((id, index) => ({
    id,
    contradiction: true,
    position: new THREE.Vector3(
      2.45 + index * 0.48,
      -0.8 + index * 0.42,
      (volumetric ? 0.9 : 0.75) + index * (volumetric ? 0.18 : 0.26),
    ),
  }));
  return [...supporting, ...contradictions];
}

function NebulaCloudLayer({
  colors,
  seed,
  selected,
  position,
  rotation,
  scale,
  opacity,
  dimmed,
  visual,
  collapsed,
}: {
  colors: [string, string, string];
  seed: number;
  selected: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  opacity: number;
  dimmed: boolean;
  visual: VisualPreset;
  collapsed: boolean;
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({
    uColorA: { value: new THREE.Color(colors[0]) },
    uColorB: { value: new THREE.Color(colors[1]) },
    uColorC: { value: new THREE.Color(colors[2]) },
    uTime: { value: 0 },
    uSeed: { value: (seed % 997) / 997 },
    uOpacity: { value: opacity },
    uSelected: { value: selected ? 1 : 0 },
    uVisibility: { value: dimmed ? 0.18 : 1 },
    uDensityBias: { value: visual.densityBias },
    uColorGain: { value: visual.colorGain },
    uSaturation: { value: visual.saturation },
    uEmissionGain: { value: visual.emissionGain },
    uCollapse: { value: collapsed ? 1 : 0 },
  }), [colors, opacity, seed, visual]);

  useFrame((state, delta) => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    materialRef.current.uniforms.uSelected.value = THREE.MathUtils.damp(
      materialRef.current.uniforms.uSelected.value,
      selected ? 1 : 0,
      3.5,
      delta,
    );
    materialRef.current.uniforms.uVisibility.value = THREE.MathUtils.damp(
      materialRef.current.uniforms.uVisibility.value,
      dimmed ? 0.18 : 1,
      4,
      delta,
    );
    materialRef.current.uniforms.uCollapse.value = THREE.MathUtils.damp(
      materialRef.current.uniforms.uCollapse.value,
      collapsed ? 1 : 0,
      collapsed ? 1.55 : 2.1,
      delta,
    );
  });

  return (
    <mesh position={position} rotation={rotation} scale={scale}>
      <planeGeometry args={[5.15, 3.35, 1, 1]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={cloudVertexShader}
        fragmentShader={cloudFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

function NebulaEmissionLayer({
  texture,
  selected,
  position,
  rotation,
  scale,
  opacity,
  dimmed,
}: {
  texture: THREE.Texture | null;
  selected: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  opacity: number;
  dimmed: boolean;
}) {
  if (!texture) return null;
  return (
    <mesh position={position} rotation={rotation} scale={scale}>
      <planeGeometry args={[5.8, 3.86]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={opacity * (selected ? 1.22 : 1) * (dimmed ? 0.16 : 1)}
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

interface HybridLayerSpec {
  layer: number;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  opacity: number;
  uvOffset: [number, number];
  uvScale: [number, number];
}

const HYBRID_LAYER_SPECS: HybridLayerSpec[] = [
  {
    layer: 0,
    position: [-0.1, 0.02, -0.62],
    rotation: [0.07, -0.16, -0.09],
    scale: [1.18, 1.12, 1],
    opacity: 0.54,
    uvOffset: [-0.012, 0.018],
    uvScale: [0.96, 0.94],
  },
  {
    layer: 1,
    position: [-0.05, 0.03, -0.16],
    rotation: [-0.02, 0.08, 0.018],
    scale: [1.08, 1.04, 1],
    opacity: 1,
    uvOffset: [0.006, -0.004],
    uvScale: [0.91, 0.9],
  },
  {
    layer: 2,
    position: [0.04, -0.01, 0.2],
    rotation: [0.04, -0.06, 0.026],
    scale: [0.98, 0.96, 1],
    opacity: 0.42,
    uvOffset: [0.016, -0.012],
    uvScale: [0.88, 0.87],
  },
  {
    layer: 3,
    position: [0.08, 0.01, 0.48],
    rotation: [0.08, 0.11, -0.035],
    scale: [1.03, 1.01, 1],
    opacity: 0.5,
    uvOffset: [-0.006, 0.006],
    uvScale: [0.9, 0.89],
  },
];

function HybridPhotographicLayer({
  texture,
  colors,
  selected,
  dimmed,
  collapsed,
  constellation,
  spec,
}: {
  texture: THREE.Texture;
  colors: [string, string, string];
  selected: boolean;
  dimmed: boolean;
  collapsed: boolean;
  constellation: boolean;
  spec: HybridLayerSpec;
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const uniforms = useMemo(() => ({
    uTexture: { value: texture },
    uColorA: { value: new THREE.Color(colors[0]) },
    uColorB: { value: new THREE.Color(colors[1]) },
    uColorC: { value: new THREE.Color(colors[2]) },
    uTime: { value: 0 },
    uLayer: { value: spec.layer },
    uOpacity: { value: spec.opacity },
    uSelected: { value: selected ? 1 : 0 },
    uVisibility: { value: dimmed ? 0.12 : constellation ? 0.72 : 1 },
    uCollapse: { value: collapsed ? 1 : 0 },
    uUvOffset: { value: new THREE.Vector2(...spec.uvOffset) },
    uUvScale: { value: new THREE.Vector2(...spec.uvScale) },
  }), [colors, dimmed, selected, spec, texture]);

  useFrame((state, delta) => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    materialRef.current.uniforms.uSelected.value = THREE.MathUtils.damp(
      materialRef.current.uniforms.uSelected.value,
      selected ? 1 : 0,
      3.5,
      delta,
    );
    materialRef.current.uniforms.uVisibility.value = THREE.MathUtils.damp(
      materialRef.current.uniforms.uVisibility.value,
      dimmed ? 0.12 : constellation ? 0.72 : 1,
      4,
      delta,
    );
    materialRef.current.uniforms.uCollapse.value = THREE.MathUtils.damp(
      materialRef.current.uniforms.uCollapse.value,
      collapsed ? 1 : 0,
      collapsed ? 1.55 : 2.1,
      delta,
    );
    if (meshRef.current) {
      const progress = materialRef.current.uniforms.uCollapse.value;
      meshRef.current.scale.set(
        spec.scale[0] * (1 - progress * 0.12),
        spec.scale[1] * (1 - progress * 0.12),
        spec.scale[2],
      );
      meshRef.current.rotation.z = spec.rotation[2] + progress * (spec.layer - 1.5) * 0.055;
    }
  });

  return (
    <mesh ref={meshRef} position={spec.position} rotation={spec.rotation} scale={spec.scale}>
      <planeGeometry args={[5.8, 4.34, 48, 32]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={hybridNebulaVertexShader}
        fragmentShader={hybridNebulaFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={spec.layer === 1 || spec.layer === 3 ? THREE.NormalBlending : THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

function HybridPhotographicNebula({
  colors,
  selected,
  dimmed,
  collapsed,
  constellation,
}: {
  colors: [string, string, string];
  selected: boolean;
  dimmed: boolean;
  collapsed: boolean;
  constellation: boolean;
}) {
  const texture = useTexture("/assets/nasa-lagoon-nebula-pia14728.jpg");

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }, [texture]);

  return (
    <group>
      {HYBRID_LAYER_SPECS.map((spec) => (
        <HybridPhotographicLayer
          key={spec.layer}
          texture={texture}
          colors={colors}
          selected={selected}
          dimmed={dimmed}
          collapsed={collapsed}
          constellation={constellation}
          spec={spec}
        />
      ))}
    </group>
  );
}

const DEPTH_SLICE_COUNT = 18;

interface DepthSliceSpec {
  index: number;
  depth: number;
  seed: number;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

const DEPTH_SLICE_SPECS: DepthSliceSpec[] = Array.from(
  { length: DEPTH_SLICE_COUNT },
  (_, index) => {
    const depth = (index + 0.5) / DEPTH_SLICE_COUNT;
    const phase = index * 1.61803398875;
    return {
      index,
      depth,
      seed: (Math.sin(phase * 4.7) + 1) * 0.5,
      position: [
        Math.sin(phase) * 0.025,
        Math.cos(phase * 1.17) * 0.018,
        -1.08 + depth * 2.16,
      ],
      rotation: [
        Math.sin(phase * 0.71) * 0.006,
        Math.cos(phase * 0.83) * 0.008,
        Math.sin(phase * 0.37) * 0.006,
      ],
      scale: [
        1.035 + Math.sin(phase * 0.51) * 0.01,
        1.02 + Math.cos(phase * 0.43) * 0.009,
        1,
      ],
    };
  },
);

function PhotographicDepthSlice({
  texture,
  depthMap,
  starMask,
  colors,
  selected,
  dimmed,
  spec,
}: {
  texture: THREE.Texture;
  depthMap: THREE.Texture;
  starMask: THREE.Texture;
  colors: [string, string, string];
  selected: boolean;
  dimmed: boolean;
  spec: DepthSliceSpec;
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({
    uTexture: { value: texture },
    uDepthMap: { value: depthMap },
    uStarMask: { value: starMask },
    uColorA: { value: new THREE.Color(colors[0]) },
    uColorB: { value: new THREE.Color(colors[1]) },
    uColorC: { value: new THREE.Color(colors[2]) },
    uTime: { value: 0 },
    uSliceDepth: { value: spec.depth },
    uSeed: { value: spec.seed },
    uSelected: { value: selected ? 1 : 0 },
    uVisibility: { value: dimmed ? 0.12 : 1 },
  }), [colors, depthMap, dimmed, selected, spec, starMask, texture]);

  useFrame((state, delta) => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    materialRef.current.uniforms.uSelected.value = THREE.MathUtils.damp(
      materialRef.current.uniforms.uSelected.value,
      selected ? 1 : 0,
      3.5,
      delta,
    );
    materialRef.current.uniforms.uVisibility.value = THREE.MathUtils.damp(
      materialRef.current.uniforms.uVisibility.value,
      dimmed ? 0.12 : 1,
      4,
      delta,
    );
  });

  return (
    <mesh
      position={spec.position}
      rotation={spec.rotation}
      scale={spec.scale}
      renderOrder={20 + spec.index}
    >
      <planeGeometry args={[5.8, 4.34, 24, 16]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={depthSliceVertexShader}
        fragmentShader={depthSliceFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        depthTest
        side={THREE.DoubleSide}
        blending={THREE.NormalBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

function PhotographicDepthNebula({
  colors,
  selected,
  dimmed,
}: {
  colors: [string, string, string];
  selected: boolean;
  dimmed: boolean;
}) {
  const [texture, depthMap, starMask] = useTexture([
    "/assets/nasa-lagoon-nebula-pia14728.jpg",
    "/assets/nasa-lagoon-nebula-pia14728-depth.png",
    "/assets/nasa-lagoon-nebula-pia14728-star-mask.png",
  ]);

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    depthMap.colorSpace = THREE.NoColorSpace;
    starMask.colorSpace = THREE.NoColorSpace;
    [texture, depthMap, starMask].forEach((map) => {
      map.minFilter = THREE.LinearMipmapLinearFilter;
      map.magFilter = THREE.LinearFilter;
      map.anisotropy = 8;
      map.needsUpdate = true;
    });
  }, [depthMap, starMask, texture]);

  return (
    <group>
      {DEPTH_SLICE_SPECS.map((spec) => (
        <PhotographicDepthSlice
          key={spec.index}
          texture={texture}
          depthMap={depthMap}
          starMask={starMask}
          colors={colors}
          selected={selected}
          dimmed={dimmed}
          spec={spec}
        />
      ))}
    </group>
  );
}

function NebulaVolumeLayer({
  colors,
  seed,
  selected,
}: {
  colors: [string, string, string];
  seed: number;
  selected: boolean;
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({
    uColorA: { value: new THREE.Color(colors[0]) },
    uColorB: { value: new THREE.Color(colors[1]) },
    uColorC: { value: new THREE.Color(colors[2]) },
    uTime: { value: 0 },
    uSeed: { value: (seed % 997) / 997 },
    uSelected: { value: selected ? 1 : 0 },
  }), [colors, seed]);

  useFrame((state, delta) => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    materialRef.current.uniforms.uSelected.value = THREE.MathUtils.damp(
      materialRef.current.uniforms.uSelected.value,
      selected ? 1 : 0,
      3.5,
      delta,
    );
  });

  return (
    <mesh position={[-0.08, 0.02, -0.28]} rotation={[0.04, -0.1, -0.12]} scale={[1.12, 1.08, 1]}>
      <planeGeometry args={[5.8, 3.86]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={cloudVertexShader}
        fragmentShader={volumeFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

interface StarLayerProps {
  seed: number;
  count: number;
  radius: [number, number];
  size: [number, number];
  brightness: [number, number];
  opacity: [number, number];
  warmChance: number;
  haloChance: number;
  rotationVelocity: [number, number, number];
}

function StarFieldLayer({
  seed,
  count,
  radius,
  size,
  brightness,
  opacity,
  warmChance,
  haloChance,
  rotationVelocity,
}: StarLayerProps) {
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const geometry = useMemo(() => {
    const random = mulberry32(seed);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const opacities = new Float32Array(count);
    const phases = new Float32Array(count);
    for (let index = 0; index < count; index += 1) {
      const distance = radius[0] + random() * (radius[1] - radius[0]);
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      positions[index * 3] = distance * Math.sin(phi) * Math.cos(theta);
      positions[index * 3 + 1] = distance * Math.cos(phi);
      positions[index * 3 + 2] = distance * Math.sin(phi) * Math.sin(theta);
      const warmth = random() < warmChance;
      const value = brightness[0] + Math.pow(random(), 2.25) * (brightness[1] - brightness[0]);
      colors[index * 3] = value * (warmth ? 1 : 0.82);
      colors[index * 3 + 1] = value * (warmth ? 0.88 : 0.93);
      colors[index * 3 + 2] = value * (warmth ? 0.72 : 1);
      const halo = random() < haloChance;
      sizes[index] = halo
        ? Math.max(1.2, size[1] * (0.9 + random() * 0.18))
        : size[0] + random() * (size[1] - size[0]);
      opacities[index] = opacity[0] + random() * (opacity[1] - opacity[0]);
      phases[index] = random();
    }
    const result = new THREE.BufferGeometry();
    result.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    result.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    result.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    result.setAttribute("aOpacity", new THREE.BufferAttribute(opacities, 1));
    result.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    return result;
  }, [brightness, count, haloChance, opacity, radius, seed, size, warmChance]);

  const uniforms = useMemo(() => ({
    uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.5) },
    uTime: { value: 0 },
  }), []);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.x += delta * rotationVelocity[0];
      groupRef.current.rotation.y += delta * rotationVelocity[1];
      groupRef.current.rotation.z += delta * rotationVelocity[2];
    }
    if (materialRef.current) materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <group ref={groupRef}>
      <points geometry={geometry}>
        <shaderMaterial
          ref={materialRef}
          vertexShader={starVertexShader}
          fragmentShader={starFragmentShader}
          uniforms={uniforms}
          vertexColors
          transparent
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}

function LayeredStarField({ visual }: { visual: VisualPreset }) {
  const amount = visual.starMultiplier;
  const alpha = visual.starOpacity;
  return (
    <>
      <StarFieldLayer
        seed={912734}
        count={Math.round(2300 * amount)}
        radius={[18, 46]}
        size={[0.3, 0.68]}
        brightness={[0.18, 0.66]}
        opacity={[0.2 * alpha, 0.58 * alpha]}
        warmChance={0.025}
        haloChance={0}
        rotationVelocity={[-0.00011, 0.00034, 0]}
      />
      <StarFieldLayer
        seed={238719}
        count={Math.round(480 * amount)}
        radius={[11, 31]}
        size={[0.46, 0.95]}
        brightness={[0.42, 0.94]}
        opacity={[0.38 * alpha, 0.8 * alpha]}
        warmChance={0.045}
        haloChance={0.006}
        rotationVelocity={[0, -0.00078, 0.00018]}
      />
      <StarFieldLayer
        seed={738129}
        count={Math.round(42 * amount)}
        radius={[7, 19]}
        size={[0.68, 1.42]}
        brightness={[0.72, 1.2]}
        opacity={[0.62 * alpha, 0.98 * alpha]}
        warmChance={0.08}
        haloChance={0.12}
        rotationVelocity={[0.00028, 0.00134, 0]}
      />
    </>
  );
}

function useRadialGlowTexture() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    if (!context) return null;
    const gradient = context.createRadialGradient(32, 32, 1, 32, 32, 31);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.1, "rgba(255,255,255,0.9)");
    gradient.addColorStop(0.34, "rgba(255,255,255,0.24)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    const nextTexture = new THREE.CanvasTexture(canvas);
    nextTexture.colorSpace = THREE.SRGBColorSpace;
    return nextTexture;
  }, []);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

function useStellarGlowTexture() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.clearRect(0, 0, 128, 128);
    context.globalCompositeOperation = "lighter";

    const halo = context.createRadialGradient(61, 60, 0, 64, 64, 52);
    halo.addColorStop(0, "rgba(255,255,255,1)");
    halo.addColorStop(0.055, "rgba(255,255,255,0.96)");
    halo.addColorStop(0.15, "rgba(226,246,255,0.44)");
    halo.addColorStop(0.42, "rgba(173,217,235,0.11)");
    halo.addColorStop(1, "rgba(95,151,176,0)");
    context.fillStyle = halo;
    context.fillRect(0, 0, 128, 128);

    const horizontal = context.createLinearGradient(12, 64, 116, 64);
    horizontal.addColorStop(0, "rgba(255,255,255,0)");
    horizontal.addColorStop(0.43, "rgba(221,245,255,0.04)");
    horizontal.addColorStop(0.5, "rgba(255,255,255,0.72)");
    horizontal.addColorStop(0.57, "rgba(221,245,255,0.04)");
    horizontal.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = horizontal;
    context.fillRect(12, 63.35, 104, 1.3);

    const vertical = context.createLinearGradient(64, 24, 64, 104);
    vertical.addColorStop(0, "rgba(255,255,255,0)");
    vertical.addColorStop(0.44, "rgba(225,246,255,0.035)");
    vertical.addColorStop(0.5, "rgba(255,255,255,0.46)");
    vertical.addColorStop(0.56, "rgba(225,246,255,0.035)");
    vertical.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = vertical;
    context.fillRect(63.45, 24, 1.1, 80);

    const nextTexture = new THREE.CanvasTexture(canvas);
    nextTexture.colorSpace = THREE.SRGBColorSpace;
    nextTexture.minFilter = THREE.LinearMipmapLinearFilter;
    nextTexture.magFilter = THREE.LinearFilter;
    return nextTexture;
  }, []);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

function useProtoNebulaTexture() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 320;
    const context = canvas.getContext("2d");
    if (!context) return null;
    const random = mulberry32(74291);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = "lighter";
    for (let index = 0; index < 18; index += 1) {
      const x = 120 + random() * 280;
      const y = 72 + random() * 176;
      const radius = 38 + random() * 105;
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      const cyan = index % 3 !== 0;
      gradient.addColorStop(0, cyan ? "rgba(87,190,204,0.16)" : "rgba(215,107,148,0.1)");
      gradient.addColorStop(0.4, cyan ? "rgba(39,108,130,0.08)" : "rgba(119,48,83,0.05)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = gradient;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    context.globalCompositeOperation = "destination-out";
    for (let index = 0; index < 5; index += 1) {
      const x = 130 + random() * 250;
      const y = 90 + random() * 140;
      const radius = 34 + random() * 75;
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, "rgba(0,0,0,0.5)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = gradient;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    const next = new THREE.CanvasTexture(canvas);
    next.colorSpace = THREE.SRGBColorSpace;
    next.minFilter = THREE.LinearFilter;
    next.magFilter = THREE.LinearFilter;
    return next;
  }, []);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

function ProtoNebulaHaze({ evidenceCount, emerging, dimmed }: { evidenceCount: number; emerging: boolean; dimmed: boolean }) {
  const texture = useProtoNebulaTexture();
  const groupRef = useRef<THREE.Group>(null);
  const opacity = evidenceCount >= 2 ? 0.48 : 0.2;
  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const target = evidenceCount >= 2 ? 1.5 : 0.82;
    const scale = THREE.MathUtils.damp(groupRef.current.scale.x, target, emerging ? 1.7 : 1.1, delta);
    groupRef.current.scale.setScalar(scale);
    groupRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.13) * 0.035;
  });
  return (
    <group ref={groupRef} scale={0.08}>
      {[[-0.06, 0.02, -0.18, 0.08], [0.18, -0.02, 0.04, -0.2], [-0.2, 0.1, 0.2, 0.34]].map((layer, index) => (
        <sprite key={index} position={[layer[0], layer[1], layer[2]]} rotation={[0, 0, layer[3]]} scale={[2.1 - index * 0.18, 1.24 - index * 0.12, 1]}>
          <spriteMaterial
            map={texture}
            color={index === 1 ? "#d77a9a" : "#72c4cf"}
            transparent
            opacity={opacity * (index === 0 ? 0.9 : 0.48) * (dimmed ? 0.16 : 1)}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </sprite>
      ))}
    </group>
  );
}

function GenesisBirthStar({ birth }: { birth: GenesisBirth }) {
  const groupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.MeshBasicMaterial>(null);
  const haloRef = useRef<THREE.SpriteMaterial>(null);
  const flareRef = useRef<THREE.SpriteMaterial>(null);
  const glowTexture = useStellarGlowTexture();
  const temperature = ["#e7f4ff", "#fff8e8", "#d9edff"][birth.sequence % 3];
  const position = useMemo<[number, number, number]>(() => [
    -0.55 + (birth.sequence % 3) * 0.48,
    0.06 + Math.sin(birth.sequence * 2.1) * 0.28,
    2.85 - Math.min(birth.sequence, 4) * 0.12,
  ], [birth.sequence]);
  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const agePulse = 1 + Math.sin(state.clock.elapsedTime * 4.2 + birth.sequence) * 0.08;
    const target = birth.phase === "settling" ? 0.36 : agePulse;
    const scale = THREE.MathUtils.damp(groupRef.current.scale.x, target, birth.phase === "birthing" ? 5.2 : 2.4, delta);
    groupRef.current.scale.setScalar(scale);
    if (coreRef.current) coreRef.current.opacity = THREE.MathUtils.damp(coreRef.current.opacity, birth.phase === "settling" ? 0.2 : 1, 3, delta);
    if (haloRef.current) haloRef.current.opacity = THREE.MathUtils.damp(haloRef.current.opacity, birth.phase === "settling" ? 0.04 : 0.72, 3, delta);
    if (flareRef.current) {
      flareRef.current.opacity = THREE.MathUtils.damp(
        flareRef.current.opacity,
        birth.phase === "birthing" ? 0.52 : 0.06,
        birth.phase === "birthing" ? 4.4 : 2.8,
        delta,
      );
      flareRef.current.rotation = state.clock.elapsedTime * 0.045 + birth.sequence * 0.7;
    }
  });
  return (
    <group ref={groupRef} position={position} scale={0.04}>
      <mesh>
        <sphereGeometry args={[0.04, 16, 12]} />
        <meshBasicMaterial ref={coreRef} color={temperature} transparent toneMapped={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.018, 12, 10]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      <sprite scale={[0.66, 0.58, 1]}>
        <spriteMaterial ref={haloRef} map={glowTexture} color={temperature} transparent opacity={0.72} blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>
      <sprite scale={[1.08, 0.92, 1]}>
        <spriteMaterial ref={flareRef} map={glowTexture} color={temperature} transparent opacity={0.52} blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>
    </group>
  );
}

function GenesisBirthLayer({ births }: { births: GenesisBirth[] }) {
  return <group>{births.map((birth) => <GenesisBirthStar key={birth.birth_id} birth={birth} />)}</group>;
}

function ExperienceStarGlyph({
  id,
  position,
  contradiction,
  selected,
  dimmed,
  patternName,
  onSelect,
  glowTexture,
}: {
  id: string;
  position: THREE.Vector3;
  contradiction: boolean;
  selected: boolean;
  dimmed: boolean;
  patternName: string;
  onSelect: () => void;
  glowTexture: THREE.Texture | null;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.MeshBasicMaterial>(null);
  const haloRef = useRef<THREE.SpriteMaterial>(null);
  const [hovered, setHovered] = useState(false);
  const signature = useMemo(() => {
    const seed = hashString(id);
    const colors = ["#e8f5ff", "#fff6df", "#dcecff", "#f5fbff"];
    return {
      color: contradiction ? "#e69aa5" : colors[seed % colors.length],
      brightness: 0.9 + ((seed >> 4) % 18) / 100,
      phase: ((seed >> 7) % 100) / 13,
      frequency: 0.62 + ((seed >> 11) % 28) / 100,
      rotation: ((seed >> 15) % 628) / 100,
      haloScale: 0.2 + ((seed >> 18) % 7) / 100,
    };
  }, [contradiction, id]);
  useFrame((state) => {
    const twinkle = 0.96 + Math.sin(state.clock.elapsedTime * signature.frequency + signature.phase) * 0.035;
    if (groupRef.current) groupRef.current.scale.setScalar(twinkle);
    if (coreRef.current) coreRef.current.opacity = (dimmed ? 0.12 : signature.brightness) * twinkle;
    if (haloRef.current) haloRef.current.opacity = (contradiction ? 0.34 : 0.29) * twinkle * (dimmed ? 0.08 : 1);
  });
  return (
    <group ref={groupRef} position={position}>
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "default";
        }}
      >
        <sphereGeometry args={[0.12, 10, 10]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[contradiction ? 0.032 : 0.026, 14, 12]} />
        <meshBasicMaterial ref={coreRef} color={signature.color} transparent opacity={1} toneMapped={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.011, 10, 8]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={dimmed ? 0.1 : 0.96} toneMapped={false} />
      </mesh>
      <sprite scale={[signature.haloScale * (selected ? 1.34 : 1.06), signature.haloScale * (selected ? 1.12 : 0.9), 1]}>
        <spriteMaterial
          ref={haloRef}
          map={glowTexture}
          color={signature.color}
          rotation={signature.rotation}
          transparent
          opacity={0.3}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
      {hovered && !selected && (
        <Html position={[0.08, 0.12, 0]} style={{ pointerEvents: "none" }}>
          <div className="evidence-peek">
            <strong>{patternName}</strong>
            <span>{contradiction ? "Contradicts this pattern" : "Supports this pattern"}</span>
          </div>
        </Html>
      )}
    </group>
  );
}

function ExperienceStars({
  pattern,
  selected,
  dimmed,
  volumetric = false,
  collapsed,
  onSelect,
}: {
  pattern: Pattern;
  selected: boolean;
  dimmed: boolean;
  volumetric?: boolean;
  collapsed: boolean;
  onSelect: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const stars = useMemo(
    () => createExperiencePositions(pattern, volumetric),
    [pattern, volumetric],
  );
  const glowTexture = useStellarGlowTexture();
  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const target = collapsed ? 0.78 : 1;
    const next = THREE.MathUtils.damp(groupRef.current.scale.x, target, collapsed ? 1.5 : 2.2, delta);
    groupRef.current.scale.setScalar(next);
    groupRef.current.rotation.z += delta * (collapsed ? 0.024 : 0);
  });
  return (
    <group ref={groupRef}>
      {stars.map((star) => (
        <ExperienceStarGlyph
          key={star.id}
          id={star.id}
          position={star.position}
          contradiction={star.contradiction}
          selected={selected}
          dimmed={dimmed}
          patternName={pattern.name}
          onSelect={onSelect}
          glowTexture={glowTexture}
        />
      ))}
    </group>
  );
}

function ConstellationStar({
  position,
  index,
  glowTexture,
}: {
  position: THREE.Vector3;
  index: number;
  glowTexture: THREE.Texture | null;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const spriteRef = useRef<THREE.SpriteMaterial>(null);
  const startedAt = useRef<number | null>(null);
  useFrame((state) => {
    if (startedAt.current === null) startedAt.current = state.clock.elapsedTime;
    const elapsed = state.clock.elapsedTime - startedAt.current - index * 0.16;
    const progress = THREE.MathUtils.smoothstep(elapsed, 0, 0.58);
    if (groupRef.current) groupRef.current.scale.setScalar(Math.max(0.001, progress));
    if (materialRef.current) materialRef.current.opacity = 0.12 + progress * 0.88;
    if (spriteRef.current) spriteRef.current.opacity = progress * 0.58;
  });
  return (
    <group ref={groupRef} position={position} scale={0.001}>
      <mesh>
        <sphereGeometry args={[0.045, 12, 12]} />
        <meshBasicMaterial ref={materialRef} color="#f7fbf7" transparent opacity={0} toneMapped={false} />
      </mesh>
      <sprite scale={[0.42, 0.42, 1]}>
        <spriteMaterial
          ref={spriteRef}
          map={glowTexture}
          color="#bfeee9"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
    </group>
  );
}

function ConstellationSegment({
  from,
  to,
  index,
}: {
  from: THREE.Vector3;
  to: THREE.Vector3;
  index: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const startedAt = useRef<number | null>(null);
  const { length, quaternion } = useMemo(() => {
    const direction = to.clone().sub(from);
    return {
      length: direction.length(),
      quaternion: new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.normalize(),
      ),
    };
  }, [from, to]);
  useFrame((state) => {
    if (startedAt.current === null) startedAt.current = state.clock.elapsedTime;
    const elapsed = state.clock.elapsedTime - startedAt.current - 0.28 - index * 0.22;
    const progress = THREE.MathUtils.smootherstep(elapsed, 0, 0.72);
    if (groupRef.current) groupRef.current.scale.y = Math.max(0.001, progress);
  });
  return (
    <group ref={groupRef} position={from} quaternion={quaternion} scale={[1, 0.001, 1]}>
      <mesh position={[0, length / 2, 0]}>
        <cylinderGeometry args={[0.006, 0.006, length, 6, 1, true]} />
        <meshBasicMaterial
          color="#b7e5e1"
          transparent
          opacity={0.52}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, length / 2, 0]}>
        <cylinderGeometry args={[0.018, 0.018, length, 6, 1, true]} />
        <meshBasicMaterial
          color="#75bfc5"
          transparent
          opacity={0.08}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function ConstellationStructure({
  pattern,
  volumetric,
  dimmed,
}: {
  pattern: Pattern;
  volumetric: boolean;
  dimmed: boolean;
}) {
  const glowTexture = useRadialGlowTexture();
  const stars = useMemo(
    () => createExperiencePositions(pattern, volumetric).filter((star) => !star.contradiction),
    [pattern, volumetric],
  );
  if (dimmed || stars.length === 0) return null;
  return (
    <group>
      {stars.slice(0, -1).map((star, index) => (
        <ConstellationSegment
          key={`${star.id}-${stars[index + 1].id}`}
          from={star.position}
          to={stars[index + 1].position}
          index={index}
        />
      ))}
      {stars.map((star, index) => (
        <ConstellationStar key={star.id} position={star.position} index={index} glowTexture={glowTexture} />
      ))}
    </group>
  );
}

function CollapseCore({ active }: { active: boolean }) {
  const coreRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (!coreRef.current) return;
    const target = active ? 1 : 0.001;
    const next = THREE.MathUtils.damp(coreRef.current.scale.x, target, active ? 1.7 : 2.2, delta);
    coreRef.current.scale.setScalar(next);
  });
  return (
    <group ref={coreRef} position={[0.03, 0.01, 1.03]} scale={0.001}>
      <mesh scale={[1, 0.72, 0.62]}>
        <sphereGeometry args={[0.34, 28, 20]} />
        <meshBasicMaterial color="#010204" depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

const MAX_ORBIT_POINTS = 160;
const MAX_ORBIT_DUST = 96;

const silkTrailVertexShader = `
  attribute float aEdge;
  attribute float aProgress;
  attribute float aSpeed;
  uniform float uTime;
  varying float vEdge;
  varying float vProgress;
  varying float vSpeed;
  void main() {
    vEdge = aEdge;
    vProgress = aProgress;
    vSpeed = aSpeed;
    float livingDrift = sin(aProgress * 31.0 - uTime * 1.45 + aEdge * 0.9) * 0.0065;
    vec3 silkPosition = position + vec3(0.0, livingDrift, livingDrift * 0.35);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(silkPosition, 1.0);
  }
`;

const silkTrailFragmentShader = `
  uniform float uTime;
  uniform float uOpacity;
  varying float vEdge;
  varying float vProgress;
  varying float vSpeed;
  void main() {
    float edge = abs(vEdge);
    float core = exp(-edge * 8.5);
    float veil = pow(max(0.0, 1.0 - edge), 1.85);
    float flow = 0.88 + 0.12 * sin(vProgress * 62.0 - uTime * 2.1 + sin(vProgress * 11.0));
    float speedLift = 0.88 + min(1.0, vSpeed) * 0.18;
    vec3 gold = vec3(0.88, 0.61, 0.20);
    vec3 warmWhite = vec3(1.0, 0.965, 0.79);
    vec3 color = mix(gold, warmWhite, core * 0.92);
    float alpha = (veil * 0.26 + core * 0.76) * flow * speedLift * uOpacity;
    gl_FragColor = vec4(color, alpha);
  }
`;

const orbitDustVertexShader = `
  attribute float aBirth;
  attribute float aSize;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vAlpha;
  void main() {
    float age = max(0.0, uTime - aBirth);
    vAlpha = 1.0 - smoothstep(0.16, 1.35, age);
    vec3 drifted = position + vec3(0.0, age * 0.018, 0.0);
    vec4 mvPosition = modelViewMatrix * vec4(drifted, 1.0);
    gl_PointSize = aSize * uPixelRatio * (7.0 / max(2.0, -mvPosition.z));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const orbitDustFragmentShader = `
  varying float vAlpha;
  void main() {
    float radial = smoothstep(0.5, 0.02, length(gl_PointCoord - 0.5));
    gl_FragColor = vec4(vec3(1.0, 0.88, 0.56), radial * vAlpha * 0.6);
  }
`;

function createDynamicSilkGeometry() {
  const geometry = new THREE.BufferGeometry();
  const vertexCount = MAX_ORBIT_POINTS * 2;
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("aEdge", new THREE.BufferAttribute(new Float32Array(vertexCount), 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("aProgress", new THREE.BufferAttribute(new Float32Array(vertexCount), 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("aSpeed", new THREE.BufferAttribute(new Float32Array(vertexCount), 1).setUsage(THREE.DynamicDrawUsage));
  const indices = new Uint16Array((MAX_ORBIT_POINTS - 1) * 6);
  for (let index = 0; index < MAX_ORBIT_POINTS - 1; index += 1) {
    const offset = index * 6;
    const left = index * 2;
    indices[offset] = left;
    indices[offset + 1] = left + 1;
    indices[offset + 2] = left + 2;
    indices[offset + 3] = left + 1;
    indices[offset + 4] = left + 3;
    indices[offset + 5] = left + 2;
  }
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);
  return geometry;
}

function updateSilkGeometry(
  geometry: THREE.BufferGeometry,
  points: THREE.Vector3[],
  speeds: number[],
  viewDirection: THREE.Vector3,
  width = 0.112,
) {
  const count = Math.min(MAX_ORBIT_POINTS, points.length);
  if (count < 2) {
    geometry.setDrawRange(0, 0);
    return;
  }
  const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
  const edges = geometry.getAttribute("aEdge") as THREE.BufferAttribute;
  const progress = geometry.getAttribute("aProgress") as THREE.BufferAttribute;
  const speed = geometry.getAttribute("aSpeed") as THREE.BufferAttribute;
  for (let index = 0; index < count; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(count - 1, index + 1)];
    const tangent = next.clone().sub(previous).normalize();
    const side = tangent.clone().cross(viewDirection).normalize();
    if (side.lengthSq() < 0.001) side.set(-tangent.y, tangent.x, 0).normalize();
    const speedValue = THREE.MathUtils.clamp(speeds[index] ?? 0, 0, 1);
    const pulse = 0.88 + Math.sin(index * 0.71) * 0.08 + speedValue * 0.12;
    const halfWidth = width * pulse;
    const left = points[index].clone().addScaledVector(side, halfWidth);
    const right = points[index].clone().addScaledVector(side, -halfWidth);
    positions.setXYZ(index * 2, left.x, left.y, left.z);
    positions.setXYZ(index * 2 + 1, right.x, right.y, right.z);
    edges.setX(index * 2, -1);
    edges.setX(index * 2 + 1, 1);
    progress.setX(index * 2, index / (count - 1));
    progress.setX(index * 2 + 1, index / (count - 1));
    speed.setX(index * 2, speedValue);
    speed.setX(index * 2 + 1, speedValue);
  }
  positions.needsUpdate = true;
  edges.needsUpdate = true;
  progress.needsUpdate = true;
  speed.needsUpdate = true;
  geometry.setDrawRange(0, (count - 1) * 6);
  geometry.computeBoundingSphere();
}

function smoothOrbitPath(raw: THREE.Vector3[]) {
  if (raw.length < 3) return raw.map((point) => point.clone());
  let refined = raw.map((point) => point.clone());
  for (let pass = 0; pass < 2; pass += 1) {
    const next = [refined[0].clone()];
    for (let index = 0; index < refined.length - 1; index += 1) {
      next.push(refined[index].clone().lerp(refined[index + 1], 0.25));
      next.push(refined[index].clone().lerp(refined[index + 1], 0.75));
    }
    next.push(refined[refined.length - 1].clone());
    refined = next;
  }
  const curve = new THREE.CatmullRomCurve3(refined, false, "centripetal", 0.45);
  const sampleCount = Math.min(MAX_ORBIT_POINTS, Math.max(44, raw.length * 2));
  return curve.getSpacedPoints(sampleCount - 1);
}

function useSilkMaterial(opacity = 1) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: silkTrailVertexShader,
    fragmentShader: silkTrailFragmentShader,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: opacity } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }), [opacity]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame((state) => { material.uniforms.uTime.value = state.clock.elapsedTime; });
  return material;
}

function PersistedSilkOrbit({ orbit }: { orbit: DrawnOrbitPath }) {
  const geometries = useMemo(() => {
    const core = createDynamicSilkGeometry();
    const outer = createDynamicSilkGeometry();
    const points = orbit.points.map((point) => new THREE.Vector3(point.x, point.y, point.z));
    const speeds = points.map(() => 0.42);
    updateSilkGeometry(core, points, speeds, new THREE.Vector3(0, 0, 1), 0.104);
    updateSilkGeometry(outer, points, speeds, new THREE.Vector3(0, 0, 1), 0.205);
    return { core, outer };
  }, [orbit]);
  const coreMaterial = useSilkMaterial(0.74);
  const outerMaterial = useSilkMaterial(0.2);
  useEffect(() => () => {
    geometries.core.dispose();
    geometries.outer.dispose();
  }, [geometries]);
  return (
    <group>
      <mesh geometry={geometries.outer} material={outerMaterial} frustumCulled={false} />
      <mesh geometry={geometries.core} material={coreMaterial} frustumCulled={false} />
    </group>
  );
}

function useFutureSeedTexture(seed: number) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) return null;
    const random = mulberry32(seed);
    context.clearRect(0, 0, 256, 256);
    context.globalCompositeOperation = "lighter";
    for (let index = 0; index < 12; index += 1) {
      const x = 128 + (random() - 0.5) * 70;
      const y = 128 + (random() - 0.5) * 54;
      const radius = 26 + random() * 58;
      const gradient = context.createRadialGradient(x, y, radius * 0.04, x, y, radius);
      const opacity = 0.08 + random() * 0.15;
      gradient.addColorStop(0, `rgba(255,249,220,${opacity * 1.8})`);
      gradient.addColorStop(0.28, `rgba(244,210,125,${opacity})`);
      gradient.addColorStop(0.68, `rgba(190,128,53,${opacity * 0.32})`);
      gradient.addColorStop(1, "rgba(120,75,22,0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 256, 256);
    }
    context.globalCompositeOperation = "destination-out";
    for (let index = 0; index < 5; index += 1) {
      const x = 105 + random() * 62;
      const y = 100 + random() * 65;
      const radius = 12 + random() * 28;
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, "rgba(0,0,0,0.34)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 256, 256);
    }
    const nextTexture = new THREE.CanvasTexture(canvas);
    nextTexture.colorSpace = THREE.SRGBColorSpace;
    nextTexture.needsUpdate = true;
    return nextTexture;
  }, [seed]);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

function FutureSeedBloom({ orbit, forming }: { orbit: DrawnOrbitPath; forming: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const dustRef = useRef<THREE.PointsMaterial>(null);
  const ringRef = useRef<THREE.MeshBasicMaterial>(null);
  const coreRef = useRef<THREE.MeshBasicMaterial>(null);
  const haloRef = useRef<THREE.SpriteMaterial>(null);
  const cloudRefs = useRef<THREE.SpriteMaterial[]>([]);
  const potentialRefs = useRef<THREE.Group[]>([]);
  const startedAt = useRef<number | null>(null);
  const glowTexture = useRadialGlowTexture();
  const cloudTexture = useFutureSeedTexture(orbit.future_seed.seed);
  const dust = useMemo(() => {
    const random = mulberry32(orbit.future_seed.seed + 417);
    const positions = new Float32Array(54 * 3);
    for (let index = 0; index < 54; index += 1) {
      const angle = random() * Math.PI * 2;
      const radius = 0.38 + random() * 1.02;
      const vertical = (random() - 0.5) * 0.58;
      positions[index * 3] = Math.cos(angle) * radius;
      positions[index * 3 + 1] = Math.sin(angle) * radius * 0.64 + vertical * 0.24;
      positions[index * 3 + 2] = vertical;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geometry;
  }, [orbit.future_seed.seed]);
  const cloudLayers = useMemo(() => [
    { position: [-0.13, 0.06, -0.12] as [number, number, number], scale: [1.72, 1.14, 1] as [number, number, number], color: "#f8d98b", opacity: 0.2 },
    { position: [0.18, -0.04, 0.05] as [number, number, number], scale: [1.26, 0.92, 1] as [number, number, number], color: "#fff1c3", opacity: 0.23 },
    { position: [-0.02, 0.12, 0.18] as [number, number, number], scale: [0.92, 0.7, 1] as [number, number, number], color: "#dca951", opacity: 0.17 },
  ], []);
  const potentialStars = useMemo(() => {
    const random = mulberry32(orbit.future_seed.seed + 911);
    return Array.from({ length: 3 }, (_, index) => ({
      position: [
        (random() - 0.5) * 1.1,
        (random() - 0.5) * 0.64,
        (random() - 0.5) * 0.42,
      ] as [number, number, number],
      delay: 0.52 + index * 0.14,
      scale: 0.018 + random() * 0.015,
    }));
  }, [orbit.future_seed.seed]);

  useEffect(() => () => dust.dispose(), [dust]);
  useFrame((state) => {
    if (startedAt.current === null) startedAt.current = state.clock.elapsedTime;
    const elapsed = state.clock.elapsedTime - startedAt.current;
    const progress = forming ? THREE.MathUtils.clamp(elapsed / 2.05, 0, 1) : 1;
    const eased = 1 - Math.pow(1 - progress, 3);
    const bloomPulse = forming ? Math.sin(progress * Math.PI) : 0;
    if (groupRef.current) {
      const scale = THREE.MathUtils.lerp(0.18, 1, eased) * (1 + bloomPulse * 0.11);
      groupRef.current.scale.setScalar(scale);
      groupRef.current.rotation.z = 0.08 + state.clock.elapsedTime * 0.018;
    }
    if (coreRef.current) coreRef.current.opacity = 0.88 + bloomPulse * 0.12;
    if (haloRef.current) haloRef.current.opacity = 0.46 + bloomPulse * 0.42;
    cloudRefs.current.forEach((material, index) => {
      material.opacity = cloudLayers[index].opacity * (0.35 + eased * 0.65) + bloomPulse * 0.11;
      material.rotation = state.clock.elapsedTime * (index % 2 === 0 ? 0.018 : -0.014) + index * 0.72;
    });
    if (dustRef.current) dustRef.current.opacity = (forming ? 0.12 + bloomPulse * 0.54 : 0.2);
    if (ringRef.current) ringRef.current.opacity = forming ? Math.max(0, Math.sin(progress * Math.PI) * 0.34) : 0;
    potentialRefs.current.forEach((star, index) => {
      const reveal = THREE.MathUtils.smoothstep(progress, potentialStars[index].delay, Math.min(1, potentialStars[index].delay + 0.22));
      star.scale.setScalar(reveal * (1 + Math.sin(state.clock.elapsedTime * (1.4 + index * 0.31)) * 0.06));
    });
  });

  const position = orbit.future_seed.position;
  return (
    <group ref={groupRef} position={[position.x, position.y, position.z]} scale={forming ? 0.18 : 1}>
      <Html center style={{ pointerEvents: "none" }}>
        <span className="future-seed-anchor" data-phase={forming ? "forming" : "settled"} aria-hidden="true" />
      </Html>
      <points geometry={dust} scale={forming ? [1.7, 1.7, 1.7] : [1, 1, 1]}>
        <pointsMaterial ref={dustRef} map={glowTexture} color="#f8dca0" size={0.052} transparent opacity={0.2} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
      </points>
      {cloudLayers.map((layer, index) => (
        <sprite key={index} position={layer.position} scale={layer.scale}>
          <spriteMaterial
            ref={(material) => { if (material) cloudRefs.current[index] = material; }}
            map={cloudTexture}
            color={layer.color}
            transparent
            opacity={layer.opacity}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </sprite>
      ))}
      <mesh rotation={[0, 0, 0]}>
        <ringGeometry args={[0.22, 0.235, 64]} />
        <meshBasicMaterial ref={ringRef} color="#f2c968" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.088, 20, 18]} />
        <meshBasicMaterial ref={coreRef} color="#fff9e8" transparent opacity={0.94} toneMapped={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.031, 14, 12]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      <sprite scale={[1.18, 0.92, 1]}>
        <spriteMaterial ref={haloRef} map={glowTexture} color="#efc76d" transparent opacity={0.58} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </sprite>
      {potentialStars.map((star, index) => (
        <group
          key={index}
          ref={(group) => { if (group) potentialRefs.current[index] = group; }}
          position={star.position}
          scale={forming ? 0 : 1}
        >
          <mesh>
            <sphereGeometry args={[star.scale, 10, 8]} />
            <meshBasicMaterial color={index === 1 ? "#fff5d6" : "#f6dfad"} toneMapped={false} />
          </mesh>
          <sprite scale={[0.26, 0.22, 1]}>
            <spriteMaterial map={glowTexture} color="#ebc56f" transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} />
          </sprite>
        </group>
      ))}
    </group>
  );
}

function FutureChoiceStar({
  position,
  parent,
  stage,
  onDrawStart,
  onDrawSpeed,
  onDrawCancel,
  onDrawComplete,
}: {
  position: FutureChoicePosition;
  parent: RefObject<THREE.Group | null>;
  stage: OrbitDrawStage;
  onDrawStart: () => void;
  onDrawSpeed: (speed: number) => void;
  onDrawCancel: () => void;
  onDrawComplete: (points: FutureChoicePosition[], endpoint: FutureChoicePosition) => void;
}) {
  const starRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.MeshBasicMaterial>(null);
  const haloRef = useRef<THREE.SpriteMaterial>(null);
  const trailGeometry = useMemo(createDynamicSilkGeometry, []);
  const outerTrailGeometry = useMemo(createDynamicSilkGeometry, []);
  const trailMaterial = useSilkMaterial(stage === "saving" ? 0.86 : 1);
  const outerTrailMaterial = useSilkMaterial(stage === "saving" ? 0.18 : 0.28);
  const dustGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_ORBIT_DUST * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("aBirth", new THREE.BufferAttribute(new Float32Array(MAX_ORBIT_DUST), 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(MAX_ORBIT_DUST), 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    return geometry;
  }, []);
  const dustMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const draggingRef = useRef(false);
  const dragPlaneRef = useRef(new THREE.Plane());
  const rawPointsRef = useRef<THREE.Vector3[]>([]);
  const speedsRef = useRef<number[]>([]);
  const distanceRef = useRef(0);
  const lastSampleRef = useRef({ time: 0, point: new THREE.Vector3(position.x, position.y, position.z) });
  const dustCountRef = useRef(0);
  const settlePulseRef = useRef(0);
  const glowTexture = useRadialGlowTexture();
  const { camera, controls, clock } = useThree();
  const orbitControls = controls as OrbitControlsImpl | undefined;

  const restoreControls = () => {
    if (orbitControls) orbitControls.enabled = true;
    document.body.style.cursor = "default";
  };

  const resetDrawing = () => {
    const origin = new THREE.Vector3(position.x, position.y, position.z);
    rawPointsRef.current = [origin];
    speedsRef.current = [0];
    distanceRef.current = 0;
    dustCountRef.current = 0;
    dustGeometry.setDrawRange(0, 0);
    trailGeometry.setDrawRange(0, 0);
    outerTrailGeometry.setDrawRange(0, 0);
    if (starRef.current) starRef.current.position.copy(origin);
  };

  useEffect(() => {
    if (stage === "ready") resetDrawing();
  }, [stage, position.x, position.y, position.z]);
  useEffect(() => () => {
    restoreControls();
    trailGeometry.dispose();
    outerTrailGeometry.dispose();
    dustGeometry.dispose();
  }, [dustGeometry, outerTrailGeometry, trailGeometry]);

  useFrame((state, delta) => {
    trailMaterial.uniforms.uTime.value = state.clock.elapsedTime;
    if (dustMaterialRef.current) dustMaterialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    settlePulseRef.current = THREE.MathUtils.damp(settlePulseRef.current, stage === "saving" ? 1 : 0, 4.2, delta);
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 3.1) * 0.025 + settlePulseRef.current * 0.13;
    if (starRef.current) starRef.current.scale.setScalar(pulse);
    if (coreRef.current) coreRef.current.opacity = stage === "drawing" ? 1 : 0.92;
    if (haloRef.current) haloRef.current.opacity = stage === "drawing" ? 0.88 : 0.66;
  });

  const addDust = (point: THREE.Vector3, speed: number, elapsedTime: number) => {
    if (speed < 1.45) return;
    const positionAttribute = dustGeometry.getAttribute("position") as THREE.BufferAttribute;
    const birthAttribute = dustGeometry.getAttribute("aBirth") as THREE.BufferAttribute;
    const sizeAttribute = dustGeometry.getAttribute("aSize") as THREE.BufferAttribute;
    const count = speed > 3.2 ? 2 : 1;
    for (let index = 0; index < count; index += 1) {
      const slot = dustCountRef.current % MAX_ORBIT_DUST;
      const angle = (dustCountRef.current * 2.399 + index * 1.17) % (Math.PI * 2);
      const spread = 0.018 + (dustCountRef.current % 4) * 0.006;
      positionAttribute.setXYZ(slot, point.x + Math.cos(angle) * spread, point.y + Math.sin(angle) * spread, point.z + (index - 0.5) * 0.012);
      birthAttribute.setX(slot, elapsedTime);
      sizeAttribute.setX(slot, 3.2 + Math.min(4.4, speed) * 0.8 + (slot % 3) * 0.7);
      dustCountRef.current += 1;
    }
    positionAttribute.needsUpdate = true;
    birthAttribute.needsUpdate = true;
    sizeAttribute.needsUpdate = true;
    dustGeometry.setDrawRange(0, Math.min(MAX_ORBIT_DUST, dustCountRef.current));
  };

  const finishPointer = (event: any, cancelled = false) => {
    if (!draggingRef.current) return;
    event.stopPropagation();
    draggingRef.current = false;
    const target = event.target as EventTarget & { releasePointerCapture?: (pointerId: number) => void };
    try { target.releasePointerCapture?.(event.pointerId); } catch { /* capture already released */ }
    restoreControls();
    if (cancelled || rawPointsRef.current.length < 5 || distanceRef.current < 0.82) {
      resetDrawing();
      onDrawCancel();
      return;
    }
    const smoothed = smoothOrbitPath(rawPointsRef.current);
    const localView = camera.getWorldDirection(new THREE.Vector3());
    if (parent.current) {
      const inverse = parent.current.getWorldQuaternion(new THREE.Quaternion()).invert();
      localView.applyQuaternion(inverse).normalize();
    }
    updateSilkGeometry(trailGeometry, smoothed, smoothed.map(() => 0.46), localView);
    updateSilkGeometry(outerTrailGeometry, smoothed, smoothed.map(() => 0.46), localView, 0.22);
    const endpoint = smoothed[smoothed.length - 1];
    if (starRef.current) starRef.current.position.copy(endpoint);
    settlePulseRef.current = 1;
    onDrawComplete(
      smoothed.map((point) => ({ x: point.x, y: point.y, z: point.z })),
      { x: endpoint.x, y: endpoint.y, z: endpoint.z },
    );
  };

  return (
    <group>
      <mesh geometry={outerTrailGeometry} material={outerTrailMaterial} frustumCulled={false} />
      <mesh geometry={trailGeometry} material={trailMaterial} frustumCulled={false} />
      <points geometry={dustGeometry} frustumCulled={false}>
        <shaderMaterial
          ref={dustMaterialRef}
          vertexShader={orbitDustVertexShader}
          fragmentShader={orbitDustFragmentShader}
          uniforms={{
            uTime: { value: 0 },
            uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.5) },
          }}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>
      <group ref={starRef} position={[position.x, position.y, position.z]}>
        <Html center style={{ pointerEvents: "none" }}>
          <span className="future-choice-star-anchor" data-stage={stage} aria-hidden="true" />
        </Html>
        <mesh
          onPointerDown={(event) => {
            if (stage !== "ready") return;
            event.stopPropagation();
            event.nativeEvent.preventDefault();
            const normal = event.camera.getWorldDirection(new THREE.Vector3());
            dragPlaneRef.current.setFromNormalAndCoplanarPoint(normal, event.point);
            resetDrawing();
            draggingRef.current = true;
            if (orbitControls) orbitControls.enabled = false;
            document.body.style.cursor = "grabbing";
            const target = event.target as EventTarget & { setPointerCapture: (pointerId: number) => void };
            target.setPointerCapture(event.pointerId);
            lastSampleRef.current = { time: event.nativeEvent.timeStamp, point: rawPointsRef.current[0].clone() };
            onDrawStart();
          }}
          onPointerMove={(event) => {
            if (!draggingRef.current || !parent.current) return;
            event.stopPropagation();
            event.nativeEvent.preventDefault();
            const world = new THREE.Vector3();
            if (!event.ray.intersectPlane(dragPlaneRef.current, world)) return;
            const local = parent.current.worldToLocal(world.clone());
            local.set(
              THREE.MathUtils.clamp(local.x, -2.8, 2.95),
              THREE.MathUtils.clamp(local.y, -1.72, 1.72),
              THREE.MathUtils.clamp(local.z, -1.25, 1.3),
            );
            const previous = lastSampleRef.current.point;
            const distance = local.distanceTo(previous);
            const elapsed = Math.max(8, event.nativeEvent.timeStamp - lastSampleRef.current.time);
            if (distance < 0.018 && elapsed < 18) return;
            const speed = distance / (elapsed / 1000);
            distanceRef.current += distance;
            rawPointsRef.current.push(local.clone());
            speedsRef.current.push(THREE.MathUtils.clamp(speed / 4.5, 0, 1));
            if (rawPointsRef.current.length > MAX_ORBIT_POINTS) {
              rawPointsRef.current.splice(1, 1);
              speedsRef.current.splice(1, 1);
            }
            lastSampleRef.current = { time: event.nativeEvent.timeStamp, point: local.clone() };
            if (starRef.current) starRef.current.position.copy(local);
            const localView = camera.getWorldDirection(new THREE.Vector3());
            const inverse = parent.current.getWorldQuaternion(new THREE.Quaternion()).invert();
            localView.applyQuaternion(inverse).normalize();
            const previewPoints = rawPointsRef.current.length > 2
              ? smoothOrbitPath(rawPointsRef.current)
              : rawPointsRef.current;
            const previewSpeeds = previewPoints.map((_, index) => {
              const sourceIndex = Math.min(
                speedsRef.current.length - 1,
                Math.round((index / Math.max(1, previewPoints.length - 1)) * (speedsRef.current.length - 1)),
              );
              return speedsRef.current[sourceIndex] ?? 0;
            });
            updateSilkGeometry(trailGeometry, previewPoints, previewSpeeds, localView);
            updateSilkGeometry(outerTrailGeometry, previewPoints, previewSpeeds, localView, 0.22);
            addDust(local, speed, clock.elapsedTime);
            onDrawSpeed(speed);
          }}
          onPointerUp={(event) => finishPointer(event)}
          onPointerCancel={(event) => finishPointer(event, true)}
          onPointerOver={() => { if (!draggingRef.current) document.body.style.cursor = "grab"; }}
          onPointerOut={() => { if (!draggingRef.current) document.body.style.cursor = "default"; }}
        >
          <sphereGeometry args={[0.28, 20, 20]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.078, 20, 18]} />
          <meshBasicMaterial ref={coreRef} color="#fff7d8" transparent opacity={0.94} toneMapped={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.028, 14, 12]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
        <sprite scale={[0.78, 0.66, 1]}>
          <spriteMaterial ref={haloRef} map={glowTexture} color="#e8c465" transparent opacity={0.7} blending={THREE.AdditiveBlending} depthWrite={false} />
        </sprite>
      </group>
    </group>
  );
}

function DrawnOrbitTrajectory({
  mode,
  blackHole,
  futureChoice,
  drawnOrbit,
  parent,
  stage,
  onDrawStart,
  onDrawSpeed,
  onDrawCancel,
  onDrawComplete,
}: {
  mode: Exclude<TrajectoryMode, "hidden">;
  blackHole: boolean;
  futureChoice: FutureChoiceDraft | null;
  drawnOrbit: DrawnOrbitPath | null;
  parent: RefObject<THREE.Group | null>;
  stage: OrbitDrawStage;
  onDrawStart: () => void;
  onDrawSpeed: (speed: number) => void;
  onDrawCancel: () => void;
  onDrawComplete: (points: FutureChoicePosition[], endpoint: FutureChoicePosition) => void;
}) {
  const currentOrbit = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const startAngle = blackHole ? -2.9 : -2.4;
    const endAngle = blackHole ? 1.05 : 0.7;
    for (let index = 0; index < 56; index += 1) {
      const progress = index / 55;
      const angle = THREE.MathUtils.lerp(startAngle, endAngle, progress);
      const radius = blackHole ? 0.78 + progress * 0.12 : 1.0 + progress * 0.18;
      points.push(new THREE.Vector3(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius * (blackHole ? 0.34 : 0.48),
        1.02 + Math.sin(progress * Math.PI) * 0.13,
      ));
    }
    return points;
  }, [blackHole]);
  return (
    <group>
      <Line
        points={currentOrbit}
        color="#78909c"
        lineWidth={0.5}
        transparent
        opacity={mode === "current" ? 0.23 : 0.16}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
      {mode === "drawing" && futureChoice && stage !== "blooming" && (
        <FutureChoiceStar
          position={futureChoice.position}
          parent={parent}
          stage={stage}
          onDrawStart={onDrawStart}
          onDrawSpeed={onDrawSpeed}
          onDrawCancel={onDrawCancel}
          onDrawComplete={onDrawComplete}
        />
      )}
      {mode === "drawing" && stage === "blooming" && drawnOrbit && (
        <>
          <PersistedSilkOrbit orbit={drawnOrbit} />
          <FutureSeedBloom orbit={drawnOrbit} forming />
        </>
      )}
      {mode === "changed" && drawnOrbit && (
        <>
          <PersistedSilkOrbit orbit={drawnOrbit} />
          <FutureSeedBloom orbit={drawnOrbit} forming={false} />
        </>
      )}
    </group>
  );
}

function NebulaFilaments({ seed, color, selected }: { seed: number; color: string; selected: boolean }) {
  const curves = useMemo(() => {
    const random = mulberry32(seed);
    return Array.from({ length: 7 }, (_, curveIndex) => {
      const verticalOffset = (curveIndex - 3) * 0.24 + (random() - 0.5) * 0.32;
      return Array.from({ length: 15 }, (_, pointIndex) => {
        const progress = pointIndex / 14;
        const x = -2.55 + progress * 5.1;
        const y = verticalOffset + Math.sin(progress * Math.PI * (1.4 + curveIndex * 0.12) + curveIndex) * (0.28 + random() * 0.28);
        const z = Math.cos(progress * Math.PI * 2 + curveIndex) * 0.32 + (random() - 0.5) * 0.18;
        return [x, y, z] as [number, number, number];
      });
    });
  }, [seed]);

  return (
    <group>
      {curves.map((points, index) => (
        <Line
          key={index}
          points={points}
          color={color}
          lineWidth={selected ? 0.42 : 0.24}
          transparent
          opacity={selected ? 0.075 : 0.028}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      ))}
    </group>
  );
}

function PatternNebula({
  pattern,
  spec,
  visual,
  dominant,
  selected,
  dimmed,
  onSelect,
  futureChoice,
  changedOrbit,
  drawnOrbit,
  trajectoryMode,
  orbitDrawStage,
  onOrbitDrawStart,
  onOrbitDrawSpeed,
  onOrbitDrawCancel,
  onOrbitDrawComplete,
  emerging,
}: {
  pattern: Pattern;
  spec: NebulaSpec;
  visual: VisualPreset;
  dominant: boolean;
  selected: boolean;
  dimmed: boolean;
  onSelect: () => void;
  futureChoice: FutureChoiceDraft | null;
  changedOrbit: ChangedOrbit | null;
  drawnOrbit: DrawnOrbitPath | null;
  trajectoryMode: TrajectoryMode;
  orbitDrawStage: OrbitDrawStage;
  onOrbitDrawStart: () => void;
  onOrbitDrawSpeed: (speed: number) => void;
  onOrbitDrawCancel: () => void;
  onOrbitDrawComplete: (points: FutureChoicePosition[], endpoint: FutureChoicePosition) => void;
  emerging: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const groupRef = useRef<THREE.Group>(null);
  const established = pattern.status === "recurring";
  const resolvedVisualState = established ? pattern.visual_state : "nebula";
  const geometry = useMemo(
    () => createNebulaGeometry(pattern, spec.colors),
    [pattern.pattern_id, pattern.evidence_count, spec.colors],
  );
  const emissionTexture = useMemo(
    () => createNebulaTexture(pattern, spec.colors),
    [pattern.pattern_id, spec.colors],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => emissionTexture?.dispose(), [emissionTexture]);
  useEffect(() => {
    document.body.style.cursor = hovered ? "pointer" : "default";
    return () => { document.body.style.cursor = "default"; };
  }, [hovered]);

  useFrame((state, delta) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
      materialRef.current.uniforms.uSelected.value = THREE.MathUtils.damp(
        materialRef.current.uniforms.uSelected.value,
        selected || hovered ? 1 : 0,
        4,
        delta,
      );
      materialRef.current.uniforms.uVisibility.value = THREE.MathUtils.damp(
        materialRef.current.uniforms.uVisibility.value,
        dimmed ? 0.12 : 1,
        4,
        delta,
      );
      materialRef.current.uniforms.uCollapse.value = THREE.MathUtils.damp(
        materialRef.current.uniforms.uCollapse.value,
        resolvedVisualState === "black_hole" ? 1 : 0,
        resolvedVisualState === "black_hole" ? 1.55 : 2.1,
        delta,
      );
    }
    if (groupRef.current) {
      groupRef.current.rotation.z += delta * (selected ? 0.006 : 0.0025);
    }
  });

  const seed = hashString(pattern.pattern_id);
  const usesPhotographicHybrid = dominant && visual.name === "D";
  const usesPhotographicDepth = dominant && visual.name === "D2";
  const isProtoNebula = !established;
  return (
    <group
      ref={groupRef}
      position={spec.position}
      rotation={spec.rotation}
      scale={spec.scale}
    >
      {isProtoNebula ? (
        <ProtoNebulaHaze evidenceCount={pattern.evidence_count} emerging={emerging} dimmed={dimmed} />
      ) : usesPhotographicDepth ? (
        <PhotographicDepthNebula
          colors={spec.colors}
          selected={selected || hovered}
          dimmed={dimmed}
        />
      ) : usesPhotographicHybrid ? (
        <HybridPhotographicNebula
          colors={spec.colors}
          selected={selected || hovered}
          dimmed={dimmed}
          collapsed={resolvedVisualState === "black_hole"}
          constellation={resolvedVisualState === "constellation"}
        />
      ) : (
        <>
          <NebulaEmissionLayer
            texture={emissionTexture}
            selected={selected || hovered}
            position={[-0.08, 0.04, -0.34]}
            rotation={[0.06, -0.12, -0.12]}
            scale={[1.12, 1.04, 1]}
            opacity={dominant ? visual.emissionOpacity : 0.12}
            dimmed={dimmed}
          />
          <NebulaCloudLayer
            colors={spec.colors}
            seed={seed}
            selected={selected || hovered}
            position={[-0.15, 0.08, -0.48]}
            rotation={[0.08, -0.18, -0.14]}
            scale={[1.02, 0.98, 1]}
            opacity={dominant ? visual.cloudOpacity[0] : 0.7}
            dimmed={dimmed}
            visual={visual}
            collapsed={resolvedVisualState === "black_hole"}
          />
          <NebulaCloudLayer
            colors={[spec.colors[1], spec.colors[2], spec.colors[0]]}
            seed={seed + 173}
            selected={selected || hovered}
            position={[0.22, 0.08, 0.24]}
            rotation={[0.42, 0.18, 0.58]}
            scale={[0.78, 0.7, 1]}
            opacity={dominant ? visual.cloudOpacity[1] : 0.38}
            dimmed={dimmed}
            visual={visual}
            collapsed={resolvedVisualState === "black_hole"}
          />
          <points geometry={geometry} frustumCulled={false}>
            <shaderMaterial
              ref={materialRef}
              vertexShader={vertexShader}
              fragmentShader={fragmentShader}
              vertexColors
              transparent
              depthWrite={false}
              depthTest
              blending={THREE.AdditiveBlending}
              uniforms={{
                uTime: { value: 0 },
                uSelected: { value: selected ? 1 : 0 },
                uVisibility: { value: dimmed ? 0.12 : 1 },
                uCollapse: { value: resolvedVisualState === "black_hole" ? 1 : 0 },
                uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.5) },
              }}
            />
          </points>
        </>
      )}

      <ExperienceStars
        pattern={pattern}
        selected={selected || hovered}
        dimmed={dimmed}
        volumetric={usesPhotographicHybrid || usesPhotographicDepth}
        collapsed={resolvedVisualState === "black_hole"}
        onSelect={onSelect}
      />

      {resolvedVisualState === "constellation" && (
        <ConstellationStructure
          pattern={pattern}
          volumetric={usesPhotographicHybrid || usesPhotographicDepth}
          dimmed={dimmed}
        />
      )}

      <CollapseCore active={resolvedVisualState === "black_hole" && !dimmed} />

      {trajectoryMode !== "hidden" && (
        <DrawnOrbitTrajectory
          blackHole={resolvedVisualState === "black_hole"}
          mode={trajectoryMode}
          futureChoice={futureChoice}
          drawnOrbit={drawnOrbit}
          parent={groupRef}
          stage={orbitDrawStage}
          onDrawStart={onOrbitDrawStart}
          onDrawSpeed={onOrbitDrawSpeed}
          onDrawCancel={onOrbitDrawCancel}
          onDrawComplete={onOrbitDrawComplete}
        />
      )}

      <mesh
        // Keep the dominant nebula's invisible hit volume inside its visual
        // core so it cannot intercept clicks intended for a distant pattern.
        // This changes interaction geometry only; the frozen D rendering is
        // untouched.
        scale={dominant ? [1.65, 1.4, 1.2] : [3.05, 1.65, 1.45]}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[1, 18, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>

      <Html
        position={[0, -1.58, 0.3]}
        center
        distanceFactor={9}
        style={{ pointerEvents: "none" }}
      >
        <div className={`nebula-label${selected ? " is-selected" : ""}${hovered ? " is-hovered" : ""}`}>
          <strong>{pattern.name}</strong>
          <span>{pattern.evidence_count} experiences</span>
        </div>
      </Html>
    </group>
  );
}

function CameraRig({
  selectedFrame,
  futureBloomPosition,
  orbitPreset,
  homeCamera,
  cosmicEvent,
  interactionLocked,
}: {
  selectedFrame: FocusFrame | null;
  futureBloomPosition: [number, number, number] | null;
  orbitPreset: "D" | "D2" | null;
  homeCamera: [number, number, number];
  cosmicEvent: CosmicEventState | null;
  interactionLocked: boolean;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const transitionStrength = useRef(0);

  useEffect(() => {
    transitionStrength.current = 1;
  }, [selectedFrame, futureBloomPosition, cosmicEvent?.kind, cosmicEvent?.phase]);

  useFrame((_, delta) => {
    const orbit = controls.current;
    if (!orbit || transitionStrength.current < 0.002) return;
    const eventOffset = cosmicEvent?.kind === "CHANGE_ORBIT" ? 1.18 : cosmicEvent?.kind === "CONSTELLATION" ? 0 : cosmicEvent?.kind === "BLACK_HOLE" ? 0 : 0.54;
    const eventDistance = cosmicEvent?.kind === "CHANGE_ORBIT" ? 11.4 : cosmicEvent?.kind === "CONSTELLATION" ? 2.9 : cosmicEvent?.kind === "BLACK_HOLE" ? 7.55 : 9.35;
    const bloomTarget = futureBloomPosition ? new THREE.Vector3(...futureBloomPosition) : null;
    const target = selectedFrame
      ? bloomTarget
        ? bloomTarget.clone().lerp(new THREE.Vector3(...selectedFrame.position), 0.1)
        : new THREE.Vector3(...selectedFrame.position)
          .add(new THREE.Vector3(...selectedFrame.right).multiplyScalar(eventOffset))
          .add(new THREE.Vector3(0, 0.04, 0))
      : new THREE.Vector3(0, 0, 0);
    const destination = selectedFrame
      ? target.clone()
        .add(new THREE.Vector3(...selectedFrame.normal).multiplyScalar(bloomTarget ? 7.6 : eventDistance))
        .add(new THREE.Vector3(0, 0.08, 0))
      : new THREE.Vector3(...homeCamera);
    orbit.target.lerp(target, 1 - Math.exp(-delta * 3.2));
    camera.position.lerp(destination, 1 - Math.exp(-delta * 2.05));
    camera.up.lerp(new THREE.Vector3(0, 1, 0), 1 - Math.exp(-delta * 3.4)).normalize();
    transitionStrength.current *= Math.exp(-delta * 1.55);
    orbit.update();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={!interactionLocked}
      enableDamping
      dampingFactor={0.065}
      minDistance={2.65}
      maxDistance={25}
      rotateSpeed={0.42}
      zoomSpeed={0.72}
      panSpeed={0.42}
      enablePan={false}
      minAzimuthAngle={orbitPreset === "D"
        ? THREE.MathUtils.degToRad(-14)
        : orbitPreset === "D2"
          ? THREE.MathUtils.degToRad(-20)
          : -Infinity}
      maxAzimuthAngle={orbitPreset === "D"
        ? THREE.MathUtils.degToRad(14)
        : orbitPreset === "D2"
          ? THREE.MathUtils.degToRad(20)
          : Infinity}
      minPolarAngle={orbitPreset === "D"
        ? THREE.MathUtils.degToRad(81)
        : orbitPreset === "D2"
          ? THREE.MathUtils.degToRad(76)
          : 0}
      maxPolarAngle={orbitPreset === "D"
        ? THREE.MathUtils.degToRad(99)
        : orbitPreset === "D2"
          ? THREE.MathUtils.degToRad(104)
          : Math.PI}
    />
  );
}

function WarmMainScene() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    const warm = () => gl.compile(scene, camera);
    const idle = window.requestIdleCallback?.(warm, { timeout: 900 });
    const timer = idle === undefined ? window.setTimeout(warm, 180) : null;
    return () => {
      if (idle !== undefined) window.cancelIdleCallback?.(idle);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [camera, gl, scene]);
  return null;
}

function Scene({
  patterns,
  selectedPatternId,
  onSelectPattern,
  visual,
  futureChoice,
  projections,
  changedOrbits,
  drawnOrbits,
  orbitStates,
  orbitDrawStage,
  cosmicEvent,
  onOrbitDrawStart,
  onOrbitDrawSpeed,
  onOrbitDrawCancel,
  onOrbitDrawComplete,
  genesisBirths,
  emergingPatternId,
}: ThreeCosmosViewProps & { visual: VisualPreset }) {
  const nebulaSpecs = useMemo(() => [visual.main, ...SATELLITE_NEBULAE], [visual]);
  const attentionPatternId = selectedPatternId ?? emergingPatternId;
  const selectedIndex = patterns.findIndex((pattern) => pattern.pattern_id === attentionPatternId);
  const selectedFrame = useMemo(() => {
    if (selectedIndex < 0) return null;
    const spec = nebulaSpecs[selectedIndex % nebulaSpecs.length];
    const universeQuaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(...UNIVERSE_ROTATION),
    );
    const localQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...spec.rotation));
    const worldQuaternion = universeQuaternion.clone().multiply(localQuaternion);
    const position = new THREE.Vector3(...spec.position).applyQuaternion(universeQuaternion);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(worldQuaternion).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(worldQuaternion).normalize();
    return {
      position: position.toArray() as [number, number, number],
      normal: normal.toArray() as [number, number, number],
      right: right.toArray() as [number, number, number],
    };
  }, [nebulaSpecs, selectedIndex]);
  const futureBloomPosition = useMemo(() => {
    if (
      cosmicEvent?.kind !== "CHANGE_ORBIT"
      || selectedIndex < 0
      || (orbitDrawStage !== "blooming" && cosmicEvent.phase !== "SETTLED")
    ) return null;
    const orbit = drawnOrbits[cosmicEvent.patternId];
    if (!orbit) return null;
    const spec = nebulaSpecs[selectedIndex % nebulaSpecs.length];
    const endpoint = orbit.future_seed.position;
    const world = new THREE.Vector3(endpoint.x, endpoint.y, endpoint.z)
      .multiply(new THREE.Vector3(...spec.scale))
      .applyEuler(new THREE.Euler(...spec.rotation))
      .add(new THREE.Vector3(...spec.position))
      .applyEuler(new THREE.Euler(...UNIVERSE_ROTATION));
    return world.toArray() as [number, number, number];
  }, [cosmicEvent, drawnOrbits, nebulaSpecs, orbitDrawStage, selectedIndex]);

  return (
    <>
      <color attach="background" args={["#02050a"]} />
      <fog attach="fog" args={["#02050a", 21, 52]} />
      <ambientLight intensity={0.08} />
      <LayeredStarField visual={visual} />
      <GenesisBirthLayer births={genesisBirths} />
      <group rotation={UNIVERSE_ROTATION}>
        {patterns.map((pattern, index) => (
          (() => {
            const isSelected = selectedPatternId === pattern.pattern_id;
            const eventForPattern = cosmicEvent?.patternId === pattern.pattern_id ? cosmicEvent : null;
            let trajectoryMode: TrajectoryMode = "hidden";
            const orbitState = orbitStates[pattern.pattern_id] ?? "hidden";
            if (orbitState === "changed" && changedOrbits[pattern.pattern_id] && drawnOrbits[pattern.pattern_id]) trajectoryMode = "changed";
            else if (orbitState === "current" && isSelected && projections[pattern.pattern_id]) trajectoryMode = "current";
            if (eventForPattern?.kind === "BLACK_HOLE") trajectoryMode = "hidden";
            if (eventForPattern?.kind === "CHANGE_ORBIT") {
              trajectoryMode = eventForPattern.phase === "PREFRAME"
                ? "hidden"
                : eventForPattern.phase === "PLAYING"
                  ? "drawing"
                  : "changed";
            }
            return (
          <PatternNebula
            key={pattern.pattern_id}
            pattern={pattern}
            spec={nebulaSpecs[index % nebulaSpecs.length]}
            visual={visual}
            dominant={index === 0}
            selected={isSelected}
            dimmed={selectedPatternId !== null && selectedPatternId !== pattern.pattern_id}
            onSelect={() => onSelectPattern(pattern.pattern_id)}
            futureChoice={futureChoice?.patternId === pattern.pattern_id ? futureChoice : null}
            changedOrbit={changedOrbits[pattern.pattern_id] ?? null}
            drawnOrbit={drawnOrbits[pattern.pattern_id] ?? null}
            trajectoryMode={trajectoryMode}
            orbitDrawStage={orbitDrawStage}
            onOrbitDrawStart={onOrbitDrawStart}
            onOrbitDrawSpeed={onOrbitDrawSpeed}
            onOrbitDrawCancel={onOrbitDrawCancel}
            onOrbitDrawComplete={onOrbitDrawComplete}
            emerging={emergingPatternId === pattern.pattern_id}
          />
            );
          })()
        ))}
      </group>
      <CameraRig
        selectedFrame={selectedFrame}
        futureBloomPosition={futureBloomPosition}
        orbitPreset={visual.name === "D" || visual.name === "D2" ? visual.name : null}
        homeCamera={visual.camera}
        cosmicEvent={cosmicEvent}
        interactionLocked={orbitDrawStage === "drawing" || orbitDrawStage === "saving" || orbitDrawStage === "blooming"}
      />
      <WarmMainScene />
      <EffectComposer multisampling={0}>
        <Bloom
          intensity={visual.bloomIntensity}
          luminanceThreshold={visual.bloomThreshold}
          luminanceSmoothing={0.34}
          mipmapBlur
          resolutionScale={0.5}
        />
      </EffectComposer>
    </>
  );
}

export function ThreeCosmosView({
  patterns,
  selectedPatternId,
  onSelectPattern,
  futureChoice,
  projections,
  changedOrbits,
  drawnOrbits,
  orbitStates,
  orbitDrawStage,
  cosmicEvent,
  onOrbitDrawStart,
  onOrbitDrawSpeed,
  onOrbitDrawCancel,
  onOrbitDrawComplete,
  interactionMode,
  genesisBirths,
  emergingPatternId,
}: ThreeCosmosViewProps) {
  const visual = useMemo(resolveVisualPreset, []);
  return (
    <div className="three-cosmos-frame" aria-label="Interactive 3D Pattern Cosmos">
      <Canvas
        className="three-cosmos-canvas"
        camera={{ position: visual.camera, fov: visual.fov, near: 0.1, far: 80 }}
        dpr={interactionMode === "ORACLE_SEQUENCE" ? [0.65, 0.9] : [1, 1.25]}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = visual.exposure;
        }}
        onPointerMissed={() => undefined}
      >
        <Scene
          patterns={patterns}
          selectedPatternId={selectedPatternId}
          onSelectPattern={onSelectPattern}
          visual={visual}
          futureChoice={futureChoice}
          projections={projections}
          changedOrbits={changedOrbits}
          drawnOrbits={drawnOrbits}
          orbitStates={orbitStates}
          orbitDrawStage={orbitDrawStage}
          cosmicEvent={cosmicEvent}
          onOrbitDrawStart={onOrbitDrawStart}
          onOrbitDrawSpeed={onOrbitDrawSpeed}
          onOrbitDrawCancel={onOrbitDrawCancel}
          onOrbitDrawComplete={onOrbitDrawComplete}
          interactionMode={interactionMode}
          genesisBirths={genesisBirths}
          emergingPatternId={emergingPatternId}
        />
      </Canvas>
    </div>
  );
}
