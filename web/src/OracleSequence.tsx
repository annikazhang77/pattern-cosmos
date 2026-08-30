import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import * as THREE from "three";
import type { OracleSequenceState } from "./types";

interface OracleSequenceProps {
  sequence: OracleSequenceState;
}

const oracleVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDirection;
  void main() {
    vUv = uv;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDirection = normalize(-viewPosition.xyz);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const oracleFragmentShader = `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDirection;

  float wave(vec2 p, float scale, float speed) {
    float a = sin((p.x * 1.8 + p.y * 1.15) * scale + uTime * speed);
    float b = sin((p.x * -1.2 + p.y * 2.1) * scale * 0.72 - uTime * speed * 0.83);
    return 0.5 + 0.25 * (a + b);
  }

  void main() {
    float fresnel = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewDirection)), 0.0, 1.0), 2.55);
    float largeGas = wave(vUv + vec2(sin(uTime * 0.13), cos(uTime * 0.1)) * 0.035, 7.2, 0.34);
    float fineGas = wave(vUv.yx + largeGas * 0.045, 18.0, -0.22);
    float density = smoothstep(0.28, 0.86, largeGas * 0.72 + fineGas * 0.36);
    vec3 cyan = vec3(0.16, 0.72, 0.79);
    vec3 rose = vec3(0.78, 0.25, 0.49);
    vec3 amber = vec3(0.92, 0.69, 0.34);
    vec3 gas = mix(cyan, rose, smoothstep(0.25, 0.8, vUv.x + fineGas * 0.12));
    gas = mix(gas, amber, smoothstep(0.68, 0.94, fineGas) * 0.34);
    float highlight = smoothstep(0.135, 0.015, distance(vUv, vec2(0.31, 0.73)));
    vec3 color = vec3(0.008, 0.019, 0.032);
    color += gas * density * 0.62;
    color += vec3(0.72, 0.95, 0.98) * fresnel * 0.66;
    color += vec3(1.0) * highlight * 0.92;
    float alpha = 0.54 + density * 0.19 + fresnel * 0.25;
    gl_FragColor = vec4(color, alpha);
  }
`;

const oracleStarVertexShader = `
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = 2.4 * (4.0 / max(2.0, -viewPosition.z));
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const oracleStarFragmentShader = `
  void main() {
    float radius = length(gl_PointCoord - 0.5);
    float alpha = smoothstep(0.5, 0.08, radius);
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(vec3(0.95, 1.0, 1.0), alpha * 0.9);
  }
`;

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function WarmOracleScene() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    const timer = window.setTimeout(() => gl.compile(scene, camera), 0);
    return () => window.clearTimeout(timer);
  }, [camera, gl, scene]);
  return null;
}

function OracleSphere() {
  const group = useRef<THREE.Group>(null);
  const material = useRef<THREE.ShaderMaterial>(null);
  const starPositions = useMemo(() => {
    const random = seededRandom(50321);
    const values: number[] = [];
    for (let index = 0; index < 18; index += 1) {
      const radius = Math.cbrt(random()) * 0.72;
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      values.push(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta),
      );
    }
    return new Float32Array(values);
  }, []);

  useFrame((state, delta) => {
    if (group.current) {
      group.current.rotation.y += delta * 0.12;
      group.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.22) * 0.035;
    }
    if (material.current) material.current.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <group ref={group}>
      <mesh>
        <sphereGeometry args={[1, 56, 40]} />
        <shaderMaterial
          ref={material}
          vertexShader={oracleVertexShader}
          fragmentShader={oracleFragmentShader}
          uniforms={{ uTime: { value: 0 } }}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh scale={1.012}>
        <sphereGeometry args={[1, 48, 36]} />
        <meshBasicMaterial
          color="#d9f3f4"
          transparent
          opacity={0.1}
          side={THREE.BackSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[starPositions, 3]} />
        </bufferGeometry>
        <shaderMaterial
          vertexShader={oracleStarVertexShader}
          fragmentShader={oracleStarFragmentShader}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>
    </group>
  );
}

export function OracleSequence({ sequence }: OracleSequenceProps) {
  const style = {
    "--oracle-origin-x": `${sequence.origin.x - window.innerWidth / 2}px`,
    "--oracle-origin-y": `${sequence.origin.y - window.innerHeight / 2}px`,
    "--oracle-origin-scale": Math.max(0.22, sequence.origin.size / 300),
  } as CSSProperties;

  return (
    <div
      className="oracle-sequence"
      data-phase={sequence.phase}
      data-pattern-id={sequence.patternId}
      style={style}
      role="status"
      aria-live="polite"
      aria-label="Reading the current orbit"
    >
      <div className="oracle-sequence__mist" />
      <div className="oracle-sequence__sphere" aria-hidden="true">
        <Canvas
          camera={{ position: [0, 0, 3.65], fov: 34, near: 0.1, far: 10 }}
          dpr={[0.9, 1.15]}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        >
          <WarmOracleScene />
          <OracleSphere />
        </Canvas>
      </div>
    </div>
  );
}
