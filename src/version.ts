/**
 * Build stamp shown on the title screen and the F3 overlay, bumped every
 * content round — the ground truth for "which build am I actually running?".
 * If the title screen doesn't show this exact tag, the client is serving a
 * stale build (old dev-server process, stale cache, or an unsynced clone).
 */
export const BUILD_TAG = 'v0.31 THE RULE OF THE DARK — light wards spawns · dense cave realms';
