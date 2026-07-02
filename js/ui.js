// WORKSONG — HUD and screens. Serif everything; Hallownest is a serif kingdom.

const UI = {
  font(size, weight = 400) {
    return `${weight} ${size}px Georgia, 'Times New Roman', serif`;
  },

  // ------------------------------------------------------------- world-space
  worldPrompt(ctx, x, y, text) {
    ctx.save();
    ctx.font = this.font(13, 700);
    ctx.textAlign = 'center';
    const bob = Math.sin(performance.now() / 280) * 2;
    ctx.fillStyle = 'rgba(10,14,24,0.75)';
    const w = ctx.measureText(text).width + 26;
    ctx.fillRect(x - w / 2, y - 14 + bob, w, 20);
    ctx.strokeStyle = 'rgba(220,230,245,0.5)';
    ctx.strokeRect(x - w / 2, y - 14 + bob, w, 20);
    ctx.fillStyle = '#e8eef8';
    ctx.fillText('▲ ' + text, x, y + bob);
    ctx.restore();
  },

  // -------------------------------------------------------------------- HUD
  drawHUD(ctx) {
    ctx.save();
    ctx.textAlign = 'left';

    // Soul orb
    const ox = 46, oy = 46, r = 26;
    ctx.fillStyle = 'rgba(12,16,28,0.72)';
    ctx.beginPath();
    ctx.arc(ox, oy, r + 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#a8b8d0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ox, oy, r + 2, 0, Math.PI * 2);
    ctx.stroke();
    const frac = Player.soul / CFG.soulMax;
    if (frac > 0.01) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(ox, oy, r - 1, 0, Math.PI * 2);
      ctx.clip();
      const lvl = oy + r - frac * r * 2;
      const slosh = Math.sin(performance.now() / 400) * 2;
      ctx.fillStyle = '#eef4ff';
      ctx.beginPath();
      ctx.moveTo(ox - r, lvl + slosh);
      ctx.quadraticCurveTo(ox, lvl - slosh * 2, ox + r, lvl + slosh);
      ctx.lineTo(ox + r, oy + r);
      ctx.lineTo(ox - r, oy + r);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Masks
    for (let i = 0; i < Player.masksMax; i++) {
      const mx = 92 + i * 30, my = 34;
      ctx.save();
      ctx.translate(mx, my);
      const filled = i < Player.masks;
      ctx.fillStyle = filled ? '#eef1f8' : 'rgba(30,36,54,0.85)';
      ctx.strokeStyle = filled ? '#ffffff' : '#4a5470';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10, -8);
      ctx.quadraticCurveTo(0, -14, 10, -8);
      ctx.quadraticCurveTo(11, 4, 0, 12);
      ctx.quadraticCurveTo(-11, 4, -10, -8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (filled) {
        ctx.fillStyle = '#1a2030';
        ctx.beginPath();
        ctx.ellipse(-3.5, 0, 1.8, 3.2, 0, 0, Math.PI * 2);
        ctx.ellipse(3.5, 0, 1.8, 3.2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Geo
    ctx.translate(94, 62);
    ctx.fillStyle = '#e8e4c8';
    ctx.strokeStyle = '#8a8464';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      i ? ctx.lineTo(Math.cos(a) * 8, Math.sin(a) * 8) : ctx.moveTo(Math.cos(a) * 8, Math.sin(a) * 8);
    }
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.font = this.font(20, 700);
    ctx.fillStyle = '#e8eef8';
    ctx.fillText(String(Player.geo), 18, 7);
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
    ctx.fillStyle = '#f0d8c8';
    ctx.fillText(CONTENT.enemyNames.boss, VIEW_W / 2, y - 8);
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

    // distant spires
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#141b2e';
    for (let i = 0; i < 7; i++) {
      const bx = i * 150 - 40, bw = 90 + (i % 3) * 40, bh = 150 + ((i * 83) % 160);
      ctx.beginPath();
      ctx.moveTo(bx, VIEW_H);
      ctx.lineTo(bx + bw / 2, VIEW_H - bh);
      ctx.lineTo(bx + bw, VIEW_H);
      ctx.closePath();
      ctx.fill();
    }
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

    // the little knight, waiting
    ctx.save();
    ctx.translate(VIEW_W / 2, 470);
    const bob = Math.sin(t * 2.2) * 2;
    ctx.strokeStyle = '#252c42';
    ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-4, -12); ctx.lineTo(-5, 0);
    ctx.moveTo(4, -12); ctx.lineTo(5, 0);
    ctx.stroke();
    ctx.fillStyle = '#2a3350';
    ctx.beginPath();
    ctx.moveTo(-10, -6);
    ctx.quadraticCurveTo(-13, -30 - bob, -7, -32 - bob);
    ctx.quadraticCurveTo(0, -36 - bob, 7, -32 - bob);
    ctx.quadraticCurveTo(13, -30 - bob, 10, -6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#eef1f8';
    ctx.beginPath();
    ctx.ellipse(0, -38 - bob, 10.5, 9.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#eef1f8';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(-6, -44 - bob); ctx.quadraticCurveTo(-14, -54 - bob, -17, -50 - bob);
    ctx.moveTo(6, -44 - bob); ctx.quadraticCurveTo(14, -54 - bob, 17, -50 - bob);
    ctx.stroke();
    ctx.fillStyle = '#10141f';
    ctx.beginPath();
    ctx.ellipse(-3.5, -37 - bob, 2.2, 3.6, 0, 0, Math.PI * 2);
    ctx.ellipse(4.5, -37 - bob, 2.2, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  drawPause(ctx) {
    this.fade(ctx, 0.72, '#060910');
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = this.font(40, 700);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '8px';
    ctx.fillStyle = '#f0f4fc';
    ctx.fillText('PAUSED', VIEW_W / 2, 92);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

    ctx.font = this.font(17, 700);
    ctx.fillStyle = 'rgba(200,214,236,0.9)';
    ctx.fillText('— RELICS —', VIEW_W / 2, 150);
    ctx.font = this.font(15);
    let y = 178;
    const ab = Player.abilities;
    for (const key of ['dash', 'claw', 'wings', 'spell']) {
      const meta = CONTENT.abilities[key];
      ctx.fillStyle = ab[key] ? '#e8eef8' : 'rgba(120,132,156,0.5)';
      ctx.fillText(ab[key] ? `${meta.name} — ${meta.desc}` : '· not yet found ·', VIEW_W / 2, y);
      y += 24;
    }

    ctx.font = this.font(17, 700);
    ctx.fillStyle = 'rgba(200,214,236,0.9)';
    ctx.fillText('— TRINKETS —', VIEW_W / 2, y + 22);
    ctx.font = this.font(15);
    y += 50;
    for (const key of ['coffee', 'focus', 'duck']) {
      const meta = CONTENT.charms[key];
      const has = Player.charms.has(key);
      ctx.fillStyle = has ? '#e8eef8' : 'rgba(120,132,156,0.5)';
      ctx.fillText(has ? `${meta.name} — ${meta.desc}` : '· not yet found ·', VIEW_W / 2, y);
      y += 24;
    }

    ctx.font = this.font(15);
    ctx.fillStyle = 'rgba(180,195,220,0.75)';
    ctx.fillText('move ←→ · jump Z · strike X (↑/↓ to aim) · dash C · tap V cast · hold V focus', VIEW_W / 2, VIEW_H - 108);
    ctx.fillText('sit at benches to rest and save · M mute', VIEW_W / 2, VIEW_H - 84);
    ctx.font = this.font(16, 700);
    ctx.fillStyle = 'rgba(230,238,250,0.9)';
    ctx.fillText('ESC resume · ENTER quit to title', VIEW_W / 2, VIEW_H - 44);
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
