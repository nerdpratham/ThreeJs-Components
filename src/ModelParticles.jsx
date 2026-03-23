// "use client";

// import { Suspense, useCallback, useEffect, useMemo, useRef } from "react";
// import { Canvas, useFrame } from "@react-three/fiber";
// import { OrbitControls, PerspectiveCamera, useGLTF } from "@react-three/drei";
// import * as THREE from "three";

// const MODEL_PATH = "/MOTOR(1).gltf";
// const MAX_PARTICLES = 100_000;
// const PARTICLE_SIZE = 0.05;
// const LERP_SPEED = 0.04;
// const BG = "linear-gradient(90deg, #ffffff 35%, #000000 65%)";
// const COL_A = "#5af0ff";
// const SCROLL_HEIGHT = "800vh";

// function extractVertices(gltf) {
//   const out = [];

//   gltf.scene.traverse((child) => {
//     if (!child.isMesh) return;

//     const geometry = child.geometry.clone();
//     child.updateWorldMatrix(true, false);
//     geometry.applyMatrix4(child.matrixWorld);

//     const position = geometry.attributes.position;
//     const index = geometry.index;

//     if (!position) {
//       geometry.dispose();
//       return;
//     }

//     if (index) {
//       for (let i = 0; i < index.count; i += 1) {
//         const vertexIndex = index.getX(i);
//         out.push(
//           position.getX(vertexIndex),
//           position.getY(vertexIndex),
//           position.getZ(vertexIndex),
//         );
//       }
//     } else {
//       for (let i = 0; i < position.count; i += 1) {
//         out.push(position.getX(i), position.getY(i), position.getZ(i));
//       }
//     }

//     geometry.dispose();
//   });

//   return out;
// }

// function buildArrays(raw, maxCount) {
//   const total = raw.length / 3;

//   let cx = 0;
//   let cy = 0;
//   let cz = 0;

//   for (let i = 0; i < total; i += 1) {
//     cx += raw[i * 3];
//     cy += raw[i * 3 + 1];
//     cz += raw[i * 3 + 2];
//   }

//   cx /= total || 1;
//   cy /= total || 1;
//   cz /= total || 1;

//   let maxRadius = 0;
//   for (let i = 0; i < total; i += 1) {
//     const dx = raw[i * 3] - cx;
//     const dy = raw[i * 3 + 1] - cy;
//     const dz = raw[i * 3 + 2] - cz;
//     const radius = Math.sqrt(dx * dx + dy * dy + dz * dz);
//     if (radius > maxRadius) maxRadius = radius;
//   }

//   const scale = maxRadius > 0 ? 2 / maxRadius : 1;
//   const count = Math.min(total, maxCount);
//   const chosen = new Uint32Array(count);

//   for (let i = 0; i < count; i += 1) chosen[i] = i;
//   for (let i = count; i < total; i += 1) {
//     const j = Math.floor(Math.random() * (i + 1));
//     if (j < count) chosen[j] = i;
//   }

//   const target = new Float32Array(count * 3);
//   const scatter = new Float32Array(count * 3);
//   const phases = new Float32Array(count);

//   for (let i = 0; i < count; i += 1) {
//     const vertexIndex = chosen[i];
//     target[i * 3] = (raw[vertexIndex * 3] - cx) * scale;
//     target[i * 3 + 1] = (raw[vertexIndex * 3 + 1] - cy) * scale;
//     target[i * 3 + 2] = (raw[vertexIndex * 3 + 2] - cz) * scale;

//     scatter[i * 3] = (Math.random() - 0.5) * 160;
//     scatter[i * 3 + 1] = (Math.random() - 0.5) * 160;
//     scatter[i * 3 + 2] = (Math.random() - 0.5) * 160;
//     phases[i] = Math.random() * Math.PI * 2;
//   }

//   const vortex = new Float32Array(count * 3);
//   for (let i = 0; i < count; i += 1) {
//     const r = 0.3 + Math.pow(Math.random(), 0.6) * 2.3;
//     const spiralOffset = (r / 2.3) * Math.PI * 2 * 2.5;
//     const angle = Math.random() * Math.PI * 2 + spiralOffset;
//     const spread = 0.08 + r * 0.05;
//     vortex[i * 3]     = Math.cos(angle) * r + (Math.random() - 0.5) * spread;
//     vortex[i * 3 + 1] = Math.sin(angle) * r + (Math.random() - 0.5) * spread;
//     vortex[i * 3 + 2] = (Math.random() - 0.5) * (0.12 + r * 0.04);
//   }

//   return { target, scatter, phases, vortex };
// }

// const vertexShader = /* glsl */ `
//   attribute float aPhase;

//   uniform float uTime;
//   uniform float uProgress;
//   uniform float uSize;
//   uniform float uDpr;

//   varying float vPhase;
//   varying float vProgress;
//   varying float vDist;
//   varying vec2 vScreenUv;

//   void main() {
//     vPhase = aPhase;
//     vProgress = uProgress;
//     vDist = length(position);

//     vec4 mv = modelViewMatrix * vec4(position, 1.0);
//     float baseSize = mix(uSize * (0.5 + fract(aPhase * 13.37) * 4.0), uSize * 1.6, uProgress);
//     float pSize = baseSize * uDpr;

//     gl_PointSize = pSize * (280.0 / -mv.z);
//     gl_Position = projectionMatrix * mv;
//     vScreenUv = (gl_Position.xy / gl_Position.w) * 0.5 + 0.5;
//   }
// `;

// const fragmentShader = /* glsl */ `
//   uniform float uTime;
//   uniform float uProgress;
//   uniform vec2 uResolution;

