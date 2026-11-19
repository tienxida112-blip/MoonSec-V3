'use strict';

const KEYWORDS = new Set([
  'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function',
  'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true',
  'until', 'while',
]);

function finiteNumber(s, fallback) {
  const n = Number(s);
  if (Number.isFinite(n)) return n;
  if (fallback !== undefined) return fallback;
  return String(s).trim().startsWith('-') ? -1.7976931348623157e+308 : 1.7976931348623157e+308;
}

class LexerError extends Error {
  constructor(msg, line, col) {
    super(`${msg} at ${line}:${col}`);
    this.line = line;
    this.col = col;
  }
}

class Lexer {
  constructor(src) {
    this.src = src;
    this.i = 0;
    this.line = 1;
    this.col = 1;
  }

  peek(n = 0) {
    return this.src[this.i + n] || '';
  }

  adv() {
    const c = this.src[this.i++];
    if (c === '\n') {
      this.line++;
      this.col = 1;
    } else this.col++;
    return c;
  }

  tok(type, value, line, col) {
    return { type, value, line, col };
  }

  skipSpaceAndComments() {
    for (;;) {
      while (this.peek() && /[ \t\r\n\f\v]/.test(this.peek())) this.adv();
      if (this.peek() === '-' && this.peek(1) === '-') {
        this.adv(); this.adv();
        if (this.peek() === '[') {
          const long = this.readLong();
          if (long === null) {
            while (this.peek() && this.peek() !== '\n') this.adv();
          }
        } else {
          while (this.peek() && this.peek() !== '\n') this.adv();
        }
        continue;
      }
      break;
    }
  }

  readLong() {
    if (this.peek() !== '[') return null;
    const saveI = this.i, saveL = this.line, saveC = this.col;
    this.adv();
    let eq = 0;
    while (this.peek() === '=') { eq++; this.adv(); }
    if (this.peek() !== '[') {
      this.i = saveI; this.line = saveL; this.col = saveC;
      return null;
    }
    this.adv();
    if (this.peek() === '\n') this.adv();
    let s = '';
    const close = ']' + '='.repeat(eq) + ']';
    while (this.i < this.src.length) {
      if (this.src.startsWith(close, this.i)) {
        for (let k = 0; k < close.length; k++) this.adv();
        return s;
      }
      s += this.adv();
    }
    throw new LexerError('unfinished long string/comment', this.line, this.col);
  }

  readString(q) {
    this.adv();
    let s = '', text = '';
    const chunks = [];
    const append = value => { s += value; text += value; };
    const flush = () => { if (text) { chunks.push(Buffer.from(text, 'utf8')); text = ''; } };
    const byte = value => {
      if (value < 128) append(String.fromCharCode(value));
      else { flush(); chunks.push(Buffer.from([value])); s += String.fromCharCode(value); }
    };
    while (this.peek() && this.peek() !== q) {
      if (this.peek() === '\\') {
        this.adv();
        const c = this.adv();
        const map = { n: '\n', r: '\r', t: '\t', a: '\x07', b: '\b', f: '\f', v: '\v', '\\': '\\', '"': '"', "'": "'", '\n': '\n' };
        if (map[c] !== undefined) append(map[c]);
        else if (c === 'u' && this.peek() === '{') {
          this.adv();
          let h = '';
          while (/[0-9a-fA-F]/.test(this.peek())) h += this.adv();
          if (this.peek() !== '}' || !h || parseInt(h, 16) > 0x10ffff) throw new LexerError('invalid Unicode escape', this.line, this.col);
          this.adv();
          append(String.fromCodePoint(parseInt(h, 16)));
        } else if (c === 'x' && /[0-9a-fA-F]/.test(this.peek())) {
          let h = '';
          while (/[0-9a-fA-F]/.test(this.peek()) && h.length < 2) h += this.adv();
          byte(parseInt(h, 16));
        } else if (/\d/.test(c)) {
          let n = c;
          while (/\d/.test(this.peek()) && n.length < 3) n += this.adv();
          byte(parseInt(n, 10) % 256);
        } else if (c === 'z') {
          while (/[ \t\r\n]/.test(this.peek())) this.adv();
        } else append(c);
      } else {
        if (this.peek() === '\n') throw new LexerError('unfinished string', this.line, this.col);
        append(this.adv());
      }
    }
    if (this.peek() !== q) throw new LexerError('unfinished string', this.line, this.col);
    this.adv();flush();
    // A Lua byte escape is not a Unicode character: "\\128" is one byte,
    // whereas a literal U+0080 in a UTF-8 source file occupies two. Keep both
    // the ordinary token value and the original bytes for the serializer.
    this.stringBytes = Buffer.concat(chunks);
    return s;
  }

