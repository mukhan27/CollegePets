// Offscreen item thumbnails. Renders the actual toon-shaded item (a pet wearing
// the wearable, or the furniture mesh) to a cached data URL so shop/try-on menus
// can show a real preview instead of an emoji. One small WebGL context, reused.

import * as THREE from 'three';
import { createPet } from './petFactory.js';
import { FURNITURE } from './furniture.js';
import { FOOD_MODELS } from './foodModels.js';
import { clothesSlot } from './state.js';

const SIZE = 140;
let renderer, scene, camera;
const cache = new Map();
const slotOf = (id) => clothesSlot(id);

function init() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8a78, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.25); key.position.set(3, 5, 4); scene.add(key);
  const fill = new THREE.DirectionalLight(0xcfe0ff, 0.4); fill.position.set(-3, 2, -2); scene.add(fill);
  camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
}

// auto-frame a group from a friendly 3/4 angle and capture a PNG
function snapshot(group, lift = 0, dir = new THREE.Vector3(0.55, 0.42, 1), zoom = 1) {
  init();
  scene.add(group);
  const box = new THREE.Box3().setFromObject(group);
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z, 0.6) * 0.5;
  const dist = radius / Math.tan((camera.fov * Math.PI / 180) / 2) * 1.45 * zoom;
  c.y += lift;
  camera.position.copy(c).add(dir.clone().normalize().multiplyScalar(dist));
  camera.lookAt(c);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(group);
  return url;
}

// Every clothing thumbnail shows the DUCK actually wearing the item (shirts recolour
// the duck's baked shirt zone, so a standalone mesh can't represent them). Body slots
// get a slot-appropriate camera: shirts/pants framed on the torso, bags from behind.
const SLOT_CAM = {
  top:    { lift: -0.28, dir: new THREE.Vector3(0.3, 0.25, 1) },
  bottom: { lift: -0.55, dir: new THREE.Vector3(0.35, 0.3, 1) },
  back:   { lift: -0.1,  dir: new THREE.Vector3(-0.55, 0.5, -1) },
  feet:   { lift: -0.72, dir: new THREE.Vector3(0.5, 0.28, 1) },
  // near-frontal + tighter: neck items (bowtie especially) are small and front-facing
  neck:   { lift: 0.02,  dir: new THREE.Vector3(0.18, 0.3, 1), zoom: 0.66 },
};
export function wearablePreview(id) {
  const slot = slotOf(id);
  // v4: caps rebuilt in duck space, shoes remodelled, bowtie/scarf remodelled,
  // neck-slot preview camera added
  const k = 'w4:' + id;
  if (cache.has(k)) return cache.get(k);
  const pet = createPet('creature', { equipped: { [slot]: id } });
  if (pet.userData.animate) pet.userData.animate(0, false);
  const c = SLOT_CAM[slot] || { lift: 0.15, dir: new THREE.Vector3(0.55, 0.42, 1) };
  const url = snapshot(pet, c.lift, c.dir, c.zoom || 1);
  cache.set(k, url);
  return url;
}

// Back-compat alias (creator picker chips) — same duck-worn preview.
export function accessoryPreview(id) {
  return wearablePreview(id);
}


export function furniturePreview(id) {
  const k = 'f:' + id;
  if (cache.has(k)) return cache.get(k);
  const def = FURNITURE[id];
  if (!def) return '';
  const url = snapshot(def.build());
  cache.set(k, url);
  return url;
}

export function foodPreview(id) {
  const k = 'd:' + id;
  if (cache.has(k)) return cache.get(k);
  const def = FOOD_MODELS[id];
  if (!def) return '';
  const url = snapshot(def.build());
  cache.set(k, url);
  return url;
}
