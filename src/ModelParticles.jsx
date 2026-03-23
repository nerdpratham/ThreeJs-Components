"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, useGLTF } from "@react-three/drei";
import * as THREE from "three";

const MODEL_PATH = "/MOTOR(1).gltf";
const MAX_PARTICLES = 100_000;
const PARTICLE_SIZE = 0.05;
const LERP_SPEED = 0.04;
const BG = "linear-gradient(90deg, #ffffff 35%, #000000 65%)";
const COL_A = "#5af0ff";
const SCROLL_HEIGHT = "800vh";

function extractVertices(gltf) {
  const out = [];

  gltf.scene.traverse((child) => {
    if (!child.isMesh) return;

    const geometry = child.geometry.clone();
    child.updateWorldMatrix(true, false);
    geometry.applyMatrix4(child.matrixWorld);

    const position = geometry.attributes.position;
    const index = geometry.index;

    if (!position) {
      geometry.dispose();
      return;
    }

    if (index) {
      for (let i = 0; i < index.count; i += 1) {
        const vertexIndex = index.getX(i);
        out.push(
          position.getX(vertexIndex),
          position.getY(vertexIndex),
          position.getZ(vertexIndex),
        );
      }
    } else {
      for (let i = 0; i < position.count; i += 1) {
        out.push(position.getX(i), position.getY(i), position.getZ(i));
      }
    }

    geometry.dispose();
  });

  return out;
}

function buildArrays(raw, maxCount) {
  const total = raw.length / 3;

  let cx = 0;
  let cy = 0;
  let cz = 0;

  for (let i = 0; i < total; i += 1) {
    cx += raw[i * 3];
    cy += raw[i * 3 + 1];
    cz += raw[i * 3 + 2];
  }

  cx /= total || 1;
  cy /= total || 1;
  cz /= total || 1;

  let maxRadius = 0;
  for (let i = 0; i < total; i += 1) {
    const dx = raw[i * 3] - cx;
    const dy = raw[i * 3 + 1] - cy;
    const dz = raw[i * 3 + 2] - cz;
    const radius = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (radius > maxRadius) maxRadius = radius;
  }

  const scale = maxRadius > 0 ? 2 / maxRadius : 1;
  const count = Math.min(total, maxCount);
  const chosen = new Uint32Array(count);

  for (let i = 0; i < count; i += 1) chosen[i] = i;
  for (let i = count; i < total; i += 1) {
    const j = Math.floor(Math.random() * (i + 1));
    if (j < count) chosen[j] = i;
  }

  const target = new Float32Array(count * 3);
  const scatter = new Float32Array(count * 3);
  const phases = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const vertexIndex = chosen[i];
    target[i * 3] = (raw[vertexIndex * 3] - cx) * scale;
    target[i * 3 + 1] = (raw[vertexIndex * 3 + 1] - cy) * scale;
    target[i * 3 + 2] = (raw[vertexIndex * 3 + 2] - cz) * scale;

    scatter[i * 3] = (Math.random() - 0.5) * 160;
    scatter[i * 3 + 1] = (Math.random() - 0.5) * 160;
    scatter[i * 3 + 2] = (Math.random() - 0.5) * 160;
    phases[i] = Math.random() * Math.PI * 2;
  }

  const vortex = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const r = 0.3 + Math.pow(Math.random(), 0.6) * 2.3;
    const spiralOffset = (r / 2.3) * Math.PI * 2 * 2.5;
    const angle = Math.random() * Math.PI * 2 + spiralOffset;
    const spread = 0.08 + r * 0.05;
    vortex[i * 3]     = Math.cos(angle) * r + (Math.random() - 0.5) * spread;
    vortex[i * 3 + 1] = Math.sin(angle) * r + (Math.random() - 0.5) * spread;
    vortex[i * 3 + 2] = (Math.random() - 0.5) * (0.12 + r * 0.04);
  }

  return { target, scatter, phases, vortex };
}