  readNumber() {
    let s = '';
    const takeDigits = (re) => {
      while (re.test(this.peek()) || (this.peek() === '_' && re.test(this.peek(1)))) {
        if (this.peek() === '_') this.adv();
        else s += this.adv();
      }
    };
    if (this.peek() === '0' && (this.peek(1) === 'x' || this.peek(1) === 'X')) {
      s += this.adv(); s += this.adv();
      takeDigits(/[0-9a-fA-F]/);
      if (this.peek() === '.' && /[0-9a-fA-F]/.test(this.peek(1))) {
        s += this.adv();
        takeDigits(/[0-9a-fA-F]/);
      }
      if (this.peek() === 'p' || this.peek() === 'P') {
        s += this.adv();
        if (this.peek() === '+' || this.peek() === '-') s += this.adv();
        takeDigits(/\d/);
        return finiteNumber(s, 0);
      }
      const hex = parseInt(s, 16);
      return Number.isFinite(hex) ? hex : 0;
    }
    takeDigits(/\d/);
    if (this.peek() === '.' && /\d/.test(this.peek(1))) {
      s += this.adv();
      takeDigits(/\d/);
    }
    if (this.peek() === 'e' || this.peek() === 'E') {
      s += this.adv();
      if (this.peek() === '+' || this.peek() === '-') s += this.adv();
      takeDigits(/\d/);
    }
    return finiteNumber(s);
  }

  readInterpolated() {
    this.adv();
    const parts = [];
    let buf = '';
    const flush = () => {
      if (buf) { parts.push({ kind: 'str', value: buf }); buf = ''; }
    };
    while (this.i < this.src.length) {
      const c = this.peek();
      if (c === '`') { this.adv(); break; }
      if (c === '{') {
        if (this.peek(1) === '{') { this.adv(); this.adv(); buf += '{'; continue; }
        flush();
        this.adv();
        parts.push({ kind: 'expr', value: this.readInterpolExpr() });
        continue;
      }
      if (c === '}' && this.peek(1) === '}') { this.adv(); this.adv(); buf += '}'; continue; }
      if (c === '\\') {
        this.adv();
        const e = this.adv();
        const map = { n: '\n', r: '\r', t: '\t', '\\': '\\', '`': '`', '{': '{', '}': '}' };
        buf += map[e] !== undefined ? map[e] : e;
        continue;
      }
      buf += this.adv();
    }
    flush();
    return parts;
  }

  readInterpolExpr() {
    let depth = 1;
    let s = '';
    while (this.i < this.src.length && depth > 0) {
      const c = this.peek();
      if (c === '"' || c === "'") {
        const q = c;
        s += this.adv();
        while (this.peek() && this.peek() !== q) {
          if (this.peek() === '\\') { s += this.adv(); if (this.peek()) s += this.adv(); }
          else s += this.adv();
        }
        if (this.peek() === q) s += this.adv();
        continue;
      }
      if (c === '{') { depth++; s += this.adv(); continue; }
      if (c === '}') {
        depth--;
        if (depth === 0) { this.adv(); break; }
        s += this.adv();
        continue;
      }
      s += this.adv();
    }
    return s;
  }

  next() {
    this.skipSpaceAndComments();
    const line = this.line, col = this.col;
    if (this.i >= this.src.length) return this.tok('eof', null, line, col);
    const c = this.peek();

    if (c === '[' && (this.peek(1) === '[' || this.peek(1) === '=')) {
      const s = this.readLong();
      if (s !== null) return this.tok('string', s, line, col);
    }

    if (c === '"' || c === "'") {
      const value = this.readString(c);
      return { ...this.tok('string', value, line, col), bytes: this.stringBytes };
    }
    if (c === '`') return this.tok('interpolated', this.readInterpolated(), line, col);
    if (/\d/.test(c) || (c === '.' && /\d/.test(this.peek(1)))) return this.tok('number', this.readNumber(), line, col);

    if (/[A-Za-z_]/.test(c)) {
      let s = '';
      while (/[A-Za-z0-9_]/.test(this.peek())) s += this.adv();
      if (KEYWORDS.has(s)) return this.tok(s, s, line, col);
      return this.tok('name', s, line, col);
    }

    const two = c + this.peek(1);
    const three = two + this.peek(2);
    const ops3 = ['...', '..=', '//='];
    const ops2 = ['==', '~=', '<=', '>=', '..', '//', '::', '+=', '-=', '*=', '/=', '%=', '^=', '->'];
    if (ops3.includes(three)) { this.adv(); this.adv(); this.adv(); return this.tok(three, three, line, col); }
    if (ops2.includes(two)) { this.adv(); this.adv(); return this.tok(two, two, line, col); }

    this.adv();
    return this.tok(c, c, line, col);
  }

  tokenize() {
    const toks = [];
    for (;;) {
      const t = this.next();
      toks.push(t);
      if (t.type === 'eof') break;
    }
    return toks;
  }
}

module.exports = { Lexer, LexerError, KEYWORDS };