//   varying float vPhase;
//   varying float vProgress;
//   varying float vDist;
//   varying vec2 vScreenUv;

//   void main() {
//     vec2 uv = gl_PointCoord * 2.0 - 1.0;
//     float dist = length(uv);
//     if (dist > 1.0) discard;

//     float core = smoothstep(1.0, 0.0, dist);
//     float halo = smoothstep(1.0, 0.3, dist) * 0.35;
//     float alpha = core + halo;

//     float mixRatio = smoothstep(0.35, 0.65, vScreenUv.x);
//     float intrinsicRandom = fract(vPhase / 6.28318);
//     float side = step(intrinsicRandom, mixRatio);

//     vec3 col = mix(vec3(0.0), vec3(1.0), side);
//     col *= mix(0.25, 1.0, uProgress);
//     alpha *= mix(1.0, 0.8, side);

//     gl_FragColor = vec4(col, alpha * mix(0.35, 1.0, uProgress));
//   }
// `;

// function ParticleCloud({ target, scatter, phases, vortex, progress }) {
//   const ref = useRef(null);
//   const livePositions = useRef(new Float32Array(scatter));

//   const geometry = useMemo(() => {
//     const value = new THREE.BufferGeometry();
//     value.setAttribute(
//       "position",
//       new THREE.BufferAttribute(new Float32Array(scatter), 3),
//     );
//     value.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
//     return value;
//   }, [scatter, phases]);

//   const material = useMemo(
//     () =>
//       new THREE.ShaderMaterial({
//         vertexShader,
//         fragmentShader,
//         uniforms: {
//           uTime: { value: 0 },
//           uProgress: { value: 0 },
//           uSize: { value: PARTICLE_SIZE },
//           uDpr: { value: Math.min(window.devicePixelRatio, 2) },
//           uResolution: {
//             value: new THREE.Vector2(window.innerWidth, window.innerHeight),
//           },
//         },
//         transparent: true,
//         depthWrite: false,
//         blending: THREE.NormalBlending,
//       }),
//     [],
//   );

//   useEffect(() => {
//     const handleResize = () => {
//       material.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
//     };

//     window.addEventListener("resize", handleResize);
//     return () => window.removeEventListener("resize", handleResize);
//   }, [material]);

//   useFrame(({ clock }) => {
//     if (!ref.current) return;

//     const t = progress.current;
//     const assembleT = Math.min(t / 0.60, 1.0);
//     const vortexT = t > 0.75 ? Math.min((t - 0.75) / 0.25, 1.0) : 0;

//     material.uniforms.uTime.value = clock.getElapsedTime();
//     material.uniforms.uProgress.value = assembleT;

//     const live = livePositions.current;
//     const buffer = geometry.attributes.position.array;

//     for (let i = 0; i < live.length; i += 1) {
//       const motorPos = target[i] * assembleT + scatter[i] * (1 - assembleT);
//       const destination = motorPos + (vortex[i] - motorPos) * vortexT;
//       live[i] += (destination - live[i]) * LERP_SPEED;
//       buffer[i] = live[i];
//     }

//     geometry.attributes.position.needsUpdate = true;
//   });

//   useEffect(
//     () => () => {
//       geometry.dispose();
//       material.dispose();
//     },
//     [geometry, material],
//   );

//   return <points ref={ref} geometry={geometry} material={material} />;
// }

// function Scene({ progress }) {
//   const gltf = useGLTF(MODEL_PATH);
//   const groupRef = useRef(null);
//   const timeRotation = useRef(0);
//   const scrollRotation = useRef(0);

//   const data = useMemo(() => {
//     const raw = extractVertices(gltf);
//     return buildArrays(raw, MAX_PARTICLES);
//   }, [gltf]);

//   useFrame((_, delta) => {
//     if (!groupRef.current) return;

//     timeRotation.current += delta * 0.15;
//     const targetScrollRotation = progress.current * Math.PI * 8;
//     scrollRotation.current = THREE.MathUtils.lerp(
//       scrollRotation.current,
//       targetScrollRotation,
//       0.08,
//     );

//     groupRef.current.rotation.y = timeRotation.current + scrollRotation.current;

//     const targetScale = 0.4 + progress.current * 1.6;
//     const newScale = THREE.MathUtils.lerp(groupRef.current.scale.x, targetScale, 0.05);
//     groupRef.current.scale.setScalar(newScale);
//   });

//   return (
//     <>
//       <PerspectiveCamera makeDefault position={[0, 0, 6]} fov={42} />
//       <OrbitControls
//         enableZoom={false}
//         enablePan={false}
//         maxPolarAngle={Math.PI * 0.8}
//         minPolarAngle={Math.PI * 0.2}
//         enableDamping
//         dampingFactor={0.08}
//       />
//       <group ref={groupRef}>
//         <ParticleCloud
//           target={data.target}
//           scatter={data.scatter}
//           phases={data.phases}
//           vortex={data.vortex}
//           progress={progress}
//         />
//       </group>
//     </>
//   );
// }

// function LoadingRing() {
//   const ref = useRef(null);

//   useFrame(({ clock }) => {
//     if (ref.current) {
//       ref.current.rotation.y = clock.getElapsedTime() * 1.2;
//     }
//   });

//   return (
//     <mesh ref={ref}>
//       <torusGeometry args={[0.9, 0.012, 8, 80]} />
//       <meshBasicMaterial color={COL_A} transparent opacity={0.5} />
//     </mesh>
//   );
// }

