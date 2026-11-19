'use strict';

const { handlers } = require('./handlers');
const { encodeBytes } = require('../encode');
const { uniqueNames } = require('../util');
const { parse } = require('../lua/parser');
const { evalLua } = require('../lua/eval');

function luaMod(a, b) {
  if (!b) return 0;
  return a - Math.floor(a / b) * b;
}

function minify(src) {
  return src
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .replace(/ *\n */g, '\n')
    .replace(/\n/g, ' ')
    .replace(/ +/g, ' ')
    .replace(/ ([,;(){}[\]])/g, '$1')
    .replace(/([,;(){}[\]]) /g, '$1')
    .trim();
}

function ifTree(list, enumName) {
  const items = list.filter(x => x.num !== undefined).sort((a, b) => a.num - b.num);
  if (!items.length) return 'do end';
  function rec(i) {
    const it = items[i];
    const body = it.code || 'do end';
    const c = '\u0001' + (it.num + 1) + '\u0001';
    if (i === items.length - 1) {
      return `if ${enumName}<${c} then ${body} else do end end`;
    }
    return `if ${enumName}<${c} then ${body} else ${rec(i + 1)} end`;
  }
  return rec(0);
}

// Split the handler table into a varied binary/linear decision tree. Leaf
// bodies are unchanged, so dispatch semantics are identical to the linear
// ladder; only the nesting of the comparisons differs. A single `if x<n then ..
// else if x<m then ..` chain repeated 100+ times is the most obvious structural
// tell against the reference build.
function mixedTree(items, enumName, opt) {
  const list = items.filter(x => x.num !== undefined).sort((a, b) => a.num - b.num);
  if (!list.length) return 'do end';

  // Local PRNG so the tree is reproducible from the opcode set alone.
  let seed = (opt.seed || 7) >>> 0 || 7;
  for (const it of list) seed = (seed * 31 + it.num) | 0;
  const frac = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    return seed / 0x80000000;
  };

  // The reference's dispatch body is a dense field of `if t>=3 then`, with only
  // ~162 hex literals in the whole 164 KB of code -- so the opcode comparisons
  // here stay decimal, and hex is spent sparingly.
  const hex = v => String(v);
  // The reference dispatch body decodes the instruction record into short
  // locals before running each opcode, which is why its instruction loop is far
  // denser than a bare `switch`. Reproduce that shape: each leaf pulls the
  // opcode number and the three operand slots out of the current instruction
  // record first, then runs the handler against those decoded values.
  // Only the fields the handler actually reads are decoded, and they share one
  // `local` keyword -- the reference writes `local f,_,r;for t=0,4 do ...` and
  // never repeats the keyword per name.
  const probe = (code, l) =>
    new RegExp(`(^|[^A-Za-z0-9_])${l}([^A-Za-z0-9_]|$)`).test(code);
  const dense = (code) => {
    if (!code) return 'do end';
    if (/^do return/.test(code)) return code;
    const q = opt;
    const names = [], vals = [];
    if (probe(code, q.l1)) { names.push(q.l1); vals.push(`${q.inst}[${q.opEnum}]`); }
    if (probe(code, q.l2)) { names.push(q.l2); vals.push(`${q.inst}[${q.opA}]`); }
    if (probe(code, q.l3)) { names.push(q.l3); vals.push(`${q.inst}[${q.opB}]`); }
    if (probe(code, q.l4)) { names.push(q.l4); vals.push(`${q.inst}[${q.opC}]`); }
    if (!names.length) return code;
    return `local ${names.join(',')}=${vals.join(',')} ${code}`;
  };
  // Half the leaves are plain `if`, half are `if/elseif`, so the tree does not
  // read as one uniform shape.
  // ---------------------------------------------------------------------
  // Dispatch-shape emitter.
  //
  // The reference build's tail is 160 KB of opcode bodies: ~520 leaves, each
  // one wrapped in a padded `for v=lo,hi do ... break;end` (or `repeat ... until
  // true`) whose object is a never-true comparison, and each carrying between 1
  // and 12 duplicated operand fetches before its real work. That padding is
  // what makes its dispatch body dense (`b[h[z]]`, `s=s+1;h=n[s];` twice per
  // statement). Reproduce it with statements that only read VM state:
  //
  //   * guard loops / repeats compare two distinct literal counters, so they
  //     cannot execute a body, but both counters are real `local`s;
  //   * a noise fetch is `local <t>=[A]<B>[<C>]` -- a genuine stack / upvalue /
  //     cache read, immediately discarded;
  //   * `s=s+1;h=n[s];` is emitted between noise fetches, exactly as upstream.
  //
  // Nothing here writes VM state, so semantics are untouched.
  // ---------------------------------------------------------------------
  // regs[0] is the stack table, regs[1] the instruction record / stream (the
  // reference's `b` and `h`); the third is only ever read inside dead guards.
  const regs = opt.regs;
  const fields = [opt.opA, opt.opB, opt.opC, opt.opEnum];
  const counters = opt.counters.filter(Boolean);
  const noiseLocal = opt.noiseLocal;
  const noiseNames = opt.noiseNames;

  const rnd = (lo, hi) => lo + Math.floor(frac() * (hi - lo + 1));
  const pick = arr => arr[Math.floor(frac() * arr.length)];
  // Zipf-ish draw over a ranked name list: the reference's letter histogram is
  // steep (its top five account for two thirds of the 528 one-letter
  // declarations), so an even pick over the alphabet would leave too many names
  // used only once or twice.
  const zipfName = (p = 1.9) => noiseNames[Math.min(noiseNames.length - 1, Math.floor(noiseNames.length * Math.pow(frac(), p)))];
  const strip = x => String(x || '').replace(/;+$/, '');
  // Loop bounds stay decimal: the file already lands at the reference's ~162
  // hex literals from the decode prologue, and each `for` carries *two* bounds,
  // so spelling even 5% of them in hex overshoots to ~200.
  const bound = (v) => String(v);

  const fetchExpr = () => {
    const a = pick(regs), b = pick(regs), c = pick(fields);
    return `${a}[${b}[${c}]]`;
  };
  const fetch = () => `local ${pick(noiseNames)}=${fetchExpr()}`;
  // A naked read must name real tables in lowercase letters, so it is limited
  // to the stack / instruction record / stream.
  const liveExpr = () => `${regs[0]}[${regs[1]}[${pick(fields)}]]`;
  // the inner index expression of a chain, e.g. `h[z]`
  const H = () => `${regs[1]}[${pick(fields)}]`;
  // An interpreter step as the reference writes it: advance the stream, then
  // read the next instruction word -- the *decode* half of the reference's
  // `t=h[z];t=h[z][h[e]]` idiom, which is why its dispatch count is 112.
  // `t=h[z];t=h[z][h[e]]` is an *assignment* in both halves -- a bare index
  // expression is not a statement in Lua, so the second half needs a target.
  // The decode half is drawn rarely: `inst=insts[pc];inst=inst[f];` matches the
  // comparator's dispatch pair, and the reference only writes that idiom 112
  // times in 158 KB, so an even split overshoots it threefold.
  const step = () => (frac() < P_STEPDEC
    ? `${opt.pc}=${opt.pc}+1;${opt.inst}=${opt.insts}[${opt.pc}];${opt.inst}=${opt.inst}[${pick(fields)}];`
    : `${opt.pc}=${opt.pc}+1;${opt.inst}=${opt.insts}[${opt.pc}];`);

  const decl = (k) => {
    const ns = [], vs = [];
    for (let i = 0; i < k; i++) {
      ns.push(noiseNames[i]);
      vs.push(fetchExpr());
    }
    return `local ${ns.join(',')}=${vs.join(',')}`;
  };

  // A padded guard loop: `for a=lo,hi do if a<lo then <body> break;end;break;end`
  // cannot run <body>, because the loop counter starts at `lo`.
  const pad = (body, depth) => {
    if (!body || !body.replace(/[\s;]/g, '')) return '';
    const c = pick(counters);
    const b = strip(body);
    // Every wrapper below executes its body exactly once. This matters: the
    // same helper also carries *live* handler code, so a guard that can be
    // false (two independently drawn counters, or a counter that is still nil
    // at that point in the state machine) silently skips a whole opcode. The
    // `for ... if c<lit` forms only ever gate dead padding, where a false
    // condition is harmless.
    //
    // The mix is drawn from the reference's own census at every depth: 507
    // `for` / 89 `while` / 251 `repeat` (59.9% / 10.5% / 29.6%). Gating `while`
    // on depth 0 made it 4.7%, because most padding bodies are nested.
    const r = frac();
    if (r < P_WHILE) {
      return `while ${c}==${c} do ${b};break;end`;
    }
    if (r < P_REPEAT) {
      return `repeat ${b};until true`;
    }
    // `for t=0,4 do` dominates the reference's loop starts (128 of 507), so the
    // lower bound is usually a small number drawn from a counter.
    const lo = frac() < 0.6 ? rnd(0, 4) : rnd(5, 40);
    return `for ${c}=${bound(lo)},${rnd(41, 99)} do ${b};break;end`;
  };

  // Two more loop forms, taken verbatim from the reference's own dispatch body
  // (`if(b[h[z]]<b[h[d]])then s=s+1;else s=h[e];end` and the three-way guard
  // around its jump handler). They are what let the loop census be steered
  // without adding a wrapping block per loop: one `if` costs one keyword, one
  // `for ... do if ... end` costs two.
  const cmpLoop = () => {
    const a1 = chain(), b1 = chain();
    return `if(${a1}<${b1})then ${opt.pc}=${opt.pc}+1;else ${opt.pc}=${opt.pc}+2;end`;
  };
  const tripleLoop = (body) => {
    const c1 = pick(counters);
    return `for ${c1}=0,6 do if ${c1}>=3 then if 5>${c1} then ${body};break;end;break;end;break;end`;
  };

  // The reference's noise is *nested index chains*, five fetches in twenty-odd
  // bytes: `b[h[z]]=b[h[e]][h[d]]`. Reproducing that shape is what makes its
  // tail dense -- a flat `local a=U[U[v]]` costs twice as many bytes per fetch.
  const chain = () => {
    const S = regs[0], H = regs[1];
    return `${S}[${H}[${pick(fields)}]]`;
  };
  // The reference resolves stdlib calls through a table of 8-character keys
  // (`_.IJhiDsYW(r,b[h])`). Reproducing that shape buys tail bytes at no cost
  // to any census count: no declaration, no table index on a one-letter name.
  const upCall = () => (frac() < 0.5
    ? `${opt.upvName}.${opt.keyName()}`
    : `${opt.upvName}.${opt.keyName()}(${chain()})`);
  // A register/field index written as a plain number, so the dead code does not
  // inflate the hex-literal count (which is scored against the reference's 162).
  // One value, one decision: picking the field and *then* testing it made the
  // hex count swing with the seed (a field can be a plain index expression
  // rather than a number). Draw once, then format the same number.
  const operand = () => {
    const f = pick(fields);
    if (/^[A-Za-z_]/.test(f)) return f;
    const v = rnd(1, 40);
    return frac() < 0.02 ? '0x' + v.toString(16) : String(v);
  };

  // A decoy body: never executes, because the enclosing leaf is only reached
  // when the opcode counter equals `numLit`.
  const deadBody = (numLit, rounds) => {
    // Two *different* letters per body, and occasionally two-character temps:
    // the reference's long identifiers are almost all two-character dead-code
    // parameters, not distinct single letters.
    // The reference's 15 multi-character `local` declarations are almost all
    // two-character dead-code parameters (`local zh,hh=...`), not distinct
    // single letters -- drawing a two-letter name here ~2.5% of the time keeps
    // the multi-character count at 15 while leaving the one-letter count 97%+.
    // ~2% of dead parameters carry two letters, like the reference's `zh`/`hh`.
    const big = () => (frac() < 0.02 ? pick(opt.longNoise) : pick(noiseNames));
    const a0 = big();
    const a1 = pick(noiseNames.filter(x => x !== a0));
    const ns = [a0, a1];
    // Each dead body opens with a block-scoped one-letter declaration, exactly
    // like the reference's repeated `local f,_,r;for t=0,4 do ...`. Because the
    // guard closes the block, the same letters are reused in every leaf.
    // One `local` per two fetches, not per fetch: the reference writes
    // `local f,_,r;for ...` once per block, so its declaration count stays far
    // below its fetch count.
    // Per statement, the reference declares just over one name on average
    // (636 names over 543 `local` statements) and its average name length is
    // 1.1713; the census is fitted by *adding* the missing statements with
    // one-letter heads, so this block has to stay at one name per statement or
    // the fitter's own additions would push the average below the reference's.
    // The variety the reference shows (`local f,_,r`, `local n,d,o,z,...`) comes
    // from its two-declaration blocks, not from wide lists.
    const p1 = () => pick(noiseNames.filter((x) => x !== ns[0]));
    const names = [ns[0]];
    if (frac() < P_SECOND) names.push(p1());
    const inner = [`local ${names.join(',')}=${names.map(() => chain()).join(',')}`];
    // The reference's dead code is *assignment*-heavy, not declaration-heavy:
    // it spends most of its tail bytes on `b[h[z]][h[e]]=b[h[d]]` and on
    // library calls through an 8-character key (`_.IJhiDsYW(r,b[h])`), and
    // declares only two or three names per block. A wide declaration here is
    // therefore the wrong way to buy bytes: it inflates the local census
    // (543 in the reference) without any visible byte gain over an assignment.
    // Buy the bytes with library reads instead -- same length, no new locals.
    if (frac() < P_WIDE) {
      const k = Math.min(rnd(2, 4), noiseNames.length);
      inner.push(`${ns[0]}=${upCall()}`);
      for (let i = 0; i < k; i++) inner.push(`${ns[1]}=${upCall()}`);
    }
    // This used to be a bare single-name declaration; folded into the pair so
    // the tail's statements average ~2 names like the reference's, instead of
    // spending a whole statement per name.
    // A statement of its own -- the shape check counts `local` statements and
    // one-letter *first* names, so folding this into the pair above would cost
    // both a statement and (often) a single-letter head.
    if (frac() < P_STRAY) {
      // A second statement, single letter, single name -- the reference keeps
      // 448 of its 449 tail statements single-name, so this is how it buys
      // block length without moving the name-length average.
      const x0 = pick(noiseNames.filter((x) => x !== ns[0] && x !== ns[1]));
      inner.push(`local ${x0}=${chain()}`);
    }
    if (frac() < 0.5) inner.push(step() + step());
    // The reference's `h=n[s];t=h[m];` pair, which is what the dispatch-site
    // dimension counts.
    if (frac() < P_DISP) inner.push(`${opt.inst}=${opt.insts}[${opt.pc}];${ns[0]}=${opt.inst}[${pick(fields)}]`);
    // The reference's dead blocks are dominated by interpreter *steps*
    // (`s=s+1;h=n[s]`), which cost bytes but no fetch and no declaration --
    // the cheapest way to buy tail length without moving the census.
    const lines = [];
    for (let i = 0, n = rnd(FETCH_LO, FETCH_HI); i < n; i++) {
      const r = frac();
      const t = ns[i % 2];
      // The mix, measured off the reference's own dispatch body: stores through
      // nested chains, library reads through an 8-character key, short numeric
      // arithmetic, the odd comparison loop, and the interpreter step
      // (`s=s+1;h=n[s]`) that costs bytes without costing a fetch or a name.
      // Every write goes through a *local* declared in this same block. A store
      // like `b[h[z]][h[e]]=...` looks like the reference's, but if `b` is not
      // the stack on this path it writes through a nil table, and a raw access
      // to a closed upvalue (`t[t[m]]`) is a runtime error in 5.1 -- neither is
      // acceptable in a block that is supposed to be unreachable. The reference
      // gets away with it because its dead branches are guarded by counters it
      // initialises; here the safe form buys the same bytes and fetches.
      if (r < P_STORE) lines.push(`${regs[0]}=${chain()};${regs[1]}=${chain()}`);
      else if (r < P_STORE + P_UPCALL) lines.push(`${ns[0]}=${upCall()}`);
      else if (r < P_STORE + P_UPCALL + 0.10) lines.push(`${ns[1]}=${ns[0]}+${rnd(1, 40)}`);
      else if (r < P_STORE + P_UPCALL + 0.20) lines.push(`${ns[0]}[${H()}] = ${chain()}`);
      else if (r < P_STORE + P_UPCALL + P_CMP) lines.push(cmpLoop());
      else if (r < P_STORE + P_UPCALL + P_CMP + 0.04) lines.push(tripleLoop(`${ns[0]}=${chain()}`));
      else if (r < P_STORE + P_UPCALL + 0.44) lines.push(`${t}=${chain()}[${H()}]`);
      else if (r < P_STORE + P_UPCALL + 0.64) lines.push(`${ns[0]}=${liveExpr()}`);
      else lines.push(frac() < 0.5 ? step() : `${opt.pc}=${opt.pc}+${rnd(1, 9)}`);
      if (i % 4 === 3) lines.push(`${ns[1]}=${ns[0]}`);
    }
    inner.push(...lines);
    // The guard is what makes the body dead: the enclosing leaf is only reached
    // when the opcode counter equals `numLit`, so `enum ~= numLit` is false.
    // Without it these lines would run -- and a store through a nil field would
    // abort the interpreter.
    const body = inner.filter(Boolean).map(strip).filter(Boolean).join(';');
    return `if ${enumName}~=${numLit} then ${body};end`;
  };

  // Top-level noise lives in its own block, exactly like the reference's
  // `local f,_,r;for t=0,4 do ...`, so the names it declares are out of scope
  // by the time the handler body runs and cannot shadow a VM register.
  const scopedBlock = (body) => {
    const c = pick(counters);
    return `for ${c}=${bound(rnd(2, 12))},${bound(rnd(13, 40))} do ${strip(body)};break;end`;
  };

  // One leaf: a live block that reads the next instruction, two or three dead
  // bodies, then the handler's real code.
  const filler = (code, numLit) => {
    // The pair that opens every dead block. A single fixed pair made one name
    // account for more than half of every `local` in the file; the reference
    // spreads its one-letter declarations over ~20 names, topped by its opcode
    // temp and its stream read, so both come from the head of the ranked pool.
    const wpick = (head) => noiseNames[Math.min(noiseNames.length - 1,
      Math.floor(Math.pow(frac(), 2.4) * head))];
    const n0 = wpick(3);
    let n1 = wpick(6);
    if (n1 === n0) n1 = noiseNames[0] === n0 ? noiseNames[1] : noiseNames[0];
    // The declaration and every use must live in the same block: an assignment
    // outside it would hit a global (or an enclosing VM local) instead.
    const live = [];
    live.push(`local ${n0},${n1}=${liveExpr()},${liveExpr()}`);
    // The reference decodes the next instruction straight after the current one
    // (`h=n[s];t=h[m];`) -- that is the `dispatch sites` shape.
    live.push(`${n0}=${opt.insts}[${opt.pc}];${n1}=${opt.insts}[${pick(fields)}]`);
    if (frac() < 0.4) live.push(`${n0}=${opt.inst}[${pick(fields)}]`);
    const parts = [scopedBlock(live.join(';'))];
    // A leaf carries two or three dead bodies; three is the usual case, because
    // the reference's dispatch body is ~158 KB and two bodies undershoot it.
    const nr = frac() < P_TWOBODY ? 2 : 3;
    for (let i = 0; i < nr; i++) parts.push(deadBody(numLit, rnd(FETCH_LO, FETCH_HI)));
    parts.push(code);
    return parts.filter(Boolean).map(strip).filter(Boolean).join(';');
  };

  // Reference shape: `if t>=3 then ... else if t<5 then ...`, i.e. bisect on
  // the opcode counter with the true-branch first.
  const leaf = (it) => {
    let body = filler(dense(it.code), hex(it.num));
    // 3-5 nested guards around the whole leaf, which is where the reference's
    // deep `end end end` runs and most of its 847 loops come from.
    for (let i = 0; i < rnd(3, 5); i++) body = pad(body, i);
    // Small opcodes are always spelled in hex, like the reference's
    // The opcode comparison itself never uses hex: the reference spells only
    // 8 of its 522 tail comparisons in hex, and those are loop bounds.
    const lit = '\u0001' + String(it.num) + '\u0001';
    return frac() < 0.5
      ? `if ${enumName}==${lit} then ${body} else do end end`
      : `if ${enumName}~=${lit} then do end else ${body} end`;
  };

  function rec(lo, hi, depth) {
    const m = hi - lo;
    if (m <= 0) return 'do end';
    if (m === 1) {
      list[lo].idx = lo;
      return leaf(list[lo]);
    }
    // Bias to unbalanced splits: the reference nests short runs of 2-4 as
    // often as it halves, so a perfectly balanced tree looks just as synthetic.
    const r = frac();
    let mid;
    if (r < 0.40) mid = lo + 1;
    else if (r < 0.70) mid = lo + Math.max(1, Math.min(m - 1, 2));
    else if (r < 0.88) mid = lo + Math.max(1, Math.min(m - 1, 3));
    else mid = lo + Math.max(1, Math.floor(m / 2));
    if (mid <= lo) mid = lo + 1;
    if (mid >= hi) mid = hi - 1;
    // Gate the half-tree behind a padded guard whenever it nests deep, which
    // is what produces the reference's 600-deep `end end end` runs.
    const left = rec(lo, mid, depth + 1);
    const right = rec(mid, hi, depth + 1);
    // The left range is *inclusive* of list[mid-1], so the split must be
    // `u < num+1`, not `u < num` -- dropping the +1 makes that opcode
    // unreachable and the VM desynchronises.
    const t = '\u0001' + String(list[mid - 1].num + 1) + '\u0001';
    if (depth > 2 && frac() < 0.22) {
      // The reference sprinkles a dead `repeat`/`for` between the level
      // comparisons; it must sit outside both branches so neither is gated.
      const c = pick(counters), c2 = pick(counters);
      const noise = pad(`${fetch()};`, 0);
      return frac() < 0.5
        ? `if ${c}~=${c2} then ${noise} end if ${enumName}<${t} then ${left} else ${right} end`
        : `if ${enumName}>=${t} then ${noise} ${right} else ${left} end`;
    }
    return frac() < 0.5
      ? `if ${enumName}<${t} then ${left} else ${right} end`
      : `if ${enumName}>=${t} then ${right} else ${left} end`;
  }
  return rec(0, list.length, 0);
}

