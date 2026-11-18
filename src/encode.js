'use strict';

// V4 codec. Replaces the V3 rolling-subtract cipher with a Park-Miller
// keystream (state = state*48271 mod 2^31-1, all arithmetic exact in Lua
// doubles) combined with cipher-byte chaining, plus alternating nibble
// order. The Lua decoder in src/vm/generate.js mirrors this exactly:
//   state = key % 2147483647 (0 -> 1); prev = 0
//   per byte: state = state*48271 % 2147483647; ks = state % 256
//             cipher = (plain + ks + prev) % 256; prev = cipher
//             plain  = (cipher - ks - prevCipher) mod 256
// Nibbles are emitted hi,lo for even byte indices and lo,hi for odd ones.

const ALPHABET_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_$#@!%^&*+-~<>?/|:;,.';

const PM_MULT = 48271;
const PM_MOD = 2147483647;

function makeAlphabet(rng) {
  // Fisher-Yates shuffle of the whole pool, take 16 distinct chars. The
  // pool deliberately excludes '"' and '\\' so the alphabet is always safe
  // inside a Lua double-quoted string literal.
  const pool = ALPHABET_POOL.split('');
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 16).join('');
}

function transformBytes(buf, key) {
  let state = key % PM_MOD;
  if (state === 0) state = 1;
  let prev = 0;
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    state = (state * PM_MULT) % PM_MOD;
    const c = (buf[i] + (state % 256) + prev) % 256;
    out[i] = c;
    prev = c;
  }
  return out;
}

function inverseTransformBytes(buf, key) {
  let state = key % PM_MOD;
  if (state === 0) state = 1;
  let prev = 0;
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    state = (state * PM_MULT) % PM_MOD;
    const c = buf[i];
    out[i] = (((c - (state % 256) - prev) % 256) + 256) % 256;
    prev = c;
  }
  return out;
}

function encodeBytes(buf, key, alphabet) {
  const cipher = transformBytes(buf, key);
  let out = alphabet;
  for (let i = 0; i < cipher.length; i++) {
    const hi = (cipher[i] >> 4) & 15;
    const lo = cipher[i] & 15;
    if (i % 2 === 1) {
      out += alphabet[lo];
      out += alphabet[hi];
    } else {
      out += alphabet[hi];
      out += alphabet[lo];
    }
  }
  return out;
}

function decodeBytes(data, key) {
  const chars = Object.create(null);
  for (let i = 0; i < 16; i++) chars[data[i]] = i;
  const cipher = [];
  let bi = 0;
  for (let i = 16; i + 1 < data.length; i += 2) {
    const p1 = chars[data[i]] !== undefined ? chars[data[i]] : 0;
    const p2 = chars[data[i + 1]] !== undefined ? chars[data[i + 1]] : 0;
    cipher.push(bi % 2 === 1 ? p2 * 16 + p1 : p1 * 16 + p2);
    bi++;
  }
  return inverseTransformBytes(Buffer.from(cipher), key);
}

function encodeConstant(str, key, salt = (key % 127) + 1) {
  const raw = Buffer.from(str, 'utf8');
  if (!key || raw.length === 0) return raw;
  if (!Number.isInteger(salt) || salt < 1 || salt > 127) throw new RangeError('invalid constant salt');
  const body = transformBytes(raw, key + salt);
  const out = Buffer.alloc(body.length + 1);
  out[0] = 0x80 + salt;
  body.copy(out, 1);
  return out;
}

function decodeConstant(key, bytes) {
  if (!key || !(bytes.length > 1 && bytes[0] > 0x7f)) {
    return Buffer.from(bytes).toString('utf8');
  }
  return inverseTransformBytes(bytes.subarray(1), key + bytes[0] - 0x80).toString('utf8');
}

// Integrity checksum over the serialized payload. h = h*31 + b (mod 2^31-1);
// every intermediate stays below 2^36 so JS and Lua doubles agree exactly.
function checksumBytes(buf) {
  let h = 0;
  for (let i = 0; i < buf.length; i++) h = (h * 31 + buf[i]) % PM_MOD;
  return h;
}

module.exports = {
  makeAlphabet,
  encodeBytes,
  decodeBytes,
  encodeConstant,
  decodeConstant,
  transformBytes,
  inverseTransformBytes,
  checksumBytes,
  PM_MULT,
  PM_MOD,
};
