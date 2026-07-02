// WORKSONG — content & personalization layer.
//
// This file is the "you" in the game. Everything with a name, a color, or a
// line of lore lives here. Edit freely: rename areas after your real jobs,
// rewrite tablets with your own history, rename the boss after whatever
// nearly ate you. Nothing in here touches game logic.

const CONTENT = {
  playerName: 'Tristan',
  title: 'WORKSONG',
  subtitle: 'the ballad of Tristan',
  tagline: 'A kingdom built of everything you ever made.',

  // ---- Areas (eras of the work-history) ------------------------------------
  // palette: sky1/sky2 = background gradient, mid = parallax silhouettes,
  // fg = tile fill, edge = tile highlight, accent = text/glow color.
  areas: {
    foyer: {
      name: 'The Foyer',
      sub: 'where every history begins',
      palette: { sky1: '#141a28', sky2: '#2a3650', mid: '#1d2740', fg: '#0b101e', edge: '#3d4d70', accent: '#cfd9ea', glow: '#8fb3dd' },
      scale: [220, 262, 294, 330, 392, 440], // A minor-ish, calm
    },
    archives: {
      name: 'The Archives',
      sub: 'old projects dream in green',
      palette: { sky1: '#0c1c16', sky2: '#17362b', mid: '#10281f', fg: '#06120d', edge: '#2e5c47', accent: '#a8dcbb', glow: '#5ce8a0' },
      scale: [196, 233, 262, 294, 349, 392],
    },
    foundry: {
      name: 'The Foundry',
      sub: 'where the real work was forged',
      palette: { sky1: '#1e1206', sky2: '#3b230c', mid: '#2a1808', fg: '#120a03', edge: '#6b4416', accent: '#f2c076', glow: '#ff9838' },
      scale: [175, 208, 233, 262, 311, 349],
    },
    stacks: {
      name: 'The Deep Stacks',
      sub: 'the long nights, shelved and sleeping',
      palette: { sky1: '#0b081c', sky2: '#181239', mid: '#120d2b', fg: '#060413', edge: '#39307a', accent: '#a99ae6', glow: '#7a5cff' },
      scale: [165, 196, 220, 247, 294, 330],
    },
    overclock: {
      name: 'The Overclock',
      sub: 'everything, all at once, forever',
      palette: { sky1: '#170607', sky2: '#330d0e', mid: '#230809', fg: '#0e0304', edge: '#672022', accent: '#ff7a5c', glow: '#ff3020' },
      scale: [155, 175, 208, 233, 262, 311],
    },
    dawn: {
      name: 'The Quiet Dawn',
      sub: '',
      palette: { sky1: '#3a4a66', sky2: '#8fa8c8', mid: '#5a7398', fg: '#22304a', edge: '#7a94ba', accent: '#f4f7fc', glow: '#ffffff' },
      scale: [262, 294, 330, 392, 440, 523],
    },
  },

  // ---- Lore tablets ---------------------------------------------------------
  tablets: {
    welcome: [
      'Welcome, little worker.',
      'This kingdom was raised from every task you ever finished,',
      'and haunted by every one you never did.',
      'Walk left and right. Press Z to leap. You know how — you always did.',
    ],
    foyer_door: [
      'Beyond this hall the history deepens.',
      'Strike with X. What blocks your way was once',
      'only a problem, and problems remember being solved.',
    ],
    archives_enter: [
      'Here rest the early works — the first commits,',
      'green and eager, tangled as vines.',
      'They were small. They were yours. They still are.',
    ],
    archives_depth: [
      'Some who wandered here never left.',
      'They tend old projects that no one will open again,',
      'and call the tending love. Perhaps it is.',
    ],
    cloak: [
      'MOMENTUM, said the old ones, is the only true magic.',
      'Begin moving and you will find you cannot easily stop.',
      'Press C to dash. The gap ahead was never as wide as it looked.',
    ],
    foundry_enter: [
      'Hear it? The hammering. The Foundry never sleeps —',
      'it only compiles.',
      'What is made here is made to be remade.',
    ],
    spell: [
      'A question, sharpened and thrown, is a weapon.',
      'Tap V to cast it, when your soul is bright enough.',
      'Hold V instead, and be still, and be mended.',
    ],
    claw: [
      'The wall is not the end of the road.',
      'The wall is the road, turned on its side.',
      'Cling, kick, rise. Iteration is just falling upward.',
    ],
    stacks_enter: [
      'Softly now. These shelves hold the long nights:',
      'every hour worked past the hour of working.',
      'They are heavy, and they are asleep, and they dream of you.',
    ],
    stacks_arena: [
      'To go higher you must first be surrounded,',
      'and remain.',
    ],
    proving: [
      'Beneath the long nights lives the voice that says:',
      'you never deserved any of this.',
      'It wears your face. It swings your nail.',
      'It is wrong, and you may tell it so.',
    ],
    overclock_gate: [
      'TURN BACK. Beyond burns the fire that eats its keeper —',
      'the flame called BURNOUT, which whispers:',
      '"just one more hour," and means: all of them.',
      'You have carried this kingdom far enough to face it.',
    ],
    dawn_tablet: [
      'The fire is out. The work remains — it always remains —',
      'but it no longer consumes.',
      'Rest, Tristan. The kingdom will keep.',
      'You built it well.',
    ],
  },

  // ---- Abilities ------------------------------------------------------------
  abilities: {
    dash:  { name: 'Momentum Cloak',    desc: 'Press C to dash. Once begun, hard to stop.' },
    claw:  { name: 'Grip of Iteration', desc: 'Cling to walls and leap between them.' },
    wings: { name: 'Second Wind',       desc: 'Jump once more, in midair, when it matters.' },
    spell: { name: 'Vengeful Query',    desc: 'Tap V: hurl a burning question. Hold V: focus and heal.' },
  },

  // ---- Trinkets (charms) ----------------------------------------------------
  // cost = notches. You have 3 notches; choose what to carry.
  charms: {
    coffee: { name: 'Coffee Shard',       cost: 1, desc: 'The nail swings notably faster. Sleep is a rumor.' },
    focus:  { name: 'Deep Focus',         cost: 1, desc: 'Focusing heals two masks, but takes far longer.' },
    duck:   { name: "Duckling's Insight", cost: 1, desc: 'Explaining the problem grants bonus SOUL on every nail strike.' },
    veil:   { name: "Imposter's Veil",    cost: 2, desc: 'Absorbs one wound without harm. Mended again at any bench.' },
    ledger: { name: 'Golden Ledger',      cost: 1, desc: 'Fallen foes yield half again as much geo.' },
  },
  notches: 3,

  // ---- The Recruiter (shop) --------------------------------------------------
  shopName: 'The Recruiter',
  shopGreeting: [
    'Ah — a candidate! Sit, sit. Well, stand.',
    'Everything in this kingdom has a price, little worker.',
    'Fortunately for you, I set them. Browse. Invest in yourself.',
  ],
  shopItems: [
    { id: 'shard',  name: 'Severance Shard',    price: 140, desc: 'Half of a new mask, pre-owned. Lightly haunted.' },
    { id: 'vessel', name: 'Vessel of Overtime', price: 120, desc: 'Holds 33 more SOUL. The hours had to go somewhere.' },
    { id: 'ledger', name: 'Golden Ledger',      price: 90,  desc: 'A trinket: fallen foes yield half again as much geo.' },
  ],

  shardBanner: {
    half: ['Mask Shard', 'Half of a new mask. Keep going.'],
    full: ['A MASK IS FORGED', 'Your endurance grows. Health fully restored.'],
  },

  // ---- Bestiary display names ------------------------------------------------
  enemyNames: {
    crawler: 'Task Mite',
    flyer: 'Ping',
    spitter: 'The Critic',
    heavy: 'Deadline Golem',
    boss: 'BURNOUT, the Consuming Flame',
    imposter: 'THE IMPOSTER, echo of doubt',
  },

  imposterTitle: ['THE IMPOSTER', 'echo of doubt'],

  // ---- The Mentor (NPC) ------------------------------------------------------
  // Dialogue is staged by progress: start → mid (has dash) → late (has wings)
  // → end (Burnout defeated).
  npcName: 'The Mentor',
  npcDialogue: {
    foyer2: {
      start: [
        'Oh! A new hire. No — older than that. A returning one.',
        'I am the Mentor. I have watched every worker who ever',
        'walked into this kingdom, and I remember all of them.',
        'Rest at benches. Read the tablets. Your history is kinder',
        'than you think, Tristan — go down and see for yourself.',
      ],
      mid: [
        'Moving quicker now, I see. Momentum suits you.',
        'The Foundry lies ahead. It is loud, and it is honest —',
        'everything in there was made by someone who cared.',
      ],
      late: [
        'You have your second wind. Few find it.',
        'What waits at the bottom of the Overclock cannot be',
        'reasoned with. It can only be outlasted. You know how.',
      ],
      end: [
        'The fire is out, and yet here you stand — whole.',
        'That was always the trick, you know.',
        'Not the working. The remaining.',
      ],
    },
    gate1: {
      start: [
        'You should not be here yet, little worker. And yet you are.',
        'Stubborn. Good. You will need that.',
      ],
      mid: [
        'Beyond this gate the hours burn faster than they pass.',
        'Sit a while first. The bench asks nothing of you.',
      ],
      late: [
        'Listen to me once, before you go in.',
        'BURNOUT does not want your death. It wants your dawn —',
        'every dawn, forever. Refuse it, and it starves.',
        'I will be here. I am always here. Go.',
      ],
      end: [
        'I saw the light go out from here. I confess I wept.',
        'Walk east, Tristan. The dawn you saved is waiting,',
        'and it is quiet, and it is yours.',
      ],
    },
  },

  benches: {
    foyer2: 'Bench of Beginnings',
    foundry1: 'Bench of Iteration',
    stacks2: 'Bench of Long Nights',
    gate: 'Bench of Resolve',
  },

  bossTitle: ['BURNOUT', 'the Consuming Flame'],

  ending: [
    'The flame gutters, shrinks, and goes out',
    'like a monitor at last allowed to sleep.',
    '',
    'The kingdom does not fall. It never needed the fire —',
    'it needed the builder, rested and whole.',
    '',
    'THE WORK CONTINUES.',
    'IT NO LONGER CONSUMES.',
  ],

  deathQuotes: [
    'Scope creep claims another.',
    'It compiled. It still killed you.',
    'Marked as "won\'t fix". Try again.',
    'The retro will be brutal.',
    'Shipped to production too early.',
  ],
};