const vertexShader = /* glsl */ `
  attribute float aPhase;

  uniform float uTime;
  uniform float uProgress;
  uniform float uSize;
  uniform float uDpr;

  varying float vPhase;
  varying float vProgress;
  varying float vDist;
  varying vec2 vScreenUv;

  void main() {
    vPhase = aPhase;
    vProgress = uProgress;
    vDist = length(position);

    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float baseSize = mix(uSize * (0.5 + fract(aPhase * 13.37) * 4.0), uSize * 1.6, uProgress);
    float pSize = baseSize * uDpr;

    gl_PointSize = pSize * (280.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
    vScreenUv = (gl_Position.xy / gl_Position.w) * 0.5 + 0.5;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uProgress;
  uniform vec2 uResolution;

  varying float vPhase;
  varying float vProgress;
  varying float vDist;
  varying vec2 vScreenUv;

  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float dist = length(uv);
    if (dist > 1.0) discard;

    float core = smoothstep(1.0, 0.0, dist);
    float halo = smoothstep(1.0, 0.3, dist) * 0.35;
    float alpha = core + halo;

    float mixRatio = smoothstep(0.35, 0.65, vScreenUv.x);
    float intrinsicRandom = fract(vPhase / 6.28318);
    float side = step(intrinsicRandom, mixRatio);

    vec3 col = mix(vec3(0.0), vec3(1.0), side);
    col *= mix(0.25, 1.0, uProgress);
    alpha *= mix(1.0, 0.8, side);

    gl_FragColor = vec4(col, alpha * mix(0.35, 1.0, uProgress));
  }
`;

function ParticleCloud({ target, scatter, phases, vortex, progress }) {
  const ref = useRef(null);
  const livePositions = useRef(new Float32Array(scatter));

  const geometry = useMemo(() => {
    const value = new THREE.BufferGeometry();
    value.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(scatter), 3),
    );
    value.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    return value;
  }, [scatter, phases]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uProgress: { value: 0 },
          uSize: { value: PARTICLE_SIZE },
          uDpr: { value: Math.min(window.devicePixelRatio, 2) },
          uResolution: {
            value: new THREE.Vector2(window.innerWidth, window.innerHeight),
          },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
      }),
    [],
  );

  useEffect(() => {
    const handleResize = () => {
      material.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [material]);

  useFrame(({ clock }) => {
    if (!ref.current) return;

    const t = progress.current;
    const assembleT = Math.min(t / 0.60, 1.0);
    const vortexT = t > 0.75 ? Math.min((t - 0.75) / 0.25, 1.0) : 0;

    material.uniforms.uTime.value = clock.getElapsedTime();
    material.uniforms.uProgress.value = assembleT;

    const live = livePositions.current;
    const buffer = geometry.attributes.position.array;

    for (let i = 0; i < live.length; i += 1) {
      const motorPos = target[i] * assembleT + scatter[i] * (1 - assembleT);
      const destination = motorPos + (vortex[i] - motorPos) * vortexT;
      live[i] += (destination - live[i]) * LERP_SPEED;
      buffer[i] = live[i];
    }

    geometry.attributes.position.needsUpdate = true;
  });

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  return <points ref={ref} geometry={geometry} material={material} />;
}

function Scene({ progress }) {
  const gltf = useGLTF(MODEL_PATH);
  const groupRef = useRef(null);
  const timeRotation = useRef(0);
  const scrollRotation = useRef(0);

  const data = useMemo(() => {
    const raw = extractVertices(gltf);
    return buildArrays(raw, MAX_PARTICLES);
  }, [gltf]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    timeRotation.current += delta * 0.15;
    const targetScrollRotation = progress.current * Math.PI * 8;
    scrollRotation.current = THREE.MathUtils.lerp(
      scrollRotation.current,
      targetScrollRotation,
      0.08,
    );

    groupRef.current.rotation.y = timeRotation.current + scrollRotation.current;

    const targetScale = 0.4 + progress.current * 1.6;
    const newScale = THREE.MathUtils.lerp(groupRef.current.scale.x, targetScale, 0.05);
    groupRef.current.scale.setScalar(newScale);
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0, 6]} fov={42} />
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        maxPolarAngle={Math.PI * 0.8}
        minPolarAngle={Math.PI * 0.2}
        enableDamping
        dampingFactor={0.08}
      />
      <group ref={groupRef}>
        <ParticleCloud
          target={data.target}
          scatter={data.scatter}
          phases={data.phases}
          vortex={data.vortex}
          progress={progress}
        />
      </group>
    </>
  );
}

