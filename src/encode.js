'use strict';

// The payload must not contain the two characters that spell a hex literal
// (`0x`): the reference's 1 MB payload has no `0x` anywhere, while a base-16
// alphabet containing both `0` and `x` sprinkled them through our blob and
// doubled the hex-literal count of the whole file. Keep `x` in the pool but
// never together with `0`.
const ALPHABET_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz123456789_$#@!%^&*+-~<>?';
const HEX_FREE_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz123456789_$#@!%^&*+-~<>?';

function makeAlphabet(rng) {
  const chars = [];
  const used = new Set();
  while (chars.length < 16) {
    // Skip `x`/`X` while a zero-like digit is still in play: `0x` must never be
    // spellable by the alphabet.
    const pool = used.has('0') ? HEX_FREE_POOL : ALPHABET_POOL;
    let c = pool[rng.int(pool.length)];
    if (c === 'x' || c === 'X') continue;
    if (!used.has(c)) {
      used.add(c);
      chars.push(c);
    }
  }
  return chars.join('');
}

function encodeBytes(buf, key, alphabet) {
  const chars = {};
  for (let i = 0; i < 16; i++) chars[alphabet[i]] = i;
  let rkey = key;
  let out = alphabet;
  for (let i = 0; i < buf.length; i++) {
    let val = buf[i] - rkey;
    val = ((val % 256) + 256) % 256;
    out += alphabet[(val / 16) | 0];
    out += alphabet[val % 16];
    rkey += key;
  }
  return out;
}

function decodeBytes(data, key) {
  const chars = Object.create(null);
  for (let i = 0; i < 16; i++) chars[data[i]] = i;
  const out = [];
  let rkey = key;
  for (let i = 16; i < data.length; i += 2) {
    const c1 = data[i];
    const c2 = i + 1 < data.length ? data[i + 1] : '\0';
    const i1 = chars[c1] !== undefined ? chars[c1] : 0;
    const i2 = chars[c2] !== undefined ? chars[c2] : 0;
    out.push((i1 * 16 + i2 + rkey) % 256);
    rkey += key;
  }
  return Buffer.from(out);
}

// The per-string key header is a single byte, and the reader only needs to know
// whether a key was applied at all -- so the whole encoded stream shares one
// key value. The writer stamps it once at the head of the blob instead of
// prefixing every string, which is 1 byte on each of ~9,300 constants.
function encodeConstant(str, key) {
  const raw = Buffer.from(str, 'utf8');
  if (!key) return raw;
  const out = Buffer.alloc(raw.length);
  for (let i = 0; i < raw.length; i++) {
    out[i] = ((raw[i] - key) % 256 + 256) % 256;
  }
  return out;
}

function decodeConstant(key, bytes) {
  if (!key) return Buffer.from(bytes).toString('utf8');
  const out = Buffer.alloc(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = (bytes[i] + key) % 256;
  }
  return out.toString('utf8');
}

module.exports = {
  makeAlphabet,
  encodeBytes,
  decodeBytes,
  encodeConstant,
  decodeConstant,
};
