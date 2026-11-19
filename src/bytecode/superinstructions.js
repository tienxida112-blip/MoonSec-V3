'use strict';

const { OpCode: O } = require('./opcodes');

// A superinstruction dispatches several existing records in one handler. The
// records stay in the stream, so absolute jumps and CLOSURE descriptors retain
// their addresses. Only the first record gets a different dispatch number.
const BRANCH = new Set([O.JMP, O.TEST, O.TESTSET, O.EQ, O.LT, O.LE,
  O.FORPREP, O.FORLOOP, O.TFORLOOP, O.RETURN, O.TAILCALL, O.CLOSURE]);

function stops(ins) {
  return BRANCH.has(ins.op) || (ins.op === O.LOADBOOL && ins.c !== 0);
}

function leadersOf(proto) {
  const code = proto.instructions, leaders = new Set([0]);
  const add = p => { if (p >= 0 && p < code.length) leaders.add(p); };
  for (let i = 0; i < code.length; i++) {
    const x = code[i];
    if (x.fusedCmp || x.fusedBranch) add(x.b);
    if (x.op === O.JMP || x.op === O.FORLOOP) add(i + 1 + x.b);
    if (x.op === O.FORPREP) { add(i + 1 + x.b); add(i + 2 + x.b); }
    if (stops(x)) add(i + 1);
    if ([O.EQ, O.LT, O.LE, O.TEST, O.TESTSET, O.TFORLOOP].includes(x.op) ||
        (x.op === O.LOADBOOL && x.c !== 0)) add(i + 2);
    if (x.op === O.CLOSURE) add(i + x.c + 1);
    if (x.upval) { add(i); add(i + 1); }
  }
  return leaders;
}

function fuseSequences(proto, rng) {
  const functions = [];
  (function walk(p) { functions.push(p); p.functions.forEach(walk); })(proto);
  const total = functions.reduce((n, p) => n + p.instructions.length, 0);
  const maxKinds = Math.min(20, Math.max(1, Math.floor(Math.sqrt(total) / 2)));
  const candidates = new Map();
  const blocks = functions.map(p => ({ p, leaders: leadersOf(p) }));
  for (const { p, leaders } of blocks) {
    const code = p.instructions;
    for (let i = 0; i < code.length; i++) {
      if (code[i].upval || code[i].op === O.CLOSURE || stops(code[i])) continue;
      const variants = [];
      for (let j = i; j < Math.min(code.length, i + 5); j++) {
        const x = code[j];
        if (x.upval || x.op === O.CLOSURE || (j > i && leaders.has(j))) break;
        variants.push(x.variant);
        if (variants.length >= 2) {
          const key = 'S:' + variants.join('/');
          if (!candidates.has(key)) candidates.set(key, { key, variants: variants.slice(), sites: [], tie: rng.next() });
          candidates.get(key).sites.push({ p, start: i });
        }
        if (stops(x)) break;
      }
    }
  }

  const selected = {}, claimed = new Map(functions.map(p => [p, new Set()]));
  const available = c => c.sites.filter(({ p, start }) => {
    const used = claimed.get(p);
    return c.variants.every((_, j) => !used.has(start + j));
  });
  // Prefer sequences that actually recur. Single-use sequences are only useful
  // when their component variants are otherwise unique (small straight-line
  // chunks); this avoids manufacturing a large library of duplicated bodies.
  const frequencies = new Map();
  for (const p of functions) for (const x of p.instructions) {
    if (!x.upval) frequencies.set(x.variant, (frequencies.get(x.variant) || 0) + 1);
  }
  for (let count = 0; count < maxKinds; count++) {
    let best, bestSites, bestScore = 0;
    for (const c of candidates.values()) {
      const sites = available(c);
      if (!sites.length) continue;
      const localUsed = new Map(), nonOverlapping = [];
      for (const site of sites) {
        if (!localUsed.has(site.p)) localUsed.set(site.p, new Set());
        const used = localUsed.get(site.p);
        if (c.variants.some((_, j) => used.has(site.start + j))) continue;
        nonOverlapping.push(site);
        c.variants.forEach((_, j) => used.add(site.start + j));
      }
      const n = nonOverlapping.length, width = c.variants.length;
      if (n === 1 && c.variants.some(v => frequencies.get(v) > 1)) continue;
      // A duplicated handler costs space. Require at least three eliminated
      // dispatches, except for a wholly unique straight-line chunk.
      const score = n === 1 ? width - 1 : (n - 1) * (width - 1) - 1;
      if (score > bestScore || (score > 0 && score === bestScore && c.tie < best.tie)) {
        best = c; bestSites = nonOverlapping; bestScore = score;
      }
    }
    if (!best) break;
    selected[best.key] = best.variants;
    for (const { p, start } of bestSites) {
      p.instructions[start].dispatchVariant = best.key;
      best.variants.forEach((_, j) => {
        claimed.get(p).add(start + j);
        if (j) p.instructions[start + j].superMember = true;
      });
    }
    candidates.delete(best.key);
  }
  return selected;
}

function dispatchVariants(proto, result = new Set()) {
  for (const x of proto.instructions) {
    if (!x.upval && !x.superMember) result.add(x.opcodeVariant || x.dispatchVariant || x.variant);
  }
  proto.functions.forEach(p => dispatchVariants(p, result));
  return result;
}

module.exports = { fuseSequences, dispatchVariants, leadersOf };