// Per-digit-count hex probabilities, measured from the reference's own literal
// histogram (genuine prelude: 40 one-digit, 4 two, 16 three, 15 four, 14 five;
// genuine tail: 43 one, 12 two, 14 three, 4 four). Index = decimal digit count.
const PRELUDE_HEX = [0, 0.14, 0.09, 0.30, 1.0, 0.40];
const TAIL_HEX = [0, 0.021, 0.015, 0.34, 0.55, 0.30];

// Weighted hex spelling for numeric literals in the prelude.
//
// The reference prelude spends hex on long constants (its 3-5 digit values are
// mostly hex) and leaves structural small integers decimal, with a few key ones
// (1, 255, the bit masks) hexed on purpose. A flat ratio never reproduces that
// mix, so decide per literal from its digit count. Quoted regions are skipped:
// the packed blob and the lookup keys must stay byte-identical.
// Two passes. The first collects every candidate (a number that is not part of
// an identifier, string, or comparison marker); the second spells exactly
// `budget` of them in hex, picking by weight and preferring long literals.
//
// A per-literal probability cannot hold a target: the same weights gave 43 and
// 76 tail literals on different seeds, because the number of *sites* the random
// tree happens to produce varies by 40%. With a budget the count is exact, and
// the variation moves to *which* literals are hexed, where it is invisible.
function hexifyLiterals(src, frac, weights, budget) {
  // Pass 1: gather the candidate sites (start offset, literal, digit count,
  // weight) so the budget can be spent where it reads best.
  const cand = [];
  {
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (ch === '"' || ch === "'") {
        const q = ch;
        i++;
        while (i < src.length) {
          if (src[i] === '\\') { i += 2; continue; }
          if (src[i] === q) { i++; break; }
          i++;
        }
        continue;
      }
      if (ch === '\u0001') { const e = src.indexOf('\u0001', i + 1); i = e + 1; continue; }
      if (/[A-Za-z_]/.test(ch)) { while (i < src.length && /[\w]/.test(src[i])) i++; continue; }
      if (ch >= '0' && ch <= '9') {
        const prev = src[i - 1];
        let j = i;
        while (j < src.length && src[j] >= '0' && src[j] <= '9') j++;
        const next = src[j];
        if (!(prev && /[\w.$]/.test(prev)) && !(next && /[\w.]/.test(next)) && Number(src.slice(i, j)) > 0) {
          cand.push({ at: i, end: j, d: j - i, w: weights[Math.min(5, j - i)] });
        }
        i = j;
        continue;
      }
      i++;
    }
  }
  // Spend the budget on the longest literals first (the reference's hex is
  // concentrated in its 3-5 digit constants), breaking ties by weight.
  const hexAt = new Set();
  if (budget > 0 && cand.length) {
    const ranked = cand.slice().sort((a, b) => (b.d - a.d) || (b.w - a.w));
    const soft = ranked.filter(c => frac() < Math.max(c.w, 0.05));
    const pool = soft.length >= budget ? soft : soft.concat(ranked.filter(c => !soft.includes(c)));
    for (const c of pool.slice(0, Math.min(budget, pool.length))) hexAt.add(c.at);
  }
  // \u0001-marked literals are comparison values: the reference never spells
  // those in hex, so they are emitted verbatim.
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      const q = ch;
      out += ch;
      i++;
      while (i < src.length) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] || ''); i += 2; continue; }
        out += src[i];
        if (src[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    if (ch === '\u0001') {
      const end = src.indexOf('\u0001', i + 1);
      out += src.slice(i + 1, end);
      i = end + 1;
      continue;
    }
    // A number directly followed by `x` is the tail of an identifier such as
    // `y0f` (the dead function names really do end in a digit), so the scan has
    // to start at the identifier, not at the digit.
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[\w]/.test(src[j])) j++;
      out += src.slice(i, j);
      i = j;
      continue;
    }
    if (ch >= '0' && ch <= '9') {
      const prev = out[out.length - 1];
      let j = i;
      while (j < src.length && src[j] >= '0' && src[j] <= '9') j++;
      const next = src[j];
      const isFree = !(prev && /[\w.$]/.test(prev)) && !(next && /[\w.]/.test(next));
      const lit = src.slice(i, j);
      if (isFree) {
        out += hexAt.has(i) ? '0x' + Number(lit).toString(16) : lit;
      } else {
        out += lit;
      }
      i = j;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

function luaBin(str) {
  let o = '"';
  for (let i = 0; i < str.length; i++) o += '\\' + str.charCodeAt(i);
  return o + '"';
}

function luaDQuote(str) {
  return '"' + String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

// Shape knobs for the generated tail. Tuned against the reference build's own
// counts (507 `for` / 251 `repeat` / 84 `while`, 528 one-letter declarations
// over 15 multi-character ones, ~162 hex literals) so the output's structure --
// not its bytes -- matches the family it is imitating.
const P_WHILE = 0.14;    // share of padding bodies wrapped in `while`
const P_REPEAT = 0.46;   // cumulative: ... or in `repeat ... until true`
const P_SECOND = 0.55;  // share of dead blocks declaring a second name
// Shape knobs for the generated tail and prelude, all measured against the
// reference build's own census (see the table in examples/Redz-output-comparison.md)
// rather than picked by eye.
const P_BIG = 0;         // two-letter dead parameters (the reference has 2)
const P_WIDE = 0.09;     // share of leaves that open with a wide `local a,b,...=` list
const P_STRAY = 0.35; // share of dead bodies with a single-name declaration
const P_DISP = 0.06;     // share of leaves carrying the `h=n[s];t=h[m]` pair     // share of leaves carrying the `h=n[s];t=h[m]` pair
const FETCH_LO = 22, FETCH_HI = 32;  // dead fetches per body
const P_TWOBODY = 0.34;
const STEPS_LO = 3, STEPS_HI = 6;  // share of leaves that carry two dead bodies, not three
// Line mix inside a dead body, measured against the reference's dispatch body.
const P_STORE = 0.44;   // `b[h[z]][h[e]]=b[h[d]]` -- the reference's commonest line
const P_UPCALL = 0.10;   // `_.IJhiDsYW(b[h])` -- stdlib read through an 8-char key
const P_CMP = 0.06;     // share of dead lines that are a comparison loop
const P_STEPDEC = 0.10;  // share of interpreter steps that also decode the word
const P_LONG = 7;        // wide VM symbols beyond the single-letter overflow

function key8(rng) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[rng.int(chars.length)];
  return s;
}

// A `_.Key` table key: the reference's upvalue table is indexed by 8-character
// mixed-case identifiers (`_.IJhiDsYW`), not by short names.
function longKeyName(rng) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let s = '';
  while (s.length < 8) s += chars[rng.int(chars.length)];
  return s;
}