// export default function ModelParticlesPage() {
//   const scrollRef = useRef(null);
//   const progressRef = useRef(0);
//   const text1Ref = useRef(null);
//   const text2Ref = useRef(null);
//   const text3Ref = useRef(null);
//   const text4Ref = useRef(null);
//   const text5Ref = useRef(null);

//   const onScroll = useCallback(() => {
//     const element = scrollRef.current;
//     if (!element) return;

//     const { scrollTop, scrollHeight, clientHeight } = element;
//     const max = scrollHeight - clientHeight;
//     progressRef.current = max > 0 ? Math.min(scrollTop / max, 1) : 0;
//   }, []);

//   useEffect(() => {
//     const element = scrollRef.current;
//     if (!element) return undefined;

//     element.addEventListener("scroll", onScroll, { passive: true });
//     return () => element.removeEventListener("scroll", onScroll);
//   }, [onScroll]);

//   useEffect(() => {
//     let frameId = 0;

//     const updateText = () => {
//       const p = progressRef.current;

//       if (text1Ref.current) {
//         let opacity = 1;
//         let blur = 0;
//         let y = 0;

//         if (p > 0.05) {
//           const t = Math.min((p - 0.05) / 0.1, 1);
//           opacity = 1 - t;
//           blur = t * 12;
//           y = t * -40;
//         }

//         text1Ref.current.style.opacity = opacity;
//         text1Ref.current.style.filter = `blur(${blur}px)`;
//         text1Ref.current.style.transform = `translateY(${y}px)`;
//       }

//       if (text2Ref.current) {
//         let opacity = 0;
//         let blur = 12;
//         let y = 40;

//         if (p > 0.15 && p <= 0.35) {
//           const tIn = Math.min((p - 0.15) / 0.1, 1);
//           opacity = tIn;
//           blur = 12 - tIn * 12;
//           y = 40 - tIn * 40;
//         } else if (p > 0.35) {
//           const tOut = Math.min((p - 0.35) / 0.1, 1);
//           opacity = 1 - tOut;
//           blur = tOut * 12;
//           y = tOut * -40;
//         }

//         text2Ref.current.style.opacity = opacity;
//         text2Ref.current.style.filter = `blur(${blur}px)`;
//         text2Ref.current.style.transform = `translateY(${y}px)`;
//       }

//       if (text3Ref.current) {
//         let opacity = 0;
//         let blur = 20;
//         let letterSpacing = 3;
//         let y = 0;

//         if (p > 0.45 && p <= 0.65) {
//           const tIn = Math.min((p - 0.45) / 0.1, 1);
//           opacity = tIn;
//           blur = 20 - tIn * 20;
//           letterSpacing = 3 - tIn * 3;
//         } else if (p > 0.65) {
//           const tOut = Math.min((p - 0.65) / 0.1, 1);
//           opacity = 1 - tOut;
//           blur = tOut * 12;
//           letterSpacing = 0;
//           y = tOut * -40;
//         }

//         text3Ref.current.style.opacity = opacity;
//         text3Ref.current.style.filter = `blur(${blur}px)`;
//         text3Ref.current.style.transform = `translateY(${y}px)`;

//         const heading = text3Ref.current.querySelector("h2");
//         if (heading) heading.style.letterSpacing = `${letterSpacing}em`;
//       }

//       if (text4Ref.current) {
//         let opacity = 0;
//         let blur = 20;
//         let letterSpacing = 3;
//         let y = 0;

//         if (p > 0.75 && p <= 0.93) {
//           const tIn = Math.min((p - 0.75) / 0.1, 1);
//           opacity = tIn;
//           blur = 20 - tIn * 20;
//           letterSpacing = 3 - tIn * 3;
//         } else if (p > 0.93) {
//           const tOut = Math.min((p - 0.93) / 0.04, 1);
//           opacity = 1 - tOut;
//           blur = tOut * 12;
//           letterSpacing = 0;
//           y = tOut * -40;
//         }

//         text4Ref.current.style.opacity = opacity;
//         text4Ref.current.style.filter = `blur(${blur}px)`;
//         text4Ref.current.style.transform = `translateY(${y}px)`;

//         const heading = text4Ref.current.querySelector("h2");
//         if (heading) heading.style.letterSpacing = `${letterSpacing}em`;
//       }

//       if (text5Ref.current) {
//         let opacity = 0;
//         let blur = 12;
//         let scale = 0.9;

//         if (p >= 0.97) {
//           const tIn = Math.min((p - 0.97) / 0.03, 1);
//           opacity = tIn;
//           blur = 12 - tIn * 12;
//           scale = 0.9 + tIn * 0.1;
//         }

//         text5Ref.current.style.opacity = opacity;
//         text5Ref.current.style.filter = `blur(${blur}px)`;
//         text5Ref.current.style.transform = `scale(${scale})`;
//       }

//       frameId = requestAnimationFrame(updateText);
//     };

//     frameId = requestAnimationFrame(updateText);
//     return () => cancelAnimationFrame(frameId);
//   }, []);

//   return (
//     <>
//       <style>{`
//         @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Syne:wght@400;700;800&family=DM+Mono:wght@300;400&display=swap');

//         *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
//         html, body { width: 100%; height: 100%; overflow: hidden; background: ${BG}; }
//         .scroll-container::-webkit-scrollbar { display: none; }
//         .scroll-container { scrollbar-width: none; ms-overflow-style: none; }
//         .text-gradient {
//           background-image: linear-gradient(90deg, #000000 35%, #ffffff 65%);
//           background-attachment: fixed;
//           -webkit-background-clip: text;
//           -webkit-text-fill-color: transparent;
//           color: transparent;
//         }
//       `}</style>

