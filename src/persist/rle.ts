/**
 * Chunk RLE codec (§4.11): runs of (length: uint16 LE, id: uint8). Worst case
 * (alternating ids) is 3 bytes per block; typical chunks compress ~100x.
 */
const MAX_RUN = 0xffff;

export function encodeRLE(data: Uint8Array): Uint8Array {
  // First pass: count runs for an exact allocation.
  let runs = 0;
  for (let i = 0; i < data.length; ) {
    const id = data[i];
    let len = 1;
    while (i + len < data.length && data[i + len] === id && len < MAX_RUN) len++;
    runs++;
    i += len;
  }
  const out = new Uint8Array(runs * 3);
  let o = 0;
  for (let i = 0; i < data.length; ) {
    const id = data[i] ?? 0;
    let len = 1;
    while (i + len < data.length && data[i + len] === id && len < MAX_RUN) len++;
    out[o] = len & 0xff;
    out[o + 1] = (len >> 8) & 0xff;
    out[o + 2] = id;
    o += 3;
    i += len;
  }
  return out;
}

/** Decode into a fresh buffer; throws on malformed or wrong-length input. */
export function decodeRLE(encoded: Uint8Array, expectedLength: number): Uint8Array {
  if (encoded.length % 3 !== 0) throw new Error('RLE: truncated run triplet');
  const out = new Uint8Array(expectedLength);
  let o = 0;
  for (let i = 0; i < encoded.length; i += 3) {
    const len = (encoded[i] ?? 0) | ((encoded[i + 1] ?? 0) << 8);
    const id = encoded[i + 2] ?? 0;
    if (len === 0) throw new Error('RLE: zero-length run');
    if (o + len > expectedLength) throw new Error('RLE: overflows expected length');
    out.fill(id, o, o + len);
    o += len;
  }
  if (o !== expectedLength) throw new Error(`RLE: decoded ${o} of ${expectedLength} bytes`);
  return out;
}
