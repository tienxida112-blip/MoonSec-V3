'use strict';

const ALPHABET_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_$#@!%^&*+-~<>?';

function makeAlphabet(rng) {
  const chars = [];
  const used = new Set();
  while (chars.length < 16) {
    const c = ALPHABET_POOL[rng.int(ALPHABET_POOL.length)];
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

function encodeConstant(str, key) {
  const raw = Buffer.from(str, 'utf8');
  if (!key) return raw;
  const out = Buffer.alloc(raw.length + 1);
  out[0] = 0x80 + (key % 0x7f);
  for (let i = 0; i < raw.length; i++) {
    out[i + 1] = ((raw[i] - key) % 256 + 256) % 256;
  }
  return out;
}

function decodeConstant(key, bytes) {
  if (!(bytes.length > 1 && bytes[0] > 0x7f)) {
    return Buffer.from(bytes).toString('utf8');
  }
  const out = Buffer.alloc(bytes.length - 1);
  for (let i = 1; i < bytes.length; i++) {
    out[i - 1] = (bytes[i] + key) % 256;
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