//       <div
//         ref={scrollRef}
//         className="scroll-container"
//         style={{
//           position: "fixed",
//           inset: 0,
//           overflowY: "scroll",
//           zIndex: 10,
//         }}
//       >
//         <div style={{ height: SCROLL_HEIGHT }} />
//       </div>

//       <div
//         ref={text1Ref}
//         style={{
//           position: "fixed",
//           inset: 0,
//           pointerEvents: "none",
//           zIndex: 5,
//           display: "flex",
//           flexDirection: "column",
//           justifyContent: "center",
//           paddingLeft: "10vw",
//         }}
//       >
//         <div
//           className="text-gradient"
//           style={{
//             fontFamily: "'DM Mono', monospace",
//             fontSize: "clamp(12px, 1.2vw, 16px)",
//             letterSpacing: "0.2em",
//             marginBottom: "2vh",
//           }}
//         >
//           CHAPTER 01/
//         </div>
//         <h1
//           className="text-gradient"
//           style={{
//             fontFamily: "'Playfair Display', serif",
//             fontSize: "clamp(4rem, 12vw, 15rem)",
//             fontWeight: 400,
//             lineHeight: 1.1,
//             margin: 0,
//             paddingBottom: "2vw",
//           }}
//         >
//           Vincent
//           <br />
//           <span style={{ marginLeft: "12vw" }}>van Gogh</span>
//         </h1>

//         <div
//           className="text-gradient"
//           style={{
//             position: "absolute",
//             left: "3vw",
//             bottom: "15vh",
//             transformOrigin: "left bottom",
//             transform: "rotate(-90deg)",
//             fontFamily: "'DM Mono', monospace",
//             fontSize: "clamp(10px, 1vw, 14px)",
//             letterSpacing: "0.3em",
//             whiteSpace: "nowrap",
//           }}
//         >
//           SCROLL
//         </div>
//       </div>

//       <div
//         ref={text2Ref}
//         style={{
//           position: "fixed",
//           inset: 0,
//           pointerEvents: "none",
//           zIndex: 5,
//           display: "flex",
//           alignItems: "center",
//           justifyContent: "center",
//           opacity: 0,
//         }}
//       >
//         <h2
//           className="text-gradient"
//           style={{
//             fontFamily: "'Playfair Display', serif",
//             fontSize: "clamp(3rem, 7vw, 10rem)",
//             fontWeight: 400,
//             margin: 0,
//             textAlign: "center",
//           }}
//         >
//           This is a story of
//         </h2>
//       </div>

//       <div
//         ref={text3Ref}
//         style={{
//           position: "fixed",
//           inset: 0,
//           pointerEvents: "none",
//           zIndex: 5,
//           display: "flex",
//           alignItems: "center",
//           justifyContent: "center",
//           opacity: 0,
//         }}
//       >
//         <h2
//           className="text-gradient"
//           style={{
//             fontFamily: "'Playfair Display', serif",
//             fontSize: "clamp(3rem, 9vw, 12rem)",
//             fontWeight: 400,
//             margin: 0,
//             textAlign: "center",
//             whiteSpace: "nowrap",
//           }}
//         >
//           lost art
//         </h2>
//       </div>

//       <div
//         ref={text4Ref}
//         style={{
//           position: "fixed",
//           inset: 0,
//           pointerEvents: "none",
//           zIndex: 5,
//           display: "flex",
//           alignItems: "center",
//           justifyContent: "center",
//           opacity: 0,
//         }}
//       >
//         <div style={{ textAlign: "left" }}>
//           <h2
//             className="text-gradient"
//             style={{
//               fontFamily: "'Playfair Display', serif",
//               fontSize: "clamp(2.5rem, 8vw, 10rem)",
//               fontWeight: 400,
//               margin: 0,
//               lineHeight: 1.1,
//               whiteSpace: "nowrap",
//             }}
//           >
//             fractured
//             <br />
//             identity
//           </h2>
//         </div>
//       </div>

//       <div
//         ref={text5Ref}
//         style={{
//           position: "fixed",
//           inset: 0,
//           pointerEvents: "none",
//           zIndex: 5,
//           display: "flex",
//           alignItems: "center",
//           justifyContent: "center",
//           opacity: 0,
//         }}
//       >
//         <h2
//           className="text-gradient"
//           style={{
//             fontFamily: "'Playfair Display', serif",
//             fontSize: "clamp(4rem, 11vw, 15rem)",
//             fontWeight: 400,
//             margin: 0,
//             textAlign: "center",
//             whiteSpace: "nowrap",
//           }}
//         >
//          Hope
//         </h2>
//       </div>

//       <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
//         <Canvas
//           gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
//           style={{ background: "transparent" }}
//           dpr={[1, 2]}
//         >
//           <Suspense fallback={<LoadingRing />}>
//             <Scene progress={progressRef} />
//           </Suspense>
//         </Canvas>
//       </div>
//     </>
//   );
// }

// useGLTF.preload("/MOTOR(1).gltf");




"use client";

/**
 * ModelParticlesPage.jsx
 *
 * Scroll-driven particle assembly animation.
 * Loads /public/human/scene.gltf, extracts all mesh vertices,
 * scatters them into space, then reassembles them into the human
 * form as the user scrolls down.
 *
 * Install:
 *   npm install three @react-three/fiber @react-three/drei
 *
 * Drop this file anywhere in your src/ and render <ModelParticlesPage />
 */

import {
  useRef,
  useMemo,
  useEffect,
  useState,
  Suspense,
  useCallback,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  useGLTF,
  OrbitControls,
  PerspectiveCamera,
} from "@react-three/drei";
import * as THREE from "three";

