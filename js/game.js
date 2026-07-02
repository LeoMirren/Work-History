// WORKSONG — the conductor. Owns the loop, the camera, the state machine,
// room population, encounters, saving, and every screen overlay.

const SAVE_KEY = 'worksong.save.v1';

const Game = {
  state: 'title', // title | play | pause | dialog | dead | ending
  canvas: null, ctx: null,
  lastT: 0,
  titleT: 0,
  titleSel: 0,

  // room entities
  enemies: [], shots: [], orbs: [], geoBits: [], pickups: [],
  tablets: [], benches: [], deposits: [], portals: [], ghosts: [],
  shadeEnt: null, boss: null,

  // fx / timing
  cam: { x: 0, y: 0 },
  shakeMag: 0,
  hitstopT: 0,
  transition: null, // {t, exit, out}
  areaCardT: 0, areaCardName: '', areaCardSub: '',
  bannerT: 0, bannerTitle: '', bannerDesc: '',
  dialogLines: null, dialogShown: 0,
  deathT: 0, deathQuote: '',
  endT: 0,
  hazardFlashT: 0,
  playT: 0, deaths: 0,
  lastArea: null,

  // encounter state
  arena: null, // {phase:'wait'|'fight', wave, sealed}
  bossArmed: false,

  flags: {
    arenaDone: false,
    bossDone: false,
    shade: null,          // {room,x,y,geo}
    benchRoom: null,
    benchPos: null,       // {x,y} feet-center px
    collected: [],        // ["room:kind:id"]
  },

  // ---------------------------------------------------------------- boot
  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    Input.init();
    addEventListener('keydown', () => AudioSys.unlock(), { once: false });
    addEventListener('resize', () => this.fit());
    this.fit();
    this.titleSel = 0;
    requestAnimationFrame(t => this.frame(t));
  },

  fit() {
    const scale = Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H);
    this.canvas.style.width = `${VIEW_W * scale}px`;
    this.canvas.style.height = `${VIEW_H * scale}px`;
  },

  hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  },

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        abilities: Player.abilities,
        charms: [...Player.charms],
        geo: Player.geo,
        flags: this.flags,
        deaths: this.deaths,
        playT: Math.floor(this.playT),
      }));
    } catch (e) { /* private mode etc.; play on without saves */ }
  },

  loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      Object.assign(Player.abilities, s.abilities || {});
      Player.charms = new Set(s.charms || []);
      Player.geo = s.geo || 0;
      this.flags = Object.assign(this.flags, s.flags || {});
      this.deaths = s.deaths || 0;
      this.playT = s.playT || 0;
      return true;
    } catch (e) { return false; }
  },

  startGame(fresh) {
    if (fresh) {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
      Player.abilities = { dash: false, claw: false, wings: false, spell: false };
      Player.charms = new Set();
      Player.geo = 0;
      this.flags = { arenaDone: false, bossDone: false, shade: null, benchRoom: null, benchPos: null, collected: [] };
      this.deaths = 0;
      this.playT = 0;
    } else {
      this.loadSave();
    }
    Player.masks = Player.masksMax;
    Player.soul = 0;
    this.lastArea = null;
    const room = this.flags.benchRoom || 'foyer1';
    this.loadRoom(room, null);
    this.state = 'play';
  },

  // ------------------------------------------------------------ room load
  loadRoom(id, spawnFeet) {
    World.load(id);
    this.enemies = []; this.shots = []; this.orbs = []; this.geoBits = [];
    this.pickups = []; this.tablets = []; this.benches = []; this.deposits = [];
    this.portals = []; this.ghosts = [];
    this.shadeEnt = null; this.boss = null; this.arena = null; this.bossArmed = false;
    Particles.clear();

    let benchSpawn = null;
    for (const sp of World.spawnPoints) {
      const feetY = sp.y + TILE / 2; // spawn markers sit in the tile above ground
      switch (sp.type) {
        case 'crawler': case 'flyer': case 'spitter': case 'heavy':
          this.enemies.push(new Enemy(sp.type, sp.x, sp.y));
          break;
        case 'bench': {
          const b = new BenchEnt(sp.id, sp.x, sp.y);
          this.benches.push(b);
          benchSpawn = { x: sp.x, y: feetY };
          break;
        }
        case 'tablet':
          this.tablets.push(new TabletEnt(sp.id, sp.x, sp.y));
          break;
        case 'ability': case 'charm': {
          const key = `${id}:${sp.type}:${sp.id}`;
          if (this.flags.collected.includes(key)) break;
          const pk = new Pickup(sp.type, sp.id, sp.x, sp.y);
          pk.saveKey = key;
          if (World.def.arena && !this.flags.arenaDone) pk.hidden = true;
          this.pickups.push(pk);
          break;
        }
        case 'geo':
          this.deposits.push(new Deposit(sp.x, sp.y));
          break;
        case 'portal':
          this.portals.push(new PortalEnt(sp.x, sp.y));
          break;
      }
    }

    // player placement
    let feet = spawnFeet;
    if (!feet) {
      if (this.flags.benchRoom === id && this.flags.benchPos) feet = this.flags.benchPos;
      else if (benchSpawn && this.flags.benchRoom === id) feet = benchSpawn;
      else if (World.playerStart) feet = { x: World.playerStart.x, y: World.playerStart.y + TILE / 2 };
      else feet = { x: TILE * 3, y: TILE * 14 };
    }
    Player.reset(feet);

    // shade waiting here?
    if (this.flags.shade && this.flags.shade.room === id) {
      this.shadeEnt = new Shade(this.flags.shade.x, this.flags.shade.y, this.flags.shade.geo);
    }

    // encounters
    if (World.def.arena && !this.flags.arenaDone) this.arena = { phase: 'wait', wave: 0 };
    if (World.def.boss && !this.flags.bossDone) this.bossArmed = true;

    // music + area card
    AudioSys.setScale(CONTENT.areas[World.areaId].scale);
    AudioSys.setBoss(false);
    if (World.areaId !== this.lastArea) {
      this.lastArea = World.areaId;
      const a = CONTENT.areas[World.areaId];
      this.areaCardName = a.name;
      this.areaCardSub = a.sub;
      this.areaCardT = 3.4;
    }

    this.cam.x = Math.max(0, Math.min(Player.cx - VIEW_W / 2, World.pxW - VIEW_W));
    this.cam.y = Math.max(0, Math.min(Player.cy - VIEW_H / 2, World.pxH - VIEW_H));
  },

  // ------------------------------------------------------------- helpers
  shake(mag) { this.shakeMag = Math.max(this.shakeMag, mag); },

  openDialog(lines) {
    this.dialogLines = lines;
    this.dialogShown = 0;
    this.state = 'dialog';
  },

  restAtBench(bench) {
    Player.masks = Player.masksMax;
    this.flags.benchRoom = World.roomId;
    this.flags.benchPos = { x: bench.x, y: bench.y + TILE / 2 };
    this.save();
    AudioSys.sfx('bench');
    Particles.burst(Player.cx, Player.cy - 10, 'rgba(245,250,255,0.9)', 14, 150, -60);
    const name = CONTENT.benches[bench.id] || 'Bench';
    this.showBanner(name, 'Rested. The kingdom is saved.');
  },

  showBanner(title, desc) {
    this.bannerTitle = title;
    this.bannerDesc = desc;
    this.bannerT = 3.2;
  },

  acquire(kind, id, x, y) {
    if (kind === 'ability') {
      Player.abilities[id] = true;
      const meta = CONTENT.abilities[id];
      this.showBanner(meta.name, meta.desc);
    } else {
      Player.charms.add(id);
      const meta = CONTENT.charms[id];
      this.showBanner(meta.name, meta.desc);
    }
    const pk = this.pickups.find(p => p.dead && p.id === id);
    if (pk && pk.saveKey && !this.flags.collected.includes(pk.saveKey)) {
      this.flags.collected.push(pk.saveKey);
    }
    this.save();
    AudioSys.sfx('pickup');
    this.hitstopT = 0.18;
    this.shake(4);
    Particles.burst(x, y, '#ffffff', 22, 260, -40);
  },

  onPlayerDeath() {
    this.deaths++;
    this.deathQuote = CONTENT.deathQuotes[Math.floor(Math.random() * CONTENT.deathQuotes.length)];
    if (Player.geo > 0) {
      this.flags.shade = { room: World.roomId, x: Player.cx, y: Math.min(Player.cy, World.pxH - TILE * 3.5), geo: Player.geo };
      Player.geo = 0;
    }
    this.save();
    this.deathT = 0;
    this.state = 'dead';
    AudioSys.setBoss(false);
  },

  hazardRespawn() {
    if (Player.dead) return;
    this.hazardFlashT = 0.4;
    Player.x = Player.lastSafe.x;
    Player.y = Player.lastSafe.y;
    Player.vx = 0; Player.vy = 0;
    Player.dashing = false;
  },

  onBossDeath(x, y) {
    this.boss = null;
    this.flags.bossDone = true;
    this.save();
    AudioSys.setBoss(false);
    this.unseal();
    Particles.burst(x, y, '#ffb050', 40, 380);
    Particles.burst(x, y, '#f4f7ff', 26, 300);
    this.shake(12);
    this.showBanner('BURNOUT is extinguished', 'The way onward stands open.');
  },

  startEnding() {
    if (this.state !== 'play') return;
    this.state = 'ending';
    this.endT = 0;
    this.save();
  },

  // Seal / unseal every exit of the current room (arena & boss doors).
  seal() {
    for (const ex of World.def.exits) this.setExitTiles(ex, T_SOLID);
    AudioSys.sfx('door');
  },
  unseal() {
    for (const ex of World.def.exits) this.setExitTiles(ex, T_EMPTY);
    AudioSys.sfx('door');
  },
  setExitTiles(ex, val) {
    for (let i = ex.min; i <= ex.max; i++) {
      if (ex.side === 'left') World.setTile(0, i, val);
      else if (ex.side === 'right') World.setTile(World.w - 1, i, val);
      else if (ex.side === 'top') World.setTile(i, 0, val);
      else if (ex.side === 'bottom') World.setTile(i, World.h - 1, val);
    }
  },

  // ------------------------------------------------------------ encounters
  updateArena(dt) {
    if (!this.arena) return;
    if (this.arena.phase === 'wait') {
      if (Player.cx > TILE * 10 && Player.cx < TILE * 30 && Player.grounded) {
        this.arena.phase = 'fight';
        this.arena.wave = 1;
        this.seal();
        this.shake(5);
        this.spawnWave(1);
      }
    } else if (this.arena.phase === 'fight') {
      if (this.enemies.every(e => e.dead)) {
        if (this.arena.wave === 1) {
          this.arena.wave = 2;
          this.spawnWave(2);
        } else {
          this.arena = null;
          this.flags.arenaDone = true;
          this.unseal();
          for (const p of this.pickups) p.hidden = false;
          this.showBanner('The stacks fall silent', 'Something pale glimmers in the dark.');
          this.save();
        }
      }
    }
  },
  spawnWave(n) {
    const y = TILE * 11;
    if (n === 1) {
      this.enemies.push(new Enemy('crawler', TILE * 8, y));
      this.enemies.push(new Enemy('crawler', TILE * 32, y));
      this.enemies.push(new Enemy('flyer', TILE * 20, TILE * 6));
    } else {
      this.enemies.push(new Enemy('flyer', TILE * 10, TILE * 5));
      this.enemies.push(new Enemy('flyer', TILE * 30, TILE * 5));
      this.enemies.push(new Enemy('heavy', TILE * 20, y));
    }
    AudioSys.sfx('roar');
  },

  updateBossTrigger() {
    if (!this.bossArmed || this.boss) return;
    if (Player.cx > TILE * 8) {
      this.bossArmed = false;
      this.boss = new Boss(World.pxW / 2, TILE * 11);
      this.seal();
      AudioSys.setBoss(true);
      AudioSys.sfx('roar');
      this.shake(8);
    }
  },

  // ------------------------------------------------------------ transitions
  checkExits() {
    if (this.transition) return;
    const pr = Player.rect();
    const cx = Player.cx, cy = Player.cy;
    const rowTop = Math.floor(pr.y / TILE), rowBot = Math.floor((pr.y + pr.h - 1) / TILE);
    const colL = Math.floor(pr.x / TILE), colR = Math.floor((pr.x + pr.w - 1) / TILE);
    for (const ex of World.def.exits) {
      let hit = false;
      if (ex.side === 'left' && cx < 4) hit = rowBot >= ex.min && rowTop <= ex.max;
      if (ex.side === 'right' && cx > World.pxW - 4) hit = rowBot >= ex.min && rowTop <= ex.max;
      if (ex.side === 'top' && cy < 4) hit = colR >= ex.min && colL <= ex.max;
      if (ex.side === 'bottom' && cy > World.pxH - 4) hit = colR >= ex.min && colL <= ex.max;
      if (hit) {
        this.transition = { t: 0, exit: ex, out: true, keepVX: Player.vx, keepVY: Player.vy, side: ex.side };
        return;
      }
    }
    // fell out of the world through a gap that isn't an exit — mercy respawn
    if (cy > World.pxH + TILE * 4) this.hazardRespawn();
  },

  updateTransition(dt) {
    const tr = this.transition;
    if (!tr) return;
    tr.t += dt;
    const T = CFG.transitionTime;
    if (tr.out && tr.t >= T) {
      const ex = tr.exit;
      this.loadRoom(ex.to, { x: ex.px * TILE + TILE / 2, y: (ex.py + 1) * TILE });
      // preserve momentum through horizontal doors, and falling speed downward
      if (tr.side === 'left' || tr.side === 'right') Player.vx = tr.keepVX;
      if (tr.side === 'bottom') Player.vy = Math.max(tr.keepVY, 100);
      tr.out = false;
      tr.t = 0;
    } else if (!tr.out && tr.t >= T) {
      this.transition = null;
    }
  },

  // ---------------------------------------------------------------- update
  update(dt) {
    if (this.state === 'title') {
      this.titleT += dt;
      const hasSave = this.hasSave();
      const n = hasSave ? 2 : 1;
      if (Input.pressed.down) this.titleSel = (this.titleSel + 1) % n;
      if (Input.pressed.up) this.titleSel = (this.titleSel + n - 1) % n;
      if (Input.pressed.confirm || Input.pressed.jump) {
        AudioSys.unlock();
        const fresh = !hasSave || this.titleSel === 1;
        this.startGame(fresh);
      }
      return;
    }

    if (this.state === 'pause') {
      if (Input.pressed.pause) this.state = 'play';
      else if (Input.pressed.confirm) {
        this.save();
        this.state = 'title';
        this.titleSel = 0;
      }
      return;
    }

    if (this.state === 'dialog') {
      const total = this.dialogLines.reduce((a, l) => a + l.length, 0);
      this.dialogShown += dt * 55;
      if (Input.pressed.confirm || Input.pressed.jump || Input.pressed.attack) {
        if (this.dialogShown < total) this.dialogShown = total;
        else { this.state = 'play'; this.dialogLines = null; }
      }
      return;
    }

    if (this.state === 'dead') {
      this.deathT += dt;
      Particles.update(dt);
      if (this.deathT > CFG.respawnTime) {
        Player.masks = Player.masksMax;
        Player.soul = 0;
        const room = this.flags.benchRoom || 'foyer1';
        this.loadRoom(room, null);
        this.state = 'play';
      }
      return;
    }

    if (this.state === 'ending') {
      this.endT += dt;
      Particles.update(dt);
      if (this.endT > 3 && Input.pressed.confirm) {
        this.state = 'title';
        this.titleSel = 0;
        this.lastArea = null;
      }
      return;
    }

    // ---- play ----
    if (Input.pressed.pause) { this.state = 'pause'; return; }
    if (Input.pressed.mute) AudioSys.toggleMute();

    this.playT += dt;

    if (this.hitstopT > 0) {
      this.hitstopT -= dt;
      return; // world frozen for impact
    }

    if (this.transition) {
      this.updateTransition(dt);
      Particles.update(dt);
      return;
    }

    Player.update(dt);
    this.checkExits();

    for (const e of this.enemies) if (!e.dead) e.update(dt);
    if (this.boss) this.boss.update(dt);
    for (const s of this.shots) if (!s.dead) s.update(dt);
    for (const o of this.orbs) {
      if (o.dead) continue;
      o.update(dt);
      // spell vs enemies
      for (const e of this.enemies) {
        if (!e.dead && rectsOverlap(o.rect(), e.rect())) {
          e.hurt(CFG.spellDamage, o.dir);
          o.dead = true;
          break;
        }
      }
      if (!o.dead && this.boss && !this.boss.dead && rectsOverlap(o.rect(), this.boss.rect())) {
        this.boss.hurt(CFG.spellDamage, o.dir);
        o.dead = true;
      }
    }
    for (const g of this.geoBits) if (!g.dead) g.update(dt);
    for (const p of this.pickups) if (!p.dead) p.update(dt);
    for (const d of this.deposits) if (!d.dead) d.update(dt);
    for (const t of this.tablets) t.update();
    for (const b of this.benches) b.update();
    for (const p of this.portals) p.update(dt);
    if (this.shadeEnt && !this.shadeEnt.dead) this.shadeEnt.update(dt);

    this.enemies = this.enemies.filter(e => !e.dead || this.arena); // arena counts its dead
    this.shots = this.shots.filter(s => !s.dead);
    this.orbs = this.orbs.filter(o => !o.dead);
    this.geoBits = this.geoBits.filter(g => !g.dead);
    this.pickups = this.pickups.filter(p => !p.dead);
    this.deposits = this.deposits.filter(d => !d.dead);
    if (this.shadeEnt && this.shadeEnt.dead) this.shadeEnt = null;

    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      this.ghosts[i].life -= dt;
      if (this.ghosts[i].life <= 0) this.ghosts.splice(i, 1);
    }

    this.updateArena(dt);
    this.updateBossTrigger();

    Particles.update(dt);

    // ambient motes
    if (Math.random() < 0.12) {
      Particles.spawn(this.cam.x + Math.random() * VIEW_W, this.cam.y + Math.random() * VIEW_H,
        (Math.random() - 0.5) * 12, -8 - Math.random() * 14, 2.5, 1.6, 'rgba(190,205,230,0.28)');
    }

    // camera
    const targetX = Player.cx + Player.facing * CFG.camLookahead - VIEW_W / 2;
    const targetY = Player.cy + CFG.camVertOffset - VIEW_H / 2;
    const k = 1 - Math.exp(-CFG.camLerp * dt);
    this.cam.x += (targetX - this.cam.x) * k;
    this.cam.y += (targetY - this.cam.y) * k;
    this.cam.x = Math.max(0, Math.min(this.cam.x, World.pxW - VIEW_W));
    this.cam.y = Math.max(0, Math.min(this.cam.y, World.pxH - VIEW_H));
    if (World.pxW <= VIEW_W) this.cam.x = (World.pxW - VIEW_W) / 2;
    if (World.pxH <= VIEW_H) this.cam.y = (World.pxH - VIEW_H) / 2;

    this.shakeMag = Math.max(0, this.shakeMag - dt * 26);
  },

  // ------------------------------------------------------------------ draw
  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);

    if (this.state === 'title') {
      UI.drawTitle(ctx, this.titleT, this.hasSave(), this.titleSel);
      return;
    }

    // world
    World.drawBackground(ctx, this.cam);

    ctx.save();
    const sx = (Math.random() - 0.5) * this.shakeMag;
    const sy = (Math.random() - 0.5) * this.shakeMag;
    ctx.translate(-Math.round(this.cam.x + sx), -Math.round(this.cam.y + sy));

    World.drawTiles(ctx, this.cam);
    for (const d of this.deposits) d.draw(ctx);
    for (const b of this.benches) b.draw(ctx);
    for (const t of this.tablets) t.draw(ctx);
    for (const p of this.pickups) p.draw(ctx);
    for (const p of this.portals) p.draw(ctx);
    if (this.shadeEnt) this.shadeEnt.draw(ctx);
    for (const e of this.enemies) if (!e.dead) e.draw(ctx);
    if (this.boss) this.boss.draw(ctx);
    for (const s of this.shots) s.draw(ctx);
    for (const o of this.orbs) o.draw(ctx);
    for (const g of this.geoBits) g.draw(ctx);

    // dash ghosts
    for (const g of this.ghosts) {
      ctx.save();
      ctx.globalAlpha = g.life / 0.22 * 0.35;
      ctx.fillStyle = '#9fb6e8';
      ctx.beginPath();
      ctx.ellipse(g.x + Player.w / 2, g.y + Player.h / 2, 12, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    Player.draw(ctx);
    Particles.draw(ctx);
    ctx.restore();

    // lighting
    const dark = { foyer: 0.3, archives: 0.34, foundry: 0.34, stacks: 0.52, overclock: 0.44, dawn: 0.12 }[World.areaId] || 0.3;
    UI.vignette(ctx, dark);

    // HUD & overlays
    UI.drawHUD(ctx);
    if (this.boss && !this.boss.dead && this.boss.state !== 'intro') UI.drawBossBar(ctx, this.boss);
    if (this.boss && this.boss.state === 'intro') {
      ctx.save();
      ctx.textAlign = 'center';
      const a = Math.min(1, this.boss.stateT / 0.4);
      ctx.globalAlpha = a;
      ctx.font = UI.font(40, 700);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '8px';
      ctx.fillStyle = '#ffb890';
      ctx.fillText(CONTENT.bossTitle[0], VIEW_W / 2, VIEW_H / 2 - 60);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      ctx.font = UI.font(18);
      ctx.fillStyle = 'rgba(255,220,200,0.9)';
      ctx.fillText(CONTENT.bossTitle[1], VIEW_W / 2, VIEW_H / 2 - 28);
      ctx.restore();
    }

    if (this.areaCardT > 0) {
      this.areaCardT -= 1 / 60;
      const a = this.areaCardT > 2.9 ? (3.4 - this.areaCardT) / 0.5 : Math.min(1, this.areaCardT / 0.8);
      UI.areaCard(ctx, this.areaCardName, this.areaCardSub, Math.max(0, a));
    }
    if (this.bannerT > 0) {
      this.bannerT -= 1 / 60;
      const a = this.bannerT > 2.8 ? (3.2 - this.bannerT) / 0.4 : Math.min(1, this.bannerT / 0.6);
      UI.banner(ctx, this.bannerTitle, this.bannerDesc, Math.max(0, a));
    }

    if (this.state === 'dialog' && this.dialogLines) {
      UI.drawDialog(ctx, this.dialogLines, Math.floor(this.dialogShown));
    }

    if (this.transition) {
      const T = CFG.transitionTime;
      const a = this.transition.out ? this.transition.t / T : 1 - this.transition.t / T;
      UI.fade(ctx, a);
    }
    if (this.hazardFlashT > 0) {
      this.hazardFlashT -= 1 / 60;
      UI.fade(ctx, Math.min(0.85, this.hazardFlashT * 2.5));
    }

    if (this.state === 'pause') UI.drawPause(ctx);
    if (this.state === 'dead') UI.drawDeath(ctx, this.deathT, this.deathQuote);
    if (this.state === 'ending') UI.drawEnding(ctx, this.endT, { playT: this.playT, deaths: this.deaths, geo: Player.geo });
  },

  // ------------------------------------------------------------------ loop
  frame(t) {
    const dt = Math.min((t - this.lastT) / 1000 || 0.016, 1 / 30);
    this.lastT = t;
    this.update(dt);
    AudioSys.update(dt);
    this.draw();
    Input.endFrame();
    requestAnimationFrame(tt => this.frame(tt));
  },
};

addEventListener('DOMContentLoaded', () => Game.init());
