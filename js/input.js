// WORKSONG — keyboard input with edge detection.
// Actions are polled per frame: Input.down (held), Input.pressed (this frame),
// Input.released (this frame). Game code calls Input.endFrame() once per tick.

const Input = (() => {
  const MAP = {
    ArrowLeft: 'left',   KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up',       KeyW: 'up',
    ArrowDown: 'down',   KeyS: 'down',
    KeyZ: 'jump',        Space: 'jump',
    KeyX: 'attack',      KeyJ: 'attack',
    KeyC: 'dash',        ShiftLeft: 'dash', ShiftRight: 'dash',
    KeyV: 'cast',        KeyK: 'cast',
    Enter: 'confirm',
    Escape: 'pause',     KeyP: 'pause',
    KeyM: 'mute',
  };

  const down = {}, pressed = {}, released = {};
  let anyKey = false;

  function onKey(e, isDown) {
    const action = MAP[e.code];
    if (!action) return;
    // Don't let the page scroll with arrows/space.
    e.preventDefault();
    if (isDown) {
      if (!down[action]) pressed[action] = true;
      down[action] = true;
      anyKey = true;
    } else {
      down[action] = false;
      released[action] = true;
    }
  }

  return {
    down, pressed, released,
    get anyKey() { return anyKey; },
    init() {
      addEventListener('keydown', e => onKey(e, true));
      addEventListener('keyup', e => onKey(e, false));
      // Releasing focus shouldn't leave keys stuck down.
      addEventListener('blur', () => { for (const k in down) down[k] = false; });
    },
    endFrame() {
      for (const k in pressed) pressed[k] = false;
      for (const k in released) released[k] = false;
      anyKey = false;
    },
    axis() {
      return (down.right ? 1 : 0) - (down.left ? 1 : 0);
    },
  };
})();
