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

    // invalidate all baked art for the new room
    this._tileDirty = true;
    this._bgLayers = null;
    this._fgLayer = null;
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
  // Everything static is baked once per room: the terrain layer (organic
  // boulder-edged rock, moss caps, grass, vines) and each parallax plane
  // (dense vegetation silhouettes with atmospheric depth). Per-frame work is
  // just blits + a few dynamic glows.

  _tileCanvas: null,
  _tileDirty: true,
  _bgLayers: null,
  _fgLayer: null,

  _hash(x, y) {
    let h = (x * 374761393 + y * 668265263) ^ (hashStr(this.roomId || '') | 0);
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967296;
  },
  markDirty() { this._tileDirty = true; },

  // hex color lerp for atmospheric tints
  _mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
    const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
    const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  },

  // ================================================================ FLORA
  // Small procedural plant painters. Everything silhouette-first, like the
  // real thing: shape carries the read, color carries the depth.
  _grass(ctx, x, y, s, color, seed) {
    const rand = mulberry32(seed);
    const n = 4 + Math.floor(rand() * 4);
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const bx = x + (rand() - 0.5) * 14 * s;
      const h = (7 + rand() * 12) * s;
      const lean = (rand() - 0.5) * 10 * s;
      ctx.lineWidth = (1 + rand()) * s;
      ctx.beginPath();
      ctx.moveTo(bx, y);
      ctx.quadraticCurveTo(bx + lean * 0.3, y - h * 0.6, bx + lean, y - h);
      ctx.stroke();
    }
  },

  _fern(ctx, x, y, s, color, seed) {
    const rand = mulberry32(seed);
    const lean = (rand() - 0.5) * 0.9;
    const h = (30 + rand() * 26) * s;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = 'round';
    // stem
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + lean * h * 0.4, y - h * 0.6, x + lean * h, y - h);
    ctx.stroke();
    // leaflets along the stem
    const steps = 7;
    for (let i = 2; i <= steps; i++) {
      const t = i / steps;
      const px = x + lean * h * (t * t * 0.9);
      const py = y - h * t * 0.95;
      const ll = (1 - t) * 16 * s + 3;
      for (const side of [-1, 1]) {
        ctx.lineWidth = 1.6 * s;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.quadraticCurveTo(px + side * ll * 0.6, py - ll * 0.15, px + side * ll, py - ll * 0.45);
        ctx.stroke();
      }
    }
  },

  _mushroom(ctx, x, y, s, stemC, capC, seed) {
    const rand = mulberry32(seed);
    const h = (10 + rand() * 16) * s;
    const cw = (7 + rand() * 8) * s;
    const lean = (rand() - 0.5) * 6 * s;
    ctx.strokeStyle = stemC;
    ctx.lineWidth = 2.4 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + lean * 0.5, y - h * 0.6, x + lean, y - h);
    ctx.stroke();
    ctx.fillStyle = capC;
    ctx.beginPath();
    ctx.ellipse(x + lean, y - h, cw, cw * 0.55, 0, Math.PI, 0);
    ctx.quadraticCurveTo(x + lean, y - h + cw * 0.28, x + lean - cw, y - h);
    ctx.fill();
  },

  _bulbPlant(ctx, x, y, s, stemC, glowC, seed) {
    const rand = mulberry32(seed);
    const h = (24 + rand() * 22) * s;
    const lean = (rand() - 0.5) * 20 * s;
    ctx.strokeStyle = stemC;
    ctx.lineWidth = 2 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + lean * 0.2, y - h, x + lean, y - h * 0.92);
    ctx.stroke();
    // drooping lantern bulb
    const bx = x + lean, by = y - h * 0.92 + 4 * s;
    const g = ctx.createRadialGradient(bx, by, 1, bx, by, 10 * s);
    g.addColorStop(0, glowC);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = g;
    ctx.fillRect(bx - 10 * s, by - 10 * s, 20 * s, 20 * s);
    ctx.globalAlpha = 1;
    ctx.fillStyle = glowC;
    ctx.beginPath();
    ctx.ellipse(bx, by, 2.6 * s, 3.6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  },

  _vine(ctx, x, y, len, color, seed) {
    const rand = mulberry32(seed);
    const sway = (rand() - 0.5) * 26;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + sway, y + len * 0.55, x + sway * 0.5, y + len);
    ctx.stroke();
    // leaf pairs
    const leaves = Math.floor(len / 14);
    ctx.fillStyle = color;
    for (let i = 1; i <= leaves; i++) {
      const t = i / (leaves + 1);
      const lx = x + sway * (t * 1.1 - t * t * 0.55);
      const ly = y + len * t;
      const ls = 4.5 * (1 - t * 0.4);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(lx + side * ls * 0.8, ly, ls, ls * 0.4, side * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },

  // ======================================================== TERRAIN LAYER
  renderTileLayer() {
    const p = this.palette;
    if (!this._tileCanvas) this._tileCanvas = document.createElement('canvas');
    const c = this._tileCanvas;
    c.width = this.pxW; c.height = this.pxH;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const T = TILE;
    const solid = (x, y) => this.tile(x, y) === T_SOLID;
    const rockLite = this._mix(p.fg, p.edge, 0.55);
    const mossC = this._mix(p.fg, p.accent, 0.4);
    const mossBright = this._mix(p.fg, p.accent, 0.62);
    const deepC = this._mix(p.fg, '#000000', 0.45);

    // -- pillars (behind rock) --------------------------------------------
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
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = g;
      ctx.fillRect(px + 4, topY, T - 8, hgt);
      ctx.fillStyle = p.mid;
      ctx.fillRect(px + 1, topY, T - 2, 7);
      ctx.fillRect(px + 3, topY + 9, T - 6, 3);
      // ivy wrap
      ctx.globalAlpha = 0.6;
      this._vine(ctx, px + 8, topY + 10, Math.min(hgt - 20, 90), this._mix(p.mid, p.accent, 0.3), d.x * 31 + 7);
      ctx.globalAlpha = 1;
    }

    // -- base rock fill with depth gradient --------------------------------
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!solid(x, y)) continue;
        // depth: cells far from any exposed edge get darker
        let exposed = 0;
        for (let r = 1; r <= 2; r++) {
          if (!solid(x, y - r) || !solid(x, y + r) || !solid(x - r, y) || !solid(x + r, y)) { exposed = r; break; }
        }
        ctx.fillStyle = exposed === 1 ? p.fg : (exposed === 2 ? this._mix(p.fg, deepC, 0.5) : deepC);
        ctx.fillRect(x * T - 0.5, y * T - 0.5, T + 1, T + 1);
      }
    }

    // -- organic boulder bumps along every exposed edge ---------------------
    // Overlapping ellipses straddling the tile boundary erase the straight
    // machine line and read as natural rock.
    const bump = (bx, by, rx, ry, fill) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.ellipse(bx, by, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!solid(x, y)) continue;
        const px = x * T, py = y * T;
        const h0 = this._hash(x, y);
        if (!solid(x, y - 1)) { // top edge
          for (let i = 0; i < 3; i++) {
            const hh = this._hash(x * 3 + i, y * 5 + i);
            bump(px + 5 + i * 11 + (hh - 0.5) * 6, py + (hh - 0.5) * 5, 7 + hh * 5, 5 + hh * 3, p.fg);
          }
        }
        if (!solid(x, y + 1)) { // bottom edge
          for (let i = 0; i < 3; i++) {
            const hh = this._hash(x * 7 + i, y * 3 + i);
            bump(px + 5 + i * 11 + (hh - 0.5) * 6, py + T + (hh - 0.5) * 6, 7 + hh * 5, 5 + hh * 4, deepC);
          }
        }
        if (!solid(x - 1, y)) { // left edge
          for (let i = 0; i < 3; i++) {
            const hh = this._hash(x * 5 + i, y * 7 + i);
            bump(px + (hh - 0.5) * 6, py + 5 + i * 11, 4 + hh * 4, 7 + hh * 5, p.fg);
          }
        }
        if (!solid(x + 1, y)) { // right edge
          for (let i = 0; i < 3; i++) {
            const hh = this._hash(x * 11 + i, y * 13 + i);
            bump(px + T + (hh - 0.5) * 6, py + 5 + i * 11, 4 + hh * 4, 7 + hh * 5, p.fg);
          }
        }
      }
    }

    // -- interior speckle texture -------------------------------------------
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!solid(x, y)) continue;
        const h1 = this._hash(x, y);
        if (h1 < 0.4) {
          ctx.fillStyle = 'rgba(0,0,0,0.2)';
          ctx.beginPath();
          ctx.ellipse(x * T + 4 + (h1 * 97) % (T - 8), y * T + 5 + (h1 * 53) % (T - 10),
            2.5 + h1 * 3.5, 1.6 + h1 * 2, h1 * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // -- moss caps on top surfaces (bumpy, two-tone) --------------------------
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!solid(x, y) || solid(x, y - 1)) continue;
        const px = x * T, py = y * T;
        // base band
        ctx.fillStyle = mossC;
        ctx.fillRect(px - 1, py - 1.5, T + 2, 6.5);
        // bumpy underside of the moss
        for (let i = 0; i < 4; i++) {
          const hh = this._hash(x * 13 + i, y * 17 + i);
          ctx.beginPath();
          ctx.ellipse(px + 4 + i * 9 + (hh - 0.5) * 4, py + 4 + hh * 4, 5 + hh * 3, 3.5 + hh * 2.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        // bright crest
        ctx.fillStyle = mossBright;
        ctx.fillRect(px - 1, py - 1.5, T + 2, 2.4);
        for (let i = 0; i < 3; i++) {
          const hh = this._hash(x * 19 + i, y * 7 + i);
          ctx.beginPath();
          ctx.ellipse(px + 5 + i * 11 + (hh - 0.5) * 5, py + 0.5, 5 + hh * 3, 2.2 + hh * 1.4, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // -- side rim light (soft) --------------------------------------------------
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!solid(x, y)) continue;
        const px = x * T, py = y * T;
        if (!solid(x - 1, y) && !(!solid(x, y - 1))) {
          const g = ctx.createLinearGradient(px, 0, px + 7, 0);
          g.addColorStop(0, rockLite);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = g;
          ctx.fillRect(px - 2, py, 9, T);
          ctx.globalAlpha = 1;
        }
        if (!solid(x + 1, y) && !(!solid(x, y - 1))) {
          const g = ctx.createLinearGradient(px + T, 0, px + T - 7, 0);
          g.addColorStop(0, rockLite);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = g;
          ctx.fillRect(px + T - 7, py, 9, T);
          ctx.globalAlpha = 1;
        }
      }
    }

    // -- vegetation on top surfaces ------------------------------------------------
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!solid(x, y) || solid(x, y - 1)) continue;
        const px = x * T, py = y * T;
        const h = this._hash(x * 29, y * 23);
        // grass everywhere
        this._grass(ctx, px + T / 2, py + 1, 1, this._mix(mossBright, p.accent, 0.35), x * 977 + y * 31);
        // occasional feature plant (never on narrow pedestals used for pickups)
        if (h > 0.82) this._fern(ctx, px + T / 2 + (h - 0.5) * 10, py + 2, 0.8 + h * 0.5, this._mix(p.mid, p.accent, 0.28), x * 131 + y * 7);
        else if (h > 0.72) this._mushroom(ctx, px + 8 + h * 14, py + 2, 0.8 + h * 0.6, this._mix(p.mid, '#000000', 0.2), this._mix(p.accent, p.glow, 0.4), x * 61 + y * 13);
        else if (h > 0.66 && this.areaId !== 'overclock') this._bulbPlant(ctx, px + T / 2, py + 2, 0.85, this._mix(p.mid, p.accent, 0.25), p.glow, x * 17 + y * 43);
      }
    }

    // -- hanging vines & roots under overhangs ----------------------------------------
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!solid(x, y) || solid(x, y + 1)) continue;
        const px = x * T, py = y * T;
        const h = this._hash(x * 41, y * 3);
        if (h > 0.45) {
          const len = 14 + h * 46;
          this._vine(ctx, px + 4 + h * 24, py + T - 2, len, this._mix(p.mid, p.accent, 0.22), x * 7 + y * 19);
        }
      }
    }

    // -- carved bright blocks ('%') --------------------------------------------------
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

    // -- spikes: bone-pale thorns ---------------------------------------------------------
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.tile(x, y) !== T_SPIKE) continue;
        const px = x * T, py = y * T;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(px, py + T - 4, T, 4);
        const n = 3;
        for (let i = 0; i < n; i++) {
          const bx = px + (i * T) / n, bw = T / n;
          const hh = this._hash(x * 3 + i, y);
          const g = ctx.createLinearGradient(bx, py + T, bx + bw / 2, py + 4);
          g.addColorStop(0, p.mid);
          g.addColorStop(0.7, this._mix(p.edge, '#c8c4b8', 0.5));
          g.addColorStop(1, '#efece2');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(bx + 1, py + T);
          ctx.quadraticCurveTo(bx + bw * 0.28, py + T - 12, bx + bw / 2 + (hh - 0.5) * 5, py + 4 + hh * 5);
          ctx.quadraticCurveTo(bx + bw * 0.72, py + T - 12, bx + bw - 1, py + T);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // -- one-way platforms: mossy branch shelves -------------------------------------------
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.tile(x, y) !== T_PLAT) continue;
        const px = x * T, py = y * T;
        const lf = this.tile(x - 1, y) === T_PLAT, rt = this.tile(x + 1, y) === T_PLAT;
        const g = ctx.createLinearGradient(0, py + 2, 0, py + 13);
        g.addColorStop(0, this._mix(p.edge, p.accent, 0.25));
        g.addColorStop(1, p.fg);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(px - (lf ? 1 : -2), py + 3, T + (lf ? 1 : -2) + (rt ? 1 : -2), 9, lf && rt ? 0 : 4);
        ctx.fill();
        // moss crest + grass on the shelf
        ctx.fillStyle = mossBright;
        ctx.fillRect(px + (lf ? 0 : 4), py + 3, T - (lf ? 0 : 4) - (rt ? 0 : 4), 2);
        this._grass(ctx, px + T / 2, py + 4, 0.7, mossBright, x * 53 + y * 11);
        // drooping tendril at ends
        if (!lf) this._vine(ctx, px + 6, py + 11, 16, this._mix(p.mid, p.accent, 0.25), x * 3 + y);
        if (!rt) this._vine(ctx, px + T - 6, py + 11, 16, this._mix(p.mid, p.accent, 0.25), x * 5 + y);
      }
    }

    this._tileDirty = false;
  },

  // ==================================================== PARALLAX PLANES
  renderBackgroundLayers() {
    const p = this.palette;
    const mk = (speed) => {
      const w = Math.ceil(Math.max(VIEW_W, Math.max(0, this.pxW - VIEW_TW) * speed * ZOOM + VIEW_W)) + 40;
      const h = VIEW_H + 160;
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      return { cv, ctx: cv.getContext('2d'), w, h, speed };
    };
    const rand = mulberry32(hashStr(this.roomId + 'flora'));

    // L1 — far ridge line with spires, heavily atmospheric
    const L1 = mk(0.12);
    {
      const ctx = L1.ctx;
      const col = this._mix(p.sky2, p.mid, 0.45);
      ctx.fillStyle = col;
      const base = L1.h - 120;
      ctx.beginPath();
      ctx.moveTo(0, L1.h);
      ctx.lineTo(0, base);
      let x = 0;
      while (x < L1.w) {
        const seg = 60 + rand() * 120;
        const peak = base - rand() * 130 - (rand() > 0.75 ? 90 : 0);
        ctx.quadraticCurveTo(x + seg * 0.5, peak, x + seg, base - rand() * 40);
        x += seg;
      }
      ctx.lineTo(L1.w, L1.h);
      ctx.closePath();
      ctx.fill();
      // faint far spires
      ctx.globalAlpha = 0.6;
      for (let i = 0; i < L1.w / 210; i++) {
        const sx = i * 210 + rand() * 90;
        const sh = 120 + rand() * 140;
        ctx.beginPath();
        ctx.moveTo(sx, base + 10);
        ctx.lineTo(sx + 13, base - sh);
        ctx.lineTo(sx + 26, base + 10);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // L2 — mid vegetation band + hanging growth from above
    const L2 = mk(0.32);
    {
      const ctx = L2.ctx;
      const col = this._mix(p.sky2, p.mid, 0.8);
      const base = L2.h - 70;
      // ground mound
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, L2.h);
      ctx.lineTo(0, base + 20);
      let x = 0;
      while (x < L2.w) {
        const seg = 50 + rand() * 90;
        ctx.quadraticCurveTo(x + seg * 0.5, base - rand() * 26, x + seg, base + rand() * 22);
        x += seg;
      }
      ctx.lineTo(L2.w, L2.h);
      ctx.closePath();
      ctx.fill();
      // plants along it
      for (let i = 0; i < L2.w / 26; i++) {
        const px = i * 26 + rand() * 20;
        const r = rand();
        if (r > 0.6) this._fern(ctx, px, base + 8, 0.9 + rand() * 0.9, col, i * 7 + 3);
        else if (r > 0.35) this._grass(ctx, px, base + 10, 1.6, col, i * 13 + 1);
        else if (r > 0.22) this._mushroom(ctx, px, base + 8, 1.1 + rand(), col, col, i * 29);
      }
      // hanging vines from the top of the frame
      for (let i = 0; i < L2.w / 90; i++) {
        const vx = i * 90 + rand() * 60;
        this._vine(ctx, vx, L2.h - VIEW_H - 4, 40 + rand() * 110, col, i * 37 + 11);
      }
    }

    // L3 — near-behind large flora, darker
    const L3 = mk(0.58);
    {
      const ctx = L3.ctx;
      const col = this._mix(p.mid, p.fg, 0.45);
      const base = L3.h - 34;
      for (let i = 0; i < L3.w / 46; i++) {
        const px = i * 46 + rand() * 36;
        const r = rand();
        if (r > 0.55) this._fern(ctx, px, base, 1.5 + rand() * 1.3, col, i * 17 + 5);
        else if (r > 0.3) this._grass(ctx, px, base, 2.4, col, i * 41 + 9);
        else if (r > 0.18) this._mushroom(ctx, px, base, 1.7 + rand() * 1.2, col, col, i * 53);
        else if (this.areaId !== 'overclock') this._bulbPlant(ctx, px, base, 1.5, col, this._mix(p.glow, col, 0.45), i * 59);
      }
      for (let i = 0; i < L3.w / 150; i++) {
        this._vine(ctx, i * 150 + rand() * 100, L3.h - VIEW_H - 6, 60 + rand() * 130, col, i * 43 + 29);
      }
    }

    this._bgLayers = [L1, L2, L3];

    // FG — dark occluder plants that slide in front of the action
    const FG = mk(1.22);
    {
      const ctx = FG.ctx;
      const col = this._mix(p.fg, '#000000', 0.55);
      const base = FG.h;
      for (let i = 0; i < FG.w / 34; i++) {
        const px = i * 34 + rand() * 26;
        const r = rand();
        if (r > 0.5) this._fern(ctx, px, base + 10, 2.0 + rand() * 1.6, col, i * 23 + 3);
        else if (r > 0.25) this._grass(ctx, px, base + 6, 3.2, col, i * 31 + 15);
        else this._mushroom(ctx, px, base + 6, 2.2 + rand() * 1.4, col, col, i * 71);
      }
      // a few hanging fronds from the top
      for (let i = 0; i < FG.w / 260; i++) {
        this._vine(ctx, i * 260 + rand() * 160, FG.h - VIEW_H - 8, 50 + rand() * 90, col, i * 83 + 41);
      }
    }
    this._fgLayer = FG;
  },

  // ------------------------------------------------------------- background
  drawBackground(ctx, cam) {
    const p = this.palette;
    const t = performance.now() / 1000;
    if (!this._bgLayers) this.renderBackgroundLayers();

    // sky
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, p.sky1);
    g.addColorStop(0.72, p.sky2);
    g.addColorStop(1, this._mix(p.sky2, p.sky1, 0.5));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // horizon bloom
    const hb = ctx.createRadialGradient(VIEW_W / 2, VIEW_H * 0.62, 40, VIEW_W / 2, VIEW_H * 0.62, VIEW_W * 0.55);
    hb.addColorStop(0, 'rgba(255,255,255,0.05)');
    hb.addColorStop(0.5, 'rgba(255,255,255,0.02)');
    hb.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hb;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const maxCamY = Math.max(0, this.pxH - VIEW_TH);
    const blit = (L, alpha) => {
      const ox = Math.max(0, Math.min(cam.x * L.speed * ZOOM, L.w - VIEW_W));
      const oy = (VIEW_H - L.h) + Math.min(160, (maxCamY - cam.y) * L.speed * 0.5);
      ctx.globalAlpha = alpha;
      ctx.drawImage(L.cv, ox, 0, VIEW_W, L.h, 0, oy, VIEW_W, L.h);
      ctx.globalAlpha = 1;
    };

    blit(this._bgLayers[0], 0.9);
    // fog between far and mid
    const f1 = ctx.createLinearGradient(0, VIEW_H * 0.5, 0, VIEW_H);
    f1.addColorStop(0, 'rgba(0,0,0,0)');
    f1.addColorStop(1, this._hexA(this._mix(p.sky2, '#ffffff', 0.12), 0.16));
    ctx.fillStyle = f1;
    ctx.fillRect(0, VIEW_H * 0.5, VIEW_W, VIEW_H * 0.5);
    blit(this._bgLayers[1], 0.95);
    // drifting fog band
    const fy = VIEW_H * 0.62 + Math.sin(t * 0.14) * 24 - cam.y * 0.1;
    const f2 = ctx.createLinearGradient(0, fy - 70, 0, fy + 70);
    f2.addColorStop(0, 'rgba(0,0,0,0)');
    f2.addColorStop(0.5, this._hexA(this._mix(p.sky2, '#ffffff', 0.2), 0.1));
    f2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = f2;
    ctx.fillRect(0, fy - 70, VIEW_W, 140);
    blit(this._bgLayers[2], 1);
  },

  _hexA(hex, a) {
    const v = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((v >> 16) & 255) + ',' + ((v >> 8) & 255) + ',' + (v & 255) + ',' + a + ')';
  },

  // ------------------------------------------------------- dynamic tile pass
  drawTiles(ctx, cam) {
    if (this._tileDirty || !this._tileCanvas) this.renderTileLayer();
    ctx.drawImage(this._tileCanvas, 0, 0);

    // lamps: chain + caged bulb pulse
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

  // -------------------------------------------------- foreground occluders
  drawForeground(ctx, cam) {
    if (!this._fgLayer) return;
    const L = this._fgLayer;
    const maxCamY = Math.max(0, this.pxH - VIEW_TH);
    const ox = Math.max(0, Math.min(cam.x * L.speed * ZOOM, L.w - VIEW_W));
    const oy = (VIEW_H - L.h) + Math.min(360, (maxCamY - cam.y) * 0.6);
    ctx.globalAlpha = 0.92;
    ctx.drawImage(L.cv, ox, 0, VIEW_W, L.h, 0, oy, VIEW_W, L.h);
    ctx.globalAlpha = 1;
  },

  // light sources for the lighting overlay (world coords)
  lightSources() {
    const out = [];
    for (const d of this.decor) {
      if (d.type === 'lamp') out.push({ x: d.x * TILE + TILE / 2, y: d.y * TILE + TILE / 2, r: 210 });
    }
    return out;
  },
};