function LoadingRing() {
  const ref = useRef(null);

  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.getElapsedTime() * 1.2;
    }
  });

  return (
    <mesh ref={ref}>
      <torusGeometry args={[0.9, 0.012, 8, 80]} />
      <meshBasicMaterial color={COL_A} transparent opacity={0.5} />
    </mesh>
  );
}

export default function ModelParticlesPage() {
  const scrollRef = useRef(null);
  const progressRef = useRef(0);
  const text1Ref = useRef(null);
  const text2Ref = useRef(null);
  const text3Ref = useRef(null);
  const text4Ref = useRef(null);
  const text5Ref = useRef(null);

  const onScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;

    const { scrollTop, scrollHeight, clientHeight } = element;
    const max = scrollHeight - clientHeight;
    progressRef.current = max > 0 ? Math.min(scrollTop / max, 1) : 0;
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;

    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  useEffect(() => {
    let frameId = 0;

    const updateText = () => {
      const p = progressRef.current;

      if (text1Ref.current) {
        let opacity = 1;
        let blur = 0;
        let y = 0;

        if (p > 0.05) {
          const t = Math.min((p - 0.05) / 0.1, 1);
          opacity = 1 - t;
          blur = t * 12;
          y = t * -40;
        }

        text1Ref.current.style.opacity = opacity;
        text1Ref.current.style.filter = `blur(${blur}px)`;
        text1Ref.current.style.transform = `translateY(${y}px)`;
      }

      if (text2Ref.current) {
        let opacity = 0;
        let blur = 12;
        let y = 40;

        if (p > 0.15 && p <= 0.35) {
          const tIn = Math.min((p - 0.15) / 0.1, 1);
          opacity = tIn;
          blur = 12 - tIn * 12;
          y = 40 - tIn * 40;
        } else if (p > 0.35) {
          const tOut = Math.min((p - 0.35) / 0.1, 1);
          opacity = 1 - tOut;
          blur = tOut * 12;
          y = tOut * -40;
        }

        text2Ref.current.style.opacity = opacity;
        text2Ref.current.style.filter = `blur(${blur}px)`;
        text2Ref.current.style.transform = `translateY(${y}px)`;
      }

      if (text3Ref.current) {
        let opacity = 0;
        let blur = 20;
        let letterSpacing = 3;
        let y = 0;

        if (p > 0.45 && p <= 0.65) {
          const tIn = Math.min((p - 0.45) / 0.1, 1);
          opacity = tIn;
          blur = 20 - tIn * 20;
          letterSpacing = 3 - tIn * 3;
        } else if (p > 0.65) {
          const tOut = Math.min((p - 0.65) / 0.1, 1);
          opacity = 1 - tOut;
          blur = tOut * 12;
          letterSpacing = 0;
          y = tOut * -40;
        }

        text3Ref.current.style.opacity = opacity;
        text3Ref.current.style.filter = `blur(${blur}px)`;
        text3Ref.current.style.transform = `translateY(${y}px)`;

        const heading = text3Ref.current.querySelector("h2");
        if (heading) heading.style.letterSpacing = `${letterSpacing}em`;
      }

      if (text4Ref.current) {
        let opacity = 0;
        let blur = 20;
        let letterSpacing = 3;
        let y = 0;

        if (p > 0.75 && p <= 0.93) {
          const tIn = Math.min((p - 0.75) / 0.1, 1);
          opacity = tIn;
          blur = 20 - tIn * 20;
          letterSpacing = 3 - tIn * 3;
        } else if (p > 0.93) {
          const tOut = Math.min((p - 0.93) / 0.04, 1);
          opacity = 1 - tOut;
          blur = tOut * 12;
          letterSpacing = 0;
          y = tOut * -40;
        }

        text4Ref.current.style.opacity = opacity;
        text4Ref.current.style.filter = `blur(${blur}px)`;
        text4Ref.current.style.transform = `translateY(${y}px)`;

        const heading = text4Ref.current.querySelector("h2");
        if (heading) heading.style.letterSpacing = `${letterSpacing}em`;
      }

      if (text5Ref.current) {
        let opacity = 0;
        let blur = 12;
        let scale = 0.9;

        if (p >= 0.97) {
          const tIn = Math.min((p - 0.97) / 0.03, 1);
          opacity = tIn;
          blur = 12 - tIn * 12;
          scale = 0.9 + tIn * 0.1;
        }

        text5Ref.current.style.opacity = opacity;
        text5Ref.current.style.filter = `blur(${blur}px)`;
        text5Ref.current.style.transform = `scale(${scale})`;
      }

      frameId = requestAnimationFrame(updateText);
    };

    frameId = requestAnimationFrame(updateText);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Syne:wght@400;700;800&family=DM+Mono:wght@300;400&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { width: 100%; height: 100%; overflow: hidden; background: ${BG}; }
        .scroll-container::-webkit-scrollbar { display: none; }
        .scroll-container { scrollbar-width: none; ms-overflow-style: none; }
        .text-gradient {
          background-image: linear-gradient(90deg, #000000 35%, #ffffff 65%);
          background-attachment: fixed;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          color: transparent;
        }
      `}</style>

      <div
        ref={scrollRef}
        className="scroll-container"
        style={{
          position: "fixed",
          inset: 0,
          overflowY: "scroll",
          zIndex: 10,
        }}
      >
        <div style={{ height: SCROLL_HEIGHT }} />
      </div>

      <div
        ref={text1Ref}
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 5,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          paddingLeft: "10vw",
        }}
      >
        <div
          className="text-gradient"
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: "clamp(12px, 1.2vw, 16px)",
            letterSpacing: "0.2em",
            marginBottom: "2vh",
          }}
        >
          CHAPTER 01/
        </div>
        <h1
          className="text-gradient"
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: "clamp(4rem, 12vw, 15rem)",
            fontWeight: 400,
            lineHeight: 1.1,
            margin: 0,
            paddingBottom: "2vw",
          }}
        >
          Vincent
          <br />
          <span style={{ marginLeft: "12vw" }}>van Gogh</span>
        </h1>

        <div
          className="text-gradient"
          style={{
            position: "absolute",
            left: "3vw",
            bottom: "15vh",
            transformOrigin: "left bottom",
            transform: "rotate(-90deg)",
            fontFamily: "'DM Mono', monospace",
            fontSize: "clamp(10px, 1vw, 14px)",
            letterSpacing: "0.3em",
            whiteSpace: "nowrap",
          }}
        >
          SCROLL
        </div>
      </div>

      <div
        ref={text2Ref}
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 5,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: 0,
        }}
      >
        <h2
          className="text-gradient"
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: "clamp(3rem, 7vw, 10rem)",
            fontWeight: 400,
            margin: 0,
            textAlign: "center",
          }}
        >
          This is a story of
        </h2>
      </div>

      <div
        ref={text3Ref}
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 5,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: 0,
        }}
      >
        <h2
          className="text-gradient"
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: "clamp(3rem, 9vw, 12rem)",
            fontWeight: 400,
            margin: 0,
            textAlign: "center",
            whiteSpace: "nowrap",
          }}
        >
          lost art
        </h2>
      </div>

      <div
        ref={text4Ref}
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 5,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: 0,
        }}
      >
        <div style={{ textAlign: "left" }}>
          <h2
            className="text-gradient"
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: "clamp(2.5rem, 8vw, 10rem)",
              fontWeight: 400,
              margin: 0,
              lineHeight: 1.1,
              whiteSpace: "nowrap",
            }}
          >
            fractured
            <br />
            identity
          </h2>
        </div>
      </div>

      <div
        ref={text5Ref}
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 5,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: 0,
        }}
      >
        <h2
          className="text-gradient"
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: "clamp(4rem, 11vw, 15rem)",
            fontWeight: 400,
            margin: 0,
            textAlign: "center",
            whiteSpace: "nowrap",
          }}
        >
         Hope
        </h2>
      </div>

      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
        <Canvas
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          style={{ background: "transparent" }}
          dpr={[1, 2]}
        >
          <Suspense fallback={<LoadingRing />}>
            <Scene progress={progressRef} />
          </Suspense>
        </Canvas>
      </div>
    </>
  );
}

useGLTF.preload("/MOTOR(1).gltf");