/* ─────────────────────────────────────────────────────────────
   CONFIG
───────────────────────────────────────────────────────────── */
const MODEL_HUMAN_PATH = "/human/scene.gltf";
const MODEL_MOTOR_PATH = "/MOTOR(1).gltf";
const MAX_PARTICLES = 140_000;
const SCATTER_RADIUS = 10;
const PARTICLE_SIZE = 0.018; // Much sharper definition, less blob-like
const LERP_SPEED = 0.04;
const BG = "linear-gradient(90deg, #ffffff 35%, #000000 65%)"; // Smooth split background
const COL_A = "#5af0ff";   // Unused now but kept for fallback
const COL_B = "#ff4d6d";   // Unused now but kept for fallback
const SCROLL_HEIGHT = "1200vh";     // total scrollable distance

/* ─────────────────────────────────────────────────────────────
   VERTEX EXTRACTION
   Traverses every mesh, applies world transform, collects
   position attribute data (indexed or flat).
───────────────────────────────────────────────────────────── */
function extractVertices(gltf) {
  const out = [];
  gltf.scene.traverse((child) => {
    if (!child.isMesh) return;
    const geo = child.geometry.clone();
    child.updateWorldMatrix(true, false);
    geo.applyMatrix4(child.matrixWorld);
    const pos = geo.attributes.position;
    if (!pos) return;
    const idx = geo.index;
    if (idx) {
      for (let i = 0; i < idx.count; i++) {
        const v = idx.getX(i);
        out.push(pos.getX(v), pos.getY(v), pos.getZ(v));
      }
    } else {
      for (let i = 0; i < pos.count; i++) {
        out.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      }
    }
    geo.dispose();
  });
  return out;
}

/* ─────────────────────────────────────────────────────────────
   PARTICLE ARRAYS
   Returns two Float32Arrays:
     target  — vertices in model-space (centred, normalised)
     scatter — random positions on a sphere shell
───────────────────────────────────────────────────────────── */
function buildArrays(rawHuman, rawMotor, maxCount) {
  const count = maxCount;

  // Normalized vertex sampler
  function getNormalized(raw) {
    const total = raw.length / 3;
    let cx = 0, cy = 0, cz = 0;
    if (total === 0) return new Float32Array(count * 3); // Safety fallback
    for (let i = 0; i < total; i++) {
      cx += raw[i * 3]; cy += raw[i * 3 + 1]; cz += raw[i * 3 + 2];
    }
    cx /= total; cy /= total; cz /= total;

    let maxR = 0;
    for (let i = 0; i < total; i++) {
      const dx = raw[i * 3] - cx, dy = raw[i * 3 + 1] - cy, dz = raw[i * 3 + 2] - cz;
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (r > maxR) maxR = r;
    }
    const scale = maxR > 0 ? 2.0 / maxR : 1;

    const target = new Float32Array(count * 3);
    const chosen = new Uint32Array(count);
    if (total >= count) {
      for (let i = 0; i < count; i++) chosen[i] = i;
      for (let i = count; i < total; i++) {
        const j = Math.floor(Math.random() * (i + 1));
        if (j < count) chosen[j] = i;
      }
    } else {
      for (let i = 0; i < count; i++) {
        chosen[i] = Math.floor(Math.random() * total);
      }
    }

    for (let i = 0; i < count; i++) {
      const vi = chosen[i];
      target[i * 3] = (raw[vi * 3] - cx) * scale;
      target[i * 3 + 1] = (raw[vi * 3 + 1] - cy) * scale;
      target[i * 3 + 2] = (raw[vi * 3 + 2] - cz) * scale;
    }
    return target;
  }

  const targetA = getNormalized(rawHuman);
  const targetB = getNormalized(rawMotor);

  const scatter = new Float32Array(count * 3);
  const vortex = new Float32Array(count * 3);
  const phases = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    scatter[i * 3] = (Math.random() - 0.5) * 160;     // x
    scatter[i * 3 + 1] = (Math.random() - 0.5) * 160; // y
    scatter[i * 3 + 2] = (Math.random() - 0.5) * 160; // z

    const vTheta = Math.random() * Math.PI * 2; // full circle
    const vR = 3.5 + Math.pow(Math.random(), 2.5) * 5.0;
    vortex[i * 3 + 0] = Math.cos(vTheta) * vR;
    vortex[i * 3 + 1] = Math.sin(vTheta) * vR;
    vortex[i * 3 + 2] = (Math.random() - 0.5) * 2.5;

    phases[i] = Math.random() * Math.PI * 2;
  }

  return { targetA, targetB, scatter, vortex, phases, count };
}

/* ─────────────────────────────────────────────────────────────
   VERTEX SHADER
───────────────────────────────────────────────────────────── */
const vertexShader = /* glsl */`
  attribute float aPhase;

  uniform float uTime;
  uniform float uProgress;
  uniform float uSize;
  uniform float uDpr;

  varying float vPhase;
  varying float vProgress;
  // Dist not really needed anymore but kept for consistency
  varying float vDist;
  varying vec2  vScreenUv;

  void main() {
    vPhase    = aPhase;
    vProgress = uProgress;

    // Distance from model centre — drives size & brightness variation
    vDist = length(position);

    vec4 mv = modelViewMatrix * vec4(position, 1.0);

    // Assembled particles are slightly larger, scattered particles vary in size
    // to give an illusion of depth in space when not assembled.
    float baseSize = mix(uSize * (0.5 + fract(aPhase * 13.37) * 4.0), uSize * 1.6, uProgress);
    
    float pSize = baseSize * uDpr;
    gl_PointSize = pSize * (280.0 / -mv.z);
    gl_Position  = projectionMatrix * mv;

    // Calculate normalized screen coordinates (-1 to 1) -> (0 to 1) 
    vScreenUv = (gl_Position.xy / gl_Position.w) * 0.5 + 0.5;
  }
`;