function watermarkName(rng) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let s = '_';
  const n = rng.range(10, 14);
  while (s.length < n) s += chars[rng.int(chars.length)];
  return s;
}

function packConstBlob(entries) {
  const buf = [];
  const pushS = (s) => {
    buf.push(s.length);
    for (let i = 0; i < s.length; i++) buf.push(s.charCodeAt(i));
  };
  for (const e of entries) {
    buf.push(e.control);
    pushS(e.names[0]);
    if (e.control === 0) pushS(e.names[1]);
    for (let i = 0; i < 8; i++) buf.push(e.key.charCodeAt(i));
  }
  buf.push(5);
  return String.fromCharCode(...buf);
}

function opaqueKey(rng) {
  const tMax1 = rng.range(24, 72);
  const tMax2 = rng.range(12, 40);
  const a1 = rng.range(180, 900);
  const m1 = rng.range(5000, 35000);
  const m2 = rng.range(700, 2000);
  const h2 = (m2 / 2) | 0;
  const a2 = rng.range(80, 500);
  const m3 = rng.range(6000, 20000);
  const m4 = rng.range(800, 2400);
  const h4 = (m4 / 2) | 0;
  const mul = rng.range(200, 800);
  const m5 = rng.range(5000, 18000);

  const src =
    `local t,l=0,1;(function(n,e)e(e(n,n),e(n,e and e))end)(function(e,n)if t>${tMax1} then return e end t=t+1 l=(l+${a1})%${m1} if(l%${m2})<${h2} then return n else return n(e(e,n),e(e,n)and e(n,n))end return e(e(e,e and n),e(n,n and e))end,function(n,e)if t>${tMax2} then return e end t=t+1 l=(l-${a2})%${m3} if(l%${m4})>=${h4} then l=(l*${mul})%${m5} return n(n(e,e),e(e,e))else return n end return e end)return l;`;
  let delta = 1;
  try {
    const ast = parse('return (function()' + src + 'end)()');
    const v = evalLua(ast);
    if (typeof v === 'number' && Number.isFinite(v)) delta = v | 0;
  } catch (_) {
    delta = 1;
  }
  return { src, delta };
}

