// WORKSONG — everything that lives in a room besides the player.

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ------------------------------------------------------------------ particles
const Particles = {
  list: [],
  spawn(x, y, vx, vy, life, size, color, grav = 0, fade = true) {
    if (this.list.length > 600) this.list.shift();
    this.list.push({ x, y, vx, vy, life, maxLife: life, size, color, grav, fade });
  },
  burst(x, y, color, n = 10, speed = 160, grav = 300) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s - 40, 0.35 + Math.random() * 0.4, 2 + Math.random() * 3, color, grav);
    }
  },
  dust(x, y, dir = 0) {
    for (let i = 0; i < 5; i++) {
      this.spawn(x + (Math.random() - 0.5) * 14, y, dir * (30 + Math.random() * 60) + (Math.random() - 0.5) * 40,
        -20 - Math.random() * 50, 0.25 + Math.random() * 0.2, 2 + Math.random() * 2, 'rgba(200,210,225,0.5)', 60);
    }
  },
  soulWisp(x, y, tx, ty) {
    this.spawn(x, y, (tx - x) * 2.2, (ty - y) * 2.2, 0.45, 3, 'rgba(240,248,255,0.8)', 0);
  },
  // expanding impact ring
  rings: [],
  ring(x, y, color, maxR = 42) {
    if (this.rings.length > 24) this.rings.shift();
    this.rings.push({ x, y, r: 6, maxR, color, life: 0.28, maxLife: 0.28 });
  },
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) { this.list.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) { this.rings.splice(i, 1); continue; }
      r.r += (r.maxR - r.r) * 10 * dt;
    }
  },
  draw(ctx) {
    for (const p of this.list) {
      ctx.globalAlpha = p.fade ? Math.max(p.life / p.maxLife, 0) : 1;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + 0.5 * p.life / p.maxLife), 0, Math.PI * 2);
      ctx.fill();
    }
    for (const r of this.rings) {
      ctx.globalAlpha = Math.max(0, r.life / r.maxLife) * 0.8;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2.5 * (r.life / r.maxLife);
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  clear() { this.list.length = 0; this.rings.length = 0; },
};