/* ─────────────────────────────────────────────────────────────
   FRAGMENT SHADER
───────────────────────────────────────────────────────────── */
const fragmentShader = /* glsl */`
  uniform float uTime;
  uniform float uProgress;

  // We add this to know where we are on the screen
  uniform vec2  uResolution;

  varying float vPhase;
  varying float vProgress;
  varying float vDist;
  varying vec2  vScreenUv;

  void main() {
    // Soft circular disc
    vec2  uv   = gl_PointCoord * 2.0 - 1.0;
    float dist = length(uv);
    if (dist > 1.0) discard;

    // Crisper core to increase definition, subtle halo
    float core  = smoothstep(0.8, 0.4, dist);
    float halo  = smoothstep(1.0, 0.6, dist) * 0.15;
    float alpha = core + halo;

    // Figure out if we are on the left (white) or right (black) side of the screen
    float screenX = vScreenUv.x;
    
    // Smooth transition in the middle to match the CSS gradient
    float mixRatio = smoothstep(0.35, 0.65, screenX);
    
    // Instead of screen-space noise which causes severe flickering and swimming when moving,
    // we use the particle's own intrinsic random 'Phase' which stays constant forever.
    // vPhase goes from 0 to 2PI, we map it to 0..1
    float intrinsicRandom = fract(vPhase / 6.28318);

    // If the particle's random value is less than the mix ratio, it's white, else black.
    // This allows particles to stochastically transition across the gradient without flickering.
    float side = step(intrinsicRandom, mixRatio);

    // Left side (side=0) -> black particle. Right side (side=1) -> white particle.
    vec3 col = mix(vec3(0.0), vec3(1.0), side);

    // Fade out a tiny bit based on assembly if desired
    float bright = mix(0.25, 1.0, uProgress);
    col *= bright;

    // Optional: make white particles slightly smaller or less opaque so they don't overpower black
    float densityAdjust = mix(1.0, 0.8, side);
    alpha *= densityAdjust;

    // Use pure alpha blending
    gl_FragColor = vec4(col, alpha * mix(0.35, 1.0, uProgress));
  }
`;

/* ─────────────────────────────────────────────────────────────
   PARTICLE CLOUD — the actual Three.js Points object
───────────────────────────────────────────────────────────── */
function ParticleCloud({ targetA, targetB, scatter, vortex, phases, particleCount, progress }) {
  const ref = useRef();
  const livePos = useRef(new Float32Array(scatter)); // CPU-side interpolated state

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(scatter), 3));
    g.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    return g;
  }, []); // eslint-disable-line

  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uSize: { value: PARTICLE_SIZE },
      uDpr: { value: Math.min(window.devicePixelRatio, 2) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  }), []); // eslint-disable-line

  // Handle resize for shader resolution
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
    const u = material.uniforms;

    u.uTime.value = clock.getElapsedTime();
    // Opacity fades in from scatter to target, fades out to vortex
    let modelPresence = 1.0;
    if (t < 0.35) {
      // 0 to 1 during assembly
      modelPresence = (t / 0.35) * (2 - (t / 0.35)); 
    } else if (t >= 0.8) {
      // 1 to 0 during scatter into vortex
      modelPresence = 1.0 - Math.min((t - 0.8) / 0.2, 1.0);
    }
    u.uProgress.value = modelPresence;

    const live = livePos.current;
    const buf = geometry.attributes.position.array;

    for (let i = 0; i < live.length; i++) {
      let dest;
      if (t < 0.35) {
        // Smoothly scatter to targetA (Human)
        let localT = t / 0.35;
        // ease out
        localT = localT * (2 - localT);
        dest = targetA[i] * localT + scatter[i] * (1 - localT);
      } else if (t < 0.43) {
        // Hold Human shape
        dest = targetA[i];
      } else if (t < 0.59) {
        // Morph Human to Motor
        let localT = (t - 0.43) / 0.16;
        // cubic in-out logic for smooth morphing curve
        localT = localT * localT * (3 - 2 * localT);
        dest = targetB[i] * localT + targetA[i] * (1 - localT);
      } else if (t < 0.8) {
        // Hold Motor shape
        dest = targetB[i];
      } else {
        // Blow apart into the vortex (black hole)
        let localT = Math.min((t - 0.8) / 0.2, 1.0);
        // cubic ease in-out
        localT = localT < 0.5 ? 4 * localT * localT * localT : 1 - Math.pow(-2 * localT + 2, 3) / 2;
        dest = vortex[i] * localT + targetB[i] * (1 - localT);
      }
      live[i] += (dest - live[i]) * LERP_SPEED;
      buf[i] = live[i];
    }
    geometry.attributes.position.needsUpdate = true;
  });

  // Dispose on unmount
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, []); // eslint-disable-line

  return <points ref={ref} geometry={geometry} material={material} />;
}

