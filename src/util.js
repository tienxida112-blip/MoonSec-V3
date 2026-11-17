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

function uniqueNames(rng, count, reserved = new Set()) {
  const out = [];
  const used = new Set(reserved);
  while (out.length < count) {
    const n = randomIdent(rng, { min: 3, max: 5 });
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
  u8() {
    return this.buf[this.pos++];
  }
  i16() {
    const v = this.buf.readInt16LE(this.pos);
    this.pos += 2;
    return v;
  }
  u16() {
    const v = this.buf.readUInt16LE(this.pos);
    this.pos += 2;
    return v;
  }
  i32() {
    const v = this.buf.readInt32LE(this.pos);
    this.pos += 4;
    return v;
  }
  u32() {
    const v = this.buf.readUInt32LE(this.pos);
    this.pos += 4;
    return v;
  }
  f64() {
    const v = this.buf.readDoubleLE(this.pos);
    this.pos += 8;
    return v;
  }
  bytes(n) {
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

module.exports = {
  RNG,
  randomIdent,
  uniqueNames,
  ByteWriter,
  ByteReader,
  getBits,
  luaString,
  luaLongString,
};
