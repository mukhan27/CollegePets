// Offscreen item thumbnails. Renders the actual toon-shaded item (a pet wearing
// the wearable, or the furniture mesh) to a cached data URL so shop/try-on menus
// can show a real preview instead of an emoji. One small WebGL context, reused.

import * as THREE from 'three';
import { createPet } from './petFactory.js';
import { FURNITURE } from './furniture.js';
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
function snapshot(group, lift = 0) {
  init();
  scene.add(group);
  const box = new THREE.Box3().setFromObject(group);
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z, 0.6) * 0.5;
  const dist = radius / Math.tan((camera.fov * Math.PI / 180) / 2) * 1.45;
  const dir = new THREE.Vector3(0.55, 0.42, 1).normalize();
  c.y += lift;
  camera.position.copy(c).add(dir.multiplyScalar(dist));
  camera.lookAt(c);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(group);
  return url;
}

export function wearablePreview(id) {
  const k = 'w:' + id;
  if (cache.has(k)) return cache.get(k);
  const pet = createPet('cat', { equipped: { [slotOf(id)]: id } });
  if (pet.userData.animate) pet.userData.animate(0, false);
  const url = snapshot(pet, 0.15);
  cache.set(k, url);
  return url;
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