/* ─────────────────────────────────────────────────────────────
   SCENE — loads the GLTF, builds particle data
───────────────────────────────────────────────────────────── */
function Scene({ progress }) {
  const humanGltf = useGLTF(MODEL_HUMAN_PATH);
  const motorGltf = useGLTF(MODEL_MOTOR_PATH);
  const groupRef = useRef();
  const timeRot = useRef(0);
  const scrollRot = useRef(0);

  const data = useMemo(() => {
    const rawHuman = extractVertices(humanGltf);
    const rawMotor = extractVertices(motorGltf);
    return buildArrays(rawHuman, rawMotor, MAX_PARTICLES);
  }, [humanGltf, motorGltf]);

  useFrame((_, delta) => {
    if (groupRef.current) {
      // A slow idle rotation so it feels alive
      timeRot.current += delta * 0.15;

      // Snyc profound rotation to the scroll position
      const targetScrollRot = progress.current * Math.PI * 8; // 4 full rotations over scroll length
      scrollRot.current = THREE.MathUtils.lerp(scrollRot.current, targetScrollRot, 0.08);

      groupRef.current.rotation.y = timeRot.current + scrollRot.current;
    }
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
      <group ref={groupRef} scale={1.4}>
        <ParticleCloud
          targetA={data.targetA}
          targetB={data.targetB}
          scatter={data.scatter}
          vortex={data.vortex}
          phases={data.phases}
          particleCount={data.count}
          progress={progress}
        />
      </group>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   LOADING FALLBACK — pulsing ring while GLTF streams
───────────────────────────────────────────────────────────── */
function LoadingRing() {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.getElapsedTime() * 1.2;
  });
  return (
    <mesh ref={ref}>
      <torusGeometry args={[0.9, 0.012, 8, 80]} />
      <meshBasicMaterial color={COL_A} transparent opacity={0.5} />
    </mesh>
  );
}

/* ─────────────────────────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────────────────────────── */
export default function ModelParticlesPage() {
  const scrollRef = useRef(null);
  const progressRef = useRef(0);           // ref — no re-render on change
  const [pct, setPct] = useState(0);        // state — drives UI only

  const text1Ref = useRef(null);
  const text2Ref = useRef(null);
  const text3Ref = useRef(null);
  const text4Ref = useRef(null);
  const text5Ref = useRef(null);
  const text6Ref = useRef(null);
  const text7Ref = useRef(null);
  const blobLayerRef = useRef(null);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const max = scrollHeight - clientHeight;
    const p = max > 0 ? Math.min(scrollTop / max, 1) : 0;
    progressRef.current = p;
    setPct(Math.round(p * 100));
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  // High-performance scroll animation loop for DOM elements
  useEffect(() => {
    let frameId;
    const updateText = () => {
      const p = progressRef.current;

      const updateFade = (el, p, start, end) => {
        let op = 1, blur = 0, y = 0;
        if (p > start) {
          const t = Math.min((p - start) / (end - start), 1);
          op = 1 - t; blur = t * 12; y = t * -40;
        }
        el.style.opacity = op;
        el.style.filter = `blur(${blur}px)`;
        el.style.transform = `translateY(${y}px)`;
      };

      const updateFadeHold = (el, p, inS, inE, outS, outE) => {
        let op = 0, blur = 12, y = 40;
        if (p >= inS && p <= outS) {
          const t = Math.min((p - inS) / (inE - inS), 1);
          op = t; blur = 12 - t * 12; y = 40 - t * 40;
        } else if (p > outS) {
          const t = Math.min((p - outS) / (outE - outS), 1);
          op = 1 - t; blur = t * 12; y = t * -40;
        }
        el.style.opacity = op;
        el.style.filter = `blur(${blur}px)`;
        el.style.transform = `translateY(${y}px)`;
      };

      const updateTrackHold = (el, p, inS, inE, outS, outE) => {
        let op = 0, blur = 20, ls = 3, y = 0;
        if (p >= inS && p <= outS) {
          const t = Math.min((p - inS) / (inE - inS), 1);
          op = t; blur = 20 - t * 20; ls = 3 - t * 3;
        } else if (p > outS) {
          const t = Math.min((p - outS) / (outE - outS), 1);
          op = 1 - t; blur = t * 12; ls = 0; y = t * -40;
        }
        el.style.opacity = op;
        el.style.filter = `blur(${blur}px)`;
        el.style.transform = `translateY(${y}px)`;
        const h2 = el.querySelector('h2');
        if (h2) h2.style.letterSpacing = `${ls}em`;
      };

      const updateScaleHold = (el, p, inS, inE, outS, outE) => {
        let op = 0, blur = 12, s = 0.9, y = 0;
        if (p >= inS && p <= outS) {
          const t = Math.min((p - inS) / (inE - inS), 1);
          op = t; blur = 12 - t * 12; s = 0.9 + t * 0.1;
        } else if (p > outS) {
          const tOut = Math.min((p - outS) / (outE - outS), 1);
          op = 1 - tOut; blur = tOut * 12; s = 1; y = tOut * -40;
        }
        el.style.opacity = op;
        el.style.filter = `blur(${blur}px)`;
        el.style.transform = `scale(${s}) translateY(${y}px)`;
      };

      // Rescaled logic to fit the timeline
      if (text1Ref.current) updateFade(text1Ref.current, p, 0.05, 0.13);
      if (text2Ref.current) updateFadeHold(text2Ref.current, p, 0.13, 0.19, 0.23, 0.27);
      if (text3Ref.current) updateTrackHold(text3Ref.current, p, 0.27, 0.35, 0.39, 0.43);
      if (text4Ref.current) updateTrackHold(text4Ref.current, p, 0.43, 0.51, 0.55, 0.59);
      if (text5Ref.current) updateScaleHold(text5Ref.current, p, 0.59, 0.65, 0.69, 0.73);
      if (text6Ref.current) updateTrackHold(text6Ref.current, p, 0.73, 0.81, 0.85, 0.89);

      // The Black Hole expanding + Target text fading in
      if (blobLayerRef.current && text7Ref.current) {
        let scale = 0;
        let tOp = 0;
        if (p >= 0.89) {
          const t = Math.min((p - 0.89) / 0.11, 1);
          scale = t;
          tOp = t;
        }
        blobLayerRef.current.style.transform = `translate(-50%, -50%) scale(${scale})`;
        text7Ref.current.style.opacity = tOp;
      }

      frameId = requestAnimationFrame(updateText);
    };
    frameId = requestAnimationFrame(updateText);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <>
      {/* ── Google Fonts ─────────────────────────────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Syne:wght@400;700;800&family=DM+Mono:wght@300;400&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        html, body { width: 100%; height: 100%; overflow: hidden; background: ${BG}; }

        /* hide native scrollbar but keep it functional */
        .scroll-container::-webkit-scrollbar { display: none; }
        .scroll-container { scrollbar-width: none; ms-overflow-style: none; }

        @keyframes scanline {
          0%   { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        @keyframes nudge {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50%       { transform: translateX(-50%) translateY(6px); }
        }
        
        .text-gradient {
          background-image: linear-gradient(90deg, #000000 35%, #ffffff 65%);
          background-attachment: fixed;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          color: transparent;
        }
      `}</style>

      {/* ── Scroll container (transparent, sits above canvas) ── */}
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

      {/* ── Text Overlay 1 ── */}
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
          paddingLeft: "10vw"
        }}
      >
        <div className="text-gradient" style={{ fontFamily: "'DM Mono', monospace", fontSize: "clamp(12px, 1.2vw, 16px)", letterSpacing: "0.2em", marginBottom: "2vh" }}>
          CHAPTER 01/
        </div>
        <h1 className="text-gradient" style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(4rem, 12vw, 15rem)", fontWeight: 400, lineHeight: 1.1, margin: 0, paddingBottom: "2vw" }}>
          Vincent<br />
          <span style={{ marginLeft: "12vw" }}>van Gogh</span>
        </h1>

        <div className="text-gradient" style={{
          position: "absolute",
          left: "3vw",
          bottom: "15vh",
          transformOrigin: "left bottom",
          transform: "rotate(-90deg)",
          fontFamily: "'DM Mono', monospace",
          fontSize: "clamp(10px, 1vw, 14px)",
          letterSpacing: "0.3em",
          whiteSpace: "nowrap"
        }}>
          SCROLL
        </div>
      </div>

      {/* ── Text Overlay 2 ── */}
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
        <h2 className="text-gradient" style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(3rem, 7vw, 10rem)", fontWeight: 400, margin: 0, textAlign: "center" }}>
          This is a story of
        </h2>
      </div>

      {/* ── Text Overlay 3 ── */}
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
        <h2 className="text-gradient" style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(3rem, 9vw, 12rem)", fontWeight: 400, margin: 0, textAlign: "center", whiteSpace: "nowrap" }}>
          lost art
        </h2>
      </div>

      {/* ── Text Overlay 4 ── */}
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
          <h2 className="text-gradient" style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(2.5rem, 8vw, 10rem)", fontWeight: 400, margin: 0, lineHeight: 1.1, whiteSpace: "nowrap" }}>
            fractured<br />identity
          </h2>
        </div>
      </div>

      {/* ── Text Overlay 5 ── */}
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
        <h2 className="text-gradient" style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(4rem, 11vw, 15rem)", fontWeight: 400, margin: 0, textAlign: "center", whiteSpace: "nowrap" }}>
          regret
        </h2>
      </div>

      {/* ── Text Overlay 6 ── */}
      <div
        ref={text6Ref}
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
        <h2 className="text-gradient" style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(3rem, 9vw, 12rem)", fontWeight: 400, margin: 0, textAlign: "center", whiteSpace: "nowrap" }}>
          redemption
        </h2>
      </div>

      {/* ── Blob Background Layer ── */}
      <div
        ref={blobLayerRef}
        style={{
          position: "fixed",
          top: "50%", left: "50%",
          width: "250vmax", height: "250vmax",
          borderRadius: "50%",
          backgroundColor: "#000",
          filter: "blur(60px)",
          transform: "translate(-50%, -50%) scale(0)",
          zIndex: 4,
          pointerEvents: "none"
        }}
      />

      {/* ── Text Overlay 7 ── */}
      <div
        ref={text7Ref}
        style={{
          position: "fixed", inset: 0, pointerEvents: "none", zIndex: 5,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          opacity: 0, color: "white", mixBlendMode: "difference"
        }}
      >
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "14px", letterSpacing: "0.2em", marginBottom: "2vh" }}>
          LMI PRESENTS
        </div>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontSize: "clamp(3rem, 5vw, 10rem)", fontWeight: 400, margin: 0, lineHeight: 1 }}>
          Elimar <span style={{ fontStyle: "normal", fontSize: "clamp(2rem, 3.5vw, 6rem)" }}>by</span>
        </h2>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(3rem, 8vw, 12rem)", fontWeight: 400, margin: 0, lineHeight: 1.1 }}>
          Vincent van Gogh
        </h1>

        <div style={{
          position: "absolute", left: "50%", bottom: "10vh",
          transform: "translateX(-50%) rotate(180deg)",
          writingMode: "vertical-rl",
          fontFamily: "'DM Mono', monospace", fontSize: "12px", letterSpacing: "0.3em", whiteSpace: "nowrap"
        }}>
          SCROLL
        </div>
      </div>

      {/* ── Three.js canvas (fixed, behind scroll layer) ──────── */}
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

/* Pre-warm the loader */
useGLTF.preload(MODEL_HUMAN_PATH);
useGLTF.preload(MODEL_MOTOR_PATH);