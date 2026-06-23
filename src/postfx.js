// Post-processing pipeline — the "polish" layer over the v2 toon look.
// Chain: scene -> soft bloom -> tilt-shift + vignette + warm grade -> tone map -> FXAA.
// Built on the vendored three.js r184 addons. Mobile-gated via quality tiers
// (see setQuality); the heavier knobs (bloom resolution, tilt-shift radius) scale down
// on phones so the same look stays smooth on mid-range hardware.

import * as THREE from 'three';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js';
import { ShaderPass } from '../vendor/addons/postprocessing/ShaderPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from '../vendor/addons/shaders/FXAAShader.js';

// ---------------------------------------------------------- "look" shader
// Single-pass tilt-shift (screen-space, not depth — far cheaper on mobile),
// plus vignette and a gentle warm grade. Runs in linear space before tone
// mapping, so the corner falloff rolls off naturally through ACES.
const GradeShader = {
  uniforms: {
    tDiffuse:        { value: null },
    resolution:      { value: new THREE.Vector2(1, 1) },
    focusCenter:     { value: 0.52 }, // vertical centre of the sharp band (UV)
    focusWidth:      { value: 0.30 }, // half-height of the fully-sharp band (wider = less softening)
    blurStrength:    { value: 3.0 },  // max blur radius in pixels (0 disables)
    vignetteStrength:{ value: 0.42 },
    warmth:          { value: 0.022 },
    saturation:      { value: 1.12 },
    contrast:        { value: 1.045 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float focusCenter;
    uniform float focusWidth;
    uniform float blurStrength;
    uniform float vignetteStrength;
    uniform float warmth;
    uniform float saturation;
    uniform float contrast;
    varying vec2 vUv;

    // 8-tap ring blur (+ centre) — unrolled so it compiles on any GLSL level.
    vec3 ringBlur(vec2 uv, vec2 px) {
      vec3 s = texture2D(tDiffuse, uv).rgb;
      s += texture2D(tDiffuse, uv + vec2( 1.0,  0.0) * px).rgb;
      s += texture2D(tDiffuse, uv + vec2(-1.0,  0.0) * px).rgb;
      s += texture2D(tDiffuse, uv + vec2( 0.0,  1.0) * px).rgb;
      s += texture2D(tDiffuse, uv + vec2( 0.0, -1.0) * px).rgb;
      s += texture2D(tDiffuse, uv + vec2( 0.7,  0.7) * px).rgb;
      s += texture2D(tDiffuse, uv + vec2(-0.7,  0.7) * px).rgb;
      s += texture2D(tDiffuse, uv + vec2( 0.7, -0.7) * px).rgb;
      s += texture2D(tDiffuse, uv + vec2(-0.7, -0.7) * px).rgb;
      return s / 9.0;
    }

    void main() {
      // tilt-shift: sharpness falls off above/below the focus band
      float d = abs(vUv.y - focusCenter);
      float t = clamp((d - focusWidth) / max(1.0 - focusWidth, 0.0001), 0.0, 1.0);
      float blur = pow(t, 1.5) * blurStrength;

      vec3 col;
      if (blur < 0.4) {
        col = texture2D(tDiffuse, vUv).rgb;
      } else {
        col = ringBlur(vUv, blur / resolution);
      }

      // gentle warm grade
      col.r += warmth;
      col.b -= warmth * 0.6;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, saturation);          // saturation
      col = (col - 0.5) * contrast + 0.5;            // contrast around mid

      // vignette
      float vig = smoothstep(0.85, 0.25, length(vUv - 0.5));
      col *= mix(1.0, vig, vignetteStrength);

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

// Per-tier tuning. `low` keeps the same look but cheaper kernels / half-res bloom.
const TIERS = {
  // Render up to 2.5x device pixels (then downsampled to the screen = extra AA).
  high: { pixelRatio: 2.5, bloomStrength: 0.42, bloomRadius: 0.6, blur: 2.2 },
  // `low` matches the resolution but uses cheaper bloom + a smaller tilt-shift
  // kernel. With MSAA on, a half-res phone render was the main "blurry" culprit.
  low:  { pixelRatio: 2.5, bloomStrength: 0.34, bloomRadius: 0.5, blur: 1.4 },
};

// Build the composer. Returns helpers the host (main.js) drives each frame / on resize.
export function createComposer(renderer, scene, camera, { tier = 'high' } = {}) {
  const size = renderer.getSize(new THREE.Vector2());

  const composer = new EffectComposer(renderer);
  // The post-FX chain renders the scene into an offscreen target, which bypasses
  // the WebGLRenderer's own `antialias` — so geometry edges alias badly (jagged
  // trees/posts/buildings). Re-enable hardware MSAA on the composer's targets so
  // edges are crisp before FXAA cleans up the shader passes. Set once; survives
  // resize / setPixelRatio (they only resize the same targets).
  composer.renderTarget1.samples = 4;
  composer.renderTarget2.samples = 4;
  composer.addPass(new RenderPass(scene, camera));

  // threshold raised to 1.0 so only genuinely emissive things (lamp bulbs/glow
  // sprites) bloom — a brightly-lit white column no longer flares into a beam
  const bloom = new UnrealBloomPass(size.clone(), 0.42, 0.6, 1.0); // strength, radius, threshold
  composer.addPass(bloom);

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  composer.addPass(new OutputPass()); // ACES tone map (reads renderer.toneMapping) + sRGB

  const fxaa = new ShaderPass(FXAAShader);
  composer.addPass(fxaa);

  // EffectComposer (r184) has no getPixelRatio, and it propagates setSize to
  // passes but ShaderPass ignores it — so we track the ratio and feed the
  // effective pixel resolution to the FXAA / grade shaders ourselves.
  let pixelRatio = Math.min(window.devicePixelRatio, 2.5);

  function setSize(w, h) {
    size.set(w, h);
    const ew = w * pixelRatio, eh = h * pixelRatio;
    composer.setSize(w, h); // composer multiplies by its pixel ratio internally
    grade.uniforms.resolution.value.set(ew, eh);
    fxaa.uniforms.resolution.value.set(1 / ew, 1 / eh);
  }

  function setQuality(name) {
    const q = TIERS[name] || TIERS.high;
    pixelRatio = Math.min(window.devicePixelRatio, q.pixelRatio);
    composer.setPixelRatio(pixelRatio);
    bloom.strength = q.bloomStrength;
    bloom.radius = q.bloomRadius;
    grade.uniforms.blurStrength.value = q.blur;
    setSize(size.x, size.y); // re-derive resolution uniforms at the new pixel ratio
  }

  setQuality(tier);
  setSize(size.x, size.y);

  return { composer, setSize, setQuality, passes: { bloom, grade, fxaa } };
}
