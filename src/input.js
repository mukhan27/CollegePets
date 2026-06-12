// Virtual joystick (touch) + WASD/arrow keys (desktop). Exposes a normalized move vector.

export const input = { x: 0, y: 0, active: false };

const keys = new Set();
const KEYMAP = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1],  ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0],  ArrowRight: [1, 0],
};

function updateFromKeys() {
  let x = 0, y = 0;
  for (const k of keys) {
    const v = KEYMAP[k];
    if (v) { x += v[0]; y += v[1]; }
  }
  const len = Math.hypot(x, y);
  if (len > 0) { x /= len; y /= len; }
  input.x = x; input.y = y;
  input.active = len > 0;
}

export function initInput() {
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (KEYMAP[e.code]) { keys.add(e.code); updateFromKeys(); e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => {
    if (keys.delete(e.code)) updateFromKeys();
  });
  window.addEventListener('blur', () => { keys.clear(); updateFromKeys(); });

  // --- touch joystick ---
  const zone = document.getElementById('joystick-zone');
  const base = document.getElementById('joystick-base');
  const knob = document.getElementById('joystick-knob');
  const RADIUS = 55;
  let touchId = null, baseX = 0, baseY = 0;

  function setKnob(dx, dy) {
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  zone.addEventListener('touchstart', (e) => {
    if (touchId !== null) return;
    const t = e.changedTouches[0];
    touchId = t.identifier;
    baseX = t.clientX; baseY = t.clientY;
    base.style.left = (baseX - RADIUS) + 'px';
    base.style.top = (baseY - RADIUS) + 'px';
    base.style.bottom = 'auto';
    base.classList.add('active');
    setKnob(0, 0);
    e.preventDefault();
  }, { passive: false });

  zone.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== touchId) continue;
      let dx = t.clientX - baseX, dy = t.clientY - baseY;
      const len = Math.hypot(dx, dy);
      if (len > RADIUS) { dx = dx / len * RADIUS; dy = dy / len * RADIUS; }
      setKnob(dx, dy);
      input.x = dx / RADIUS;
      input.y = dy / RADIUS;
      input.active = len > 8;
      e.preventDefault();
    }
  }, { passive: false });

  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== touchId) continue;
      touchId = null;
      base.classList.remove('active');
      input.x = 0; input.y = 0; input.active = false;
      setKnob(0, 0);
    }
  };
  zone.addEventListener('touchend', endTouch);
  zone.addEventListener('touchcancel', endTouch);
}
