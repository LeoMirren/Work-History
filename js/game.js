// WORKSONG — the conductor. Owns the loop, the camera, the state machine,
// room population, encounters, saving, and every screen overlay.

const SAVE_KEY = 'worksong.save.v1';

const Game = {
  state: 'title', // title | play | pause | dialog | dead | ending | shop
  canvas: null, ctx: null,
  lastT: 0,
  titleT: 0,
  titleSel: 0,
  pauseSel: 0,
  shopSel: 0,

  // room entities
  enemies: [], shots: [], orbs: [], geoBits: [], pickups: [],
  tablets: [], benches: [], deposits: [], portals: [], ghosts: [], npcs: [],
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
    bossDone: false,      // BURNOUT
    imposterDone: false,  // THE IMPOSTER
    shards: 0,            // mask shards found (2 → +1 mask)
    shade: null,          // {room,x,y,geo}
    benchRoom: null,
    benchPos: null,       // {x,y} feet-center px
    collected: [],        // ["room:kind:id"]
    visited: [],          // room ids seen (drawn on the map)
    shopSold: [],         // item ids bought from the Recruiter
  },

  bossFlagFor(kind) { return kind === 'imposter' ? 'imposterDone' : 'bossDone'; },
  applyShards() {
    Player.masksMax = Math.min(7, CFG.masksMax + Math.floor((this.flags.shards || 0) / 2));
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
        equipped: [...Player.equipped],
        soulVessels: Player.soulVessels,
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
      Player.equipped = new Set(s.equipped || []);
      Player.soulVessels = s.soulVessels || 0;
      Player.geo = s.geo || 0;
      this.flags = Object.assign(this.flags, s.flags || {});
      if (!this.flags.visited) this.flags.visited = [];
      if (!this.flags.shopSold) this.flags.shopSold = [];
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
      this.flags = { arenaDone: false, bossDone: false, imposterDone: false, shards: 0, shade: null, benchRoom: null, benchPos: null, collected: [], visited: [], shopSold: [] };
      Player.equipped = new Set();
      Player.soulVessels = 0;
      this.deaths = 0;
      this.playT = 0;
    } else {
      this.loadSave();
    }
    this.applyShards();
    Player.veilCharge = true;
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
    this.portals = []; this.ghosts = []; this.npcs = [];
    this.shadeEnt = null; this.boss = null; this.arena = null; this.bossArmed = false;
    Particles.clear();

    const bossPending = World.def.boss && !this.flags[this.bossFlagFor(World.def.boss)];

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
        case 'ability': case 'charm': case 'shard': {
          const key = `${id}:${sp.type}:${sp.id || Math.round(sp.x)}`;
          if (this.flags.collected.includes(key)) break;
          const pk = new Pickup(sp.type, sp.id, sp.x, sp.y);
          pk.saveKey = key;
          // encounter rewards stay hidden until the fight is won
          if ((World.def.arena && !this.flags.arenaDone) || bossPending) pk.hidden = true;
          this.pickups.push(pk);
          break;
        }
        case 'geo':
          this.deposits.push(new Deposit(sp.x, sp.y));
          break;
        case 'portal':
          this.portals.push(new PortalEnt(sp.x, sp.y));
          break;
        case 'npc':
          this.npcs.push(new NpcEnt(sp.x, sp.y));
          break;
        case 'shop':
          this.npcs.push(new ShopEnt(sp.x, sp.y));
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
    if (bossPending) this.bossArmed = true;

    // map knowledge
    if (!this.flags.visited.includes(id)) this.flags.visited.push(id);

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
    Player.veilCharge = true;
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

  acquire(pk) {
    if (pk.kind === 'ability') {
      Player.abilities[pk.id] = true;
      const meta = CONTENT.abilities[pk.id];
      this.showBanner(meta.name, meta.desc);
    } else if (pk.kind === 'charm') {
      this.grantCharm(pk.id);
    } else if (pk.kind === 'shard') {
      this.grantShard();
    }
    if (pk.saveKey && !this.flags.collected.includes(pk.saveKey)) {
      this.flags.collected.push(pk.saveKey);
    }
    this.save();
    AudioSys.sfx('pickup');
    this.hitstopT = 0.18;
    this.shake(4);
    Particles.burst(pk.x, pk.y, '#ffffff', 22, 260, -40);
  },

  grantShard() {
    this.flags.shards = (this.flags.shards || 0) + 1;
    const whole = this.flags.shards % 2 === 0;
    this.applyShards();
    if (whole) Player.masks = Player.masksMax;
    const b = whole ? CONTENT.shardBanner.full : CONTENT.shardBanner.half;
    this.showBanner(b[0], b[1]);
  },

  grantCharm(id) {
    Player.charms.add(id);
    if (id === 'veil') Player.veilCharge = true;
    const meta = CONTENT.charms[id];
    // auto-equip when there's room for it
    if (Player.notchesUsed() + meta.cost <= CONTENT.notches) Player.equipped.add(id);
    this.showBanner(meta.name, `${meta.desc} (${meta.cost}◆)`);
  },

  // -------------------------------------------------------------------- shop
  openShop() {
    this.shopSel = 0;
    this.state = 'shop';
  },

  shopStock() {
    return CONTENT.shopItems.filter(it => !this.flags.shopSold.includes(it.id));
  },

  updateShop() {
    const stock = this.shopStock();
    if (Input.pressed.pause || Input.pressed.quit || stock.length === 0 && Input.pressed.confirm) {
      this.state = 'play';
      return;
    }
    if (stock.length === 0) return;
    if (Input.pressed.down) { this.shopSel = (this.shopSel + 1) % stock.length; AudioSys.sfx('soul'); }
    if (Input.pressed.up) { this.shopSel = (this.shopSel + stock.length - 1) % stock.length; AudioSys.sfx('soul'); }
    this.shopSel = Math.min(this.shopSel, stock.length - 1);
    if (Input.pressed.confirm || Input.pressed.jump) {
      const it = stock[this.shopSel];
      if (Player.geo >= it.price) {
        Player.geo -= it.price;
        this.flags.shopSold.push(it.id);
        if (it.id === 'shard') this.grantShard();
        else if (it.id === 'vessel') {
          Player.soulVessels++;
          this.showBanner(it.name, 'Your soul runs deeper now.');
        } else if (it.id === 'ledger') this.grantCharm('ledger');
        this.save();
        AudioSys.sfx('pickup');
        Particles.burst(Player.cx, Player.cy - 20, '#e8e4c8', 14, 200, -40);
      } else {
        AudioSys.sfx('hitWall');
      }
    }
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
    const kind = this.boss ? this.boss.kind : 'burnout';
    this.boss = null;
    this.flags[this.bossFlagFor(kind)] = true;
    this.save();
    AudioSys.setBoss(false);
    this.unseal();
    for (const p of this.pickups) p.hidden = false;
    Particles.burst(x, y, kind === 'imposter' ? '#cfd6ea' : '#ffb050', 40, 380);
    Particles.burst(x, y, '#f4f7ff', 26, 300);
    this.shake(12);
    if (kind === 'imposter') {
      this.showBanner('THE IMPOSTER dissolves', 'It never knew you at all. Something waits below.');
    } else {
      this.showBanner('BURNOUT is extinguished', 'The way onward stands open.');
    }
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
    if (Player.cx > TILE * 6 && Player.grounded) {
      this.bossArmed = false;
      const kind = World.def.boss;
      this.boss = kind === 'imposter'
        ? new Imposter(World.pxW / 2, TILE * 9)
        : new Boss(World.pxW / 2, TILE * 11);
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
      if (Input.pressed.pause) { this.state = 'play'; return; }
      if (Input.pressed.quit) {
        this.save();
        this.state = 'title';
        this.titleSel = 0;
        return;
      }
      const owned = Object.keys(CONTENT.charms).filter(c => Player.charms.has(c));
      if (owned.length) {
        if (Input.pressed.down) { this.pauseSel = (this.pauseSel + 1) % owned.length; AudioSys.sfx('soul'); }
        if (Input.pressed.up) { this.pauseSel = (this.pauseSel + owned.length - 1) % owned.length; AudioSys.sfx('soul'); }
        this.pauseSel = Math.min(this.pauseSel, owned.length - 1);
        if (Input.pressed.confirm || Input.pressed.jump) {
          const id = owned[this.pauseSel];
          const meta = CONTENT.charms[id];
          if (Player.equipped.has(id)) {
            Player.equipped.delete(id);
            AudioSys.sfx('hitWall');
          } else if (Player.notchesUsed() + meta.cost <= CONTENT.notches) {
            Player.equipped.add(id);
            if (id === 'veil') { /* charge state persists; benches restore it */ }
            AudioSys.sfx('bench');
          } else {
            AudioSys.sfx('hurt'); // no room on the cord
          }
          this.save();
        }
      }
      return;
    }

    if (this.state === 'shop') {
      this.updateShop();
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
    for (const n of this.npcs) n.update(dt);
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

    // ambient atmosphere, tuned per area
    const area = World.areaId;
    if (area === 'archives') {
      if (Math.random() < 0.14) Particles.spawn(this.cam.x + Math.random() * VIEW_W, this.cam.y - 10,
        (Math.random() - 0.5) * 18, 18 + Math.random() * 22, 4, 2, 'rgba(140,220,160,0.3)');
    } else if (area === 'foundry') {
      if (Math.random() < 0.2) Particles.spawn(this.cam.x + Math.random() * VIEW_W, this.cam.y + VIEW_H + 8,
        (Math.random() - 0.5) * 24, -30 - Math.random() * 50, 3, 1.8, 'rgba(255,150,60,0.35)');
    } else if (area === 'overclock') {
      if (Math.random() < 0.3) Particles.spawn(this.cam.x + Math.random() * VIEW_W, this.cam.y + VIEW_H + 8,
        (Math.random() - 0.5) * 40, -60 - Math.random() * 90, 2.2, 2, 'rgba(255,90,40,0.4)');
    } else if (area === 'stacks') {
      if (Math.random() < 0.1) Particles.spawn(this.cam.x + Math.random() * VIEW_W, this.cam.y + Math.random() * VIEW_H,
        (Math.random() - 0.5) * 8, -4 - Math.random() * 8, 4, 1.6, 'rgba(150,140,220,0.25)');
    } else {
      if (Math.random() < 0.12) Particles.spawn(this.cam.x + Math.random() * VIEW_W, this.cam.y + Math.random() * VIEW_H,
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
    for (const n of this.npcs) n.draw(ctx);
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
      ctx.fillStyle = this.boss.kind === 'imposter' ? '#cfd6ea' : '#ffb890';
      ctx.fillText(this.boss.title[0], VIEW_W / 2, VIEW_H / 2 - 60);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      ctx.font = UI.font(18);
      ctx.fillStyle = this.boss.kind === 'imposter' ? 'rgba(215,225,245,0.9)' : 'rgba(255,220,200,0.9)';
      ctx.fillText(this.boss.title[1], VIEW_W / 2, VIEW_H / 2 - 28);
      ctx.restore();
    }

    const overlayFree = this.state === 'play' || this.state === 'dialog' || this.state === 'dead';
    if (this.areaCardT > 0 && overlayFree) {
      this.areaCardT -= 1 / 60;
      const a = this.areaCardT > 2.9 ? (3.4 - this.areaCardT) / 0.5 : Math.min(1, this.areaCardT / 0.8);
      UI.areaCard(ctx, this.areaCardName, this.areaCardSub, Math.max(0, a));
    }
    if (this.bannerT > 0 && overlayFree) {
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

    if (this.state === 'pause') UI.drawPause(ctx, this.pauseSel);
    if (this.state === 'shop') UI.drawShop(ctx, this.shopSel);
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
