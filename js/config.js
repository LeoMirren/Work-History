// WORKSONG — global tuning constants.
// All speeds are px/sec, accelerations px/sec^2, times in seconds.
// The feel targets Hollow Knight: heavy gravity, snappy accel, generous
// coyote/buffer windows, hard jump-cut.

const TILE = 32;
const VIEW_W = 960;
const VIEW_H = 544; // exactly 17 tiles

const CFG = {
  // --- Locomotion ---
  runSpeed: 335,
  groundAccel: 3400,
  airAccel: 2000,
  groundFriction: 2800,
  airFriction: 400,

  gravity: 2500,
  maxFall: 920,

  jumpVel: -815, // clears a 4-tile ledge (v²/2g ≈ 133px) with a little grace
  jumpCut: 0.42,        // multiply vy by this when jump released while rising
  coyoteTime: 0.10,
  jumpBuffer: 0.13,

  doubleJumpVel: -650,

  wallSlideMaxFall: 150,
  wallJumpVX: 390,
  wallJumpVY: -650,
  wallJumpLock: 0.13,   // seconds of reduced air control after wall jump
  wallStickTime: 0.09,  // grace before leaving a wall slide

  dashSpeed: 820,
  dashTime: 0.17,
  dashCooldown: 0.45,

  // --- Combat ---
  nailRange: 56,
  nailHeight: 44,
  nailCooldown: 0.36,
  nailCooldownFast: 0.26, // with Coffee Shard
  nailDamage: 1,
  nailRecoil: 150,        // horizontal recoil on landing a hit
  pogoVel: -700,

  soulMax: 99,
  soulPerHit: 11,
  soulPerHitBonus: 5,     // Duckling's Insight
  focusCost: 33,
  focusTime: 0.95,
  focusTimeDeep: 1.55,    // Deep Focus
  castCost: 33,
  spellSpeed: 560,
  spellDamage: 2,

  masksMax: 5,
  invulnTime: 1.1,
  hurtKnockX: 320,
  hurtKnockY: -300,
  hitstop: 0.045,         // freeze frames on nail connect
  hurtstop: 0.12,         // freeze on taking damage

  // --- Camera ---
  camLerp: 8.5,
  camLookahead: 60,
  camVertOffset: -30,

  // --- Misc ---
  geoMagnetDist: 90,
  geoMagnetSpeed: 700,
  transitionTime: 0.32,
  respawnTime: 1.6,
};
