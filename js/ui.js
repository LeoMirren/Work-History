// WORKSONG — HUD and screens. Serif everything; Hallownest is a serif kingdom.

const UI = {
  font(size, weight = 400) {
    return `${weight} ${size}px Georgia, 'Times New Roman', serif`;
  },

  // ------------------------------------------------------------- world-space
  worldPrompt(ctx, x, y, text) {
    ctx.save();
    ctx.font = this.font(10, 700);
    ctx.textAlign = 'center';
    const bob = Math.sin(performance.now() / 280) * 2;
    ctx.fillStyle = 'rgba(10,14,24,0.75)';
    const w = ctx.measureText(text).width + 20;
    ctx.fillRect(x - w / 2, y - 11 + bob, w, 15);
    ctx.strokeStyle = 'rgba(220,230,245,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - w / 2, y - 11 + bob, w, 15);
    ctx.fillStyle = '#e8eef8';
    ctx.fillText('▲ ' + text, x, y + bob);
    ctx.restore();
  },

  // -------------------------------------------------------------------- HUD
  drawHUD(ctx) {
    ctx.save();
    ctx.textAlign = 'left';
    const now = performance.now();

    // ---- Soul orb ------------------------------------------------------
    const ox = 50, oy = 50, r = 27;
    const frac = Player.soul / Player.soulMax;
    // vessel socket
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8;
    const socket = ctx.createRadialGradient(ox - 6, oy - 8, 4, ox, oy, r + 6);
    socket.addColorStop(0, '#1a2033');
    socket.addColorStop(1, '#080b14');
    ctx.fillStyle = socket;
    ctx.beginPath(); ctx.arc(ox, oy, r + 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // soul liquid
    if (frac > 0.01) {
      ctx.save();
      ctx.beginPath(); ctx.arc(ox, oy, r - 1, 0, Math.PI * 2); ctx.clip();
      const lvl = oy + r - frac * r * 2;
      const slosh = Math.sin(now / 400) * 2;
      const sg = ctx.createLinearGradient(0, lvl - 8, 0, oy + r);
      sg.addColorStop(0, '#ffffff');
      sg.addColorStop(1, '#b8d0f0');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.moveTo(ox - r, lvl + slosh);
      ctx.quadraticCurveTo(ox, lvl - slosh * 2, ox + r, lvl + slosh);
      ctx.lineTo(ox + r, oy + r); ctx.lineTo(ox - r, oy + r);
      ctx.closePath(); ctx.fill();
      // inner bloom + rising motes
      const bloom = ctx.createRadialGradient(ox, oy + 6, 2, ox, oy + 6, r);
      bloom.addColorStop(0, 'rgba(255,255,255,0.5)');
      bloom.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = bloom;
      ctx.fillRect(ox - r, lvl - 4, r * 2, oy + r - lvl + 4);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      for (let i = 0; i < 3; i++) {
        const my2 = oy + r - ((now / 900 + i * 0.4) % 1) * (frac * r * 2);
        ctx.beginPath(); ctx.arc(ox + Math.sin(now / 500 + i * 2) * 8, my2, 1.4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    // glass highlight
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath(); ctx.ellipse(ox - 8, oy - 11, 8, 5, -0.5, 0, Math.PI * 2); ctx.fill();
    // rune ring
    const canFocus = Player.soul >= CFG.focusCost;
    ctx.strokeStyle = canFocus ? '#cfe0ff' : '#6a7690';
    ctx.lineWidth = 2.5;
    if (canFocus) { ctx.shadowColor = 'rgba(180,210,255,0.7)'; ctx.shadowBlur = 8; }
    ctx.beginPath(); ctx.arc(ox, oy, r + 2, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    // little notches around the ring
    ctx.strokeStyle = 'rgba(180,196,224,0.5)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(ox + Math.cos(a) * (r + 4), oy + Math.sin(a) * (r + 4));
      ctx.lineTo(ox + Math.cos(a) * (r + 7), oy + Math.sin(a) * (r + 7));
      ctx.stroke();
    }

    // ---- Masks ---------------------------------------------------------
    const lowHP = Player.masks <= 1;
    for (let i = 0; i < Player.masksMax; i++) {
      const mx = 100 + i * 32, my = 36;
      ctx.save();
      ctx.translate(mx, my);
      const filled = i < Player.masks;
      // pulse the last mask when low
      if (filled && lowHP && i === Player.masks - 1) {
        const p = 0.5 + Math.sin(now / 180) * 0.5;
        ctx.shadowColor = `rgba(255,90,90,${0.5 + p * 0.5})`;
        ctx.shadowBlur = 10;
      }
      // mask body with vertical shading
      const mg = ctx.createLinearGradient(0, -13, 0, 12);
      if (filled) { mg.addColorStop(0, '#f8fafe'); mg.addColorStop(1, '#c4cee0'); }
      else { mg.addColorStop(0, 'rgba(38,44,64,0.85)'); mg.addColorStop(1, 'rgba(20,25,40,0.85)'); }
      ctx.fillStyle = mg;
      ctx.strokeStyle = filled ? '#ffffff' : '#3a4460';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-11, -7);
      ctx.quadraticCurveTo(0, -15, 11, -7);
      ctx.quadraticCurveTo(12, 5, 0, 13);
      ctx.quadraticCurveTo(-12, 5, -11, -7);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      // horn nubs
      ctx.strokeStyle = filled ? '#ffffff' : '#3a4460'; ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-7, -9); ctx.quadraticCurveTo(-12, -15, -13, -12);
      ctx.moveTo(7, -9); ctx.quadraticCurveTo(12, -15, 13, -12);
      ctx.stroke();
      // eyes
      ctx.fillStyle = filled ? '#1a2030' : 'rgba(90,100,120,0.5)';
      ctx.beginPath();
      ctx.ellipse(-3.6, -1, 1.8, 3.2, 0, 0, Math.PI * 2);
      ctx.ellipse(3.6, -1, 1.8, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ---- Geo -----------------------------------------------------------
    ctx.save();
    ctx.translate(102, 70);
    ctx.save();
    ctx.rotate(now / 3000);
    const geoG = ctx.createLinearGradient(-8, -8, 8, 8);
    geoG.addColorStop(0, '#f4efce');
    geoG.addColorStop(1, '#b8ac7c');
    ctx.fillStyle = geoG;
    ctx.strokeStyle = '#6a6448';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      i ? ctx.lineTo(Math.cos(a) * 8, Math.sin(a) * 8) : ctx.moveTo(Math.cos(a) * 8, Math.sin(a) * 8);
    }
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // facet line
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-4, -6); ctx.lineTo(0, 0); ctx.lineTo(4, -6); ctx.stroke();
    ctx.restore();
    ctx.font = this.font(21, 700);
    ctx.fillStyle = '#eef2fa';
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 3;
    ctx.fillText(String(Player.geo), 16, 7);
    ctx.restore();

    if (AudioSys.muted) {
      ctx.save();
      ctx.font = this.font(12, 700);
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(200,212,232,0.45)';
      ctx.fillText('MUTED (M)', VIEW_W - 12, 20);
      ctx.restore();
    }
  },

  drawBossBar(ctx, boss) {
    const w = 420, h = 10;
    const x = (VIEW_W - w) / 2, y = VIEW_H - 44;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = this.font(17, 700);
    ctx.fillStyle = boss.kind === 'imposter' ? '#d8dff0' : '#f0d8c8';
    ctx.fillText(boss.name, VIEW_W / 2, y - 8);
    ctx.fillStyle = 'rgba(12,10,14,0.8)';
    ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    ctx.strokeStyle = '#7a4438';
    ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);
    const frac = Math.max(0, boss.hp / boss.hpMax);
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#ff5a20');
    g.addColorStop(1, '#ffb050');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w * frac, h);
    ctx.restore();
  },

  // ---------------------------------------------------------------- screens
  fade(ctx, alpha, color = '#000000') {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.restore();
  },

  vignette(ctx, strength) {
    const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.34, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.85);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(2,4,10,${strength})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  },

  areaCard(ctx, name, sub, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f2f5fa';
    ctx.font = this.font(46, 700);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '6px';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 18;
    ctx.fillText(name.toUpperCase(), VIEW_W / 2, 150);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
    ctx.font = this.font(19);
    ctx.fillStyle = 'rgba(220,230,244,0.85)';
    ctx.fillText(sub, VIEW_W / 2, 184);
    // flourish
    ctx.strokeStyle = 'rgba(220,230,244,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(VIEW_W / 2 - 130, 205);
    ctx.lineTo(VIEW_W / 2 - 20, 205);
    ctx.moveTo(VIEW_W / 2 + 20, 205);
    ctx.lineTo(VIEW_W / 2 + 130, 205);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(VIEW_W / 2, 205, 4, 0, Math.PI * 2);
    ctx.stroke();
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.restore();
  },

  banner(ctx, title, desc, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    const y = VIEW_H - 120;
    ctx.fillStyle = 'rgba(10,14,24,0.82)';
    ctx.fillRect(VIEW_W / 2 - 280, y - 34, 560, 74);
    ctx.strokeStyle = 'rgba(200,214,236,0.5)';
    ctx.strokeRect(VIEW_W / 2 - 280, y - 34, 560, 74);
    ctx.fillStyle = '#f0f4fc';
    ctx.font = this.font(24, 700);
    ctx.fillText(title, VIEW_W / 2, y - 6);
    ctx.fillStyle = 'rgba(210,222,240,0.9)';
    ctx.font = this.font(15);
    ctx.fillText(desc, VIEW_W / 2, y + 22);
    ctx.restore();
  },

  drawDialog(ctx, lines, shown) {
    ctx.save();
    const w = 640, x = (VIEW_W - w) / 2;
    const h = 40 + lines.length * 26;
    const y = VIEW_H - h - 66;
    ctx.fillStyle = 'rgba(8,12,22,0.88)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(200,214,236,0.45)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
    ctx.textAlign = 'center';
    ctx.font = this.font(17);
    ctx.fillStyle = '#e6ecf6';
    let remaining = shown;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const take = Math.max(0, Math.min(line.length, remaining));
      remaining -= line.length;
      if (take > 0) ctx.fillText(line.slice(0, take), VIEW_W / 2, y + 34 + i * 26);
    }
    const total = lines.reduce((a, l) => a + l.length, 0);
    if (shown >= total) {
      ctx.font = this.font(12, 700);
      ctx.fillStyle = `rgba(190,205,228,${0.5 + Math.sin(performance.now() / 300) * 0.3})`;
      ctx.fillText('— press Z / Enter —', VIEW_W / 2, y + h - 12);
    }
    ctx.restore();
  },

  drawTitle(ctx, t, hasSave, sel) {
    // background
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, '#0b0f1c');
    g.addColorStop(1, '#1c2438');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // drifting motes
    ctx.save();
    for (let i = 0; i < 26; i++) {
      const sx = (i * 137 + t * (8 + (i % 5) * 3)) % (VIEW_W + 40) - 20;
      const sy = (i * 211) % VIEW_H;
      ctx.globalAlpha = 0.12 + (i % 3) * 0.08;
      ctx.fillStyle = '#cfe0ff';
      ctx.beginPath();
      ctx.arc(sx, sy + Math.sin(t + i) * 12, 1.6 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // distant spires (two layers)
    ctx.save();
    for (let layer = 0; layer < 2; layer++) {
      ctx.globalAlpha = 0.3 + layer * 0.28;
      ctx.fillStyle = layer === 0 ? '#0f1626' : '#161f34';
      const off = layer * 75;
      for (let i = 0; i < 8; i++) {
        const bx = i * 135 - 40 + off, bw = 80 + (i % 3) * 44, bh = 130 + ((i * 83 + layer * 40) % 180);
        // arched tower
        ctx.beginPath();
        ctx.moveTo(bx, VIEW_H);
        ctx.lineTo(bx, VIEW_H - bh);
        ctx.quadraticCurveTo(bx + bw / 2, VIEW_H - bh - bw * 0.5, bx + bw, VIEW_H - bh);
        ctx.lineTo(bx + bw, VIEW_H);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();

    // ground plane with the knight's spotlight
    ctx.save();
    const groundY = 500;
    const spot = ctx.createRadialGradient(VIEW_W / 2, groundY - 30, 10, VIEW_W / 2, groundY - 10, 200);
    spot.addColorStop(0, 'rgba(150,180,230,0.18)');
    spot.addColorStop(1, 'rgba(150,180,230,0)');
    ctx.fillStyle = spot;
    ctx.fillRect(VIEW_W / 2 - 200, groundY - 220, 400, 240);
    const gg = ctx.createLinearGradient(0, groundY, 0, VIEW_H);
    gg.addColorStop(0, '#10182a');
    gg.addColorStop(1, '#070b14');
    ctx.fillStyle = gg;
    ctx.fillRect(0, groundY, VIEW_W, VIEW_H - groundY);
    ctx.fillStyle = 'rgba(150,175,215,0.25)';
    ctx.fillRect(0, groundY, VIEW_W, 1.5);
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    // title
    ctx.font = this.font(84, 700);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '14px';
    ctx.fillStyle = '#f2f5fb';
    ctx.shadowColor = 'rgba(140,170,230,0.5)';
    ctx.shadowBlur = 26;
    ctx.fillText(CONTENT.title, VIEW_W / 2, 190);
    ctx.shadowBlur = 0;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
    ctx.font = this.font(22);
    ctx.fillStyle = 'rgba(205,218,238,0.9)';
    ctx.fillText(CONTENT.subtitle, VIEW_W / 2, 228);
    ctx.font = this.font(14);
    ctx.fillStyle = 'rgba(170,185,210,0.65)';
    ctx.fillText(CONTENT.tagline, VIEW_W / 2, 258);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

    // menu
    const items = hasSave ? ['CONTINUE', 'NEW GAME'] : ['NEW GAME'];
    ctx.font = this.font(24, 700);
    items.forEach((it, i) => {
      const y = 350 + i * 46;
      const active = i === sel;
      ctx.fillStyle = active ? '#ffffff' : 'rgba(180,195,220,0.55)';
      ctx.fillText(it, VIEW_W / 2, y);
      if (active) {
        const wob = Math.sin(t * 4) * 3;
        ctx.fillText('❖', VIEW_W / 2 - 110 - wob, y);
        ctx.fillText('❖', VIEW_W / 2 + 110 + wob, y);
      }
    });

    ctx.font = this.font(14);
    ctx.fillStyle = 'rgba(160,175,200,0.6)';
    ctx.fillText('Z jump · X strike · C dash · V focus/cast · arrows move · M mute', VIEW_W / 2, VIEW_H - 46);
    ctx.fillStyle = 'rgba(140,155,180,0.4)';
    ctx.fillText('made for ' + CONTENT.playerName, VIEW_W / 2, VIEW_H - 22);
    ctx.restore();

    // the little knight, waiting in the spotlight
    ctx.save();
    ctx.translate(VIEW_W / 2, 500);
    const bob = Math.sin(t * 2.2) * 2;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 15, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // legs
    ctx.strokeStyle = '#1d2338';
    ctx.lineWidth = 4.2; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-4, -13); ctx.lineTo(-5, 0);
    ctx.moveTo(4, -13); ctx.lineTo(5, 0);
    ctx.stroke();
    // cloak with gradient + hem
    const cg = ctx.createLinearGradient(0, -35 - bob, 0, -5);
    cg.addColorStop(0, '#323d63');
    cg.addColorStop(1, '#1b2138');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(-11, -5);
    ctx.quadraticCurveTo(-14, -30 - bob, -8, -33 - bob);
    ctx.quadraticCurveTo(0, -38 - bob, 8, -33 - bob);
    ctx.quadraticCurveTo(14, -30 - bob, 11, -5);
    ctx.quadraticCurveTo(6, -8, 3, -5);
    ctx.quadraticCurveTo(0, -8, -3, -5);
    ctx.quadraticCurveTo(-6, -8, -11, -5);
    ctx.closePath();
    ctx.fill();
    // head with glow
    ctx.shadowColor = 'rgba(200,220,255,0.6)'; ctx.shadowBlur = 16;
    const hg = ctx.createLinearGradient(0, -48 - bob, 0, -28 - bob);
    hg.addColorStop(0, '#f6f8fc');
    hg.addColorStop(1, '#d3dae8');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.ellipse(0, -38 - bob, 11, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // filled horns
    ctx.fillStyle = hg;
    for (const side of [-1, 1]) {
      const bx = side * 6;
      ctx.beginPath();
      ctx.moveTo(bx, -43 - bob);
      ctx.quadraticCurveTo(bx + side * 8, -52 - bob, bx + side * 15, -53.5 - bob);
      ctx.quadraticCurveTo(bx + side * 17.5, -53.8 - bob, bx + side * 16, -50.5 - bob);
      ctx.quadraticCurveTo(bx + side * 10, -46.5 - bob, bx + side * 3.5, -40 - bob);
      ctx.closePath();
      ctx.fill();
    }
    // eyes
    ctx.fillStyle = '#0d1120';
    ctx.beginPath();
    ctx.ellipse(-3.4, -37 - bob, 2.2, 3.8, 0, 0, Math.PI * 2);
    ctx.ellipse(3.8, -37 - bob, 2.2, 3.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // vignette
    const vg = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.4, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.9);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(2,4,10,0.6)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  },

  drawPause(ctx, sel) {
    this.fade(ctx, 0.78, '#060910');
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = this.font(34, 700);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '8px';
    ctx.fillStyle = '#f0f4fc';
    ctx.fillText('PAUSED', VIEW_W / 2, 62);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

    // ---- left column: trinkets (selectable) --------------------------------
    const lx = 250;
    ctx.font = this.font(16, 700);
    ctx.fillStyle = 'rgba(200,214,236,0.9)';
    ctx.fillText('— TRINKETS —', lx, 108);
    // notch cord
    const used = Player.notchesUsed();
    for (let i = 0; i < CONTENT.notches; i++) {
      ctx.beginPath();
      ctx.arc(lx - 30 + i * 30, 130, 7, 0, Math.PI * 2);
      ctx.fillStyle = i < used ? '#e8eef8' : 'rgba(40,48,68,0.9)';
      ctx.fill();
      ctx.strokeStyle = '#8a9ab8';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.font = this.font(12);
    ctx.fillStyle = 'rgba(170,185,210,0.7)';
    ctx.fillText('notches', lx + 78, 134);

    const owned = Object.keys(CONTENT.charms).filter(c => Player.charms.has(c));
    ctx.font = this.font(15);
    let y = 168;
    if (!owned.length) {
      ctx.fillStyle = 'rgba(120,132,156,0.5)';
      ctx.fillText('· no trinkets found yet ·', lx, y);
      y += 26;
    }
    owned.forEach((key, i) => {
      const meta = CONTENT.charms[key];
      const eq = Player.equipped.has(key);
      const isSel = i === sel;
      if (isSel) {
        ctx.fillStyle = 'rgba(200,214,236,0.12)';
        ctx.fillRect(lx - 190, y - 30, 380, 40);
      }
      ctx.font = this.font(15, eq ? 700 : 400);
      ctx.fillStyle = eq ? '#ffffff' : 'rgba(200,212,232,0.75)';
      ctx.fillText(`${eq ? '◆ ' : '◇ '}${meta.name}  ·  ${meta.cost}◆${key === 'veil' && eq ? (Player.veilCharge ? '  (ready)' : '  (spent)') : ''}`, lx, y - 12);
      ctx.font = this.font(12);
      ctx.fillStyle = 'rgba(165,178,202,0.75)';
      ctx.fillText(meta.desc, lx, y + 5);
      y += 44;
    });
    // locked slots hint
    const missing = Object.keys(CONTENT.charms).length - owned.length;
    if (missing > 0) {
      ctx.font = this.font(12);
      ctx.fillStyle = 'rgba(120,132,156,0.5)';
      ctx.fillText(`${missing} trinket${missing > 1 ? 's' : ''} still hidden in the kingdom`, lx, y - 6);
    }

    // ---- right column: relics & record -------------------------------------
    const rx = 706;
    ctx.font = this.font(16, 700);
    ctx.fillStyle = 'rgba(200,214,236,0.9)';
    ctx.fillText('— RELICS —', rx, 108);
    ctx.font = this.font(14);
    let ry = 134;
    for (const key of ['dash', 'claw', 'wings', 'spell']) {
      const meta = CONTENT.abilities[key];
      const has = Player.abilities[key];
      ctx.fillStyle = has ? '#e8eef8' : 'rgba(120,132,156,0.5)';
      ctx.fillText(has ? meta.name : '· not yet found ·', rx, ry);
      ry += 22;
    }
    ry += 8;
    ctx.font = this.font(16, 700);
    ctx.fillStyle = 'rgba(200,214,236,0.9)';
    ctx.fillText('— RECORD —', rx, ry);
    ry += 24;
    ctx.font = this.font(14);
    ctx.fillStyle = '#cfd9ea';
    const mm = Math.floor(Game.playT / 60), ss = Math.floor(Game.playT % 60);
    const shards = Game.flags.shards || 0;
    ctx.fillText(`time ${mm}:${String(ss).padStart(2, '0')}   deaths ${Game.deaths}`, rx, ry);
    ctx.fillText(`geo ${Player.geo}   masks ${Player.masksMax}   soul ${Player.soulMax}`, rx, ry + 22);
    ctx.fillText(`mask shards ${shards % 2}/2 toward the next mask`, rx, ry + 44);

    // ---- the map -------------------------------------------------------------
    this.drawMap(ctx, VIEW_W / 2, 392);

    ctx.font = this.font(13);
    ctx.fillStyle = 'rgba(180,195,220,0.7)';
    ctx.fillText('←→ move · Z jump · X strike (↑/↓ aim) · C dash · tap V cast · hold V focus · ↑ talk/rest', VIEW_W / 2, VIEW_H - 52);
    ctx.font = this.font(15, 700);
    ctx.fillStyle = 'rgba(230,238,250,0.9)';
    ctx.fillText('↑↓ select · ENTER wear/remove · ESC resume · Q quit to title', VIEW_W / 2, VIEW_H - 26);
    ctx.restore();
  },

  // A humble cartographer's rendering of the kingdom.
  drawMap(ctx, centerX, centerY) {
    const CELL_W = 42, CELL_H = 26, GAP = 8;
    let minC = 99, maxC = -99, minR = 99, maxR = -99;
    for (const id in MAP_LAYOUT) {
      const [c, r, cw, ch] = MAP_LAYOUT[id];
      minC = Math.min(minC, c); maxC = Math.max(maxC, c + cw);
      minR = Math.min(minR, r); maxR = Math.max(maxR, r + ch);
    }
    const w = (maxC - minC) * (CELL_W + GAP);
    const h = (maxR - minR) * (CELL_H + GAP);
    const ox = centerX - w / 2, oy = centerY - h / 2;
    const cellRect = (id) => {
      const [c, r, cw, ch] = MAP_LAYOUT[id];
      return {
        x: ox + (c - minC) * (CELL_W + GAP),
        y: oy + (r - minR) * (CELL_H + GAP),
        w: cw * CELL_W + (cw - 1) * GAP,
        h: ch * CELL_H + (ch - 1) * GAP,
      };
    };
    ctx.save();
    ctx.font = this.font(14, 700);
    ctx.fillStyle = 'rgba(200,214,236,0.9)';
    ctx.fillText('— THE KINGDOM —', centerX, oy - 14);

    const visited = Game.flags.visited || [];
    // connections between visited neighbors
    ctx.strokeStyle = 'rgba(150,168,198,0.4)';
    ctx.lineWidth = 2;
    for (const id of visited) {
      const def = ROOMS[id];
      if (!def || !MAP_LAYOUT[id]) continue;
      for (const ex of def.exits || []) {
        if (!visited.includes(ex.to) || !MAP_LAYOUT[ex.to]) continue;
        const a = cellRect(id), b = cellRect(ex.to);
        ctx.beginPath();
        ctx.moveTo(a.x + a.w / 2, a.y + a.h / 2);
        ctx.lineTo(b.x + b.w / 2, b.y + b.h / 2);
        ctx.stroke();
      }
    }
    for (const id in MAP_LAYOUT) {
      const r = cellRect(id);
      const seen = visited.includes(id);
      if (!seen) {
        ctx.strokeStyle = 'rgba(70,80,105,0.25)';
        ctx.lineWidth = 1;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        continue;
      }
      const area = ROOMS[id].area;
      const pal = CONTENT.areas[area].palette;
      ctx.fillStyle = pal.mid;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = pal.edge;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      // bench pip
      if (ROOMS[id].bench) {
        ctx.fillStyle = '#e8e4c8';
        ctx.beginPath();
        ctx.arc(r.x + r.w - 8, r.y + 8, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      // you are here
      if (World.roomId === id) {
        const pulse = 0.5 + Math.sin(performance.now() / 200) * 0.4;
        ctx.strokeStyle = `rgba(255,255,255,${pulse})`;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(r.x + r.w / 2, r.y + r.h / 2, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  },

  // The Recruiter's wares.
  drawShop(ctx, sel) {
    this.fade(ctx, 0.6, '#0a0806');
    const w = 620, x = (VIEW_W - w) / 2, y = 92;
    const stock = Game.shopStock();
    const h = 150 + Math.max(stock.length, 1) * 64;
    ctx.save();
    ctx.fillStyle = 'rgba(16,12,8,0.94)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(216,200,144,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 5, y + 5, w - 10, h - 10);
    ctx.textAlign = 'center';
    ctx.font = this.font(26, 700);
    ctx.fillStyle = '#e8d8a8';
    ctx.fillText(CONTENT.shopName.toUpperCase(), VIEW_W / 2, y + 44);
    ctx.font = this.font(13);
    ctx.fillStyle = 'rgba(216,204,168,0.8)';
    ctx.fillText('"Invest in yourself. Terms and conditions apply."', VIEW_W / 2, y + 68);

    // your geo
    ctx.font = this.font(16, 700);
    ctx.fillStyle = '#e8e4c8';
    ctx.fillText(`your geo: ${Player.geo}`, VIEW_W / 2, y + 96);

    let iy = y + 132;
    if (!stock.length) {
      ctx.font = this.font(16);
      ctx.fillStyle = 'rgba(216,204,168,0.85)';
      ctx.fillText('"Sold out! A pleasure doing business, candidate."', VIEW_W / 2, iy + 8);
    }
    stock.forEach((it, i) => {
      const isSel = i === sel;
      if (isSel) {
        ctx.fillStyle = 'rgba(216,200,144,0.12)';
        ctx.fillRect(x + 24, iy - 22, w - 48, 56);
      }
      const afford = Player.geo >= it.price;
      ctx.font = this.font(17, 700);
      ctx.fillStyle = afford ? '#f0e8d0' : 'rgba(150,138,110,0.7)';
      ctx.fillText(`${it.name}   —   ${it.price} geo`, VIEW_W / 2, iy);
      ctx.font = this.font(13);
      ctx.fillStyle = afford ? 'rgba(216,204,168,0.85)' : 'rgba(140,130,105,0.6)';
      ctx.fillText(it.desc, VIEW_W / 2, iy + 20);
      iy += 64;
    });

    ctx.font = this.font(13, 700);
    ctx.fillStyle = 'rgba(216,204,168,0.7)';
    ctx.fillText('↑↓ browse · ENTER buy · ESC leave', VIEW_W / 2, y + h - 20);
    ctx.restore();
  },

  drawDeath(ctx, t, quote) {
    const a = Math.min(1, t / 0.8);
    this.fade(ctx, a * 0.9, '#04060c');
    if (t > 0.5) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, (t - 0.5) / 0.6);
      ctx.textAlign = 'center';
      ctx.font = this.font(44, 700);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '10px';
      ctx.fillStyle = '#d8e2f2';
      ctx.fillText('YOU DIED', VIEW_W / 2, VIEW_H / 2 - 20);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      ctx.font = this.font(16);
      ctx.fillStyle = 'rgba(190,204,226,0.8)';
      ctx.fillText(quote, VIEW_W / 2, VIEW_H / 2 + 22);
      ctx.font = this.font(13);
      ctx.fillStyle = 'rgba(160,175,200,0.6)';
      ctx.fillText('your geo waits where you fell', VIEW_W / 2, VIEW_H / 2 + 52);
      ctx.restore();
    }
  },

  drawEnding(ctx, t, stats) {
    this.fade(ctx, Math.min(1, t / 1.2), '#f4f6fa');
    if (t < 0.8) return;
    ctx.save();
    ctx.textAlign = 'center';
    const lines = CONTENT.ending;
    ctx.font = this.font(20);
    lines.forEach((line, i) => {
      const la = Math.min(1, Math.max(0, (t - 1.0 - i * 0.55) / 0.7));
      if (la <= 0) return;
      ctx.globalAlpha = la;
      ctx.fillStyle = i >= lines.length - 2 ? '#3a2c18' : '#2c3548';
      ctx.font = i >= lines.length - 2 ? this.font(24, 700) : this.font(19);
      ctx.fillText(line, VIEW_W / 2, 130 + i * 36);
    });
    const statsA = Math.min(1, Math.max(0, (t - 1.0 - lines.length * 0.55) / 0.8));
    if (statsA > 0) {
      ctx.globalAlpha = statsA;
      ctx.fillStyle = '#5a6478';
      ctx.font = this.font(15);
      const mm = Math.floor(stats.playT / 60), ss = Math.floor(stats.playT % 60);
      ctx.fillText(`time ${mm}:${String(ss).padStart(2, '0')}   ·   deaths ${stats.deaths}   ·   geo ${stats.geo}`, VIEW_W / 2, VIEW_H - 96);
      ctx.font = this.font(16, 700);
      ctx.fillStyle = '#3a4458';
      ctx.fillText(`Thank you for playing, ${CONTENT.playerName}.`, VIEW_W / 2, VIEW_H - 64);
      ctx.font = this.font(13);
      ctx.fillStyle = `rgba(90,100,120,${0.5 + Math.sin(performance.now() / 300) * 0.3})`;
      ctx.fillText('— press Enter —', VIEW_W / 2, VIEW_H - 36);
    }
    ctx.restore();
  },
};
