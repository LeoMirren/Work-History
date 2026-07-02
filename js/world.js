// WORKSONG — the kingdom itself. Rooms are authored as ASCII tilemaps.
//
// Legend:
//   #  solid rock          %  solid rock (worked/bright variant)
//   =  one-way platform    ^  spikes
//   B  bench               T  lore tablet (ids assigned in scan order)
//   E  crawler   F  flyer   S  spitter   H  heavy
//   A  ability pickup (room def says which)
//   Q  charm pickup (room def says which)
//   G  geo deposit         W  ending portal
//   M  mask shard          N  the Mentor (NPC)
//   P  player start        |  pillar decor   *  lamp decor
//
// Exits: {side, min, max, to, px, py} — min/max are the tile range along that
// edge through which the player may leave; px/py the arrival tile in the
// target room.

const ROOMS = {
  // ------------------------------------------------------------- THE FOYER
  foyer1: {
    area: 'foyer',
    tablets: ['welcome'],
    map: [
      '########################################',
      '#                                      #',
      '#                                      #',
      '#     *            *            *      #',
      '#  |       |          |         |      #',
      '#                                      #',
      '#                                      #',
      '#                                      #',
      '#                              M       #',
      '#                            =====     #',
      '#                                      #',
      '#                                       ',
      '#                                       ',
      '#   P              T        %%          ',
      '########################################',
      '########################################',
      '########################################',
    ],
    exits: [{ side: 'right', min: 10, max: 13, to: 'foyer2', px: 1.5, py: 13 }],
  },

  foyer2: {
    area: 'foyer',
    tablets: ['foyer_door'],
    bench: 'foyer2',
    map: [
      '##############################################',
      '#                                            #',
      '#                                            #',
      '#       *              *              *      #',
      '#   |         |             |           |    #',
      '#                                            #',
      '#                                            #',
      '#                                            #',
      '#               ====                         #',
      '#                                            #',
      '#       ====             ====                #',
      '                                              ',
      '                                              ',
      '   E      G  %%     E     T    B      N     G ',
      '##############################################',
      '##############################################',
      '##############################################',
    ],
    exits: [
      { side: 'left', min: 10, max: 13, to: 'foyer1', px: 37.5, py: 13 },
      { side: 'right', min: 10, max: 13, to: 'arch1', px: 2, py: 3 },
    ],
  },

  // ---------------------------------------------------------- THE ARCHIVES
  arch1: {
    area: 'archives',
    map: [
      '##############################',
      '#                            #',
      '                             #',
      '                             #',
      '#####                        #',
      '#      ==                    #',
      '#                 F          #',
      '#           ====             #',
      '#                            #',
      '#                     ====   #',
      '#      ====                  #',
      '#                            #',
      '#            ====            #',
      '#                            #',
      '#    ====          F         #',
      '#                            #',
      '#              ====          #',
      '#                            #',
      '#     ====                   #',
      '#                            #',
      '#            ====            #',
      '#                            #',
      '#                   ====     #',
      '#         ====               #',
      '#                            #',
      '#    ====                    #',
      '#                            #',
      '#          ====              #',
      '#                 ====       #',
      '#                            #',
      '#                            #',
      '#                            #',
      '#  G        ====             #',
      '#                            #',
      '####    ######################',
    ],
    exits: [
      { side: 'left', min: 1, max: 4, to: 'foyer2', px: 43, py: 13 },
      { side: 'bottom', min: 4, max: 7, to: 'arch2', px: 5.5, py: 1 },
    ],
  },

  arch2: {
    area: 'archives',
    tablets: ['archives_enter', 'archives_depth'],
    map: [
      '####    ##########################################',
      '#                                                #',
      '#                                                #',
      '#    ==      *               *              *    #',
      '#  |              |               |          |   #',
      '#      ==                                        #',
      '#   ==                                           #',
      '#                    F                           #',
      '#        ====                 ====               #',
      '#                                                #',
      '#             ====                    ====       #',
      '                                                  ',
      '                                                  ',
      '    E        T       %%        E        T     G   ',
      '##################################################',
      '##################################################',
      '##################################################',
    ],
    exits: [
      { side: 'top', min: 4, max: 7, to: 'arch1', px: 2, py: 31 },
      { side: 'left', min: 10, max: 13, to: 'archQ', px: 21, py: 13 },
      { side: 'right', min: 10, max: 13, to: 'arch3', px: 1.5, py: 13 },
    ],
  },

  archQ: {
    area: 'archives',
    charm: 'coffee',
    map: [
      '########################',
      '#                      #',
      '#                      #',
      '#   *                  #',
      '#                      #',
      '#                      #',
      '#                      #',
      '#                      #',
      '#                      #',
      '#                      #',
      '#                      #',
      '#                       ',
      '#  Q   H                ',
      '#     %%   ^^  %%  ^^   ',
      '########################',
      '########################',
      '########################',
    ],
    exits: [{ side: 'right', min: 10, max: 13, to: 'arch2', px: 1.5, py: 13 }],
  },

  arch3: {
    area: 'archives',
    ability: 'dash',
    tablets: ['cloak'],
    map: [
      '##########################################',
      '#                                        #',
      '#                                        #',
      '#      *          *                      #',
      '#   |                   |                #',
      '#                                        #',
      '#                                        #',
      '#                                        #',
      '#                                        #',
      '#                                        #',
      '#                                        #',
      '#                                         ',
      '#            A                            ',
      '#     T     %%%                           ',
      '######################        ############',
      '######################^^^^^^^^############',
      '##########################################',
    ],
    exits: [
      { side: 'left', min: 10, max: 13, to: 'arch2', px: 48, py: 13 },
      { side: 'right', min: 10, max: 13, to: 'fnd1', px: 1.5, py: 13 },
    ],
  },

  // ----------------------------------------------------------- THE FOUNDRY
  fnd1: {
    area: 'foundry',
    bench: 'foundry1',
    map: [
      '####################################################',
      '#                                                  #',
      '#                                                  #',
      '#    *        *          *          *         *    #',
      '#  |      |         |          |         |         #',
      '#                                                  #',
      '#                                                  #',
      '#            ==                    ==              #',
      '#     S                       S                    #',
      '#    ###                     ###                   #',
      '#                                                  #',
      '                                                    ',
      '                                                    ',
      '    G      ^^        B    R     ^^        E    G    ',
      '####################################################',
      '####################################################',
      '####################################################',
    ],
    exits: [
      { side: 'left', min: 10, max: 13, to: 'arch3', px: 39.5, py: 13 },
      { side: 'right', min: 10, max: 13, to: 'fnd2', px: 1.5, py: 18 },
    ],
  },

  fnd2: {
    area: 'foundry',
    ability: 'spell',
    tablets: ['spell'],
    map: [
      '############################################',
      '#                                          #',
      '#                                          #',
      '#      *            *             *        #',
      '#                                          #',
      '#                A                         #',
      '#               ###                        #',
      '#                                          #',
      '#                                          #',
      '#         ====                             #',
      '#                       ====               #',
      '#                                          #',
      '#     ====                                 #',
      '#                                          #',
      '#                              ====        #',
      '#   ====                                   #',
      '                                            ',
      '                                            ',
      '      T             H              S        ',
      '############################################',
      '############################################',
      '############################################',
    ],
    exits: [
      { side: 'left', min: 15, max: 18, to: 'fnd1', px: 49.5, py: 13 },
      { side: 'right', min: 15, max: 18, to: 'fnd3', px: 1.5, py: 34 },
    ],
  },

  fnd3: {
    area: 'foundry',
    ability: 'claw',
    tablets: ['claw'],
    map: [
      '##########################',
      '#                        #',
      '#                        #',
      '#                        #',
      '#                         ',
      '#                         ',
      '#                         ',
      '#                    #####',
      '#                        #',
      '#####                    #',
      '#                        #',
      '#                        #',
      '#                    #####',
      '#                        #',
      '#####                    #',
      '#                        #',
      '#                        #',
      '#                    #####',
      '#                        #',
      '#####                    #',
      '#                        #',
      '#                        #',
      '#                    #####',
      '#                        #',
      '#####                    #',
      '#                        #',
      '#                        #',
      '#                    #####',
      '#                        #',
      '#####                    #',
      '#                        #',
      '#                        #',
      '#                        #',
      '                         #',
      '                         #',
      '     T      A            #',
      '           %%%           #',
      '##########################',
      '##########################',
      '##########################',
      '##########################',
    ],
    exits: [
      { side: 'left', min: 31, max: 35, to: 'fnd2', px: 41, py: 18 },
      { side: 'right', min: 3, max: 6, to: 'stk1', px: 1.5, py: 13 },
    ],
  },

  // ------------------------------------------------------- THE DEEP STACKS
  stk1: {
    area: 'stacks',
    tablets: ['stacks_enter'],
    map: [
      '##############################################',
      '#                                            #',
      '#                                            #',
      '#        *                    *              #',
      '#   |          |         |          |   M    #',
      '#                                      ###   #',
      '#              F                             #',
      '#                                            #',
      '#         ====        ====                   #',
      '#                              F             #',
      '#                                            #',
      '                                              ',
      '                                              ',
      '     T         ^^   H              ^^         ',
      '########################   ###################',
      '########################   ###################',
      '########################   ###################',
    ],
    exits: [
      { side: 'left', min: 10, max: 13, to: 'fnd3', px: 22, py: 5 },
      { side: 'right', min: 10, max: 13, to: 'stk2', px: 1.5, py: 18 },
      { side: 'bottom', min: 24, max: 26, to: 'prv1', px: 19.5, py: 2 },
    ],
  },

  // The Proving Floor — optional duel with THE IMPOSTER.
  prv1: {
    area: 'stacks',
    boss: 'imposter',
    charm: 'veil',
    tablets: ['proving'],
    map: [
      '##################    ##################',
      '#                                      #',
      '#                                      #',
      '#      *           ====     *          #',
      '#                                      #',
      '#                  ====                #',
      '#                                      #',
      '#                       ====           #',
      '#                                      #',
      '#               ====                   #',
      '#                                      #',
      '#       ====                           #',
      '#                                      #',
      '#    T                            Q    #',
      '########################################',
      '########################################',
      '########################################',
    ],
    exits: [{ side: 'top', min: 18, max: 21, to: 'stk1', px: 29, py: 12 }],
  },

  stk2: {
    area: 'stacks',
    bench: 'stacks2',
    charm: 'duck',
    map: [
      '######################################',
      '#                                    #',
      '#                                    #',
      '#        *              *            #',
      '#                                    #',
      '#            Q                       #',
      '#           ###                      #',
      '#                                    #',
      '#                                    #',
      '#       ====                         #',
      '#                 ====               #',
      '#                                    #',
      '#    ====                            #',
      '#                                    #',
      '#                          ====      #',
      '#       ====                         #',
      '                                      ',
      '                                      ',
      '        B            F        E       ',
      '######################################',
      '######################################',
      '######################################',
    ],
    exits: [
      { side: 'left', min: 15, max: 18, to: 'stk1', px: 43.5, py: 13 },
      { side: 'right', min: 15, max: 18, to: 'stk3', px: 1.5, py: 13 },
    ],
  },

  stk3: {
    area: 'stacks',
    ability: 'wings',
    arena: true,
    tablets: ['stacks_arena'],
    map: [
      '##########################################',
      '#                                        #',
      '#                                        #',
      '#     *          *            *          #',
      '#                                        #',
      '#                                         ',
      '#                                         ',
      '#                                 ########',
      '#                                        #',
      '#                                        #',
      '#                                        #',
      '                                         #',
      '                   ====                  #',
      '     T          A          ^^^^^^^^^^^^^^#',
      '##########################################',
      '##########################################',
      '##########################################',
    ],
    exits: [
      { side: 'left', min: 10, max: 13, to: 'stk2', px: 35.5, py: 18 },
      { side: 'right', min: 4, max: 7, to: 'gate1', px: 1.5, py: 13 },
    ],
  },

  // -------------------------------------------------------- THE OVERCLOCK
  gate1: {
    area: 'overclock',
    bench: 'gate',
    charm: 'focus',
    tablets: ['overclock_gate'],
    map: [
      '########################################',
      '#                                      #',
      '#                                      #',
      '#                                      #',
      '#                                      #',
      '#                                      #',
      '#                                      #',
      '#                                      #',
      '#     Q                                #',
      '#    ###                               #',
      '#                                      #',
      '                                        ',
      '                                        ',
      '       T        B       N               ',
      '########################################',
      '########################################',
      '########################################',
    ],
    exits: [
      { side: 'left', min: 10, max: 13, to: 'stk3', px: 38, py: 6 },
      { side: 'right', min: 10, max: 13, to: 'boss', px: 2, py: 13 },
    ],
  },

  boss: {
    area: 'overclock',
    boss: 'burnout',
    map: [
      '####################################',
      '#                                  #',
      '#                                  #',
      '#        *                *        #',
      '#                                  #',
      '#                                  #',
      '#                                  #',
      '#                                  #',
      '#                                  #',
      '#                                  #',
      '#                                  #',
      '                                    ',
      '                                    ',
      '                                    ',
      '####################################',
      '####################################',
      '####################################',
    ],
    exits: [
      { side: 'left', min: 10, max: 13, to: 'gate1', px: 37, py: 13 },
      { side: 'right', min: 10, max: 13, to: 'dawn', px: 1.5, py: 13 },
    ],
  },

  dawn: {
    area: 'dawn',
    tablets: ['dawn_tablet'],
    map: [
      '################################',
      '#                              #',
      '#                              #',
      '#                              #',
      '#                              #',
      '#                              #',
      '#                              #',
      '#                              #',
      '#                              #',
      '#                              #',
      '#                              #',
      '                               #',
      '                               #',
      '       T            W          #',
      '################################',
      '################################',
      '################################',
    ],
    exits: [{ side: 'left', min: 10, max: 13, to: 'boss', px: 33, py: 13 }],
  },
};

