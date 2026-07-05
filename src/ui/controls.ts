/** Single source of truth for the control scheme (shown in panel + guide). */
export const CONTROLS: ReadonlyArray<readonly [string, string]> = [
  ['W A S D', 'move'],
  ['Space', 'jump / swim / fly up'],
  ['Shift', 'sneak / fly down'],
  ['Ctrl / 2×W', 'sprint'],
  ['F', 'toggle fly (creative)'],
  ['Mouse', 'look'],
  ['LMB / RMB', 'break / hunt (either button)'],
  ['U', 'use: place · talk · open · eat · throw'],
  ['1-9, wheel', 'hotbar select'],
  ['I J K L', 'quick-place ahead/left/behind/right'],
  ['O', 'quick-place ahead-above'],
  ['E', 'inventory & crafting / block picker'],
  ['G', 'guide book'],
  ['Tab', 'status panel'],
  ['F3', 'debug overlay'],
  ['Esc', 'pause menu'],
];
