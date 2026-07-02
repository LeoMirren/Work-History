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
    if (ty >= 0 && ty < this.h && tx >= 0 && tx < this.w) {
      this.grid[ty][tx] = v;
      this._tileDirty = true; // cached tile layer must re-render
    }
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
  //
  // The tile layer is expensive (rounded rock, texture, moss, roots), so it
  // renders once into an offscreen canvas per room and re-renders only when
  // tiles change (boss/arena doors). Everything else is cheap per-frame.

  _tileCanvas: null,
  _tileDirty: true,
  _hash(x, y) {
    let h = (x * 374761393 + y * 668265263) ^ (hashStr(this.roomId || '') | 0);
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967296;
  },

  markDirty() { this._tileDirty = true; },

  renderTileLayer() {
    const p = this.palette;
    if (!this._tileCanvas) this._tileCanvas = document.createElement('canvas');
    const c = this._tileCanvas;
    c.width = this.pxW; c.height = this.pxH;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const T = TILE;
    const solid = (x, y) => this.tile(x, y) === T_SOLID;

    // -- pillars first (behind rock) ------------------------------------
    for (const d of this.decor) {
      if (d.type !== 'pillar') continue;
      let bottom = d.y;
      while (bottom < this.h && !solid(d.x, bottom)) bottom++;
      const px = d.x * T, topY = d.y * T - T;
      const hgt = (bottom - d.y + 1) * T;
      const g = ctx.createLinearGradient(px, 0, px + T, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.5, p.mid);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = g;
      ctx.fillRect(px + 4, topY, T - 8, hgt);
      // capital & base
      ctx.fillStyle = p.mid;
      ctx.fillRect(px + 1, topY, T - 2, 7);
      ctx.fillRect(px + 3, topY + 9, T - 6, 3);
      // flutes
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 2;
      for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(px + 6 + i * 7, topY + 14);
        ctx.lineTo(px + 6 + i * 7, topY + hgt - 6);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // -- base rock fill ---------------------------------------------------
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!solid(x, y)) continue;
        ctx.fillStyle = p.fg;
        ctx.fillRect(x * T - 0.5, y * T - 0.5, T + 1, T + 1);
      }
    }

    // -- round the exposed corners with punch-outs ------------------------
    ctx.globalCompositeOperation = 'destination-out';
    const R = 9;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!solid(x, y)) continue;
        const up = solid(x, y - 1), dn = solid(x, y + 1), lf = solid(x - 1, y), rt = solid(x + 1, y);
        const px = x * T, py = y * T;
        const corner = (cx, cy, sx, sy) => {
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + sx * R, cy);
          ctx.arcTo(cx, cy, cx, cy + sy * R, R);
          ctx.lineTo(cx, cy + sy * R);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + sx * R, cy);
          ctx.arc(cx + sx * R, cy + sy * R, R, sy > 0 ? -Math.PI / 2 : Math.PI / 2, sx > 0 ? Math.PI : 0, (sx > 0) === (sy > 0));
          ctx.closePath();
        };
        // simpler reliable punch: square minus quarter-disc
        const punch = (cx, cy, qx, qy) => {
          ctx.save();
          ctx.beginPath();
          ctx.rect(cx - (qx < 0 ? R : 0), cy - (qy < 0 ? R : 0), R, R);
          ctx.clip();
          ctx.beginPath();
          ctx.rect(cx - (qx < 0 ? R : 0), cy - (qy < 0 ? R : 0), R, R);
          ctx.arc(cx + qx * R * (qx < 0 ? 0 : 0) + (qx < 0 ? -0 : 0) + (qx > 0 ? R : -R) * 0 + (qx > 0 ? 0 : 0) + (qx > 0 ? 0 : 0), cy, 1, 0, 0); // placeholder
          ctx.restore();
        };
        // Use arc-based punch: remove the corner square, we then re-add a disc below.
        if (!up && !lf) { ctx.beginPath(); ctx.rect(px, py, R, R); ctx.fill(); }
        if (!up && !rt) { ctx.beginPath(); ctx.rect(px + T - R, py, R, R); ctx.fill(); }
        if (!dn && !lf) { ctx.beginPath(); ctx.rect(px, py + T - R, R, R); ctx.fill(); }
        if (!dn && !rt) { ctx.beginPath(); ctx.rect(px + T - R, py + T - R, R, R); ctx.fill(); }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    // re-add quarter discs to make the rounding
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!solid(x, y)) continue;
        const up = solid(x, y - 1), dn = solid(x, y + 1), lf = solid(x - 1, y), rt = solid(x + 1, y);
        const px = x * T, py = y * T;
        ctx.fillStyle = p.fg;
        if (!up && !lf) { ctx.beginPath(); ctx.moveTo(px + R, py); ctx.arc(px + R, py + R, R, -Math.PI / 2, Math.PI, true); ctx.lineTo(px + R, py + R); ctx.closePath(); ctx.fill(); }
        if (!up && !rt) { ctx.beginPath(); ctx.moveTo(px + T - R, py); ctx.arc(px + T - R, py + R, R, -Math.PI / 2, 0); ctx.lineTo(px + T - R, py + R); ctx.closePath(); ctx.fill(); }
        if (!dn && !lf) { ctx.beginPath(); ctx.moveTo(px, py + T - R); ctx.arc(px + R, py + T - R, R, Math.PI, Math.PI / 2, true); ctx.lineTo(px + R, py + T - R); ctx.closePath(); ctx.fill(); }
        if (!dn && !rt) { ctx.beginPath(); ctx.moveTo(px + T, py + T - R); ctx.arc(px + T - R, py + T - R, R, 0, Math.PI / 2); ctx.lineTo(px + T - R, py + T - R); ctx.closePath(); ctx.fill(); }
      }
    }

    // -- interior texture: seeded speckle + cracks -------------------------
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!solid(x, y)) continue;
        const px = x * T, py = y * T;
        const h1 = this._hash(x, y);
        if (h1 < 0.45) {
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          const sx = px + 4 + h1 * 40 % (T - 10), sy = py + 5 + (h1 * 91) % (T - 10);
          ctx.beginPath();
          ctx.ellipse(sx, sy, 2.5 + h1 * 3, 1.5 + h1 * 2, h1 * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        if (h1 > 0.8 && solid(x, y - 1)) {
          ctx.strokeStyle = 'rgba(0,0,0,0.28)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(px + 6 + h1 * 10, py + 2);
          ctx.lineTo(px + 12 + h1 * 8, py + 12 + h1 * 8);
          ctx.stroke();
        }
      }
    }

    // -- edge lighting ------------------------------------------------------
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!solid(x, y)) continue;
        const up = solid(x, y - 1), dn = solid(x, y + 1), lf = solid(x - 1, y), rt = solid(x + 1, y);
        const px = x * T, py = y * T;
        if (!up) {
          const g = ctx.createLinearGradient(0, py, 0, py + 10);
          g.addColorStop(0, p.edge);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.fillRect(px + (lf ? 0 : 3), py, T - (lf ? 0 : 3) - (rt ? 0 : 3), 10);
          ctx.fillStyle = 'rgba(255,255,255,0.16)';
          ctx.fillRect(px + (lf ? 0 : 4), py, T - (lf ? 0 : 4) - (rt ? 0 : 4), 2);
        }
        if (!lf) {
          const g = ctx.createLinearGradient(px, 0, px + 6, 0);
          g.addColorStop(0, p.edge);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalAlpha = 0.4;
          ctx.fillStyle = g;
          ctx.fillRect(px, py + (up ? 0 : 4), 6, T - (up ? 0 : 4));
          ctx.globalAlpha = 1;
        }
        if (!rt) {
          const g = ctx.createLinearGradient(px + T, 0, px + T - 6, 0);
          g.addColorStop(0, p.edge);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalAlpha = 0.4;
          ctx.fillStyle = g;
          ctx.fillRect(px + T - 6, py + (up ? 0 : 4), 6, T - (up ? 0 : 4));
          ctx.globalAlpha = 1;
        }
        if (!dn) {
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(px, py + T - 5, T, 5);
        }
      }
    }

    // -- moss tufts on top edges, roots under bottoms ------------------------
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!solid(x, y)) continue;
        const px = x * T, py = y * T;
        if (!solid(x, y - 1)) {
          const n = 2 + Math.floor(this._hash(x, y + 71) * 3);
          for (let i = 0; i < n; i++) {
            const hx = this._hash(x * 7 + i, y);
            const bx = px + 3 + hx * (T - 6);
            const bh = 3 + hx * 6;
            ctx.strokeStyle = p.accent;
            ctx.globalAlpha = 0.32;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(bx, py + 1);
            ctx.quadraticCurveTo(bx + (hx - 0.5) * 5, py - bh * 0.7, bx + (hx - 0.5) * 8, py - bh);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
        if (!solid(x, y + 1) && this._hash(x, y + 13) > 0.55) {
          const hx = this._hash(x + 3, y * 3);
          const bx = px + 6 + hx * (T - 12);
          const bl = 8 + hx * 16;
          ctx.strokeStyle = p.mid;
          ctx.globalAlpha = 0.8;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(bx, py + T - 2);
          ctx.quadraticCurveTo(bx + (hx - 0.5) * 8, py + T + bl * 0.6, bx + (hx - 0.5) * 12, py + T + bl);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }

    // -- carved bright blocks ('%') ------------------------------------------
    for (const d of this.decor) {
      if (d.type !== 'bright') continue;
      const px = d.x * T, py = d.y * T;
      ctx.strokeStyle = p.edge;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 4.5, py + 4.5, T - 9, T - 9);
      ctx.globalAlpha = 0.25;
      ctx.strokeRect(px + 9.5, py + 9.5, T - 19, T - 19);
      ctx.globalAlpha = 1;
    }

    // -- spikes -----------------------------------------------------------------
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.tile(x, y) !== T_SPIKE) continue;
        const px = x * T, py = y * T;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(px, py + T - 4, T, 4);
        const n = 3;
        for (let i = 0; i < n; i++) {
          const bx = px + (i * T) / n, bw = T / n;
          const g = ctx.createLinearGradient(bx, py + T, bx + bw / 2, py + 4);
          g.addColorStop(0, p.mid);
          g.addColorStop(0.7, p.edge);
          g.addColorStop(1, '#e8ecf4');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(bx + 1, py + T);
          ctx.lineTo(bx + bw / 2, py + 4 + this._hash(x * 3 + i, y) * 5);
          ctx.lineTo(bx + bw - 1, py + T);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // -- one-way platforms ---------------------------------------------------------
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.tile(x, y) !== T_PLAT) continue;
        const px = x * T, py = y * T;
        const lf = this.tile(x - 1, y) === T_PLAT, rt = this.tile(x + 1, y) === T_PLAT;
        // slab
        const g = ctx.createLinearGradient(0, py + 2, 0, py + 12);
        g.addColorStop(0, p.edge);
        g.addColorStop(1, p.fg);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(px - (lf ? 1 : -2), py + 3, T + (lf ? 1 : -2) + (rt ? 1 : -2), 9, lf && rt ? 0 : 4);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(px + (lf ? 0 : 4), py + 3, T - (lf ? 0 : 4) - (rt ? 0 : 4), 1.6);
        // support bracket at ends
        if (!lf) {
          ctx.strokeStyle = p.mid;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(px + 4, py + 12);
          ctx.quadraticCurveTo(px + 5, py + 22, px + 14, py + 24);
          ctx.stroke();
        }
        if (!rt) {
          ctx.strokeStyle = p.mid;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(px + T - 4, py + 12);
          ctx.quadraticCurveTo(px + T - 5, py + 22, px + T - 14, py + 24);
          ctx.stroke();
        }
      }
    }

    this._tileDirty = false;
  },

  // ------------------------------------------------------------- background
  drawBackground(ctx, cam) {
    const p = this.palette;
    const t = performance.now() / 1000;
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, p.sky1);
    g.addColorStop(0.72, p.sky2);
    g.addColorStop(1, p.sky1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // far arch colonnade
    const rand = mulberry32(hashStr(this.roomId + 'bg'));
    ctx.save();
    for (let layer = 0; layer < 3; layer++) {
      const speed = 0.15 + layer * 0.18;
      const alpha = 0.25 + layer * 0.2;
      const off = cam.x * speed;
      const offY = cam.y * speed * 0.4;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.mid;
      for (const s of this._silhouettes[Math.min(layer, 1)]) {
        let sx = ((s.x - off) % (this.pxW + VIEW_W));
        if (sx < -s.w) sx += this.pxW + VIEW_W;
        sx -= 120;
        const base = VIEW_H + 60 - offY;
        const top = base - s.hgt - layer * 60;
        if (s.spire) {
          // gothic spire with a shoulder
          ctx.beginPath();
          ctx.moveTo(sx, base);
          ctx.lineTo(sx + s.w * 0.18, top + s.hgt * 0.35);
          ctx.lineTo(sx + s.w * 0.5, top);
          ctx.lineTo(sx + s.w * 0.82, top + s.hgt * 0.35);
          ctx.lineTo(sx + s.w, base);
          ctx.closePath();
          ctx.fill();
        } else {
          // arch block with a punched arch window
          ctx.beginPath();
          ctx.rect(sx, top, s.w, s.hgt + 80);
          ctx.moveTo(sx + s.w / 2, top);
          ctx.arc(sx + s.w / 2, top + 4, s.w * 0.42, Math.PI, 0);
          ctx.fill();
          ctx.save();
          ctx.globalCompositeOperation = 'destination-out';
          ctx.globalAlpha = 0.55;
          const ww = s.w * 0.2;
          ctx.beginPath();
          ctx.rect(sx + s.w / 2 - ww / 2, top + s.hgt * 0.32, ww, s.hgt * 0.5);
          ctx.arc(sx + s.w / 2, top + s.hgt * 0.32, ww / 2, Math.PI, 0);
          ctx.fill();
          ctx.restore();
        }
      }
    }
    ctx.restore();

    // drifting fog bands
    for (let i = 0; i < 2; i++) {
      const fy = VIEW_H * (0.45 + i * 0.3) + Math.sin(t * 0.13 + i * 2.4) * 26 - cam.y * 0.12;
      const fg2 = ctx.createLinearGradient(0, fy - 60, 0, fy + 60);
      fg2.addColorStop(0, 'rgba(0,0,0,0)');
      const mist = p.accent;
      fg2.addColorStop(0.5, this._fogColor || 'rgba(160,180,210,0.05)');
      fg2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fg2;
      ctx.fillRect(0, fy - 60, VIEW_W, 120);
    }
  },

  // ------------------------------------------------------- dynamic tile pass
  drawTiles(ctx, cam) {
    if (this._tileDirty || !this._tileCanvas) this.renderTileLayer();
    ctx.drawImage(this._tileCanvas, 0, 0);

    // lamps: chain + bulb pulse (light punch happens in the lighting pass)
    const p = this.palette;
    const t = performance.now() / 1000;
    for (const d of this.decor) {
      if (d.type !== 'lamp') continue;
      const px = d.x * TILE + TILE / 2, py = d.y * TILE + TILE / 2;
      ctx.strokeStyle = p.mid;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, py - TILE * 2);
      ctx.lineTo(px, py - 10);
      ctx.stroke();
      // cage
      ctx.strokeStyle = p.edge;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px - 5, py - 10);
      ctx.quadraticCurveTo(px - 7, py + 2, px, py + 7);
      ctx.quadraticCurveTo(px + 7, py + 2, px + 5, py - 10);
      ctx.closePath();
      ctx.stroke();
      const pulse = 0.8 + Math.sin(t * 2.1 + d.x * 1.7) * 0.2;
      const gl = ctx.createRadialGradient(px, py - 2, 1, px, py - 2, 30);
      gl.addColorStop(0, p.glow);
      gl.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.5 * pulse;
      ctx.fillStyle = gl;
      ctx.fillRect(px - 30, py - 32, 60, 60);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff6e0';
      ctx.beginPath();
      ctx.arc(px, py - 2, 3.4 * pulse, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  // list of light sources for the lighting overlay (world coords)
  lightSources() {
    const out = [];
    for (const d of this.decor) {
      if (d.type === 'lamp') out.push({ x: d.x * TILE + TILE / 2, y: d.y * TILE + TILE / 2, r: 210 });
    }
    return out;
  },
};