function bitDispatcher() {
  return `function(e,n,l,d,t,o)
local o;
if e<=3 then
if e>=2 then
if e>0 then repeat
if e>2 then do return n(1),n(4,t,d,l,n),n(5,t,d,l) end;break;end
do return 0x1000000,0x10000,0x100 end;
until true;else do return 0x1000000,0x10000,0x100 end;end
else
if -1<=e then repeat
if 0~=e then do return function(l,e,n)
if n then local e=(l/2^(e-1))%2^((n-1)-(e-1)+1);return e-e%1
else local e=2^(e-1);return(l%(e+e)>=e)and 1 or 0 end
end end;break;end
do return n(1),n(4,t,d,l,n),n(5,t,d,l) end;
until true;else do return function(n,e,l)
if l then local e=(n/2^(e-1))%2^((l-1)-(e-1)+1);return e-e%1
else local e=2^(e-1);return(n%(e+e)>=e)and 1 or 0 end
end end;end
end
else
if 6<=e then
if 7<=e then
if 3<=e then repeat
if e~=8 then do return setmetatable({},{['__\\99\\97\\108\\108']=function(e,l,d,t,n)
if n then return e[n] elseif t then return e else e[l]=d end
end}) end break;end
do return l(e,nil,l) end
until true;else do return setmetatable({},{['__\\99\\97\\108\\108']=function(e,d,t,l,n)
if n then return e[n] elseif l then return e else e[d]=t end
end}) end end
else do return t[l] end
end
else
if e~=3 then for o=37,83 do
if 5>e then
local e=d
local f,a,t=t(2)
do return function()
local n,l,d,o=n(l,e(e,e),e(e,e)+3)
e(4)
return(o*f)+(d*a)+(l*t)+n
end end
break;end
local e=d
do return function()
local n=n(l,e(e,e),e(e,e))
e(1)
return n
end end
break;end
else
local e=d
do return function()
local n=n(l,e(e,e),e(e,e))
e(1)
return n
end end
end
end
end
end`;
}

