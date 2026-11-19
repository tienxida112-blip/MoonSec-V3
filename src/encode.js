'use strict';

// Sixteen distinct printable symbols, carried as the payload prefix. The Lua
// string writer quotes this alphabet; the codec is independent of token counts.
const ALPHABET_POOL = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_!#$%&*+-/<=>?@^~()[]{}:;,. ';

function makeAlphabet(rng) {
  return rng.shuffle(ALPHABET_POOL.split('')).slice(0, 16).join('');
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

// The observed corpus profile stores constants verbatim. A separate MoonSec
// profile uses a leading high-bit marker and shifts the following bytes. Never
// shift an unmarked string, and never mistake raw UTF-8 for that profile.
function encodeConstant(str, key = 0) {
  const raw = Buffer.isBuffer(str) ? str : Buffer.from(str, 'utf8');
  if (!key || !raw.length) return raw;
  const out = Buffer.alloc(raw.length + 1);
  out[0] = 0x80;
  for (let i = 0; i < raw.length; i++) out[i + 1] = (raw[i] - key + 256) % 256;
  return out;
}

function decodeConstantBytes(key, bytes) {
  if (!key || bytes.length < 2 || bytes[0] < 128) return Buffer.from(bytes);
  const out = Buffer.alloc(bytes.length - 1);
  for (let i = 1; i < bytes.length; i++) out[i - 1] = (bytes[i] + key) % 256;
  return out;
}

function decodeConstant(key, bytes) {
  return decodeConstantBytes(key, bytes).toString('utf8');
}

module.exports = {
  makeAlphabet,
  encodeBytes,
  decodeBytes,
  encodeConstant,
  decodeConstant,
  decodeConstantBytes,
};
