// WORKSONG — the little knight. All the game-feel lives here: coyote time,
// jump buffering, hard jump cuts, wall kisses, dash ghosts, pogo bounces.

const Player = {
  // AABB (x,y = top-left)
  x: 0, y: 0, w: 22, h: 42,
  vx: 0, vy: 0,
  facing: 1,
  grounded: false,
  dead: false,

  // resources
  masks: CFG.masksMax,
  masksMax: CFG.masksMax,
  soul: 0,
  geo: 0,
  abilities: { dash: false, claw: false, wings: false, spell: false },
  charms: new Set(),

  // timers / state
  coyoteT: 0,
  bufferT: 0,
  invulnT: 0,
  dashT: 0,
  dashCdT: 0,
  airDash: true,
  airJump: true,
  dashing: false,
  dashDir: 1,
  wallDir: 0,        // -1 wall on left, 1 wall on right, 0 none
  wallCoyoteT: 0,
  wallLockT: 0,
  sliding: false,

  slashT: 0,         // >0 while nail active
  slashCdT: 0,
  slashDir: 'side',  // 'side' | 'up' | 'down'
  slashHits: null,   // Set of things already hit this swing

  castHeldT: -1,     // -1 = not held
  focusing: false,
  focusT: 0,

  lastSafe: { x: 0, y: 0 },
  safeT: 0,
  runT: 0,
  idleT: 0,
  landT: 0,

  reset(pos) {
    this.x = pos.x - this.w / 2;
    this.y = pos.y - this.h;
    this.vx = 0; this.vy = 0;
    this.dead = false;
    this.dashing = false;
    this.slashT = 0; this.slashCdT = 0;
    this.invulnT = 0;
    this.focusing = false; this.castHeldT = -1;
    this.coyoteT = 0; this.bufferT = 0;
    this.airDash = true; this.airJump = true;
    this.lastSafe = { x: this.x, y: this.y };
  },

  rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; },
  get cx() { return this.x + this.w / 2; },
  get cy() { return this.y + this.h / 2; },

  nailCd() { return this.charms.has('coffee') ? CFG.nailCooldownFast : CFG.nailCooldown; },

  // ------------------------------------------------------------------ update
  update(dt) {
    if (this.dead) return;

    // timers
    this.slashCdT -= dt;
    this.dashCdT -= dt;
    this.invulnT -= dt;
    this.coyoteT -= dt;
    this.bufferT -= dt;
    this.wallCoyoteT -= dt;
    this.wallLockT -= dt;
    this.landT -= dt;
    this.idleT += dt;

    const axis = Input.axis();
    if (axis !== 0 && !this.focusing) { this.facing = axis; this.idleT = 0; }

    // ---- focus & cast -------------------------------------------------
    if (Input.pressed.cast) this.castHeldT = 0;
    if (this.castHeldT >= 0 && Input.down.cast) {
      this.castHeldT += dt;
      const canFocus = this.grounded && this.soul >= CFG.focusCost && this.masks < this.masksMax;
      if (this.castHeldT > 0.26 && canFocus && !this.focusing) {
        this.focusing = true;
        this.focusT = 0;
        AudioSys.sfx('focusChg');
      }
    }
    if (this.focusing) {
      const focusNeed = this.charms.has('focus') ? CFG.focusTimeDeep : CFG.focusTime;
      this.focusT += dt;
      this.vx *= 0.7;
      // soul streams inward
      if (Math.random() < 0.5) {
        const a = Math.random() * Math.PI * 2;
        Particles.soulWisp(this.cx + Math.cos(a) * 42, this.cy + Math.sin(a) * 42, this.cx, this.cy);
      }
      if (!Input.down.cast || !this.grounded) {
        this.focusing = false;
      } else if (this.focusT >= focusNeed) {
        this.focusing = false;
        this.soul -= CFG.focusCost;
        const healed = this.charms.has('focus') ? 2 : 1;
        this.masks = Math.min(this.masksMax, this.masks + healed);
        AudioSys.sfx('heal');
        Particles.burst(this.cx, this.cy, 'rgba(245,250,255,0.95)', 16, 190, -80);
        Game.shake(2);
      }
    }
    if (this.castHeldT >= 0 && !Input.down.cast) {
      // released: quick tap = spell
      if (this.castHeldT < 0.26 && this.abilities.spell && this.soul >= CFG.castCost && !this.focusing) {
        this.soul -= CFG.castCost;
        Game.orbs.push(new SpellOrb(this.cx + this.facing * 16, this.cy - 4, this.facing));
        this.vx -= this.facing * 60;
        AudioSys.sfx('cast');
        Game.shake(2);
      }
      this.castHeldT = -1;
    }

    // ---- horizontal ----------------------------------------------------
    const control = this.focusing ? 0 : (this.wallLockT > 0 ? 0.35 : 1);
    const accel = (this.grounded ? CFG.groundAccel : CFG.airAccel) * control;
    if (axis !== 0 && !this.dashing) {
      this.vx += axis * accel * dt;
      const cap = CFG.runSpeed;
      if (this.vx > cap) this.vx = Math.max(cap, this.vx - CFG.groundFriction * dt);
      if (this.vx < -cap) this.vx = Math.min(-cap, this.vx + CFG.groundFriction * dt);
    } else if (!this.dashing) {
      const fr = (this.grounded ? CFG.groundFriction : CFG.airFriction) * dt;
      if (this.vx > 0) this.vx = Math.max(0, this.vx - fr);
      else this.vx = Math.min(0, this.vx + fr);
    }

    // ---- wall detection -------------------------------------------------
    this.sliding = false;
    this.wallDir = 0;
    if (!this.grounded && this.abilities.claw && !this.dashing) {
      const touchL = World.rectHitsSolid(this.x - 2, this.y + 6, 2, this.h - 12);
      const touchR = World.rectHitsSolid(this.x + this.w, this.y + 6, 2, this.h - 12);
      if (touchL && axis < 0) this.wallDir = -1;
      else if (touchR && axis > 0) this.wallDir = 1;
      if (this.wallDir !== 0 && this.vy > 0) {
        this.sliding = true;
        this.wallCoyoteT = CFG.wallStickTime;
        this.wallCoyoteDir = this.wallDir;
        if (this.vy > CFG.wallSlideMaxFall) this.vy = CFG.wallSlideMaxFall;
        if (Math.random() < 0.3) Particles.dust(this.x + (this.wallDir > 0 ? this.w : 0), this.y + this.h * 0.7, -this.wallDir);
      }
    }

    // ---- jumping ---------------------------------------------------------
    if (Input.pressed.jump) { this.bufferT = CFG.jumpBuffer; this.idleT = 0; }

    if (this.bufferT > 0) {
      if (this.grounded || this.coyoteT > 0) {
        this.vy = CFG.jumpVel;
        this.grounded = false;
        this.coyoteT = 0;
        this.bufferT = 0;
        this.dashing = false;
        AudioSys.sfx('jump');
        Particles.dust(this.cx, this.y + this.h, 0);
      } else if (this.wallCoyoteT > 0 && this.abilities.claw) {
        const wd = this.wallCoyoteDir;
        this.vx = -wd * CFG.wallJumpVX;
        this.vy = CFG.wallJumpVY;
        this.facing = -wd;
        this.wallLockT = CFG.wallJumpLock;
        this.wallCoyoteT = 0;
        this.bufferT = 0;
        this.airJump = true; // wall jump refreshes the wing
        AudioSys.sfx('jump');
        Particles.dust(this.x + (wd > 0 ? this.w : 0), this.y + this.h * 0.6, -wd);
      } else if (this.abilities.wings && this.airJump && !this.dashing) {
        this.vy = CFG.doubleJumpVel;
        this.airJump = false;
        this.bufferT = 0;
        AudioSys.sfx('djump');
        // wing flourish
        for (let i = 0; i < 8; i++) {
          const a = Math.PI * (0.15 + 0.7 * (i / 7));
          Particles.spawn(this.cx, this.y + this.h - 4, Math.cos(a) * 130, Math.sin(a) * 60 + 50, 0.3, 3, 'rgba(230,240,255,0.8)');
        }
      }
    }
    // jump cut
    if (Input.released.jump && this.vy < 0 && !this.dashing) {
      this.vy *= CFG.jumpCut;
    }

    // ---- dash -------------------------------------------------------------
    if (Input.pressed.dash && this.abilities.dash && !this.dashing && this.dashCdT <= 0 && (this.grounded || this.airDash) && !this.focusing) {
      this.dashing = true;
      this.dashT = CFG.dashTime;
      this.dashCdT = CFG.dashCooldown;
      this.dashDir = axis !== 0 ? axis : this.facing;
      this.facing = this.dashDir;
      if (!this.grounded) this.airDash = false;
      AudioSys.sfx('dash');
      Particles.dust(this.cx, this.y + this.h, -this.dashDir);
    }
    if (this.dashing) {
      this.dashT -= dt;
      this.vx = this.dashDir * CFG.dashSpeed;
      this.vy = 0;
      // ghost trail
      Game.ghosts.push({ x: this.x, y: this.y, facing: this.facing, life: 0.22 });
      if (this.dashT <= 0) {
        this.dashing = false;
        this.vx = this.dashDir * CFG.runSpeed;
      }
    }

    // ---- gravity ------------------------------------------------------------
    if (!this.dashing) {
      this.vy += CFG.gravity * dt;
      if (this.vy > CFG.maxFall) this.vy = CFG.maxFall;
    }

    // ---- integrate & collide -------------------------------------------------
    this.moveAndCollide(dt);

    // ---- spikes ----------------------------------------------------------------
    if (this.invulnT <= 0 && World.rectHitsSpike(this.x + 4, this.y + 6, this.w - 8, this.h - 8)) {
      this.damage(this.cx, true);
    }

    // ---- track safe ground ------------------------------------------------------
    if (this.grounded) {
      this.airDash = true;
      this.airJump = true;
      this.safeT += dt;
      const onSpike = World.rectHitsSpike(this.x, this.y + this.h - 4, this.w, 8);
      if (!onSpike && this.safeT > 0.2) {
        this.safeT = 0;
        this.lastSafe = { x: this.x, y: this.y };
      }
    } else {
      this.safeT = 0;
    }

    // ---- nail ---------------------------------------------------------------------
    if (Input.pressed.attack && this.slashCdT <= 0 && !this.focusing) {
      this.slashCdT = this.nailCd();
      this.slashT = 0.14;
      this.slashHits = new Set();
      this.slashDir = Input.down.up ? 'up' : (Input.down.down && !this.grounded ? 'down' : 'side');
      this.idleT = 0;
      AudioSys.sfx('slash');
    }
    if (this.slashT > 0) {
      this.slashT -= dt;
      this.nailHits();
    }

    // soul cap
    if (this.soul > CFG.soulMax) this.soul = CFG.soulMax;

    // run dust & animation clocks
    if (this.grounded && Math.abs(this.vx) > 60) {
      this.runT += dt * Math.abs(this.vx) / CFG.runSpeed;
      if (Math.random() < 0.08) Particles.dust(this.cx - this.facing * 8, this.y + this.h, -this.facing * 0.4);
    }
  },

  // Axis-separated tile collision. One-way platforms only block downward
  // movement, only when the player was previously above them, and never
  // while holding down.
  moveAndCollide(dt) {
    // X
    let dx = this.vx * dt;
    if (dx !== 0) {
      const step = Math.sign(dx) * Math.min(Math.abs(dx), TILE - 2);
      let remaining = dx;
      while (remaining !== 0) {
        const mv = Math.abs(remaining) > TILE - 2 ? step : remaining;
        if (World.rectHitsSolid(this.x + mv, this.y, this.w, this.h)) {
          // nudge to wall
          const dir = Math.sign(mv);
          while (!World.rectHitsSolid(this.x + dir, this.y, this.w, this.h)) this.x += dir;
          this.vx = 0;
          break;
        }
        this.x += mv;
        remaining -= mv;
      }
    }

    // Y
    let dy = this.vy * dt;
    const prevBottom = this.y + this.h;
    if (dy !== 0) {
      const stepY = Math.sign(dy) * Math.min(Math.abs(dy), TILE - 2);
      let remaining = dy;
      let blocked = false;
      while (remaining !== 0 && !blocked) {
        const mv = Math.abs(remaining) > TILE - 2 ? stepY : remaining;
        const ny = this.y + mv;
        if (World.rectHitsSolid(this.x, ny, this.w, this.h)) {
          const dir = Math.sign(mv);
          while (!World.rectHitsSolid(this.x, this.y + dir, this.w, this.h)) this.y += dir;
          if (dir > 0) { this.groundLand(); } else { this.vy = 0; }
          blocked = true;
          break;
        }
        // one-way platforms
        if (mv > 0 && !Input.down.down) {
          const bottom = ny + this.h;
          const ty = Math.floor(bottom / TILE);
          const tileTop = ty * TILE;
          if (prevBottom <= tileTop + 1) {
            const x0 = Math.floor((this.x + 2) / TILE), x1 = Math.floor((this.x + this.w - 2) / TILE);
            let hit = false;
            for (let tx = x0; tx <= x1; tx++) if (World.tile(tx, ty) === T_PLAT) hit = true;
            if (hit && bottom > tileTop) {
              this.y = tileTop - this.h;
              this.groundLand();
              blocked = true;
              break;
            }
          }
        }
        this.y = ny;
        remaining -= mv;
      }
    }

    // grounded check (also catches walking off ledges)
    const wasGrounded = this.grounded;
    let onGround = World.rectHitsSolid(this.x, this.y + this.h, this.w, 1);
    if (!onGround && this.vy >= 0 && !Input.down.down) {
      // standing on a platform?
      const ty = Math.floor((this.y + this.h + 0.5) / TILE);
      const tileTop = ty * TILE;
      if (Math.abs(this.y + this.h - tileTop) < 1.5) {
        const x0 = Math.floor((this.x + 2) / TILE), x1 = Math.floor((this.x + this.w - 2) / TILE);
        for (let tx = x0; tx <= x1; tx++) if (World.tile(tx, ty) === T_PLAT) onGround = true;
      }
    }
    if (wasGrounded && !onGround) this.coyoteT = CFG.coyoteTime;
    this.grounded = onGround;
  },

  groundLand() {
    if (this.vy > 420) {
      Particles.dust(this.cx, this.y + this.h, 0);
      this.landT = 0.12;
    }
    this.vy = 0;
    this.grounded = true;
  },

  // ------------------------------------------------------------------- nail
  nailBox() {
    const r = CFG.nailRange, hh = CFG.nailHeight;
    if (this.slashDir === 'up') return { x: this.cx - hh / 2, y: this.y - r + 6, w: hh, h: r };
    if (this.slashDir === 'down') return { x: this.cx - hh / 2, y: this.y + this.h - 6, w: hh, h: r };
    return this.facing > 0
      ? { x: this.x + this.w - 4, y: this.cy - hh / 2, w: r, h: hh }
      : { x: this.x + 4 - r, y: this.cy - hh / 2, w: r, h: hh };
  },

  nailHits() {
    const box = this.nailBox();
    let struck = false;
    let pogo = false;

    const gainSoul = () => {
      this.soul += CFG.soulPerHit + (this.charms.has('duck') ? CFG.soulPerHitBonus : 0);
      AudioSys.sfx('soul');
    };

    for (const e of Game.enemies) {
      if (e.dead || this.slashHits.has(e)) continue;
      if (rectsOverlap(box, e.rect())) {
        this.slashHits.add(e);
        e.hurt(CFG.nailDamage, this.facing);
        gainSoul();
        struck = true;
        if (this.slashDir === 'down') pogo = true;
        Game.hitstopT = Math.max(Game.hitstopT, CFG.hitstop);
        Game.shake(2);
      }
    }
    if (Game.boss && !Game.boss.dead && !this.slashHits.has(Game.boss)) {
      if (rectsOverlap(box, Game.boss.rect())) {
        this.slashHits.add(Game.boss);
        Game.boss.hurt(CFG.nailDamage, this.facing);
        gainSoul();
        struck = true;
        if (this.slashDir === 'down') pogo = true;
        Game.hitstopT = Math.max(Game.hitstopT, CFG.hitstop);
        Game.shake(2);
      }
    }
    for (const d of Game.deposits) {
      if (d.dead || this.slashHits.has(d)) continue;
      if (rectsOverlap(box, d.rect())) {
        this.slashHits.add(d);
        d.hurt();
        struck = true;
        if (this.slashDir === 'down') pogo = true;
      }
    }
    // nail can bat enemy lobs/embers out of the air
    for (const s of Game.shots) {
      if (s.dead || s.kind === 'wave' || this.slashHits.has(s)) continue;
      if (rectsOverlap(box, s.rect())) {
        this.slashHits.add(s);
        s.dead = true;
        Particles.burst(s.x, s.y, '#ffffff', 8, 160);
        AudioSys.sfx('hitWall');
        if (this.slashDir === 'down') pogo = true;
      }
    }

    // pogo off spikes
    if (this.slashDir === 'down' && !this.slashHits.has('spikes')) {
      if (World.rectHitsSpike(box.x, box.y, box.w, box.h)) {
        this.slashHits.add('spikes');
        pogo = true;
        AudioSys.sfx('hitWall');
        Particles.burst(this.cx, this.y + this.h + 20, '#dfe6f2', 6, 140);
      }
    }

    if (pogo) {
      this.vy = CFG.pogoVel;
      this.airDash = true;
      this.airJump = true;
      AudioSys.sfx('pogo');
    } else if (struck && this.slashDir === 'side') {
      this.vx -= this.facing * CFG.nailRecoil;
    } else if (struck && this.slashDir === 'up') {
      this.vy = Math.max(this.vy, 60);
    }

    // clang against walls
    if (!struck && this.slashDir === 'side' && !this.slashHits.has('wall')) {
      const probe = this.facing > 0
        ? { x: this.x + this.w + 10, y: this.cy - 6, w: 8, h: 12 }
        : { x: this.x - 18, y: this.cy - 6, w: 8, h: 12 };
      if (World.rectHitsSolid(probe.x, probe.y, probe.w, probe.h)) {
        this.slashHits.add('wall');
        this.vx -= this.facing * CFG.nailRecoil * 0.9;
        AudioSys.sfx('hitWall');
        Particles.burst(this.cx + this.facing * (this.w / 2 + 14), this.cy, '#fff2c8', 4, 120);
      }
    }
  },

  // ----------------------------------------------------------------- damage
  damage(fromX, isHazard = false) {
    if (this.invulnT > 0 || this.dead || Game.state !== 'play') return;
    this.masks--;
    this.invulnT = CFG.invulnTime;
    this.focusing = false;
    this.dashing = false;
    const dir = this.cx < fromX ? -1 : 1;
    this.vx = dir * CFG.hurtKnockX;
    this.vy = CFG.hurtKnockY;
    Game.hitstopT = Math.max(Game.hitstopT, CFG.hurtstop);
    Game.shake(7);
    AudioSys.sfx('hurt');
    Particles.burst(this.cx, this.cy, '#1a1e2e', 12, 240);
    Particles.burst(this.cx, this.cy, '#c8d4e8', 6, 180);

    if (this.masks <= 0) {
      this.die();
    } else if (isHazard) {
      Game.hazardRespawn();
    }
  },

  die() {
    if (this.dead) return;
    this.dead = true;
    AudioSys.sfx('die');
    Particles.burst(this.cx, this.cy, '#0d1120', 26, 320);
    Particles.burst(this.cx, this.cy, '#e8eef8', 14, 260);
    Game.onPlayerDeath();
  },

  // ------------------------------------------------------------------- draw
  draw(ctx) {
    if (this.dead) return;
    // invuln flicker
    if (this.invulnT > 0 && Math.floor(this.invulnT * 14) % 2 === 0) return;

    const cx = this.cx, bottom = this.y + this.h;
    ctx.save();
    ctx.translate(cx, bottom);

    const spd = Math.abs(this.vx) / CFG.runSpeed;
    const running = this.grounded && spd > 0.2;
    const crouch = this.landT > 0 ? 3 : 0;
    const bob = running ? Math.abs(Math.sin(this.runT * 9)) * 2.5 : Math.sin(this.idleT * 2.2) * 1.2;
    const lean = this.dashing ? this.facing * 0.22 : (running ? this.facing * 0.1 : 0);
    ctx.rotate(lean);

    // ---- legs
    ctx.strokeStyle = '#252c42';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    if (this.grounded) {
      if (running) {
        const sw = Math.sin(this.runT * 9) * 8;
        ctx.beginPath();
        ctx.moveTo(-3, -12); ctx.lineTo(-3 + sw, 0);
        ctx.moveTo(3, -12); ctx.lineTo(3 - sw, 0);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(-4, -12); ctx.lineTo(-5, 0);
        ctx.moveTo(4, -12); ctx.lineTo(5, 0);
        ctx.stroke();
      }
    } else {
      // tucked in air
      ctx.beginPath();
      ctx.moveTo(-4, -12); ctx.lineTo(-6, -4);
      ctx.moveTo(4, -12); ctx.lineTo(6, -4);
      ctx.stroke();
    }

    // ---- cloak body
    const bodyTop = -34 - bob + crouch;
    ctx.fillStyle = '#2a3350';
    ctx.beginPath();
    ctx.moveTo(-10, -6 + crouch);
    ctx.quadraticCurveTo(-13, bodyTop + 12, -7, bodyTop + 6);
    ctx.quadraticCurveTo(0, bodyTop, 7, bodyTop + 6);
    ctx.quadraticCurveTo(13, bodyTop + 12, 10, -6 + crouch);
    ctx.quadraticCurveTo(0, -2 + crouch, -10, -6 + crouch);
    ctx.fill();
    // cloak flutter when moving fast
    if (!this.grounded || this.dashing) {
      ctx.fillStyle = 'rgba(42,51,80,0.8)';
      const fl = Math.sin(performance.now() / 60) * 4;
      ctx.beginPath();
      ctx.moveTo(-this.facing * 8, -8);
      ctx.quadraticCurveTo(-this.facing * (16 + Math.abs(this.vx) * 0.015), -14 + fl, -this.facing * 12, -22);
      ctx.quadraticCurveTo(-this.facing * 6, -18, -this.facing * 8, -8);
      ctx.fill();
    }

    // ---- head: pale mask with horns
    const headY = bodyTop - 2;
    ctx.fillStyle = '#eef1f8';
    ctx.beginPath();
    ctx.ellipse(this.facing * 1.5, headY, 10.5, 9.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // horns
    ctx.strokeStyle = '#eef1f8';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(this.facing * 1.5 - 6, headY - 6);
    ctx.quadraticCurveTo(this.facing * 1.5 - 14, headY - 16, this.facing * 1.5 - 17, headY - 12);
    ctx.moveTo(this.facing * 1.5 + 6, headY - 6);
    ctx.quadraticCurveTo(this.facing * 1.5 + 14, headY - 16, this.facing * 1.5 + 17, headY - 12);
    ctx.stroke();
    // eyes
    ctx.fillStyle = '#10141f';
    ctx.beginPath();
    ctx.ellipse(this.facing * 4 - 3, headY + 1, 2.2, 3.6, 0, 0, Math.PI * 2);
    ctx.ellipse(this.facing * 4 + 4, headY + 1, 2.2, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();

    // ---- focusing glow
    if (this.focusing) {
      const focusNeed = this.charms.has('focus') ? CFG.focusTimeDeep : CFG.focusTime;
      const pr = this.focusT / focusNeed;
      ctx.strokeStyle = 'rgba(240,248,255,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -20, 26, -Math.PI / 2, -Math.PI / 2 + pr * Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(240,248,255,${0.10 + pr * 0.2})`;
      ctx.beginPath();
      ctx.arc(0, -20, 30, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // ---- nail slash arc (drawn in world space)
    if (this.slashT > 0) {
      const p = 1 - this.slashT / 0.14; // 0→1
      const box = this.nailBox();
      ctx.save();
      ctx.strokeStyle = `rgba(240,246,255,${0.95 - p * 0.6})`;
      ctx.lineWidth = 5 - p * 3;
      ctx.lineCap = 'round';
      const midX = box.x + box.w / 2, midY = box.y + box.h / 2;
      ctx.beginPath();
      if (this.slashDir === 'side') {
        const r = CFG.nailRange * (0.8 + p * 0.3);
        const a0 = this.facing > 0 ? -1.1 : Math.PI + 1.1;
        const a1 = this.facing > 0 ? 1.1 : Math.PI - 1.1;
        ctx.arc(this.cx, this.cy, r, a0 + (this.facing > 0 ? -0.3 : 0.3) * p, a1);
      } else if (this.slashDir === 'up') {
        ctx.arc(this.cx, this.cy - 4, CFG.nailRange * (0.8 + p * 0.3), -Math.PI + 0.5, -0.5);
      } else {
        ctx.arc(this.cx, this.cy + 4, CFG.nailRange * (0.8 + p * 0.3), 0.5, Math.PI - 0.5);
      }
      ctx.stroke();
      ctx.restore();
    }
  },
};
