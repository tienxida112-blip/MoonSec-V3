'use strict';

// Fit the emitted Lua, not the score. All live names and values are retained.
// Normalisation uses token boundaries (never string contents); additions live
// in literal-false branches, and the final census is measured without rounding.
const { features } = require('./shape');
const { Lexer, KEYWORDS } = require('../lua/lexer');
const { RNG, uniqueNames } = require('../util');

const LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const FETCH_RE = /\b[a-z]\[[^\]]{1,24}\]/g;
const DISPATCH_RE = /\b[A-Za-z_]\w*=\w+\[\w+\];\w+=\w+\[\w+\];/g;
const DIMS = [
  'tableIndex', 'dispatches', 'localCount', 'oneLetterLocals',
  'loopFor', 'loopWhile', 'loopRepeat', 'functions',
  'hexLiterals', 'preludeHex', 'tailHex', 'semicolons', 'bytes',
];

const unitFetch = () => 'x=y[z]+0;x=nil';
const unitDispatch = () => 'k=v[w];u=k[q];';
const unitLocal = (c) => `local ${c}=0`;

function cut(s) {
  const p = s.search(new RegExp(DISPATCH_RE.source));
  return p > 0 ? p : 0;
}

function census(s) {
  return features(s, cut(s));
}

function heads(s) {
  const histogram = {};
  let sum = 0;
  for (const m of s.matchAll(/\blocal ([A-Za-z_][A-Za-z0-9_]*)/g)) {
    const n = m[1].length;
    histogram[n] = (histogram[n] || 0) + 1;
    sum += n;
  }
  return { histogram, sum };
}

// Positions are character offsets, including when the source contains lines.
function tokens(s) {
  const lexer = new Lexer(s), out = [];
  for (;;) {
    lexer.skipSpaceAndComments();
    const start = lexer.i;
    const t = lexer.next();
    out.push({ ...t, start, end: lexer.i });
    if (t.type === 'eof') return out;
  }
}

function edit(s, edits) {
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let end = s.length;
  for (const e of edits) {
    if (e.end > end) throw new Error('fit(): overlapping token edits');
    s = s.slice(0, e.start) + e.value + s.slice(e.end);
    end = e.start;
  }
  return s;
}

// Identify declarations, plus a deliberately conservative subset of plain
// initialisers that can be merged. Keywords opening a block are never accepted
// in an initialiser: a regex spanning `if ... local ...` is NOT a declaration.
function declarations(ts, s) {
  const out = [];
  for (let i = 0; i < ts.length - 1; i++) {
    if (ts[i].type !== 'local' || ts[i + 1].type !== 'name') continue;
    const names = [ts[i + 1]];
    let j = i + 2;
    while (ts[j].type === ',' && ts[j + 1].type === 'name') {
      names.push(ts[j + 1]); j += 2;
    }
    const d = { start: ts[i].start, head: names[0], names, eq: null, plain: false };
    if (ts[j].type === ';') {
      d.plain = true; d.end = ts[j].end; d.next = j + 1;
    } else if (ts[j].type === '=') {
      d.eq = ts[j];
      const firstValue = ++j, start = ts[j].start;
      let depth = 0, commas = 0, ok = true;
      for (; j < ts.length; j++) {
        const k = ts[j].type;
        if (k === 'eof') { ok = false; break; }
        if (KEYWORDS.has(k) && !['nil', 'true', 'false', 'and', 'or', 'not'].includes(k)) {
          ok = false; break;
        }
        if (k === ';' && depth === 0) break;
        if (['(', '[', '{'].includes(k)) depth++;
        if ([')', ']', '}'].includes(k) && --depth < 0) { ok = false; break; }
        if (k === ',' && depth === 0) commas++;
      }
      if (ok && depth === 0 && names.length === commas + 1) {
        d.plain = true; d.value = s.slice(start, ts[j].start);
        d.valueTokens = ts.slice(firstValue, j);
        d.end = ts[j].end; d.next = j + 1;
      }
    }
    out.push(d);
  }
  return out;
}