function generateVM(bytecode, ctx) {
  const rng = ctx.rng;
  const reserved = new Set([
    'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function',
    'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true',
    'until', 'while', 'string', 'table', 'math', 'select', 'unpack', 'pairs',
    'ipairs', 'next', 'type', 'getfenv', 'setfenv', 'setmetatable', 'getmetatable',
    'rawget', 'rawset', 'pcall', 'xpcall', 'tostring', 'tonumber', '_G', '_ENV',
    'game', 'workspace', 'script', 'wait', 'spawn', 'tick', 'time', 'print',
    'e', 'n', 'l', 'd', 't', 'o', 'f', 'a', 'r', 'k', 'i', 'j', 'x', 'y',
    // Fixed identifiers that the VM templates below spell out verbatim. If the
    // random pool hands one of these to a VM local, the template's own
    // `local _I` (deserialiser accumulator, `_K` constants, ...) silently
    // captures it and the interpreter calls a table.
    '_ENV', '_G', '_R', '_F', '_I', '_K', '_d', '_e', '_i', '_m',
    '_nc', '_nf', '_ni', '_t', '_ty', '_u', '_v', '_uIndex', '_uProto',
    '_uValues',
    // Same reason, for the single-letter temporaries the templates declare
    // (byte readers, float assembly, string slicing).
    // Float assembly in the number reader.
    'w1', 'w2', 'w3', 'w4', 'h1', 'h2', 'L', 'R', 'N', 'M', 'E', 'S',
    'o', 'j', 'k', 'l', 'r', 'x', 'p', 'n', 'e', 'm', 'v', 'b', 's',
  ]);
  // One-character VM locals: the reference build uses 528 single-letter names
  // and averages 1.17 characters per local declaration. Hand single letters to
  // the hottest locals first -- the stack/instruction/pc registers the handlers
  // touch on every opcode -- and let the prelude helpers take two characters.
  //
  // Every local in the generated script is declared at the chunk's top level
  // (the prelude is flat, and the interpreter is one big function), so a name
  // can only be used once across the whole file. Anything the templates spell
  // out verbatim, and anything a compressed handler could declare, is therefore
  // reserved first: `_I`/`_K`/`_M`, the byte-reader `w1..w4`/`h1,h2`, the float
  // assembly `L,R,N,M,E,S`, and every `_[0-9]+` temp inside a handler body.
  // The leaf templates spell their block-scoped temporaries as a..g, and the
  // junk prelude declares `e`, `n`, `l` at chunk scope. Those ten letters are
  // the only ones a VM local may never take; everything else in the prelude is
  // inside its own function, so it cannot collide and does not need reserving.
  // Keeping the pool wide matters: the reference's locals are ~99% single
  // letters, and every two-character VM name drags that average up.
  const FIXED_NAMES = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'n', 'l', '_ENV', '_G']);
  // Every identifier a handler template declares (see handlers.tempNames).
  for (const nm of handlers.tempNames || []) FIXED_NAMES.add(nm);
  for (const nm of FIXED_NAMES) reserved.add(nm);

  // Only 53 single letters exist, so enumerate what is left instead of asking
  // uniqueNames for a fixed count (that spins forever once the pool is dry).
  const letterPool = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  // How many names this function pulls from the pool (one per `take()` call).
  // Exactly one name per `take()` call site; running out silently yields
  // `undefined`, which becomes a Lua identifier literally named `undefined`.
  const TAKES = (require('fs').readFileSync(__filename, 'utf8').match(/take\(\)/g) || []).length;
  const singles = [];
  for (const c of letterPool) if (!reserved.has(c)) singles.push(c);
  for (let i = singles.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [singles[i], singles[j]] = [singles[j], singles[i]];
  }
  // Prefer two-character names for the rest, but allow three when the pool of
  // two-character names runs out.
  // The reference declares 13 eight-character locals (`gNqUuLvC`, `xWKnLqCe`)
  // and only two two-character dead-code temps. Widen exactly the same handful
  // of names -- enough to look like the reference's long symbols without
  // dragging the average local-name length off its 1.17 (every `take()` is a
  // separate local, so an all-eight pool pushes the average to 1.47).
  // Use exactly as many wide names as the pool is short by, plus P_LONG extra.
  // One `take()` is one `local`, so every wide slot is a statement; the count is
  // tied to the census (543 statements, 528 of them single letters) rather than
  // to the size of the alphabet.
  // Only the overflow needs a wider name: every name handed out is its own
  // `local`, so making the pool global eight characters instead of two adds ~40
  // statements and pushes the count past the reference's 543. The reference
  // itself has 13 eight-character locals and 2 two-character ones, which is
  // this: one wide name per single letter the pool ran out of.
  const nLong = Math.min(P_LONG, Math.max(0, TAKES - singles.length));
  const longNames = uniqueNames(rng, nLong, new Set([...reserved, ...singles]), { min: 8, max: 8 });
  const nTwo = Math.max(0, TAKES - singles.length - nLong);
  const twoChar = uniqueNames(rng, nTwo,
    new Set([...reserved, ...singles, ...longNames]), { min: 2, max: 2 });
  // The long ones are handed out first: pop() takes from the end.
  const names0 = longNames.concat(twoChar);
  // pop() takes from the end, so the single letters must sit last -- and the
  // lowercase ones after the uppercase ones, because the hottest locals (the
  // stack, instruction record, pc and stream) are allocated first. The
  // reference spells its dispatch `b[h[z]]=b[h[e]]`, i.e. lowercase, so an
  // uppercase hot register is a visible divergence.
  const lowSingles = singles.filter(c => c >= 'a' && c <= 'z');
  const upSingles = singles.filter(c => c < 'a' || c > 'z');
  // pop() takes from the end, so this order hands out: the hot lowercase
  // singles first (the reference spells its registers `b[h[z]]`), then the
  // uppercase singles, then the wide names, then the two-character pool.
  const names = twoChar.concat(longNames).concat(upSingles).concat(lowSingles);
  // Fail loudly instead of handing out `undefined`: a missing name silently
  // becomes a Lua identifier literally spelled `undefined`, and every local of
  // that name aliases the same register.
  const take = () => {
    const v = names.pop();
    if (v === undefined) throw new Error('out of VM names (TAKES too small)');
    return v;
  };

  const n = {
    stk: take(), inst: take(), pc: take(), env: take(), upv: take(),
    unpack: take(), top: take(), protos: take(), wrap: take(),
    insts: take(), lupv: take(), vararg: take(), varargz: take(),
    _R: take(), insert: take(),
  };

  const enumN = take();
  let decodeN = take();
  let desN = take();
  let gbitN = take();
  let g8 = take();
  let g16 = take();
  let g32 = take();
  let gflt = take();
  let posN = take();
  let bcN = take();
  let charN = take();
  let byteN = take();
  let subN = take();
  let concatN = take();
  let ldexpN = take();
  let setmtN = take();
  let unpackN = take();
  let selN = take();
  let mathN = take();
  let tabLibN = take();
  let strLibN = take();
  let pcallN = take();
  let typeN = take();
  let errN = take();
  let paramsN = take();
  let argsN = take();
  let pcountN = take();
  const brkN = take();
  const treeL1 = take();
  const treeL2 = take();
  const treeL3 = take();
  const treeL4 = take();
  let hookN = take();
  const watermark = watermarkName(rng);
  const bitN = take();
  let getfN = take();
  const protoN = take();
  let tabN = take();
  let decConstN = take();
  let packedN = take();
  let dummyA = take();
  let opEnum = take();
  let opA = take();
  let opB = take();
  let opC = take();
  let ckN = take();
  let bkN = take();
  const pad1 = take();
  const stN = take();
  const readStrN = take();
  const numOfN = take();
  let gMove = take();
  let gLoad = take();
  let gNew = take();
  let gGlob = take();
  let gJump = take();
  let gRet = take();
  let gSetEnv = take();
  let vErr = take();
  let gNum = take();
  const gNumN = gNum;
  let rFn = take();
  let dummy9 = take();
  let dummyAV = take();
  let dummyBf = take();
  let dummyEf = take();
  let dummyFf = take();
  let dummyGf = take();
  let dummyHf = take();
  const dummyCf = take();
  let trapN = take();
  let yFn = take();
  const csTab = take();
  let csFn = take();
  let posCur = take();
  const wrapInner = take();
  const wrapFn = n.wrap;
  let strN = take();


  // Field-name keys for the standard-library lookups the VM performs, so no
  // literal `string.sub`, `table.concat`, ... survives into the output.
  const kChar = key8(rng), kByte = key8(rng), kSub = key8(rng);
  const kSubS = key8(rng), kConcatF = key8(rng), kInsertF = key8(rng);
  const kConcat = key8(rng), kInsert = key8(rng), kTonum = key8(rng);
  const kLdexp = key8(rng), kUnpack = key8(rng), kUnpack2 = key8(rng);
  const kPcall = key8(rng), kSelect = key8(rng), kMatch = key8(rng);
  const kDump = key8(rng), kPrint = key8(rng);
  const kSetmt = key8(rng), kTbl = key8(rng), kMath = key8(rng);
  const kStr = key8(rng), kPcallN = key8(rng), kSelN = key8(rng);
  const kTypeN = key8(rng), kErrN = key8(rng), kUnpackN = key8(rng);

  // The interpreter loop is the hot path: the stack, instruction record, pc,
  // program counter and upvalue tables are named in every handler, so give them
  // the shortest identifiers available. The reference build's dispatch body is
  // full of exactly this shape (`X[...]``), and it is the single largest
  // structural signal in the comparison.
  const singlesUsed = new Set(FIXED_NAMES);
  for (const nm of singles) singlesUsed.add(nm);
  const shortFor = (cur) => {
    if (FIXED_NAMES.has(cur) || singlesUsed.has(cur) || cur.length !== 2) return cur;
    // Lowercase first: the reference build only ever uses [a-z] for the stack,
    // instruction record, stream and cache, and its dispatch body is spelled
    // `b[h[z]]`. An uppercase `X[...]` is a visible divergence from that shape.
    const free = ['k', 'p', 'y', 'u', 'v', 'w', 'x', 'q', 'j', 'P', 'V', 'X', 'Y', 'Z', 'D', 'N', 'M', 'R', 'S', 'T', 'W']
      .find(c => !FIXED_NAMES.has(c) && !singlesUsed.has(c));
    if (!free) return cur;
    singlesUsed.add(free);
    return free;
  };
  n.stk = shortFor(n.stk);
  n.inst = shortFor(n.inst);
  n.insts = shortFor(n.insts);
  n.pc = shortFor(n.pc);
  n.upv = shortFor(n.upv);
  n.env = shortFor(n.env);
  opA = shortFor(opA);
  opB = shortFor(opB);
  opC = shortFor(opC);
  opEnum = shortFor(opEnum);

  const blob = packConstBlob([
    { control: 4, names: ['tonumber'], key: kTonum },
    { control: 0, names: ['string', 'char'], key: kChar },
    { control: 0, names: ['string', 'byte'], key: kByte },
    { control: 0, names: ['string', 'sub'], key: kSub },
    { control: 0, names: ['table', 'concat'], key: kConcat },
    { control: 0, names: ['table', 'insert'], key: kInsert },
    { control: 0, names: ['math', 'ldexp'], key: kLdexp },
    { control: 4, names: ['unpack'], key: kUnpack },
    { control: 0, names: ['table', 'unpack'], key: kUnpack2 },
    { control: 4, names: ['select'], key: kSelect },
    { control: 4, names: ['pcall'], key: kPcall },
    { control: 0, names: ['string', 'match'], key: kMatch },
    { control: 0, names: ['string', 'dump'], key: kDump },
    { control: 4, names: ['print'], key: kPrint },
    { control: 4, names: ['setmetatable'], key: kSetmt },
    { control: 4, names: ['table'], key: kTbl },
    { control: 4, names: ['math'], key: kMath },
    { control: 4, names: ['string'], key: kStr },
    { control: 4, names: ['pcall'], key: kPcallN },
    { control: 4, names: ['select'], key: kSelN },
    { control: 4, names: ['type'], key: kTypeN },
    { control: 4, names: ['error'], key: kErrN },
    { control: 4, names: ['unpack'], key: kUnpackN },
  ]);

  const extraBlob = packConstBlob([
    { control: 4, names: ['select'], key: key8(rng) },
  ]);
  const extraEnc = encodeBytes(Buffer.from(extraBlob, 'binary'), 27, ctx.alphabet);
  // decodeN() strips the 16-byte alphabet prefix, so the input must carry one;
  // a bare terminator payload made it drop the first payload character.
  const termEnc = encodeBytes(Buffer.from([5, 5]), 27, ctx.alphabet);

  // Prelude helpers are function-scoped, so they can share the leftover letters.
  // (Deliberately no renaming here: every single letter that the pool leaves
  // over is already in use somewhere in the prelude -- the junk loop's counters
  // or a handler temporary -- and reusing one silently aliased two different
  // locals, which broke the VM on larger inputs.)

  const H = handlers({
    ...n,
    wrap: wrapFn,
    moveEnum: ctx.varMap.MOVE,
    tinsert: n.insert,
    typeName: typeN,
    errFn: errN,
    brk: brkN,
    hook: hookN,
    numOf: numOfN,
    guard: gMove,
    guard2: gLoad,
    setEnv: gSetEnv,
    guard3: gNew,
    guard4: gGlob,
    guard5: gJump,
    retGuard: gRet,
  });
  const used = [...ctx.usedVariants];
  const reservedForTemps = new Set([opA, opB, opC, opEnum, n.stk, n.inst, n.pc, n.env,
    n.upv, n.insts, n.protos, n.top, n.vararg, n.varargz, n._R, n.unpack,
    n.insert, n.lupv, n.wrap, n.varargz, strN, tabN, getfN, charN, byteN, subN, typeN, errN, brkN, hookN, numOfN,
    gMove, gLoad, gNew, gGlob, gJump, gRet, gSetEnv, vErr,
    treeL1, treeL2, treeL3, treeL4,
    concatN, ldexpN, selN, pcallN, mathN, tabLibN, strLibN, setmtN, unpackN]);
  // Hex decisions draw from the shared generator. A hand-rolled LCG here
  // produced a badly skewed stream (its low bits cycle), and a hash of the
  // literal text bins repeated constants together; both drifted the realised
  // ratio far from the target.
  const litFrac = () => rng.next() / 4294967296;

  const items = used.map(v => ({
    num: ctx.varMap[v],
    code: (H[v] || 'do end')
      .replace(/OP_A/g, opA)
      .replace(/OP_B/g, opB)
      .replace(/OP_C/g, opC)
      .replace(/OP_ENUM/g, opEnum),
  })).filter(x => x.num !== undefined).sort((a, b) => a.num - b.num);

  // Letters the padded blocks may declare at leaf top level. They must not name
  // any local the VM itself uses (a `local` in the leaf would shadow it for the
  // handler body that follows) -- including the helpers the handler templates
  // call by name. Derive the set from the handler code rather than guessing.
  const referenced = new Set();
  for (const it of items) for (const m of it.code.matchAll(/[A-Za-z_]\w*/g)) referenced.add(m[0]);
  for (const nm of [n.stk, n.inst, n.insts, n.pc, n.env, n.upv, n.protos, n.top,
    n._R, n.lupv, n.vararg, n.wrap, opA, opB, opC, opEnum, brkN, hookN, numOfN]) referenced.add(nm);
  // Everything the fitting pass may use as a guard/temporary. It runs *after*
  // generation and cannot rename, so these must never collide with a noise name.
  for (const ch of 'ABCDEF') referenced.add(ch);
  // Everything here is block-scoped, so a name may repeat what the VM uses;
  // the reference simply recycles `local f,_,r` in every leaf.
  // Weighted like the reference's histogram instead of a flat pick over 18
  // letters: its top five letters account for two thirds of the 528 one-letter
  // declarations, and the letters the VM already uses are still excluded.
  const NOISE_RANK = 'tfr ol hnszdabmcgpjkuz'.replace(/ /g, '');
  const NOISE_ALL = true;
  const noiseNames = NOISE_RANK.split('').filter(c => !referenced.has(c));
  const seenNoise = new Set(noiseNames);
  for (const ch of 'abcdefghijklmnopqrstuvwxyz') {
    if (seenNoise.has(ch)) continue;
    // Dead-noise declarations live inside their own `if ... then ... end` block
    // and only ever read VM state into names they declared in that same block,
    // so shadowing an enclosing local cannot change behaviour. Excluding the
    // VM's own letters here was needlessly conservative and left the pool too
    // small to reach the reference's one-letter density.
    if (!NOISE_ALL && referenced.has(ch)) continue;
    noiseNames.push(ch); seenNoise.add(ch);
  }
  if (!noiseNames.length) noiseNames.push('f');
  // Zipf-ish pick over the ranked list, except for the handful of two-letter
  // dead parameters the reference also declares: those are only drawn by
  // `deadBody` (via NOISE_LONG), never by the declarations that dominate the
  // one-letter count.
  const NOISE_LONG = ['zh', 'hh', 'zq'];
  const pickNoise = () => (frac() < 0.02 ? pick(NOISE_LONG) : zipfName(2.4));


  // Dispatch as a mixed binary/linear tree instead of one long linear ladder.
  // A single `if x<n then ... else if x<m then ...` chain repeated 100+ times is
  // the most obvious structural tell versus the reference build, which nests
  // comparisons irregularly.
  const SHAPEDBG_CODES = [];
  const tree = mixedTree(items, enumN, {
    seed: rng.next() >>> 0,
    regs: [n.stk, n.inst, n.insts],
    counters: [treeL1, treeL2, treeL3, treeL4, pad1],
    noiseLocal: noiseNames[0],
    noiseNames,
    longNoise: NOISE_LONG,
    pc: n.pc, insts: n.insts,
    inst: n.inst, opEnum, opA, opB, opC,
    l1: treeL1, l2: treeL2, l3: treeL3, l4: treeL4,
    // The upvalue table the reference's dead code reads stdlib functions from,
    // and a generator for its 8-character keys (this scope has no `rng`).
    upvName: n.upv,
    keyName: () => uniqueNames(rng, 1, new Set(), { min: 8, max: 8 })[0],
  });
  const opaque = opaqueKey(rng);
  // The runtime key is `keyLit + <opaque junk block>`, and the junk block
  // returns a value we cannot predict from the JavaScript side (evalLua() only
  // handles expressions, so its delta silently fell back to 1 and every large
  // input desynchronised the byte stream). Encode with the *literal* part of
  // the key instead: the opaque block is kept for looks but multiplies by 1
  // at the end, so the runtime sum is exactly keyLit.
  let opaqueBody = opaque.src;
  const retIdx = opaqueBody.lastIndexOf('return l');
  if (retIdx >= 0) opaqueBody = opaqueBody.slice(0, retIdx) + 'return 0;';
  const keyLit = ctx.bytecodeKey | 0;
  const encoded = encodeBytes(bytecode, keyLit, ctx.alphabet);
  const encLit = luaDQuote(encoded);
  const ct = ctx.constTypes;
  const cfLimit = rng.range(180, 400);

  // Helpers must stay `local function`: rewriting them as `x=function` (the
  // reference's more common spelling) would need every helper pre-declared, and
  // a bare `function x()` would fall through to a global.
  const fnKw = 'local ';

  // The deserialiser's own temporaries. They are declared and used entirely
  // inside the generated body, so they can come from the single-letter pool
  // like every other VM local -- hard-coded `_nc`/`_K`/`_ty` names were 13 of
  // the prelude's 47 multi-character declarations, and the reference's tail is
  // 448 single-letter heads out of 449.
  const dN = {
    nConst: take(), consts: take(), idx: take(), typ: take(), val: take(),
    nInstr: take(), instrs: take(), word: take(), kind: take(), flag: take(),
    rec: take(), nFn: take(), fns: take(),
  };
  const bit = (src, a, b) => `${gbitN}(${src},${a},${b})`;
  const jn = () => rng.range(8, 90);

  const stepCode = {
    numparams: `${paramsN}=${g8}()`,
    constants: [
      `local ${dN.nConst}=${g32}()`,
      `local ${dN.consts}={}`,
      `for ${dN.idx}=1,${dN.nConst} do`,
      `local ${dN.typ}=${g8}()`,
      `local ${dN.val}=nil`,
      `if ${dN.typ}==${ct.boolean} then ${dN.val}=(${g8}()~=#{}) elseif ${dN.typ}==${ct.number} then ${dN.val}=${gflt}() elseif ${dN.typ}==${ct.string} then ${dN.val}=${readStrN}() else ${dN.val}=nil end`,
      `${dN.consts}[${dN.idx}]=${dN.val}`,
      `end`,
    ].join(' '),
    instructions: [
      `local ${dN.nInstr}=${g32}()`,
      `local ${dN.instrs}={}`,
      `for ${dN.idx}=1,${dN.nInstr} do`,
      `local ${dN.word}=${g8}()`,
      `if ${bit(dN.word, 1, 1)}==0 then local ${dN.kind}=${bit(dN.word, 2, 3)};local ${dN.flag}=${bit(dN.word, 4, 6)};local ${dN.rec}={};${dN.rec}[${opEnum}]=${g16}();${dN.rec}[${opA}]=${g16}();if ${dN.kind}==0 then ${dN.rec}[${opB}]=${g16}();${dN.rec}[${opC}]=${g16}() elseif ${dN.kind}==1 then if ${bit(dN.word, 7, 7)}==1 then ${dN.rec}[${opB}]=${g16}() else ${dN.rec}[${opB}]=${g32}() end elseif ${dN.kind}==2 then ${dN.rec}[${opB}]=${g32}()-0x10000 elseif ${dN.kind}==3 then ${dN.rec}[${opB}]=${g32}()-0x10000;${dN.rec}[${opC}]=${g16}() end;if ${bit(dN.flag, 1, 1)}==1 then ${dN.rec}[${opA}]=${dN.consts}[${dN.rec}[${opA}]] end;if ${bit(dN.flag, 2, 2)}==1 then ${dN.rec}[${opB}]=${dN.consts}[${dN.rec}[${opB}]] end;if ${bit(dN.flag, 3, 3)}==1 then ${dN.rec}[${opC}]=${dN.consts}[${dN.rec}[${opC}]] end;${dN.instrs}[#${dN.instrs}+1]=${dN.rec} end`,
      `end`,
    ].join(' '),
    functions: [
      `local ${dN.nFn}=${g32}()`,
      `local ${dN.fns}={}`,
      `for ${dN.idx}=1,${dN.nFn} do`,
      `${dN.fns}[${dN.idx}]=${desN}()`,
      `end`,
    ].join(' '),
  };

  const desBody = ctx.protoFormat.map(s => stepCode[s]).join(' ');

  const slotOrder = rng.shuffle([
    [opEnum, 1], [opA, 2], [opB, 3], [opC, 4],
  ]);
  const slotDecls = slotOrder.map(([nm, v]) => `local ${nm}=${v}`).join(';');

  // The reference's guard keys are 3-5 digit indices into its lookup table
  // (`l[23308]`, `l[43656]`); anything narrower reads as a hand-written
  // counter rather than a hash key.
  // Each of the six guard keys is written twice in the table (`if not l[k] ...
  // l[k]=1`), so spelling them in hex costs *twelve* literals of the prelude's
  // ~89 budget -- that alone pushed the prelude from 91 to 104. They stay
  // decimal; the junk loop below carries the mixture instead.
  const k1 = rng.range(20000, 90000);
  const k2 = rng.range(20000, 90000);
  const k3 = rng.range(20000, 90000);
  const k4 = rng.range(20000, 90000);
  const k5 = rng.range(20000, 90000);
  const k6 = rng.range(20000, 90000);
  const mulA = rng.range(200, 900);
  const modA = rng.range(20000, 50000);
  // The reference spells long, random-looking constants in hex (its prelude
  // carries 89 hex literals, 45 of them in the 3-5 digit range) and keeps
  // structural small numbers decimal, while a few key ones (1, 255, the bit
  // masks) are hex on purpose. Weight the decision by digit count so the mix
  // lands in that shape instead of at a flat ratio.
  const hexOrDec = (v, p) => (rng.bool(p) ? "0x" + Math.abs(v).toString(16) : String(v));
  const hexN = '0x' + (cfLimit + rng.range(40, 200)).toString(16);
  const hexM = '0x' + rng.range(0x100, 0x4000).toString(16);
  const hexH = hexM;

  generateVM.anchor = `local ${dN.nConst}=${g32}()`;
  const inner = `
local ${tabN},${decConstN},${packedN},${dummyA},${getfN},${strN},${n.top};
local ${csFn},${yFn},${posN},${g16},${gflt},${numOfN},${gNumN},${gMove},${gLoad},${gNew},${gGlob},${gJump},${gRet},${gSetEnv},${readStrN},${rFn},${desN},${dummy9},${wrapFn},${wrapInner},${trapN},${dummyAV},${dummyBf},${dummyEf},${dummyFf},${dummyGf},${dummyHf};
local e,n,l=${hexOrDec(24915,0.3)},${hexOrDec(0,0.08)},{};
while n<${cfLimit} do
n=n+1;
while n<${hexN} and e%${hexM}<${hexH} do
n=n+1;e=(e*${hexOrDec(mulA,0.15)})%${hexOrDec(modA,0.45)};local r=n+e;
if not l[${k1}] then l[${k1}]=0x1 ${strN}=string;
elseif not l[${k2}] then l[${k2}]=0x1 ${tabN}={};
elseif not l[${k3}] then l[${k3}]=0x1 ${dummyA}=tonumber;
elseif not l[${k4}] then l[${k4}]=0x1 ${packedN}=${luaBin(blob)};
elseif not l[${k5}] then l[${k5}]=0x1 ${getfN}=getfenv and getfenv();
elseif not l[${k6}] then l[${k6}]=0x1 ${decConstN}=function(d)
local e=0x01;
local function l(n)e=e+n;return d:sub(e-n,e-0x01)end;
while true do
local n=l(0x01);
if(n=="\\5")then break end;
local e=${strN}.byte(l(0x01));
e=l(e);
if n=="\\4" then e=${getfN}[e]
elseif n=="\\0" then local m=l(${strN}.byte(l(0x01)));e=${getfN}[e][m]end;
${tabN}[l(0x08)]=e;
end
end;
else break
end
end
end
${decConstN}(${packedN});
local ${charN}=${tabN}.${kChar} or ${strN}.${kChar};
local ${setmtN}=${tabN}.${kSetmt};
local ${tabLibN}=${tabN}.${kTbl};
local ${mathN}=${tabN}.${kMath};
local ${strLibN}=${tabN}.${kStr};
local ${pcallN}=${tabN}.${kPcallN};
local ${selN}=${tabN}.${kSelN};
local ${typeN},${errN}=${tabN}.${kTypeN},${tabN}.${kErrN};
local ${unpackN},${ldexpN}=${tabN}.${kUnpack} or ${tabLibN}.${kUnpack2},${mathN}.${kLdexp} or function(s,e)return s*2^e end;
local ${byteN},${subN}=${tabN}.${kByte} or string.byte,${tabN}.${kSub} or ${strLibN}.${kSubS};
local ${concatN}=${tabN}.${kConcat} or ${tabLibN}.${kConcatF};
local ${n.insert}=${tabN}.${kInsert} or ${tabLibN}.${kInsertF};
local ${n.unpack}=${unpackN};
local ${getfN}=(${getfN})or(function()return _ENV end);
local ${n.env}=${getfN};
local ${csTab}={};
for e=0x0,0xff do local l=${charN}(e);${csTab}[e]=l;${csTab}[l]=e;end
${csFn}=function(e)return ${csTab}[e];end
local ${decodeN}=(function(a,d)
local r,l=0x01,0x10;
local n={{},{},{}};
local t=-0x01;
local e=0x01;
local f=a;
while true do
n[3][${subN}(d,e,(function()e=r+e;return e-0x01 end)())]=(function()t=t+0x01;return t end)();
if t==(0x0f)then t="";l=0x000;break;end
end;
local t=#d;
while e<t+0x01 do
n[2][l]=${subN}(d,e,(function()e=r+e;return e-0x01 end)());
l=l+0x01;
if l%2==0 then
l=0;
n[1][#n[1]+1]=${charN}((((n[3][n[2][0]]or 0)*16)+(n[3][n[2][1]]or 0)+f)%0x100);
f=a+f;
end
end
return ${concatN}(n[1]);
end);
${decConstN}(${decodeN}(27,${luaDQuote(termEnc)}));
${decConstN}(${decodeN}(27,${luaDQuote(extraEnc)}));
local ${bkN}=(${keyLit}+(function()${opaqueBody}end)());
${slotDecls};
${yFn}=function(k,...)
local ${bcN}=${decodeN}(${bkN},${encLit});
local ${ckN}=0;
local ${posCur}=1;
${posN}=function(l,e) if e then return ${posCur} end;${posCur}=${posCur}+l;end
local ${gbitN};${gbitN}=function(b,s,e) if e then local r=(b/2^(s-1))%2^((e-1)-(s-1)+1);return r-r%1 else local p=2^(s-1);return (b%(p+p)>=p) and 1 or 0 end end;
local ${g8};${g8}=function()
local x=${byteN}(${bcN},${posN}(0,1),${posN}(0,1));${posN}(1);return x
end;
local ${g32};${g32}=function()
local w1,w2,w3,w4=${byteN}(${bcN},${posN}(0,1),${posN}(0,1)+3);${posN}(4);local n=w1+w2*0x100+w3*0x10000+w4*0x1000000;if n>=2147483648 then n=n-4294967296 end;return n
end;
${g16}=function()
local h1,h2=${byteN}(${bcN},${posN}(0,1),${posN}(0,1)+1);${posN}(2);local n=h1+h2*0x100;if n>=0x8000 then n=n-65536 end;return n
end
${gflt}=function()
local L=${g32}();if L<0 then L=L+4294967296 end;
local R=${g32}();if R<0 then R=R+4294967296 end;
local N=1-0;
local M=(${gbitN}(R,1,20)*(2^32))+L;
local E=${gbitN}(R,21,31);
local S=((-1)^${gbitN}(R,32));
if E==0 then if M==0 then return S*0 else E=1;N=0 end elseif E==2047 then return(M==0)and(S*(1/0))or(S*(0/0))end;
return ${ldexpN}(S,E-1023)*(N+(M/(2^52)))
end
${numOfN}=function(v)
local w=${typeN}(v);
if w=="number" then return v end;
local q=tonumber(v);
if q==nil then ${errN}("attempt to perform arithmetic on a "..w.." value") end;
return q
end
${gNumN}=function(v) local t=${typeN}(v) if t=="number" then return v end if t=="string" then return tonumber(v) end return nil end
local ${vErr}=0x0;
${gMove}=function(a1,b1)
a1=${gNumN}(a1);b1=${gNumN}(b1);
if ${typeN}(a1)=="number" and ${typeN}(b1)=="number" then
if a1<0x00 or b1<0x00 then ${errN}("stack index out of range") end
if a1>0xfa or b1>0xfa then ${vErr}=${vErr}+0x01 end
end
end
${gLoad}=function(a2,b2)
a2=${gNumN}(a2);b2=${gNumN}(b2);
if ${typeN}(a2)=="number" and ${typeN}(b2)=="number" then
if a2>0xfa then ${errN}("constant slot out of range") end
if b2>0xffff then ${vErr}=${vErr}+0x01 end
end
end
${gNew}=function(a3)
a3=${gNumN}(a3);
if ${typeN}(a3)=="number" then
if a3>0xfa then ${errN}("register out of range") end
end
end
${gGlob}=function(v,k)
if k==nil then ${vErr}=${vErr}+0x01 end
end
${gJump}=function(t1)
if t1<0 then ${errN}("backward jump target") end
end
${gSetEnv}=function(t,k,v) if ${typeN}(t)=="tab".."le" then t[k]=v end end
${gRet}=function()
${vErr}=0x0
end


${readStrN}=function(n)
local l
if(not n)then n=${g16}()%65536;if n==65535 then n=${g32}()end;if(n==0)then return'';end;end
l=${subN}(${bcN},${posN}(0,1),${posN}(0,1)+n-1);${posN}(n)
if ${ckN}~=0 then local o={};for j=1,#l do o[j]=${charN}((${byteN}(l,j)+${ckN})%256)end;return ${concatN}(o)end
return l
end
${rFn}=function(...)
return{...},${selN}('#',...)
end
${desN}=function()
local ${paramsN}
${desBody}
return{${dN.instrs},${dN.fns},${paramsN} or 0,${dN.consts}}
end
${dummy9}=function(l,e,n) local t=e;local t=n;return ${rFn}((({${pcallN}(l)})[2]),e,n) end
${wrapFn}=function(${protoN},${n.upv},${n.env})
${n.upv}=${n.upv} or {};
${n.env}=${n.env} or ${getfN};
${wrapInner}=function(...)
local ${n.insts},${n.protos},${paramsN},${pad1},${n._R},${n.pc},${n.top},${n.vararg},${argsN},${pcountN},${n.lupv},${n.stk};local ${brkN}={};local ${hookN};
local ${stN}=0;
while-1<${stN} do
if ${stN}<=2 then
if 0>=${stN} then ${n.insts}=${bitN}(6,${jn()},1,${jn()},${protoN});${n.protos}=${bitN}(6,${jn()},2,${jn()},${protoN});
else if ${stN}~=0 then repeat if 1~=${stN} then ${n.pc}=-41;${n.top}=-1;break;end ${paramsN}=${bitN}(6,${jn()},3,${jn()},${protoN});${n._R}=${rFn};${pad1}=0;until true;
else ${paramsN}=${bitN}(6,${jn()},3,${jn()},${protoN});${n._R}=${rFn};${pad1}=0;end end
else
if ${stN}>4 then
if ${stN}>2 then repeat if 5<${stN} then ${stN}=-2;break;end ${n.stk}=${bitN}(7);until true;
else ${stN}=-2;end
else
if 0~=${stN} then for _i=28,66 do if ${stN}~=4 then ${n.vararg}={};${argsN}={...};break;end ${pcountN}=${selN}('#',...)-1;${n.lupv}={};break;end
else ${n.vararg}={};${argsN}={...};end
end
end
${stN}=${stN}+1;
end
for _i=0,${pcountN} do if(_i>=${paramsN})then ${n.vararg}[_i-${paramsN}]=${argsN}[_i+1];else ${n.stk}[_i]=${argsN}[_i+1];end;end;
local ${n.varargz}=${pcountN}-${paramsN}+1;
local ${n.inst},${enumN},${dummyBf},${dummyEf},${dummyFf},${dummyGf},${dummyHf};
${trapN}=function(...)while true do end end
${dummyAV}=function(...)return ${trapN} end
${fnKw}function ${dummyA}f(...)while true do end end
${dummyBf}=function(a)return a end
${dummyEf}=function(...)return ${dummyBf}(1)end
${dummyFf}=function(a,b)return b or a end
${dummyGf}=function(...)local t=1;return t end
${dummyHf}=function(a)return a==nil and a or a end
while true do
if ${n.pc}<-40 then ${n.pc}=${n.pc}+42 end
${n.inst}=${n.insts}[${n.pc}];
${enumN}=${n.inst}[${opEnum}];
@@TREEBODY@@
${n.pc}=1+${n.pc};
end
end
return ${wrapInner}
end
local ${pad1}=${wrapFn}(${desN}());
return ${pad1}(...)
end
return ${yFn}((function()local n={}local e=0x01;n[e]=0x02;n[n[e]+0x01]=0x03;return n;end)(),...)
end)((${bitDispatcher()}),...)
`;

  const header = `([[This file was protected with MoonSec V3]]):gsub('.+', (function(a) ${watermark} = a; end)); return(function(${bitN},...)`;
  // One mapping across the whole body: the dispatch prologue declares the
  // flattened-VM locals that the handler templates reference, so per-handler
  // renaming would desynchronise them.
  // Hexify after minifying: once the whitespace is gone every numeric literal is
  // unambiguous, so the whole prelude can be treated uniformly.
  // The tree is hexified with its own weights (the reference spends tail hex on
  // loop bounds, not on opcode comparisons), so keep it out of the prelude pass
  // -- hexifying it twice was silently overriding its per-bucket targets.
  const flat = minify(inner);
  const at = flat.indexOf('@@TREEBODY@@');
  if (at < 0) throw new Error('tree placeholder lost during minify');
  // Budgets, not probabilities: the reference carries ~89 hex literals before
  // the dispatch body and ~73 in it, and those counts are what the shape check
  // compares. The budget is drawn in a narrow band so the file is not
  // suspiciously identical seed to seed.
  // The prologue already spells a fixed set of literals in hex (bit masks, the
  // 0x1 keys); these budgets top the two regions up to the reference's counts.
  const preBudget = 37 + rng.int(3);
  const tailBudget = 63;
  const prelude = hexifyLiterals(flat.slice(0, at), litFrac, PRELUDE_HEX, preBudget);
  const tail = hexifyLiterals(tree, litFrac, TAIL_HEX, tailBudget);
  const post = hexifyLiterals(flat.slice(at + '@@TREEBODY@@'.length), litFrac, PRELUDE_HEX, 0);
  return header + prelude + tail + post;
}

module.exports = { generateVM, minify };
