import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";
import * as THREE from "three";
import type { OracleSequenceState } from "./types";

interface OracleSequenceProps {
  sequence: OracleSequenceState;
  onTraceComplete: () => void;
}

interface OracleInteractionState {
  active: boolean;
  progress: number;
  tiltX: number;
  tiltY: number;
}

interface TracePoint {
  x: number;
  y: number;
  speed: number;
}

const TRACE_MARGIN = 28;
const TRACE_THRESHOLD = 2.75;

const oracleVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDirection;
  varying vec3 vObjectPosition;
  void main() {
    vUv = uv;
    vObjectPosition = position;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDirection = normalize(-viewPosition.xyz);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const oracleFragmentShader = `
  uniform float uTime;
  uniform float uTrace;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDirection;
  varying vec3 vObjectPosition;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDirection = normalize(vViewDirection);
    vec3 keyLight = normalize(vec3(-0.62, 0.78, 0.92));
    vec3 sharpLight = normalize(vec3(-0.31, 0.91, 0.72));
    float fresnel = pow(1.0 - clamp(dot(normal, viewDirection), 0.0, 1.0), 3.35);
    float diffuse = max(dot(normal, keyLight), 0.0);
    float lowerRight = smoothstep(-0.15, 0.82, dot(normal, normalize(vec3(0.58, -0.64, 0.48))));
    float specular = pow(max(dot(reflect(-keyLight, normal), viewDirection), 0.0), 76.0);
    float sharpSpecular = pow(max(dot(reflect(-sharpLight, normal), viewDirection), 0.0), 180.0);
    float topLight = smoothstep(0.05, 0.92, dot(normal, normalize(vec3(-0.52, 0.72, 0.46))));
    float glassThickness = smoothstep(0.34, 0.98, fresnel);

    vec3 color = vec3(0.004, 0.009, 0.016);
    color += vec3(0.055, 0.16, 0.19) * diffuse * 0.48;
    color += vec3(0.34, 0.71, 0.77) * topLight * 0.18;
    color *= 1.0 - lowerRight * 0.58;
    color += vec3(0.68, 0.88, 0.91) * glassThickness * (0.28 + uTrace * 0.08);
    color += vec3(0.91, 0.98, 0.99) * specular * 0.94;
    color += vec3(1.0) * sharpSpecular * 1.45;
    color += vec3(0.72, 0.87, 0.9) * fresnel * 0.23;

    float alpha = 0.2 + diffuse * 0.06 + glassThickness * 0.55 + specular * 0.35 + sharpSpecular * 0.45;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.94));
  }
`;

const oracleNebulaFragmentShader = `
  uniform float uTime;
  uniform float uTrace;
  uniform float uLayer;
  varying vec2 vUv;
  varying vec3 vNormal;

  float wave(vec2 p, float scale, float speed) {
    float a = sin((p.x * 1.72 + p.y * 1.09) * scale + uTime * speed);
    float b = sin((p.x * -1.18 + p.y * 2.03) * scale * 0.71 - uTime * speed * 0.81);
    return 0.5 + 0.25 * (a + b);
  }

  void main() {
    vec2 drift = vec2(sin(uTime * (0.1 + uLayer * 0.03)), cos(uTime * 0.08)) * 0.035;
    float broad = wave(vUv + drift + uLayer * 0.07, 6.4 + uLayer * 1.7, 0.22 + uTrace * 0.13);
    float filament = wave(vUv.yx + broad * 0.05, 15.0 + uLayer * 3.0, -0.15 - uTrace * 0.08);
    float density = smoothstep(0.34, 0.86, broad * 0.7 + filament * 0.38);
    float edgeFade = pow(clamp(vNormal.z * 0.5 + 0.5, 0.0, 1.0), 0.72);
    vec3 cyan = vec3(0.12, 0.61, 0.7);
    vec3 rose = vec3(0.63, 0.16, 0.38);
    vec3 pearl = vec3(0.63, 0.82, 0.82);
    vec3 color = mix(cyan, rose, smoothstep(0.22, 0.86, vUv.x + filament * 0.1));
    color = mix(color, pearl, smoothstep(0.75, 0.98, density) * 0.34);
    float alpha = density * edgeFade * (0.2 + uLayer * 0.07 + uTrace * 0.045);
    gl_FragColor = vec4(color, alpha);
  }
`;

const oracleStarVertexShader = `
  varying float vDepth;
  void main() {
    vec3 adjusted = position;
    float radial = length(position.xy);
    float edgeRefraction = smoothstep(0.46, 0.74, radial);
    adjusted.xy += normalize(position.xy + vec2(0.0001)) * position.z * edgeRefraction * 0.026;
    vec4 viewPosition = modelViewMatrix * vec4(adjusted, 1.0);
    vDepth = position.z;
    gl_PointSize = (2.2 + (position.z + 0.7) * 1.35) * (4.0 / max(2.0, -viewPosition.z));
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const oracleStarFragmentShader = `
  varying float vDepth;
  void main() {
    float radius = length(gl_PointCoord - 0.5);
    float halo = smoothstep(0.5, 0.12, radius);
    float core = smoothstep(0.16, 0.015, radius);
    if (halo < 0.015) discard;
    vec3 temperature = mix(vec3(0.72, 0.88, 0.94), vec3(1.0, 0.97, 0.9), smoothstep(-0.55, 0.58, vDepth));
    gl_FragColor = vec4(temperature * (halo * 0.55 + core * 1.2), halo * (0.58 + core * 0.36));
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

function WarmOracleScene({ phase }: { phase: OracleSequenceState["phase"] }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    const dpr = Math.min(2, Math.max(1.5, window.devicePixelRatio || 1));
    gl.setPixelRatio(dpr);
    gl.setSize(320, 320, false);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.aspect = 1;
      camera.updateProjectionMatrix();
    }
    const timer = window.setTimeout(() => gl.compile(scene, camera), 0);
    return () => window.clearTimeout(timer);
  }, [camera, gl, phase, scene]);
  return null;
}