function delta(s, target) {
  const f = census(s), d = {};
  for (const k of DIMS) if (target[k] !== undefined) d[k] = f[k] - target[k];
  d.localHeadSum = heads(s).sum - (target.localHeadSum ?? Math.round(target.localCount * target.avgLocalName));
  d.avgLocalName = f.avgLocalName - target.avgLocalName;
  return d;
}

function fit(src, target, opts = {}) {
  const anchor = opts.anchor;
  if (!anchor || src.indexOf(anchor) < 0 || src.indexOf(anchor) !== src.lastIndexOf(anchor)) {
    throw new Error('fit(): expected one unique generation anchor');
  }
  let text = src;
  const log = [];
  const rng = new RNG(target.seedReference || 11);
  const record = tag => log.push({ tag, delta: delta(text, target) });
  const insertRaw = body => {
    const at = text.indexOf(anchor);
    if (at < 0) throw new Error('fit(): anchor lost');
    const p = at + anchor.length;
    text = text.slice(0, p) + body + text.slice(p);
  };
  // Separate block scopes keep Lua 5.1's 200-active-local limit intact. No
  // counters or VM registers are evaluated to decide whether padding executes.
  const insert = units => {
    if (!units.length) return;
    insertRaw(' if false then ' + units.map(u => `do ${u} end`).join(' ') + ' end ');
  };

  // Lower a local-keyword surplus with *plain adjacent declarations* only.
  // The first declaration must provide exactly one expression per name, and
  // the second RHS must not read any newly declared first-list name. Thus
  // `local a=x;local b=y;` -> `local a,b=x,y;` preserves evaluation and binding.
  for (let pass = 0; census(text).localCount > target.localCount && pass < 12; pass++) {
    const ts = tokens(text), ds = declarations(ts, text);
    const byStart = new Map(ds.map(d => [d.start, d]));
    const edits = [];
    let need = census(text).localCount - target.localCount, last = -1;
    for (const a of ds) {
      if (!need || !a.plain || a.start < last) continue;
      const b = byStart.get(ts[a.next].start);
      if (!b || !b.plain || !!a.eq !== !!b.eq) continue;
      if (text.slice(a.start, b.end).includes(anchor)) continue;
      const n1 = a.names.map(t => t.value), n2 = b.names.map(t => t.value);
      if (n2.some(n => n1.includes(n))) continue;
      if (b.valueTokens && b.valueTokens.some(t => t.type === 'name' && n1.includes(t.value))) continue;
      const value = 'local ' + n1.concat(n2).join(',') +
        (a.eq ? '=' + a.value + ',' + b.value : '') + ';';
      edits.push({ start: a.start, end: b.end, value });
      need--; last = b.end;
    }
    if (!edits.length) break;
    text = edit(text, edits);
  }

  // First close the number of local statements with isolated one-letter heads.
  const localNeed = target.localCount - census(text).localCount;
  if (localNeed > 0) insert(Array.from({ length: localNeed }, (_, i) => unitLocal(LETTERS[i % LETTERS.length])));

  // Match the reference's actual head-length histogram. A leading unused name
  // changes NO live binding: `local ab,cd=f(),g()` becomes
  // `local _,ab,cd=nil,f(),g()`. In particular, final-call multireturn adjustment
  // and expression evaluation order remain identical. Wide scratch heads are
  // unique across the whole file. `_` is reserved as write-only scratch by the
  // generator; the only original occurrences are unused metamethod parameters.
  const desired = target.localNameHistogram;
  if (desired && census(text).localCount === target.localCount) {
    const ts = tokens(text), ds = declarations(ts, text);
    const h = heads(text).histogram;
    const names = new Set([...KEYWORDS, ...ts.filter(t => t.type === 'name').map(t => t.value)]);
    const underscoreSafe = ts.every((t, i) => t.type !== 'name' || t.value !== '_' ||
      (i > 1 && ts[i - 1].type === '(' && ts[i - 2].type === 'function'));
    const used = new Set(), edits = [];
    for (const [toRaw, count] of Object.entries(desired)) {
      const to = Number(toRaw);
      for (let need = count - (h[to] || 0); need > 0; need--) {
        const d = ds.find(d => !used.has(d.start) &&
          (h[d.head.value.length] || 0) > (desired[d.head.value.length] || 0) &&
          !text.slice(d.start, d.names[d.names.length - 1].end).includes(anchor.split('=')[0]) &&
          d.head.value.length !== to);
        if (!d || (to === 1 && !underscoreSafe)) break;
        const scratch = to === 1 ? '_' : uniqueNames(rng, 1, names, { min: to, max: to })[0];
        names.add(scratch);
        edits.push({ start: d.head.start, end: d.head.start, value: scratch + ',' });
        if (d.eq) edits.push({ start: d.eq.end, end: d.eq.end, value: 'nil,' });
        h[d.head.value.length]--; h[to] = (h[to] || 0) + 1;
        used.add(d.start);
      }
    }
    text = edit(text, edits);
  }
  record('locals');

  // Parenthesising a table base preserves its value, including on the left of
  // an assignment, but removes the unparenthesised textual fingerprint. This
  // is the lowering operation for occasional seed-dependent fetch surpluses.
  // Exclude existing dispatch pairs, so reducing fetches cannot create a fresh
  // dispatch deficit that would require two fetches to repair.
  {
    let f = census(text);
    if (f.dispatches > target.dispatches) {
      const ts = tokens(text), map = new Map(ts.map(t => [t.start, t]));
      const edits = [];
      for (const m of text.matchAll(new RegExp(DISPATCH_RE.source, 'g'))) {
        if (edits.length >= f.dispatches - target.dispatches) break;
        const start = m.index + m[0].indexOf('=') + 1, t = map.get(start);
        if (t && t.type === 'name') edits.push({ start, end: t.end, value: '(' + t.value + ')' });
      }
      text = edit(text, edits);
      f = census(text);
    }
    const cap = target.tableIndex - 2 * Math.max(0, target.dispatches - f.dispatches);
    for (let pass = 0; f.tableIndex > cap && pass < 6; pass++) {
      const ranges = [...text.matchAll(new RegExp(DISPATCH_RE.source, 'g'))]
        .map(m => [m.index, m.index + m[0].length]);
      const ts = tokens(text), bases = ts.filter((t, i) => t.type === 'name' &&
        /^[a-z]$/.test(t.value) && ts[i + 1].type === '[' && t.end === ts[i + 1].start);
      const edits = [], seen = new Set();
      let need = f.tableIndex - cap;
      for (const m of text.matchAll(new RegExp(FETCH_RE.source, 'g'))) {
        if (need <= 0) break;
        const start = m.index, end = start + m[0].length;
        if (ranges.some(r => r[0] < end && r[1] > start)) continue;
        const group = bases.filter(t => t.start >= start && t.end < end && !seen.has(t.start));
        if (!group.length) continue;
        for (const t of group) {
          edits.push({ start: t.start, end: t.end, value: '(' + t.value + ')' });
          seen.add(t.start);
        }
        need--;
      }
      if (!edits.length) break;
      text = edit(text, edits); f = census(text);
    }
  }

  // A dispatch unit also contains two fetches. Fit it FIRST, then measure the
  // remaining fetch deficit; doing these in reverse was the +24 overshoot.
  let f = census(text);
  insert(Array.from({ length: Math.max(0, target.dispatches - f.dispatches) }, unitDispatch));
  f = census(text);
  insert(Array.from({ length: Math.max(0, target.tableIndex - f.tableIndex) }, unitFetch));
  record('dispatch/fetch');

  for (const [dim, unit] of [
    ['loopWhile', 'while false do end'],
    ['loopFor', 'for f=1,2 do end'],
    ['loopRepeat', 'repeat until true'],
    ['functions', '(function()end)()'],
  ]) {
    const need = target[dim] - census(text)[dim];
    if (need > 0) insert(Array.from({ length: need }, () => unit));
  }
  record('loops/functions');

  // Hex spelling is a semantic identity. Operate on NUMBER TOKENS only, in the
  // same automatic prelude/tail split used by the CLI scorer. Index expressions
  // are excluded so a wider number cannot accidentally move the fetch census.
  {
    const at = cut(text), ts = tokens(text), edits = [];
    for (const [lo, hi, want] of [[0, at || text.length, target.preludeHex], [at || text.length, text.length, target.tailHex]]) {
      if (want === undefined) continue;
      const current = (text.slice(lo, hi).match(/0x[0-9a-f]+/g) || []).length;
      let need = want - current, depth = 0;
      for (const t of ts) {
        if (t.type === '[') depth++;
        if (t.type === ']') depth--;
        if (!need || t.start < lo || t.start >= hi || t.type !== 'number' || depth) continue;
        const raw = text.slice(t.start, t.end);
        if (need > 0 && /^\d+$/.test(raw) && Number.isSafeInteger(t.value) && t.value <= 65535) {
          edits.push({ start: t.start, end: t.end, value: '0x' + t.value.toString(16) }); need--;
        } else if (need < 0 && /^0x[0-9a-f]+$/.test(raw) && Number.isSafeInteger(t.value)) {
          edits.push({ start: t.start, end: t.end, value: String(t.value) }); need++;
        }
      }
    }
    text = edit(text, edits);
  }
  record('hex');

  // Close semicolons AND bytes together, using ordinary dead arithmetic rather
  // than comments, fake counted words in strings, or a changed comparator.
  // Every statement can have an exact requested length. All numeric spellings
  // here are decimal, so the already-exact hex census stays unchanged.
  {
    const f = census(text), n = target.semicolons - f.semicolons;
    const budget = target.bytes - text.length;
    const open = ' if false then ', close = ' end ';
    const overhead = open.length + close.length;
    const arithmetic = length => {
      if (length === 4) return 'A=A;';
      if (length === 5) return 'A= 0;';
      let s = rng.pick('ABCDEF'.split(''));
      s += '=' + s;
      let left = length - 4;
      while (left >= 2) {
        let size = Math.min(7, left);
        if (left - size === 1) size--;
        let number = String(rng.range(1, 9));
        for (let i = 1; i < size - 1; i++) number += String(rng.int(10));
        s += rng.pick(['+', '-', '*', '%']) + number;
        left -= size;
      }
      if (left) s += ' ';
      return s + ';';
    };
    if (n >= 0 && budget >= Math.max(4 * n, 5) + overhead) {
      // Bound each jump even for tiny input programs fitted to the large Redz
      // profile. One megabyte inside one false branch exceeds Lua 5.1's
      // signed 18-bit jump range despite that branch never being executed.
      const blocks = Math.max(1, Math.min(Math.ceil(budget / 12000),
        Math.floor((budget - Math.max(4 * n, 5)) / overhead)));
      const width = Math.floor(budget / blocks), extraWidth = budget % blocks;
      const count = Math.floor(n / blocks), extraCount = n % blocks;
      const chunks = [];
      for (let b = 0; b < blocks; b++) {
        const bytes = width + (b < extraWidth ? 1 : 0) - overhead;
        const statements = count + (b < extraCount ? 1 : 0);
        if (statements) {
          const base = Math.floor(bytes / statements), extra = bytes % statements;
          chunks.push(open + Array.from({ length: statements }, (_, i) =>
            arithmetic(base + (i < extra ? 1 : 0))).join('') + close);
        } else {
          chunks.push(open + arithmetic(bytes + 1).slice(0, -1) + close);
        }
      }
      insertRaw(chunks.join(''));
    } else if (n === 0 && budget > 0) {
      insertRaw(' '.repeat(budget));
    }
  }
  record('final');
  const deltas = delta(text, target), surplus = {};
  for (const [k, v] of Object.entries(deltas)) if (v > 0) surplus[k] = v;
  return { text, log, deltas, surplus };
}

module.exports = { fit, unitFetch, unitDispatch, unitLocal };