// ----------------------------------------------------------------------- geo
class GeoBit {
  constructor(x, y, value = 1) {
    this.x = x; this.y = y;
    this.w = 10; this.h = 10;
    this.vx = (Math.random() - 0.5) * 260;
    this.vy = -140 - Math.random() * 160;
    this.value = value;
    this.dead = false;
    this.settleT = 0;
  }
  update(dt) {
    const pr = Player.rect();
    const dx = (pr.x + pr.w / 2) - this.x, dy = (pr.y + pr.h / 2) - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < CFG.geoMagnetDist && this.settleT > 0.25) {
      this.vx = (dx / dist) * CFG.geoMagnetSpeed;
      this.vy = (dy / dist) * CFG.geoMagnetSpeed;
    } else {
      this.vy += 1400 * dt;
      if (this.vy > 600) this.vy = 600;
    }
    this.settleT += dt;
    // integrate with simple tile bounce
    let nx = this.x + this.vx * dt;
    if (World.rectHitsSolid(nx - this.w / 2, this.y - this.h / 2, this.w, this.h)) {
      this.vx *= -0.45; nx = this.x;
    }
    this.x = nx;
    let ny = this.y + this.vy * dt;
    if (World.rectHitsSolid(this.x - this.w / 2, ny - this.h / 2, this.w, this.h)) {
      if (this.vy > 0) this.vx *= 0.8;
      this.vy *= -0.4;
      if (Math.abs(this.vy) < 40) this.vy = 0;
      ny = this.y;
    }
    this.y = ny;
    if (dist < 26) {
      this.dead = true;
      Player.geo += this.value;
      AudioSys.sfx('geo');
      Particles.burst(this.x, this.y, 'rgba(240,238,210,0.9)', 4, 90, 0);
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.settleT * 2);
    ctx.fillStyle = '#e8e4c8';
    ctx.strokeStyle = '#8a8464';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const r = 5;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

// Breakable geo deposit rock.
class Deposit {
  constructor(x, y) {
    this.x = x; this.y = y; this.w = 26; this.h = 26;
    this.hp = 3; this.dead = false; this.flash = 0;
  }
  rect() { return { x: this.x - this.w / 2, y: this.y - this.h / 2 + 3, w: this.w, h: this.h }; }
  hurt() {
    this.hp--; this.flash = 0.1;
    AudioSys.sfx('geo');
    Particles.burst(this.x, this.y, '#cfc9a8', 5, 130);
    for (let i = 0; i < 2; i++) Game.geoBits.push(new GeoBit(this.x, this.y - 6));
    if (this.hp <= 0) {
      this.dead = true;
      for (let i = 0; i < 5; i++) Game.geoBits.push(new GeoBit(this.x, this.y - 6));
      Particles.burst(this.x, this.y, '#cfc9a8', 14, 190);
    }
  }
  update(dt) { this.flash = Math.max(0, this.flash - dt); }
  draw(ctx) {
    const p = World.palette;
    ctx.fillStyle = this.flash > 0 ? '#ffffff' : p.edge;
    ctx.beginPath();
    ctx.moveTo(this.x - 13, this.y + 16);
    ctx.lineTo(this.x - 10, this.y - 6);
    ctx.lineTo(this.x, this.y - 13);
    ctx.lineTo(this.x + 11, this.y - 4);
    ctx.lineTo(this.x + 13, this.y + 16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e8e4c8';
    ctx.beginPath();
    ctx.arc(this.x - 3, this.y + 1, 3, 0, Math.PI * 2);
    ctx.arc(this.x + 5, this.y + 6, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

// -------------------------------------------------------------- projectiles
// Player spell.
class SpellOrb {
  constructor(x, y, dir) {
    this.x = x; this.y = y; this.dir = dir;
    this.w = 26; this.h = 18;
    this.life = 1.1; this.dead = false; this.t = 0;
  }
  rect() { return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h }; }
  update(dt) {
    this.t += dt;
    this.life -= dt;
    this.x += this.dir * CFG.spellSpeed * dt;
    if (this.life <= 0 || World.rectHitsSolid(this.x - 6, this.y - 6, 12, 12)) {
      this.dead = true;
      Particles.burst(this.x, this.y, 'rgba(230,240,255,0.9)', 10, 170, 0);
      return;
    }
    Particles.spawn(this.x - this.dir * 10, this.y + (Math.random() - 0.5) * 10,
      -this.dir * 40, (Math.random() - 0.5) * 30, 0.3, 3, 'rgba(210,225,255,0.6)');
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    const pulse = 1 + Math.sin(this.t * 30) * 0.12;
    ctx.fillStyle = 'rgba(235,244,255,0.95)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 13 * pulse, 8 * pulse, 0, 0, Math.PI * 2);
    ctx.fill();
    // little furious face, as is tradition
    ctx.fillStyle = '#20283c';
    ctx.beginPath();
    ctx.arc(this.dir * 4 - 3, -1, 1.6, 0, Math.PI * 2);
    ctx.arc(this.dir * 4 + 3, -1, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// Enemy shot: 'lob' (arcing glob) | 'wave' (ground flame) | 'ember' (falling).
class Shot {
  constructor(kind, x, y, vx, vy) {
    this.kind = kind;
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.w = 14; this.h = 14;
    if (kind === 'wave') { this.w = 22; this.h = 30; }
    this.life = 4; this.dead = false; this.t = 0;
  }
  rect() { return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h }; }
  update(dt) {
    this.t += dt; this.life -= dt;
    if (this.kind === 'lob') this.vy += 900 * dt;
    if (this.kind === 'ember') this.vy += 500 * dt;
    if (this.kind === 'wave') {
      // hug the ground; die at walls
      if (World.rectHitsSolid(this.x + Math.sign(this.vx) * 14 - 2, this.y - 4, 4, 8)) this.dead = true;
      // step down small ledges
      if (!World.rectHitsSolid(this.x - 4, this.y + this.h / 2 + 2, 8, 4)) this.y += 260 * dt;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.kind !== 'wave' && World.rectHitsSolid(this.x - 4, this.y - 4, 8, 8)) this.dead = true;
    if (this.life <= 0) this.dead = true;
    if (this.dead && this.kind !== 'wave') {
      Particles.burst(this.x, this.y, this.kind === 'lob' ? 'rgba(180,230,150,0.8)' : 'rgba(255,140,60,0.8)', 6, 120);
    }
    if (this.kind !== 'lob') {
      Particles.spawn(this.x, this.y, (Math.random() - 0.5) * 40, -60 - Math.random() * 60,
        0.25, 3, 'rgba(255,150,60,0.55)');
    }
    // hit player
    if (!Player.dead && rectsOverlap(this.rect(), Player.rect())) {
      Player.damage(this.x);
      if (this.kind !== 'wave') this.dead = true;
    }
  }
  draw(ctx) {
    if (this.kind === 'lob') {
      ctx.fillStyle = '#b8e696';
      ctx.beginPath();
      ctx.arc(this.x, this.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(140,190,110,0.5)';
      ctx.beginPath();
      ctx.arc(this.x - this.vx * 0.02, this.y - this.vy * 0.02, 5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // flame
      const h = this.kind === 'wave' ? 30 : 16;
      const flick = Math.sin(this.t * 40) * 3;
      const g = ctx.createLinearGradient(this.x, this.y + h / 2, this.x, this.y - h / 2 - flick);
      g.addColorStop(0, '#ff5020');
      g.addColorStop(1, '#ffd070');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(this.x - this.w / 2, this.y + h / 2);
      ctx.quadraticCurveTo(this.x - 4, this.y - h / 2 - flick, this.x, this.y - h / 2 - flick - 6);
      ctx.quadraticCurveTo(this.x + 4, this.y - h / 2 - flick, this.x + this.w / 2, this.y + h / 2);
      ctx.closePath();
      ctx.fill();
    }
  }
}

// ------------------------------------------------------------------- pickups
class Pickup {
  constructor(kind, id, x, y) {
    this.kind = kind; // 'ability' | 'charm' | 'shard'
    this.id = id;
    this.x = x; this.y = y;
    this.t = Math.random() * 6;
    this.dead = false;
    this.hidden = false; // encounter rewards start hidden
  }
  rect() { return { x: this.x - 14, y: this.y - 18, w: 28, h: 36 }; }
  update(dt) {
    this.t += dt;
    if (this.hidden || Player.dead) return;
    if (rectsOverlap(this.rect(), Player.rect())) {
      this.dead = true;
      Game.acquire(this);
    }
    if (Math.random() < 0.12) {
      Particles.spawn(this.x + (Math.random() - 0.5) * 20, this.y + 10, (Math.random() - 0.5) * 20,
        -40 - Math.random() * 40, 0.6, 2.5, 'rgba(240,248,255,0.7)');
    }
  }
  draw(ctx) {
    if (this.hidden) return;
    const bob = Math.sin(this.t * 2.4) * 5;
    const y = this.y + bob;
    // halo
    const g = ctx.createRadialGradient(this.x, y, 2, this.x, y, 46);
    g.addColorStop(0, 'rgba(240,248,255,0.5)');
    g.addColorStop(1, 'rgba(240,248,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(this.x - 46, y - 46, 92, 92);
    ctx.save();
    ctx.translate(this.x, y);
    if (this.kind === 'ability') {
      // a pale relic: winged diamond
      ctx.fillStyle = '#eef3fb';
      ctx.strokeStyle = '#9fb4d8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -14); ctx.lineTo(9, 0); ctx.lineTo(0, 14); ctx.lineTo(-9, 0);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(-9, -2); ctx.quadraticCurveTo(-22, -10, -26, 2); ctx.quadraticCurveTo(-18, 2, -9, 5);
      ctx.moveTo(9, -2); ctx.quadraticCurveTo(22, -10, 26, 2); ctx.quadraticCurveTo(18, 2, 9, 5);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (this.kind === 'charm') {
      // charm: rune medallion
      ctx.fillStyle = '#dfe7f4';
      ctx.strokeStyle = '#8fa3c8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#4a5a7a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-4, 4); ctx.lineTo(0, -5); ctx.lineTo(4, 4);
      ctx.stroke();
    } else if (this.kind === 'shard') {
      // a broken quarter of a pale mask
      ctx.fillStyle = '#eef1f8';
      ctx.strokeStyle = '#9fb4d8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10, -6);
      ctx.quadraticCurveTo(0, -13, 10, -6);
      ctx.lineTo(6, 6);
      ctx.lineTo(-2, 2);
      ctx.lineTo(-7, 8);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1a2030';
      ctx.beginPath();
      ctx.ellipse(-3, -2, 1.6, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ----------------------------------------------------------------- the Mentor
class NpcEnt {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.t = Math.random() * 5;
  }
  get near() {
    const pr = Player.rect();
    return Math.abs(pr.x + pr.w / 2 - this.x) < 44 && Math.abs(pr.y + pr.h / 2 - this.y) < 50;
  }
  stage() {
    if (Game.flags.bossDone) return 'end';
    if (Player.abilities.wings) return 'late';
    if (Player.abilities.dash) return 'mid';
    return 'start';
  }
  update(dt) {
    this.t += dt;
    if (this.near && Input.pressed.up && Player.grounded && Game.state === 'play') {
      const pool = CONTENT.npcDialogue[World.roomId];
      const lines = (pool && (pool[this.stage()] || pool.start)) || ['...'];
      AudioSys.sfx('tablet');
      Game.openDialog(lines);
    }
  }
  draw(ctx) {
    const breathe = Math.sin(this.t * 1.6) * 1.5;
    ctx.save();
    ctx.translate(this.x, this.y + 16);
    // staff
    ctx.strokeStyle = '#6a5c48';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(16, 0); ctx.lineTo(16, -52 - breathe);
    ctx.stroke();
    ctx.fillStyle = '#c8b890';
    ctx.beginPath();
    ctx.arc(16, -54 - breathe, 4, 0, Math.PI * 2);
    ctx.fill();
    // robed, stooped body
    ctx.fillStyle = '#4a4256';
    ctx.beginPath();
    ctx.moveTo(-14, 0);
    ctx.quadraticCurveTo(-16, -30 - breathe, -4, -38 - breathe);
    ctx.quadraticCurveTo(6, -42 - breathe, 10, -34 - breathe);
    ctx.quadraticCurveTo(14, -16, 12, 0);
    ctx.closePath();
    ctx.fill();
    // pale weathered head, drooping antennae
    ctx.fillStyle = '#e2ddd0';
    ctx.beginPath();
    ctx.ellipse(2, -40 - breathe, 9, 8.5, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e2ddd0';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-2, -47 - breathe); ctx.quadraticCurveTo(-8, -54 - breathe, -14, -50 - breathe);
    ctx.moveTo(6, -47 - breathe); ctx.quadraticCurveTo(10, -55 - breathe, 15, -52 - breathe);
    ctx.stroke();
    // tired kind eyes
    ctx.fillStyle = '#26202e';
    ctx.beginPath();
    ctx.ellipse(-1, -39 - breathe, 1.6, 2.4, 0, 0, Math.PI * 2);
    ctx.ellipse(6, -39 - breathe, 1.6, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (this.near && Game.state === 'play') UI.worldPrompt(ctx, this.x, this.y - 46, 'TALK');
  }
}

// -------------------------------------------------------------------- tablet
class TabletEnt {
  constructor(id, x, y) {
    this.id = id;
    this.x = x; this.y = y;
    this.read = false;
  }
  get near() {
    const pr = Player.rect();
    return Math.abs(pr.x + pr.w / 2 - this.x) < 34 && Math.abs(pr.y + pr.h / 2 - this.y) < 50;
  }
  update() {
    if (this.near && Input.pressed.up && Player.grounded && Game.state === 'play') {
      this.read = true;
      AudioSys.sfx('tablet');
      Game.openDialog(CONTENT.tablets[this.id] || ['...the inscription has faded.']);
    }
  }
  draw(ctx) {
    const p = World.palette;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = p.mid;
    ctx.strokeStyle = p.edge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-13, 16); ctx.lineTo(-11, -14); ctx.quadraticCurveTo(0, -20, 11, -14); ctx.lineTo(13, 16);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // glyph lines
    ctx.strokeStyle = p.accent;
    ctx.globalAlpha = 0.8 + Math.sin(performance.now() / 300) * 0.2;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-7, -9 + i * 6);
      ctx.lineTo(7 - (i % 2) * 5, -9 + i * 6);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    if (this.near && Game.state === 'play') UI.worldPrompt(ctx, this.x, this.y - 34, 'READ');
  }
}

// --------------------------------------------------------------------- bench
class BenchEnt {
  constructor(id, x, y) {
    this.id = id; this.x = x; this.y = y;
  }
  get near() {
    const pr = Player.rect();
    return Math.abs(pr.x + pr.w / 2 - this.x) < 40 && Math.abs(pr.y + pr.h / 2 - this.y) < 50;
  }
  update() {
    if (this.near && Input.pressed.up && Player.grounded && Game.state === 'play') {
      Game.restAtBench(this);
    }
  }
  draw(ctx) {
    const p = World.palette;
    ctx.save();
    ctx.translate(this.x, this.y + 4);
    ctx.strokeStyle = p.edge;
    ctx.fillStyle = p.mid;
    ctx.lineWidth = 2;
    // seat
    ctx.fillRect(-24, 2, 48, 6);
    ctx.strokeRect(-24, 2, 48, 6);
    // legs (wrought curls)
    ctx.beginPath();
    ctx.moveTo(-18, 8); ctx.lineTo(-18, 14); ctx.moveTo(18, 8); ctx.lineTo(18, 14);
    ctx.stroke();
    // backrest
    ctx.beginPath();
    ctx.moveTo(-24, 2); ctx.quadraticCurveTo(-30, -14, -20, -18);
    ctx.stroke();
    ctx.restore();
    if (this.near && Game.state === 'play') UI.worldPrompt(ctx, this.x, this.y - 34, 'REST');
  }
}

// -------------------------------------------------------------------- portal
class PortalEnt {
  constructor(x, y) { this.x = x; this.y = y; this.t = 0; }
  update(dt) {
    this.t += dt;
    if (!Player.dead && rectsOverlap({ x: this.x - 20, y: this.y - 40, w: 40, h: 60 }, Player.rect())) {
      Game.startEnding();
    }
    if (Math.random() < 0.3) {
      Particles.spawn(this.x + (Math.random() - 0.5) * 30, this.y + 20, (Math.random() - 0.5) * 15,
        -60 - Math.random() * 50, 1.0, 2.5, 'rgba(255,255,255,0.8)');
    }
  }
  draw(ctx) {
    const pulse = 1 + Math.sin(this.t * 2) * 0.08;
    const g = ctx.createRadialGradient(this.x, this.y - 10, 4, this.x, this.y - 10, 80 * pulse);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.35, 'rgba(230,240,255,0.5)');
    g.addColorStop(1, 'rgba(230,240,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(this.x - 80, this.y - 90, 160, 170);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y - 10, 14 * pulse, 34 * pulse, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --------------------------------------------------------------------- shade
class Shade {
  constructor(x, y, geo) {
    this.x = x; this.y = y; this.geo = geo; this.t = 0; this.dead = false;
  }
  update(dt) {
    this.t += dt;
    if (!Player.dead && rectsOverlap({ x: this.x - 16, y: this.y - 20, w: 32, h: 40 }, Player.rect())) {
      this.dead = true;
      Player.geo += this.geo;
      Game.flags.shade = null;
      Game.save();
      AudioSys.sfx('soul');
      Particles.burst(this.x, this.y, 'rgba(200,215,240,0.9)', 16, 200, 0);
    }
  }
  draw(ctx) {
    const bob = Math.sin(this.t * 1.8) * 6;
    ctx.save();
    ctx.translate(this.x, this.y + bob);
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = '#151a28';
    ctx.beginPath();
    ctx.moveTo(-12, 18);
    ctx.quadraticCurveTo(-16, -12, 0, -18);
    ctx.quadraticCurveTo(16, -12, 12, 18);
    ctx.quadraticCurveTo(6, 12, 0, 18);
    ctx.quadraticCurveTo(-6, 12, -12, 18);
    ctx.fill();
    // pale eyes
    ctx.fillStyle = '#cfe0ff';
    ctx.beginPath();
    ctx.ellipse(-5, -6, 2.5, 4, 0, 0, Math.PI * 2);
    ctx.ellipse(5, -6, 2.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------- enemies
class Enemy {
  constructor(type, x, y) {
    this.type = type;
    this.x = x; this.y = y;
    this.t = Math.random() * 10;
    this.dead = false;
    this.flash = 0;
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.vx = 0; this.vy = 0;
    this.state = 'idle';
    this.stateT = 0;
    this.anchor = { x, y };
    const stats = {
      crawler: { hp: 2, w: 30, h: 22, geo: 3 },
      flyer:   { hp: 2, w: 26, h: 24, geo: 3 },
      spitter: { hp: 3, w: 30, h: 28, geo: 5 },
      heavy:   { hp: 5, w: 40, h: 36, geo: 9 },
    }[type];
    Object.assign(this, stats);
    this.maxHp = this.hp;
  }
  rect() { return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h }; }

  hurt(dmg, fromDir) {
    this.hp -= dmg;
    this.flash = 0.08;
    this.vx += fromDir * 130;
    AudioSys.sfx('hitEnemy');
    Particles.burst(this.x, this.y, '#f4f7ff', 7, 180, 200);
    if (this.hp <= 0) this.die();
  }
  die() {
    this.dead = true;
    AudioSys.sfx('hitEnemy');
    Particles.burst(this.x, this.y, '#2a2f42', 14, 220);
    Particles.burst(this.x, this.y, '#e8993f', 6, 160);
    Particles.ring(this.x, this.y, '#e8eef8');
    let drop = this.geo;
    if (Player.equipped.has('ledger')) drop = Math.ceil(drop * 1.5);
    for (let i = 0; i < drop; i++) Game.geoBits.push(new GeoBit(this.x, this.y));
    Game.shake(3);
  }

  update(dt) {
    this.t += dt;
    this.stateT += dt;
    this.flash = Math.max(0, this.flash - dt);
    const pr = Player.rect();
    const px = pr.x + pr.w / 2, py = pr.y + pr.h / 2;
    const distX = px - this.x, distY = py - this.y;
    const dist = Math.hypot(distX, distY);

    if (this.type === 'crawler') {
      this.vy += CFG.gravity * dt;
      if (this.vy > 700) this.vy = 700;
      const speed = 70;
      this.vx = this.vx * 0.8 + this.dir * speed * 0.2;
      // turn at walls
      const ahead = this.x + this.dir * (this.w / 2 + 4);
      if (World.rectHitsSolid(ahead - 2, this.y - this.h / 2 + 4, 4, this.h - 8)) this.dir *= -1;
      // turn at ledges (only when grounded)
      const grounded = World.rectHitsSolid(this.x - this.w / 2, this.y + this.h / 2 + 1, this.w, 2);
      if (grounded && !World.rectHitsSolid(ahead - 2, this.y + this.h / 2 + 6, 4, 4)) this.dir *= -1;
      this.moveWithCollision(dt);
    } else if (this.type === 'flyer') {
      if (dist < 230) this.state = 'chase';
      if (dist > 420) this.state = 'idle';
      if (this.state === 'chase') {
        this.vx += (distX / dist) * 700 * dt;
        this.vy += (distY / dist) * 700 * dt;
        const cap = 210;
        const v = Math.hypot(this.vx, this.vy);
        if (v > cap) { this.vx = this.vx / v * cap; this.vy = this.vy / v * cap; }
      } else {
        // drift back to anchor with a lazy sine bob
        this.vx += (this.anchor.x - this.x) * 1.2 * dt;
        this.vy += (this.anchor.y + Math.sin(this.t * 2) * 26 - this.y) * 2.2 * dt;
        this.vx *= 0.98; this.vy *= 0.98;
      }
      this.dir = this.vx < 0 ? -1 : 1;
      this.moveWithCollision(dt, true);
    } else if (this.type === 'spitter') {
      // rooted; lob shots when player in range with line of sight-ish
      if (dist < 330 && this.stateT > 2.2 && !Player.dead) {
        this.stateT = 0;
        const tof = 0.9;
        const vx = distX / tof;
        const vy = distY / tof - 0.5 * 900 * tof;
        Game.shots.push(new Shot('lob', this.x, this.y - 8, vx, vy));
        AudioSys.sfx('cast');
      }
      this.dir = distX < 0 ? -1 : 1;
    } else if (this.type === 'heavy') {
      this.vy += CFG.gravity * dt;
      if (this.vy > 700) this.vy = 700;
      if (this.state === 'charge') {
        this.vx = this.dir * 330;
        const ahead = this.x + this.dir * (this.w / 2 + 4);
        if (World.rectHitsSolid(ahead - 2, this.y - this.h / 2 + 4, 4, this.h - 8) || this.stateT > 1.6) {
          this.state = 'idle'; this.stateT = 0; this.vx = 0;
          Game.shake(4);
          AudioSys.sfx('hitWall');
        }
      } else if (this.state === 'telegraph') {
        this.vx *= 0.8;
        if (this.stateT > 0.45) { this.state = 'charge'; this.stateT = 0; AudioSys.sfx('dash'); }
      } else {
        const speed = 40;
        this.vx = this.vx * 0.9 + this.dir * speed * 0.1;
        const ahead = this.x + this.dir * (this.w / 2 + 4);
        if (World.rectHitsSolid(ahead - 2, this.y - this.h / 2 + 4, 4, this.h - 8)) this.dir *= -1;
        const grounded = World.rectHitsSolid(this.x - this.w / 2, this.y + this.h / 2 + 1, this.w, 2);
        if (grounded && !World.rectHitsSolid(ahead - 2, this.y + this.h / 2 + 6, 4, 4)) this.dir *= -1;
        if (Math.abs(distY) < 60 && Math.abs(distX) < 280 && this.stateT > 1.2 && !Player.dead) {
          this.state = 'telegraph'; this.stateT = 0;
          this.dir = distX < 0 ? -1 : 1;
        }
      }
      this.moveWithCollision(dt);
    }

    // contact damage
    if (!Player.dead && rectsOverlap(this.rect(), Player.rect())) {
      Player.damage(this.x);
    }
  }

  moveWithCollision(dt, flying = false) {
    let nx = this.x + this.vx * dt;
    if (World.rectHitsSolid(nx - this.w / 2, this.y - this.h / 2, this.w, this.h)) {
      this.vx = flying ? this.vx * -0.5 : 0;
    } else this.x = nx;
    let ny = this.y + this.vy * dt;
    if (World.rectHitsSolid(this.x - this.w / 2, ny - this.h / 2, this.w, this.h)) {
      this.vy = flying ? this.vy * -0.5 : 0;
    } else this.y = ny;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    const white = this.flash > 0;
    const body = white ? '#ffffff' : '#232a3d';
    const shell = white ? '#ffffff' : '#39415c';
    const eye = '#ffb44d';
    if (this.type === 'crawler') {
      const wob = Math.sin(this.t * 12) * 2;
      ctx.fillStyle = shell;
      ctx.beginPath();
      ctx.ellipse(0, -2 + wob * 0.3, 15, 11, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(this.dir * 8, 2, 8, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = eye;
      ctx.beginPath();
      ctx.arc(this.dir * 11, 0, 2.2, 0, Math.PI * 2);
      ctx.fill();
      // legs
      ctx.strokeStyle = body; ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 8, 8);
        ctx.lineTo(i * 8 + Math.sin(this.t * 14 + i) * 4, 12);
        ctx.stroke();
      }
    } else if (this.type === 'flyer') {
      const flap = Math.sin(this.t * 22) * 6;
      ctx.fillStyle = 'rgba(200,215,240,0.65)';
      ctx.beginPath();
      ctx.ellipse(-10, -6 - flap, 9, 4, -0.5, 0, Math.PI * 2);
      ctx.ellipse(10, -6 - flap, 9, 4, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = eye;
      ctx.beginPath();
      ctx.arc(this.dir * 3 - 2, -2, 2, 0, Math.PI * 2);
      ctx.arc(this.dir * 3 + 3, -2, 2, 0, Math.PI * 2);
      ctx.fill();
      // dangly stinger
      ctx.strokeStyle = body; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, 15); ctx.stroke();
    } else if (this.type === 'spitter') {
      const puff = this.stateT < 0.25 ? 3 : 0;
      ctx.fillStyle = shell;
      ctx.beginPath();
      ctx.ellipse(0, 2, 15 + puff, 13 + puff, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(this.dir * 6, -6, 8, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = eye;
      ctx.beginPath();
      ctx.arc(this.dir * 9, -7, 2, 0, Math.PI * 2);
      ctx.fill();
      // maw
      ctx.fillStyle = '#0d1120';
      ctx.beginPath();
      ctx.arc(this.dir * 12, -4, 2.5 + puff * 0.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === 'heavy') {
      const rage = this.state === 'telegraph';
      const lean = this.state === 'charge' ? this.dir * 4 : 0;
      ctx.fillStyle = rage ? '#5a2c2c' : shell;
      ctx.beginPath();
      ctx.ellipse(lean, -4, 20, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = body;
      ctx.fillRect(-16 + lean, 4, 32, 12);
      // horned helm
      ctx.strokeStyle = rage ? '#c86048' : '#5a6482';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(lean - 10, -16); ctx.quadraticCurveTo(lean - 18, -26, lean - 8, -30);
      ctx.moveTo(lean + 10, -16); ctx.quadraticCurveTo(lean + 18, -26, lean + 8, -30);
      ctx.stroke();
      ctx.fillStyle = rage ? '#ff6a3d' : eye;
      ctx.beginPath();
      ctx.arc(this.dir * 8 + lean, -6, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------------- boss
class Boss {
  constructor(x, y) {
    this.kind = 'burnout';
    this.name = CONTENT.enemyNames.boss;
    this.title = CONTENT.bossTitle;
    this.x = x; this.y = y;
    this.w = 56; this.h = 74;
    this.hpMax = 46;
    this.hp = this.hpMax;
    this.vx = 0; this.vy = 0;
    this.dir = -1;
    this.state = 'intro';
    this.stateT = 0;
    this.flash = 0;
    this.dead = false;
    this.staggerPool = 0;
    this.t = 0;
  }
  rect() { return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h }; }

  hurt(dmg, fromDir) {
    if (this.state === 'intro' || this.dead) return;
    this.hp -= dmg;
    this.flash = 0.08;
    this.staggerPool += dmg;
    AudioSys.sfx('bossHit');
    Particles.burst(this.x + fromDir * -10, this.y - 10, '#ffd9a0', 8, 200);
    if (this.hp <= 0) {
      this.die();
      return;
    }
    if (this.staggerPool >= 14 && this.state !== 'stagger') {
      this.staggerPool = 0;
      this.state = 'stagger'; this.stateT = 0;
      this.vx = 0;
      AudioSys.sfx('stag');
    }
  }
  die() {
    this.dead = true;
    this.state = 'dying';
    this.stateT = 0;
    AudioSys.sfx('bossDie');
    Game.shake(14);
    Game.hitstopT = 0.35;
  }

  setState(s) { this.state = s; this.stateT = 0; }

  update(dt) {
    this.t += dt;
    this.stateT += dt;
    this.flash = Math.max(0, this.flash - dt);
    const groundY = 14 * TILE - this.h / 2; // boss arena floor
    const pr = Player.rect();
    const px = pr.x + pr.w / 2;

    if (this.state === 'dying') {
      this.vy += CFG.gravity * dt;
      this.y = Math.min(this.y + this.vy * dt, groundY);
      if (Math.random() < 0.5) {
        Particles.burst(this.x + (Math.random() - 0.5) * 50, this.y + (Math.random() - 0.5) * 60, '#ff8040', 4, 150);
      }
      if (this.stateT > 2.2) Game.onBossDeath(this.x, this.y);
      return;
    }

    if (this.state === 'intro') {
      if (this.stateT > 1.6) { this.setState('idle'); }
      this.y = groundY;
      return;
    }

    if (this.state === 'stagger') {
      this.vx *= 0.85;
      this.x += this.vx * dt;
      if (this.stateT > 1.3) this.setState('idle');
      // smolder
      if (Math.random() < 0.2) Particles.spawn(this.x, this.y - 30, 0, -60, 0.5, 3, 'rgba(255,120,50,0.6)');
      return;
    }

    // constant flame shed
    if (Math.random() < 0.35) {
      Particles.spawn(this.x + (Math.random() - 0.5) * 40, this.y - this.h / 2 + 8,
        (Math.random() - 0.5) * 30, -80 - Math.random() * 60, 0.5, 3.5, 'rgba(255,130,40,0.7)');
    }

    if (this.state === 'idle') {
      this.dir = px < this.x ? -1 : 1;
      this.vx = this.vx * 0.9 + this.dir * 60 * 0.1;
      this.x += this.vx * dt;
      this.y = groundY;
      const wait = this.hp < this.hpMax / 2 ? 0.7 : 1.1;
      if (this.stateT > wait) {
        const roll = Math.random();
        if (this.hp < this.hpMax / 2 && roll < 0.3) this.setState('embersTele');
        else if (roll < 0.62) this.setState('dashTele');
        else this.setState('slamTele');
      }
    } else if (this.state === 'dashTele') {
      this.dir = px < this.x ? -1 : 1;
      this.vx = 0;
      if (this.stateT > 0.5) { this.setState('dash'); AudioSys.sfx('roar'); }
    } else if (this.state === 'dash') {
      this.vx = this.dir * 640;
      this.x += this.vx * dt;
      this.y = groundY;
      Particles.spawn(this.x - this.dir * 24, this.y + 20, -this.dir * 60, -30, 0.3, 4, 'rgba(255,120,40,0.6)');
      // wall check
      if (World.rectHitsSolid(this.x + this.dir * (this.w / 2 + 4), this.y - 20, 6, 40) || this.stateT > 1.4) {
        Game.shake(6);
        AudioSys.sfx('hitWall');
        this.setState('idle');
      }
    } else if (this.state === 'slamTele') {
      this.vx = 0;
      if (this.stateT > 0.4) {
        this.setState('slamRise');
        this.vy = -820;
        this.vx = (px - this.x) * 1.6;
      }
    } else if (this.state === 'slamRise') {
      this.vy += CFG.gravity * 0.8 * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.vy > 0) this.setState('slamFall');
    } else if (this.state === 'slamFall') {
      this.vy += CFG.gravity * 1.6 * dt;
      this.y += this.vy * dt;
      if (this.y >= groundY) {
        this.y = groundY;
        Game.shake(10);
        AudioSys.sfx('roar');
        // flame waves both directions
        Game.shots.push(new Shot('wave', this.x - 40, 14 * TILE - 16, -260, 0));
        Game.shots.push(new Shot('wave', this.x + 40, 14 * TILE - 16, 260, 0));
        this.setState('idle');
      }
    } else if (this.state === 'embersTele') {
      this.vx = 0;
      if (Math.random() < 0.4) Particles.spawn(this.x, this.y - 40, (Math.random() - 0.5) * 80, -140, 0.4, 4, 'rgba(255,170,60,0.8)');
      if (this.stateT > 0.7) {
        AudioSys.sfx('roar');
        for (let i = 0; i < 7; i++) {
          const ex = TILE * 2 + Math.random() * (World.pxW - TILE * 4);
          Game.shots.push(new Shot('ember', ex, TILE * 1.5, 0, 60 + Math.random() * 120));
        }
        this.setState('idle');
      }
    }

    // clamp inside arena
    this.x = Math.max(TILE * 1.5 + this.w / 2, Math.min(World.pxW - TILE * 1.5 - this.w / 2, this.x));

    // contact damage
    if (!Player.dead && rectsOverlap(this.rect(), Player.rect())) {
      Player.damage(this.x);
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    const white = this.flash > 0;
    const crouch = (this.state === 'dashTele' || this.state === 'slamTele') ? 6 : 0;
    const stagger = this.state === 'stagger';

    // flame mantle
    if (!white) {
      const fh = 30 + Math.sin(this.t * 18) * 6;
      const g = ctx.createLinearGradient(0, -this.h / 2, 0, -this.h / 2 - fh);
      g.addColorStop(0, 'rgba(255,90,30,0.85)');
      g.addColorStop(1, 'rgba(255,200,90,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-26, -this.h / 2 + 12);
      ctx.quadraticCurveTo(-18, -this.h / 2 - fh, -6, -this.h / 2 + 2);
      ctx.quadraticCurveTo(0, -this.h / 2 - fh * 1.2, 8, -this.h / 2 + 2);
      ctx.quadraticCurveTo(20, -this.h / 2 - fh, 26, -this.h / 2 + 12);
      ctx.closePath();
      ctx.fill();
    }

    // body: hulking cloaked figure
    ctx.fillStyle = white ? '#ffffff' : '#1c1016';
    ctx.beginPath();
    ctx.moveTo(-28, 36 + crouch);
    ctx.quadraticCurveTo(-34, -20, -14, -34 + crouch);
    ctx.quadraticCurveTo(0, -42 + crouch, 14, -34 + crouch);
    ctx.quadraticCurveTo(34, -20, 28, 36 + crouch);
    ctx.quadraticCurveTo(0, 30 + crouch, -28, 36 + crouch);
    ctx.fill();

    // molten cracks
    if (!white) {
      ctx.strokeStyle = stagger ? '#7a4030' : '#ff6a30';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.8 + Math.sin(this.t * 10) * 0.2;
      ctx.beginPath();
      ctx.moveTo(-12, 10); ctx.lineTo(-6, -4); ctx.lineTo(-14, -16);
      ctx.moveTo(10, 16); ctx.lineTo(6, 0); ctx.lineTo(14, -12);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // mask
    ctx.fillStyle = white ? '#ffffff' : '#f2ede2';
    ctx.beginPath();
    ctx.ellipse(this.dir * 8, -22 + crouch, 14, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    // burning eyes
    ctx.fillStyle = stagger ? '#8a8a8a' : '#ff3a10';
    ctx.beginPath();
    ctx.ellipse(this.dir * 4, -24 + crouch, 2.6, 4.5, 0, 0, Math.PI * 2);
    ctx.ellipse(this.dir * 13, -24 + crouch, 2.6, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // cracked horn crown
    ctx.strokeStyle = white ? '#ffffff' : '#d8d2c4';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(this.dir * 2 - 8, -32 + crouch); ctx.quadraticCurveTo(this.dir * 2 - 22, -52, this.dir * 2 - 26, -44);
    ctx.moveTo(this.dir * 2 + 8, -32 + crouch); ctx.quadraticCurveTo(this.dir * 2 + 22, -56, this.dir * 2 + 28, -46);
    ctx.stroke();
    ctx.restore();
  }
}

// ------------------------------------------------------------ the Recruiter
class ShopEnt {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.t = Math.random() * 5;
  }
  get near() {
    const pr = Player.rect();
    return Math.abs(pr.x + pr.w / 2 - this.x) < 44 && Math.abs(pr.y + pr.h / 2 - this.y) < 50;
  }
  update(dt) {
    this.t += dt;
    if (this.near && Input.pressed.up && Player.grounded && Game.state === 'play') {
      AudioSys.sfx('tablet');
      Game.openShop();
    }
  }
  draw(ctx) {
    const breathe = Math.sin(this.t * 2.2) * 1.5;
    ctx.save();
    ctx.translate(this.x, this.y + 16);
    // plump, dapper bug with a ledger
    ctx.fillStyle = '#3c3226';
    ctx.beginPath();
    ctx.ellipse(0, -18 - breathe, 14, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    // waistcoat
    ctx.fillStyle = '#8a6c34';
    ctx.beginPath();
    ctx.ellipse(0, -12 - breathe, 11, 10, 0, 0, Math.PI);
    ctx.fill();
    // head
    ctx.fillStyle = '#e6ddc8';
    ctx.beginPath();
    ctx.ellipse(0, -38 - breathe, 8.5, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // monocle
    ctx.strokeStyle = '#d8c890';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(3.5, -38 - breathe, 3.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#26202e';
    ctx.beginPath();
    ctx.ellipse(-3, -38 - breathe, 1.5, 2.2, 0, 0, Math.PI * 2);
    ctx.ellipse(3.5, -38 - breathe, 1.5, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    // antennae, neatly combed
    ctx.strokeStyle = '#e6ddc8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-3, -45 - breathe); ctx.quadraticCurveTo(-6, -52 - breathe, -11, -51 - breathe);
    ctx.moveTo(3, -45 - breathe); ctx.quadraticCurveTo(6, -52 - breathe, 11, -51 - breathe);
    ctx.stroke();
    // the ledger, held proudly
    ctx.fillStyle = '#caa84e';
    ctx.fillRect(8, -26 - breathe, 12, 15);
    ctx.fillStyle = '#f4ecd8';
    ctx.fillRect(9.5, -24.5 - breathe, 9, 12);
    ctx.strokeStyle = '#b09040';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(11, -21 - breathe + i * 3.5); ctx.lineTo(17, -21 - breathe + i * 3.5);
      ctx.stroke();
    }
    ctx.restore();
    if (this.near && Game.state === 'play') UI.worldPrompt(ctx, this.x, this.y - 46, 'SHOP');
  }
}

// ------------------------------------------------------- the second boss
// THE IMPOSTER — a dark mirror of the little knight. Fights like you do.
class Imposter {
  constructor(x, y) {
    this.kind = 'imposter';
    this.name = CONTENT.enemyNames.imposter;
    this.title = CONTENT.imposterTitle;
    this.x = x; this.y = y;
    this.w = 26; this.h = 46;
    this.hpMax = 28;
    this.hp = this.hpMax;
    this.vx = 0; this.vy = 0;
    this.dir = -1;
    this.state = 'intro';
    this.stateT = 0;
    this.flash = 0;
    this.dead = false;
    this.staggerPool = 0;
    this.t = 0;
    this.slashActiveT = 0;
    this.comboQueued = false;
  }
  rect() { return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h }; }
  get phase2() { return this.hp < this.hpMax / 2; }
  groundY() { return 14 * TILE - this.h / 2; }

  hurt(dmg, fromDir) {
    if (this.state === 'intro' || this.dead) return;
    this.hp -= dmg;
    this.flash = 0.08;
    this.staggerPool += dmg;
    this.vx += fromDir * 60;
    AudioSys.sfx('bossHit');
    Particles.burst(this.x, this.y - 8, '#cfd6ea', 7, 190);
    if (this.hp <= 0) { this.die(); return; }
    if (this.staggerPool >= 9 && this.state !== 'stagger') {
      this.staggerPool = 0;
      this.setState('stagger');
      this.vx = -this.dir * 160;
      AudioSys.sfx('stag');
    }
  }
  die() {
    this.dead = true;
    this.setState('dying');
    AudioSys.sfx('bossDie');
    Game.shake(10);
    Game.hitstopT = 0.3;
  }
  setState(s) { this.state = s; this.stateT = 0; }

  slashBox() {
    const r = 58;
    return this.dir > 0
      ? { x: this.x + this.w / 2 - 6, y: this.y - 24, w: r, h: 48 }
      : { x: this.x - this.w / 2 + 6 - r, y: this.y - 24, w: r, h: 48 };
  }

  update(dt) {
    this.t += dt;
    this.stateT += dt;
    this.flash = Math.max(0, this.flash - dt);
    const gY = this.groundY();
    const pr = Player.rect();
    const px = pr.x + pr.w / 2;
    const dist = Math.abs(px - this.x);
    const tele = this.phase2 ? 0.72 : 1;

    if (this.state === 'dying') {
      this.vy += CFG.gravity * dt;
      this.y = Math.min(this.y + this.vy * dt, gY);
      if (Math.random() < 0.4) Particles.spawn(this.x, this.y - 10, (Math.random() - 0.5) * 60, -90, 0.6, 3, 'rgba(180,190,220,0.7)');
      if (this.stateT > 2.0) Game.onBossDeath(this.x, this.y);
      return;
    }
    if (this.state === 'intro') {
      this.y = Math.min(this.y + 120 * dt, gY);
      if (this.stateT > 1.4) this.setState('idle');
      return;
    }
    if (this.state === 'stagger') {
      this.vx *= 0.86;
      this.x += this.vx * dt;
      if (this.stateT > 0.9) this.setState('idle');
      return;
    }

    if (this.state === 'idle') {
      this.dir = px < this.x ? -1 : 1;
      this.vx *= 0.8;
      this.x += this.vx * dt;
      this.y = gY;
      if (this.stateT > (this.phase2 ? 0.4 : 0.6)) {
        const roll = Math.random();
        if (dist < 120) this.setState('slashTele');
        else if (roll < 0.38) this.setState('dashTele');
        else if (roll < 0.72) this.setState('approach');
        else { this.setState('leap'); this.vy = -720; this.vx = (px - this.x) * 1.4; }
      }
    } else if (this.state === 'approach') {
      this.dir = px < this.x ? -1 : 1;
      this.vx = this.dir * 300;
      this.x += this.vx * dt;
      this.y = gY;
      if (dist < 105) this.setState('slashTele');
      else if (this.stateT > 1.1) this.setState('idle');
    } else if (this.state === 'slashTele') {
      this.dir = px < this.x ? -1 : 1;
      this.vx = 0;
      if (this.stateT > 0.32 * tele) {
        this.setState('slash');
        this.slashActiveT = 0.16;
        this.vx = this.dir * 430;
        AudioSys.sfx('slash');
      }
    } else if (this.state === 'slash') {
      this.slashActiveT -= dt;
      this.vx *= 0.92;
      this.x += this.vx * dt;
      this.y = gY;
      if (this.slashActiveT > 0 && !Player.dead && rectsOverlap(this.slashBox(), Player.rect())) {
        Player.damage(this.x);
      }
      if (this.stateT > 0.42) {
        if (this.phase2 && !this.comboQueued) { this.comboQueued = true; this.setState('slashTele'); }
        else { this.comboQueued = false; this.setState('idle'); }
      }
    } else if (this.state === 'dashTele') {
      this.dir = px < this.x ? -1 : 1;
      this.vx = 0;
      if (this.stateT > 0.38 * tele) { this.setState('dash'); AudioSys.sfx('dash'); }
    } else if (this.state === 'dash') {
      this.vx = this.dir * 660;
      this.x += this.vx * dt;
      this.y = gY;
      Game.ghosts.push({ x: this.x - this.w / 2, y: this.y - this.h / 2, facing: this.dir, life: 0.18 });
      if (World.rectHitsSolid(this.x + this.dir * (this.w / 2 + 6), this.y - 16, 6, 32) || this.stateT > 0.6) {
        this.setState('idle');
      }
    } else if (this.state === 'leap') {
      this.vy += CFG.gravity * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.dir = this.vx < 0 ? -1 : 1;
      if (this.y >= gY && this.vy > 0) {
        this.y = gY;
        this.vy = 0;
        Game.shake(4);
        Particles.dust(this.x, this.y + this.h / 2, 0);
        this.setState(dist < 130 ? 'slashTele' : 'idle');
      }
    }

    // stay inside the arena
    this.x = Math.max(TILE * 1.5 + this.w / 2, Math.min(World.pxW - TILE * 1.5 - this.w / 2, this.x));

    if (!Player.dead && rectsOverlap(this.rect(), Player.rect())) {
      Player.damage(this.x);
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y + this.h / 2); // draw from feet, like the player
    const white = this.flash > 0;
    const stagger = this.state === 'stagger';
    const crouch = (this.state === 'slashTele' || this.state === 'dashTele') ? 4 : 0;
    const lean = this.state === 'dash' ? this.dir * 0.25 : 0;
    ctx.rotate(lean);

    // legs
    ctx.strokeStyle = white ? '#ffffff' : '#0d0a12';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-4, -12); ctx.lineTo(-5, 0);
    ctx.moveTo(4, -12); ctx.lineTo(5, 0);
    ctx.stroke();

    // cloak — the player's silhouette, drowned in shadow
    const bodyTop = -38 + crouch;
    ctx.fillStyle = white ? '#ffffff' : '#171020';
    ctx.beginPath();
    ctx.moveTo(-11, -6 + crouch);
    ctx.quadraticCurveTo(-14, bodyTop + 12, -8, bodyTop + 6);
    ctx.quadraticCurveTo(0, bodyTop, 8, bodyTop + 6);
    ctx.quadraticCurveTo(14, bodyTop + 12, 11, -6 + crouch);
    ctx.quadraticCurveTo(0, -2 + crouch, -11, -6 + crouch);
    ctx.fill();

    // dark mask, pale burning eyes
    const headY = bodyTop - 2;
    ctx.fillStyle = white ? '#ffffff' : '#241a2e';
    ctx.beginPath();
    ctx.ellipse(this.dir * 1.5, headY, 11, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = white ? '#ffffff' : '#241a2e';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(this.dir * 1.5 - 6, headY - 6);
    ctx.quadraticCurveTo(this.dir * 1.5 - 15, headY - 17, this.dir * 1.5 - 18, headY - 12);
    ctx.moveTo(this.dir * 1.5 + 6, headY - 6);
    ctx.quadraticCurveTo(this.dir * 1.5 + 15, headY - 17, this.dir * 1.5 + 18, headY - 12);
    ctx.stroke();
    ctx.fillStyle = stagger ? '#7a7a8a' : '#eef4ff';
    ctx.beginPath();
    ctx.ellipse(this.dir * 4 - 3, headY + 1, 2.2, 3.8, 0, 0, Math.PI * 2);
    ctx.ellipse(this.dir * 4 + 4, headY + 1, 2.2, 3.8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // silver slash arc
    if (this.state === 'slash' && this.slashActiveT > 0) {
      const p = 1 - this.slashActiveT / 0.16;
      ctx.save();
      ctx.strokeStyle = `rgba(205,215,240,${0.9 - p * 0.6})`;
      ctx.lineWidth = 5 - p * 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const a0 = this.dir > 0 ? -1.2 : Math.PI + 1.2;
      const a1 = this.dir > 0 ? 1.2 : Math.PI - 1.2;
      ctx.arc(this.x, this.y, 56, a0, a1);
      ctx.stroke();
      ctx.restore();
    }
    // telegraph shimmer
    if (this.state === 'slashTele' || this.state === 'dashTele') {
      ctx.save();
      ctx.globalAlpha = 0.4 + Math.sin(this.stateT * 40) * 0.3;
      ctx.strokeStyle = '#cfd6ea';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y - this.h / 2 - 14, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}