function OracleSphere({ interaction, phase }: { interaction: MutableRefObject<OracleInteractionState>; phase: OracleSequenceState["phase"] }) {
  const group = useRef<THREE.Group>(null);
  const deepLayer = useRef<THREE.Group>(null);
  const midLayer = useRef<THREE.Group>(null);
  const frontLayer = useRef<THREE.Group>(null);
  const shellMaterial = useRef<THREE.ShaderMaterial>(null);
  const deepMaterial = useRef<THREE.ShaderMaterial>(null);
  const midMaterial = useRef<THREE.ShaderMaterial>(null);
  const starLayers = useMemo(() => {
    const random = seededRandom(50321);
    const layers: number[][] = [[], [], []];
    for (let index = 0; index < 30; index += 1) {
      const radius = Math.cbrt(random()) * 0.69;
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.cos(phi);
      const z = radius * Math.sin(phi) * Math.sin(theta);
      const layer = z < -0.16 ? 0 : z > 0.18 ? 2 : 1;
      layers[layer].push(x, y, z);
    }
    return layers.map((values) => new Float32Array(values));
  }, []);

  useFrame((state, delta) => {
    const live = interaction.current;
    if (group.current) {
      const completeShake = phase === "COMPLETE" ? Math.sin(state.clock.elapsedTime * 48) * 0.035 : 0;
      group.current.rotation.y += delta * (0.08 + live.progress * 0.12);
      group.current.rotation.x = THREE.MathUtils.damp(
        group.current.rotation.x,
        Math.sin(state.clock.elapsedTime * 0.19) * 0.025 + live.tiltX * 0.1,
        7,
        delta,
      );
      group.current.rotation.z = THREE.MathUtils.damp(
        group.current.rotation.z,
        live.tiltY * 0.08 + completeShake,
        8,
        delta,
      );
    }
    const parallaxX = live.tiltY;
    const parallaxY = -live.tiltX;
    if (deepLayer.current) deepLayer.current.position.set(parallaxX * -0.018, parallaxY * -0.012, -0.02);
    if (midLayer.current) midLayer.current.position.set(parallaxX * 0.012, parallaxY * 0.009, 0.015);
    if (frontLayer.current) frontLayer.current.position.set(parallaxX * 0.038, parallaxY * 0.027, 0.045);
    if (shellMaterial.current) {
      shellMaterial.current.uniforms.uTime.value = state.clock.elapsedTime;
      shellMaterial.current.uniforms.uTrace.value = live.progress;
    }
    for (const material of [deepMaterial.current, midMaterial.current]) {
      if (!material) continue;
      material.uniforms.uTime.value = state.clock.elapsedTime;
      material.uniforms.uTrace.value = live.progress;
    }
  });

  const starMaterial = (
    <shaderMaterial
      vertexShader={oracleStarVertexShader}
      fragmentShader={oracleStarFragmentShader}
      transparent
      depthWrite={false}
      blending={THREE.AdditiveBlending}
      toneMapped={false}
    />
  );

  return (
    <group ref={group} rotation={[0.04, -0.12, -0.02]}>
      <group ref={deepLayer}>
        <mesh scale={0.72} rotation={[0.18, -0.34, 0.09]}>
          <sphereGeometry args={[1, 48, 36]} />
          <shaderMaterial
            ref={deepMaterial}
            vertexShader={oracleVertexShader}
            fragmentShader={oracleNebulaFragmentShader}
            uniforms={{ uTime: { value: 0 }, uTrace: { value: 0 }, uLayer: { value: 0.35 } }}
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        <points>
          <bufferGeometry><bufferAttribute attach="attributes-position" args={[starLayers[0], 3]} /></bufferGeometry>
          {starMaterial}
        </points>
      </group>
      <group ref={midLayer}>
        <mesh scale={0.54} rotation={[-0.25, 0.28, -0.18]}>
          <sphereGeometry args={[1, 44, 32]} />
          <shaderMaterial
            ref={midMaterial}
            vertexShader={oracleVertexShader}
            fragmentShader={oracleNebulaFragmentShader}
            uniforms={{ uTime: { value: 0 }, uTrace: { value: 0 }, uLayer: { value: 1.0 } }}
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        <points>
          <bufferGeometry><bufferAttribute attach="attributes-position" args={[starLayers[1], 3]} /></bufferGeometry>
          {starMaterial}
        </points>
      </group>
      <group ref={frontLayer}>
        <points>
          <bufferGeometry><bufferAttribute attach="attributes-position" args={[starLayers[2], 3]} /></bufferGeometry>
          {starMaterial}
        </points>
      </group>
      <mesh>
        <sphereGeometry args={[1, 64, 48]} />
        <shaderMaterial
          ref={shellMaterial}
          vertexShader={oracleVertexShader}
          fragmentShader={oracleFragmentShader}
          uniforms={{ uTime: { value: 0 }, uTrace: { value: 0 } }}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh scale={1.017}>
        <sphereGeometry args={[1, 56, 42]} />
        <meshBasicMaterial
          color="#d9edf0"
          transparent
          opacity={0.07}
          side={THREE.BackSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

export function OracleSequence({ sequence, onTraceComplete }: OracleSequenceProps) {
  const sphereRef = useRef<HTMLDivElement>(null);
  const traceCanvasRef = useRef<HTMLCanvasElement>(null);
  const tracePoints = useRef<TracePoint[]>([]);
  const lastSample = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastAngle = useRef(0);
  const accumulatedArc = useRef(0);
  const traceDirection = useRef(0);
  const complete = useRef(false);
  const interaction = useRef<OracleInteractionState>({ active: false, progress: 0, tiltX: 0, tiltY: 0 });
  const style = {
    "--oracle-origin-x": `${sequence.origin.x - window.innerWidth / 2}px`,
    "--oracle-origin-y": `${sequence.origin.y - window.innerHeight / 2}px`,
    "--oracle-origin-scale": Math.max(0.22, sequence.origin.size / 320),
  } as CSSProperties;

  const angleForPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return Math.atan2(
      event.clientY - (bounds.top + bounds.height / 2),
      event.clientX - (bounds.left + bounds.width / 2),
    );
  };

  const ensureTraceCanvas = () => {
    const canvas = traceCanvasRef.current;
    const sphere = sphereRef.current;
    if (!canvas || !sphere) return null;
    const cssWidth = sphere.clientWidth + TRACE_MARGIN * 2;
    const cssHeight = sphere.clientHeight + TRACE_MARGIN * 2;
    const dpr = Math.min(2, Math.max(1.5, window.devicePixelRatio || 1));
    const width = Math.round(cssWidth * dpr);
    const height = Math.round(cssHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { context, cssWidth, cssHeight };
  };

  const drawTraceTrail = (completed = false) => {
    const prepared = ensureTraceCanvas();
    if (!prepared) return;
    const { context, cssWidth, cssHeight } = prepared;
    const points = tracePoints.current;
    context.clearRect(0, 0, cssWidth, cssHeight);
    if (points.length < 2) return;

    const tracePath = () => {
      context.beginPath();
      context.moveTo(points[0].x + TRACE_MARGIN, points[0].y + TRACE_MARGIN);
      for (let index = 1; index < points.length - 1; index += 1) {
        const current = points[index];
        const next = points[index + 1];
        context.quadraticCurveTo(
          current.x + TRACE_MARGIN,
          current.y + TRACE_MARGIN,
          (current.x + next.x) / 2 + TRACE_MARGIN,
          (current.y + next.y) / 2 + TRACE_MARGIN,
        );
      }
      const last = points[points.length - 1];
      context.lineTo(last.x + TRACE_MARGIN, last.y + TRACE_MARGIN);
    };

    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    tracePath();
    context.strokeStyle = completed ? "rgba(238, 248, 255, 0.34)" : "rgba(215, 232, 242, 0.2)";
    context.lineWidth = completed ? 11 : 8;
    context.shadowColor = completed ? "rgba(222, 241, 252, 0.8)" : "rgba(196, 222, 238, 0.52)";
    context.shadowBlur = completed ? 22 : 15;
    context.stroke();
    context.restore();

    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    tracePath();
    context.strokeStyle = completed ? "rgba(249, 253, 255, 0.98)" : "rgba(231, 242, 249, 0.9)";
    context.lineWidth = completed ? 2.6 : 1.8;
    context.shadowColor = "rgba(238, 248, 255, 0.88)";
    context.shadowBlur = completed ? 10 : 6;
    context.stroke();
    context.restore();

    context.save();
    context.lineCap = "round";
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const point = points[index];
      const speedLift = Math.min(0.7, point.speed / 1350);
      context.beginPath();
      context.moveTo(previous.x + TRACE_MARGIN, previous.y + TRACE_MARGIN);
      context.lineTo(point.x + TRACE_MARGIN, point.y + TRACE_MARGIN);
      context.lineWidth = 0.75 + (Math.sin(index * 0.83) * 0.5 + 0.5) * 0.62 + speedLift * 0.35;
      context.strokeStyle = `rgba(255, 255, 255, ${0.48 + speedLift * 0.32})`;
      context.stroke();
    }
    context.restore();

    context.save();
    for (let index = 8; index < points.length; index += 11) {
      const point = points[index];
      if (point.speed < 100 && index % 22 !== 0) continue;
      const radius = completed ? 1.5 : 0.75 + Math.min(0.65, point.speed / 1800);
      context.beginPath();
      context.arc(point.x + TRACE_MARGIN, point.y + TRACE_MARGIN, radius, 0, Math.PI * 2);
      context.fillStyle = completed ? "rgba(255, 255, 255, 0.95)" : "rgba(236, 247, 253, 0.75)";
      context.shadowColor = "rgba(225, 243, 253, 0.9)";
      context.shadowBlur = completed ? 9 : 6;
      context.fill();
    }
    context.restore();
  };

  const updateVisualProgress = (progress: number) => {
    interaction.current.progress = progress;
  };

  const finishTrace = () => {
    if (complete.current) return;
    complete.current = true;
    interaction.current.active = false;
    updateVisualProgress(1);
    drawTraceTrail(true);
    onTraceComplete();
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (sequence.phase !== "TRACE" || complete.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top, speed: 0 };
    interaction.current.active = true;
    lastAngle.current = angleForPointer(event);
    lastSample.current = { x: point.x, y: point.y, time: performance.now() };
    if (tracePoints.current.length === 0) tracePoints.current.push(point);
    drawTraceTrail();
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interaction.current.active || sequence.phase !== "TRACE" || complete.current) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const normalizedX = (event.clientX - (bounds.left + bounds.width / 2)) / (bounds.width / 2);
    const normalizedY = (event.clientY - (bounds.top + bounds.height / 2)) / (bounds.height / 2);
    interaction.current.tiltX = THREE.MathUtils.clamp(normalizedY, -1, 1);
    interaction.current.tiltY = THREE.MathUtils.clamp(normalizedX, -1, 1);

    const angle = angleForPointer(event);
    let delta = angle - lastAngle.current;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    lastAngle.current = angle;
    if (Math.abs(delta) <= 0.75) {
      const direction = Math.sign(delta);
      if (traceDirection.current === 0 && Math.abs(delta) > 0.008) traceDirection.current = direction;
      if (direction === traceDirection.current || direction === 0) accumulatedArc.current += Math.abs(delta);
      else accumulatedArc.current = Math.max(0, accumulatedArc.current - Math.abs(delta) * 0.42);
    }

    const now = performance.now();
    const previous = lastSample.current;
    const distance = previous ? Math.hypot(x - previous.x, y - previous.y) : 0;
    if (!previous || distance >= 1.8) {
      const elapsed = previous ? Math.max(8, now - previous.time) : 16;
      tracePoints.current.push({ x, y, speed: distance / elapsed * 1000 });
      if (tracePoints.current.length > 180) tracePoints.current.splice(1, 1);
      lastSample.current = { x, y, time: now };
      drawTraceTrail();
    }

    const progress = THREE.MathUtils.clamp(accumulatedArc.current / TRACE_THRESHOLD, 0, 1);
    updateVisualProgress(progress);
    if (progress >= 1) finishTrace();
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    interaction.current.active = false;
    lastSample.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* capture already released */ }
  };

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
      <p className="oracle-sequence__instruction">Trace the orbit.</p>
      <div
        ref={sphereRef}
        className="oracle-sequence__sphere"
        role="button"
        aria-label="Trace an arc around the Oracle sphere"
        tabIndex={sequence.phase === "TRACE" ? 0 : -1}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onKeyDown={(event) => {
          if (sequence.phase === "TRACE" && (event.key === "Enter" || event.key === " ")) finishTrace();
        }}
      >
        <Canvas
          className="oracle-sequence__render-canvas"
          camera={{ position: [0, 0, 3.7], fov: 34, near: 0.1, far: 10 }}
          dpr={[1.5, 2]}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        >
          <WarmOracleScene phase={sequence.phase} />
          <OracleSphere interaction={interaction} phase={sequence.phase} />
        </Canvas>
        <canvas ref={traceCanvasRef} className="oracle-sequence__trace-canvas" aria-hidden="true" />
      </div>
    </div>
  );
}