// Tile codes
const T_EMPTY = 0, T_SOLID = 1, T_PLAT = 2, T_SPIKE = 3;

// Pause-screen map: hand-placed grid cells [col, row, wCells, hCells].
const MAP_LAYOUT = {
  foyer1: [0, 0, 1, 1],
  foyer2: [1, 0, 1, 1],
  arch1:  [2, 0, 1, 2],
  archQ:  [1, 2, 1, 1],
  arch2:  [2, 2, 1, 1],
  arch3:  [3, 2, 1, 1],
  fnd1:   [4, 2, 1, 1],
  fnd2:   [5, 2, 1, 1],
  fnd3:   [6, 1, 1, 2],
  stk1:   [7, 1, 1, 1],
  prv1:   [7, 2, 1, 1],
  stk2:   [8, 1, 1, 1],
  stk3:   [9, 1, 1, 1],
  gate1:  [10, 1, 1, 1],
  boss:   [11, 1, 1, 1],
  dawn:   [12, 1, 1, 1],
};

// Small seeded PRNG so parallax silhouettes are stable per room.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const World = {
  roomId: null,
  def: null,
  grid: [],
  w: 0, h: 0,
  pxW: 0, pxH: 0,
  decor: [],     // {type:'pillar'|'lamp', x, y}
  spawnPoints: [], // parsed entities for game.js to instantiate
  playerStart: null,
  palette: null,
  areaId: null,
  _silhouettes: null,

  load(id) {
    const def = ROOMS[id];
    if (!def) throw new Error('Unknown room: ' + id);
    this.roomId = id;
    this.def = def;
    this.areaId = def.area;
    this.palette = CONTENT.areas[def.area].palette;

    const rows = def.map;
    const w = Math.max(...rows.map(r => r.length));
    const h = rows.length;
    this.w = w; this.h = h;
    this.pxW = w * TILE; this.pxH = h * TILE;
    this.grid = [];
    this.decor = [];
    this.spawnPoints = [];
    this.playerStart = null;

    let tabletIdx = 0;
    for (let y = 0; y < h; y++) {
      const row = rows[y].padEnd(w, ' ');
      if (rows[y].length !== w && rows[y].length !== 0) {
        // Padded rows are usually intentional (open right edge); still worth a note.
        // console.debug(`room ${id} row ${y} padded from ${rows[y].length} to ${w}`);
      }
      const line = new Array(w).fill(T_EMPTY);
      for (let x = 0; x < w; x++) {
        const c = row[x];
        const px = x * TILE + TILE / 2, py = y * TILE + TILE / 2;
        switch (c) {
          case '#': line[x] = T_SOLID; break;
          case '%': line[x] = T_SOLID; this.decor.push({ type: 'bright', x, y }); break;
          case '=': line[x] = T_PLAT; break;
          case '^': line[x] = T_SPIKE; break;
          case '|': this.decor.push({ type: 'pillar', x, y }); break;
          case '*': this.decor.push({ type: 'lamp', x, y }); break;
          case 'P': this.playerStart = { x: px, y: py }; break;
          case 'B': this.spawnPoints.push({ type: 'bench', x: px, y: py, id: def.bench || id }); break;
          case 'T': this.spawnPoints.push({ type: 'tablet', x: px, y: py, id: (def.tablets || [])[tabletIdx++] }); break;
          case 'E': this.spawnPoints.push({ type: 'crawler', x: px, y: py }); break;
          case 'F': this.spawnPoints.push({ type: 'flyer', x: px, y: py }); break;
          case 'S': this.spawnPoints.push({ type: 'spitter', x: px, y: py }); break;
          case 'H': this.spawnPoints.push({ type: 'heavy', x: px, y: py }); break;
          case 'A': this.spawnPoints.push({ type: 'ability', x: px, y: py, id: def.ability }); break;
          case 'Q': this.spawnPoints.push({ type: 'charm', x: px, y: py, id: def.charm }); break;
          case 'G': this.spawnPoints.push({ type: 'geo', x: px, y: py }); break;
          case 'W': this.spawnPoints.push({ type: 'portal', x: px, y: py }); break;
          case 'M': this.spawnPoints.push({ type: 'shard', x: px, y: py }); break;
          case 'N': this.spawnPoints.push({ type: 'npc', x: px, y: py }); break;
          case 'R': this.spawnPoints.push({ type: 'shop', x: px, y: py }); break;
        }
      }
      this.grid.push(line);
    }

    // Seed silhouettes for this room's parallax layers.
    const rand = mulberry32(hashStr(id));
    const sil = [[], []];
    for (let layer = 0; layer < 2; layer++) {
      const count = 10 + Math.floor(rand() * 6);
      for (let i = 0; i < count; i++) {
        sil[layer].push({
          x: rand() * (this.pxW + VIEW_W),
          w: 60 + rand() * 220,
          hgt: 90 + rand() * (200 + layer * 120),
          spire: rand() > 0.5,
        });
      }
    }
    this._silhouettes = sil;
  },

  tile(tx, ty) {
    if (ty < 0 || ty >= this.h || tx < 0 || tx >= this.w) return T_EMPTY;
    return this.grid[ty][tx];
  },
  setTile(tx, ty, v) {
    if (ty >= 0 && ty < this.h && tx >= 0 && tx < this.w) this.grid[ty][tx] = v;
  },
  isSolid(tx, ty) { return this.tile(tx, ty) === T_SOLID; },

  // Does rect overlap any solid tile?
  rectHitsSolid(x, y, w, h) {
    const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 0.01) / TILE);
    const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 0.01) / TILE);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++)
        if (this.tile(tx, ty) === T_SOLID) return true;
    return false;
  },
  rectHitsSpike(x, y, w, h) {
    const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 0.01) / TILE);
    const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 0.01) / TILE);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++)
        if (this.tile(tx, ty) === T_SPIKE) return true;
    return false;
  },

  // ---------------------------------------------------------------- drawing
  drawBackground(ctx, cam) {
    const p = this.palette;
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, p.sky1);
    g.addColorStop(1, p.sky2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // Two parallax layers of distant architecture.
    for (let layer = 0; layer < 2; layer++) {
      const speed = layer === 0 ? 0.25 : 0.5;
      const alpha = layer === 0 ? 0.45 : 0.7;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.mid;
      const off = cam.x * speed;
      for (const s of this._silhouettes[layer]) {
        let sx = ((s.x - off) % (this.pxW + VIEW_W));
        if (sx < -s.w) sx += this.pxW + VIEW_W;
        sx -= 100;
        const base = VIEW_H - cam.y * speed * 0.3;
        const top = base - s.hgt;
        if (s.spire) {
          ctx.beginPath();
          ctx.moveTo(sx, base);
          ctx.lineTo(sx + s.w * 0.5, top);
          ctx.lineTo(sx + s.w, base);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillRect(sx, top, s.w, s.hgt + 40);
          ctx.beginPath();
          ctx.arc(sx + s.w / 2, top, s.w / 2, Math.PI, 0);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  },

  drawTiles(ctx, cam) {
    const p = this.palette;
    const x0 = Math.max(0, Math.floor(cam.x / TILE) - 1);
    const x1 = Math.min(this.w - 1, Math.ceil((cam.x + VIEW_W) / TILE) + 1);
    const y0 = Math.max(0, Math.floor(cam.y / TILE) - 1);
    const y1 = Math.min(this.h - 1, Math.ceil((cam.y + VIEW_H) / TILE) + 1);

    // Pillars first (behind tiles): each extends down to the first solid tile.
    for (const d of this.decor) {
      if (d.type !== 'pillar') continue;
      if (d.x < x0 - 1 || d.x > x1 + 1) continue;
      let bottom = d.y;
      while (bottom < this.h && this.tile(d.x, bottom) !== T_SOLID) bottom++;
      ctx.fillStyle = p.mid;
      ctx.globalAlpha = 0.8;
      const px = d.x * TILE + 6;
      ctx.fillRect(px, d.y * TILE - TILE, TILE - 12, (bottom - d.y + 1) * TILE);
      // capital
      ctx.fillRect(px - 5, d.y * TILE - TILE, TILE - 2, 8);
      ctx.globalAlpha = 1;
    }

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const t = this.grid[ty][tx];
        const px = tx * TILE, py = ty * TILE;
        if (t === T_SOLID) {
          ctx.fillStyle = p.fg;
          ctx.fillRect(px, py, TILE, TILE);
          // top edge highlight where exposed
          if (this.tile(tx, ty - 1) !== T_SOLID) {
            ctx.fillStyle = p.edge;
            ctx.fillRect(px, py, TILE, 4);
          }
          if (this.tile(tx - 1, ty) !== T_SOLID) {
            ctx.fillStyle = p.edge;
            ctx.globalAlpha = 0.35;
            ctx.fillRect(px, py, 3, TILE);
            ctx.globalAlpha = 1;
          }
          if (this.tile(tx + 1, ty) !== T_SOLID) {
            ctx.fillStyle = p.edge;
            ctx.globalAlpha = 0.35;
            ctx.fillRect(px + TILE - 3, py, 3, TILE);
            ctx.globalAlpha = 1;
          }
        } else if (t === T_PLAT) {
          ctx.fillStyle = p.edge;
          ctx.fillRect(px, py + 2, TILE, 7);
          ctx.fillStyle = p.fg;
          ctx.fillRect(px + 2, py + 9, TILE - 4, 4);
        } else if (t === T_SPIKE) {
          ctx.fillStyle = p.edge;
          const n = 3;
          for (let i = 0; i < n; i++) {
            const bx = px + (i * TILE) / n;
            ctx.beginPath();
            ctx.moveTo(bx, py + TILE);
            ctx.lineTo(bx + TILE / n / 2, py + 6);
            ctx.lineTo(bx + TILE / n, py + TILE);
            ctx.closePath();
            ctx.fill();
          }
        }
      }
    }

    // Bright-variant overlay & lamps (in front of tiles).
    for (const d of this.decor) {
      const px = d.x * TILE, py = d.y * TILE;
      if (d.type === 'bright') {
        ctx.fillStyle = p.edge;
        ctx.globalAlpha = 0.3;
        ctx.fillRect(px + 3, py + 3, TILE - 6, TILE - 6);
        ctx.globalAlpha = 1;
      } else if (d.type === 'lamp') {
        // hanging chain from ceiling
        ctx.strokeStyle = p.mid;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px + TILE / 2, py - TILE);
        ctx.lineTo(px + TILE / 2, py + TILE / 2 - 8);
        ctx.stroke();
        const gl = ctx.createRadialGradient(px + TILE / 2, py + TILE / 2, 2, px + TILE / 2, py + TILE / 2, 70);
        gl.addColorStop(0, p.glow);
        gl.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = gl;
        ctx.fillRect(px - 70, py - 70, 172, 172);
        ctx.globalAlpha = 1;
        ctx.fillStyle = p.accent;
        ctx.beginPath();
        ctx.arc(px + TILE / 2, py + TILE / 2 - 2, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },
};
