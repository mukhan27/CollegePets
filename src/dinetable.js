// First-person "sit at a table" dining view. Zooms to the seat, shows the chosen
// food on the plate in front of you, and lets you take bites until it's gone.

import { takeFromPantry, addToPantry } from './state.js';
import { eat } from './systems.js';
import { FOOD_MODELS } from './foodModels.js';
import { closeInventory } from './inventory.js';

const $ = (id) => document.getElementById(id);
const TABLE_TOP = 1.12;

export function createDineView(scene) {
  let seat = null, onLeave = null, active = false, food = null;
  const setMsg = (t) => { $('table-msg').textContent = t; };

  function enter(s, leaveCb) {
    seat = s; onLeave = leaveCb; active = true; food = null;
    $('table-hud').classList.remove('hidden');
    $('hud').classList.add('dining');
    $('table-bite').classList.add('hidden');
    setMsg('Open your 🎒 bag and pick something to eat');
  }
  function exit() {
    active = false;
    if (food) { scene.remove(food.model); addToPantry(food.id); food = null; } // refund an unfinished dish
    $('table-hud').classList.add('hidden');
    $('hud').classList.remove('dining');
  }

  function placeFood(id) {
    if (!active || food) return;              // one dish at a time
    if (!takeFromPantry(id)) return;
    closeInventory();
    const model = FOOD_MODELS[id].build();
    model.scale.setScalar(0.9);
    model.position.set(seat.plate.x, TABLE_TOP + 0.06, seat.plate.z);
    scene.add(model);
    food = { id, model, bites: 4, max: 4 };
    $('table-bite').classList.remove('hidden');
    setMsg('Tap "Take a bite" to dig in 🍽️');
  }
  function takeBite() {
    if (!food) return;
    food.bites--;
    if (food.bites <= 0) {
      scene.remove(food.model);
      const id = food.id; food = null;
      $('table-bite').classList.add('hidden');
      eat(id, { fromPantry: false });         // apply the meal's needs/stats once
      setMsg('All done! Pick another from your 🎒 bag.');
    } else {
      const k = food.bites / food.max;
      food.model.scale.setScalar(0.9 * (0.3 + 0.7 * k)); // shrink as it's eaten
      food.model.position.y = TABLE_TOP + 0.06 * k;
      setMsg(`${food.bites} bite${food.bites > 1 ? 's' : ''} left`);
    }
  }

  function cam() {
    const fx = Math.sin(seat.face), fz = Math.cos(seat.face);
    return {
      px: seat.seatPos.x - fx * 0.2, py: 1.55, pz: seat.seatPos.z - fz * 0.2,
      lx: seat.plate.x, ly: TABLE_TOP, lz: seat.plate.z,
    };
  }
  function update() { /* (static first-person view) */ }

  $('table-bite').addEventListener('click', takeBite);
  $('table-leave').addEventListener('click', () => { if (onLeave) onLeave(); });

  return { enter, exit, cam, update, placeFood, isActive: () => active };
}
