'use strict';

class RNG {
  constructor(seed) {
    this.s = (seed >>> 0) || 0x9E3779B9;
  }
  next() {
    let x = this.s >>> 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x >>> 0;
    return this.s;
  }
  int(max) {
    return this.next() % max;
  }
  range(min, max) {
    return min + this.int(max - min + 1);
  }
  pick(arr) {
    return arr[this.int(arr.length)];
  }
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  bool() {
    return (this.next() & 1) === 1;
  }
}

const ALPHA = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ALNUM = ALPHA + '0123456789_';

function randomIdent(rng, opts = {}) {
  const min = opts.min ?? 1;
  const max = opts.max ?? 2;
  const n = rng.range(min, max);
  let s = rng.bool() ? '_' : rng.pick(ALPHA);
  while (s.length < n) {
    if (rng.int(8) === 0 && s[s.length - 1] !== '_') s += '_';
    else s += rng.pick(ALNUM);
  }
  if (!/^[A-Za-z_]/.test(s)) s = '_' + s;
  return s;
}

function uniqueNames(rng, count, reserved = new Set(), opts = {}) {
  const out = [];
  const used = new Set(reserved);
  const min = opts.min ?? 1;
  const max = opts.max ?? 2;
  const alpha = opts.alpha || null;
  while (out.length < count) {
    // MoonSec V3 names almost every VM local with one character; long names are
    // a fingerprint tell. Keep the occasional 2-char name for local variety.
    let n = randomIdent(rng, { min, max });
    if (alpha && rng.int(6) === 0) n = rng.pick(alpha);
    if (!used.has(n)) {
      used.add(n);
      out.push(n);
    }
  }
  return out;
}

class ByteWriter {
  constructor() {
    this.parts = [];
  }
  u8(n) {
    this.parts.push(n & 0xff);
  }
  i16(n) {
    const b = Buffer.alloc(2);
    b.writeInt16LE(n);
    this.parts.push(b[0], b[1]);
  }
  u16(n) {
    const b = Buffer.alloc(2);
    b.writeUInt16LE(n & 0xffff);
    this.parts.push(b[0], b[1]);
  }
  i32(n) {
    const b = Buffer.alloc(4);
    b.writeInt32LE(n);
    this.parts.push(b[0], b[1], b[2], b[3]);
  }
  u32(n) {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(n >>> 0);
    this.parts.push(b[0], b[1], b[2], b[3]);
  }
  f64(n) {
    const b = Buffer.alloc(8);
    b.writeDoubleLE(n);
    this.parts.push(...b);
  }
  bytes(buf) {
    for (const x of buf) this.parts.push(x);
  }
  toBuffer() {
    return Buffer.from(this.parts);
  }
}

class ByteReader {
  constructor(buf) {
    this.buf = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    this.pos = 0;
  }
  eof() {
    return this.pos >= this.buf.length;
  }
  remaining() {
    return this.buf.length - this.pos;
  }
  ensure(n) {
    if (!Number.isInteger(n) || n < 0 || n > this.remaining()) throw new Error('truncated or invalid byte stream at ' + this.pos);
  }
  u8() {
    this.ensure(1);
    return this.buf[this.pos++];
  }
  i16() {
    this.ensure(2);
    const v = this.buf.readInt16LE(this.pos);
    this.pos += 2;
    return v;
  }
  u16() {
    this.ensure(2);
    const v = this.buf.readUInt16LE(this.pos);
    this.pos += 2;
    return v;
  }
  i32() {
    this.ensure(4);
    const v = this.buf.readInt32LE(this.pos);
    this.pos += 4;
    return v;
  }
  u32() {
    this.ensure(4);
    const v = this.buf.readUInt32LE(this.pos);
    this.pos += 4;
    return v;
  }
  f64() {
    this.ensure(8);
    const v = this.buf.readDoubleLE(this.pos);
    this.pos += 8;
    return v;
  }
  bytes(n) {
    this.ensure(n);
    const s = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return s;
  }
}

function getBits(source, start, end) {
  return (source >>> (start - 1)) & ((1 << (end - start + 1)) - 1);
}

function luaString(str) {
  return "'" + String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\0/g, '\\0') + "'";
}

function luaLongString(str) {
  let eq = 0;
  while (str.includes(']' + '='.repeat(eq) + ']')) eq++;
  const e = '='.repeat(eq);
  return `[${e}[${str}]${e}]`;
}


// Handler templates carry readable temporary names (_273, _184, ...). Rename
// them to short region-scoped locals before emission: the reference build reuses
// one-letter names constantly, and long unique temporaries show up as a diff.
function shortenTemporaries(code, rng, reserved) {
  const seen = [];
  const map = new Map();
  for (const m of code.matchAll(/_(\d{1,4})\b/g)) {
    if (!map.has(m[1])) map.set(m[1], null);
  }
  const pool = [];
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
  for (const a of letters) {
    pool.push(a);
    for (const b of letters) if (pool.length < 200) pool.push(a + b);
  }
  const taken = new Set(reserved);
  for (const kw of ['and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for',
                    'function', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat',
                    'return', 'then', 'true', 'until', 'while']) taken.add(kw);
  let idx = 0;
  for (const key of map.keys()) {
    let name;
    do {
      // bias to single characters, with occasional two-letter reuse
      name = rng.int(4) === 0 ? pool[rng.range(26, Math.min(pool.length, 120))] : pool[idx++ % 26];
      if (idx > 26 * 3) idx = 0;
    } while (taken.has(name));
    taken.add(name);
    map.set(key, name);
    seen.push(name);
  }
  return code.replace(/_(\d{1,4})\b/g, (all, n) => map.get(n) || all);
}

module.exports = {
  RNG,
  randomIdent,
  uniqueNames,
  shortenTemporaries,
  ByteWriter,
  ByteReader,
  getBits,
  luaString,
  luaLongString,
};
