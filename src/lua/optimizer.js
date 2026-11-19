'use strict';

const { OpCode: O, RKASK } = require('../bytecode/opcodes');

// Conservative dead-register-write pass. Only side-effect-free register writes
// (MOVE / LOADK / LOADBOOL / LOADNIL) are candidates for removal.
function optimizeProto(root) {
  let removed = 0;

  function compact(proto, remove) {
    const old = proto.instructions;
    const map = new Array(old.length + 1);
    let next = 0;
    for (let i = 0; i < old.length; i++) {
      map[i] = next;
      if (!remove.has(i)) next++;
    }
    map[old.length] = next;

    for (let i = 0; i < old.length; i++) {
      const ins = old[i];
      if (remove.has(i)) continue;
      // LOADBOOL's C bit skips the next physical instruction. If that slot is
      // removed, clear the skip bit so execution still reaches the same next
      // surviving instruction after compaction.
      if (ins.op === O.LOADBOOL && (ins.c | 0) !== 0 && remove.has(i + 1)) ins.c = 0;
      if (ins.op === O.JMP || ins.op === O.FORPREP || ins.op === O.FORLOOP) {
        const target = Math.max(0, Math.min(old.length, i + 1 + (ins.b | 0)));
        ins.b = map[target] - (map[i] + 1);
      }
    }

    proto.instructions = old.filter((_, i) => !remove.has(i));
    for (let i = 0; i < proto.instructions.length; i++) proto.instructions[i].pc = i;
    // Keep debug/local lifetime ranges aligned with the compacted instruction
    // stream. End positions are exclusive, so map them as instruction edges.
    for (const local of proto.locals || []) {
      if (Number.isInteger(local.startpc)) local.startpc = map[Math.max(0, Math.min(old.length, local.startpc))];
      if (Number.isInteger(local.endpc)) local.endpc = map[Math.max(0, Math.min(old.length, local.endpc))];
    }
  }

  function optimizeOne(proto) {
    const ins = proto.instructions;
    const n = ins.length;
    if (!n) return false;

    const maxReg = Math.max(2, proto.maxStack || 2);
    // Registers captured as upvalues are reachable from a closure for the rest
    // of the enclosing scope, so a write to one is never dead: the closure may
    // read it after the write. Without this, `local a,b; function F() return
    // b end; b = 5; print(F())` lost the `b = 5` store.
    const captured = new Set();
    for (const x of ins) if (x.upval && (x.a | 0) === 0) captured.add(x.b | 0);
    const uses = Array.from({ length: n }, () => new Set());
    const defs = Array.from({ length: n }, () => new Set());
    const successors = Array.from({ length: n }, () => []);
    const predecessors = Array.from({ length: n }, () => []);

    const addRange = (set, first, last) => {
      for (let r = Math.max(0, first | 0); r <= Math.min(maxReg - 1, last | 0); r++) set.add(r);
    };
    const useRK = (set, value) => {
      if ((value | 0) < RKASK) set.add(value | 0);
    };

    for (let i = 0; i < n; i++) {
      const x = ins[i];
      const a = x.a | 0, b = x.b | 0, c = x.c | 0;
      const u = uses[i], d = defs[i];

      if (x.upval) {
        // CLOSURE's inline binding pseudo-instruction reads the parent's slot.
        u.add(b);
      } else switch (x.op) {
        case O.MOVE: u.add(b); d.add(a); break;
        case O.LOADK: case O.LOADBOOL: d.add(a); break;
        case O.LOADNIL: addRange(d, a, b); break;
        case O.GETUPVAL: case O.GETGLOBAL: d.add(a); break;
        case O.GETTABLE: d.add(a); u.add(b); useRK(u, c); break;
        case O.SETGLOBAL: case O.SETUPVAL: u.add(a); break;
        case O.SETTABLE: u.add(a); useRK(u, b); useRK(u, c); break;
        case O.NEWTABLE: d.add(a); break;
        case O.SELF: d.add(a); d.add(a + 1); u.add(b); useRK(u, c); break;
        case O.ADD: case O.SUB: case O.MUL: case O.DIV: case O.MOD: case O.POW:
          d.add(a); useRK(u, b); useRK(u, c); break;
        case O.UNM: case O.NOT: case O.LEN: d.add(a); u.add(b); break;
        case O.CONCAT: d.add(a); addRange(u, b, c); break;
        case O.EQ: case O.LT: case O.LE: useRK(u, b); useRK(u, c); break;
        case O.TEST: u.add(a); break;
        case O.TESTSET: u.add(a); u.add(b); break;
        case O.CALL:
          u.add(a);
          if (b === 0) addRange(u, a + 1, maxReg - 1);
          else addRange(u, a + 1, a + b - 1);
          if (c === 0) addRange(d, a, maxReg - 1);
          else if (c > 1) addRange(d, a, a + c - 2);
          break;
        case O.TAILCALL:
          u.add(a);
          if (b === 0) addRange(u, a + 1, maxReg - 1);
          else addRange(u, a + 1, a + b - 1);
          break;
        case O.RETURN:
          if (b === 0) addRange(u, a, maxReg - 1);
          else if (b > 1) addRange(u, a, a + b - 2);
          break;
        case O.FORPREP:
          // Conservative around loop-control registers and exit paths.
          addRange(u, a, a + 3);
          break;
        case O.FORLOOP:
          // A and A+3 are only written on the loop-taken path.
          addRange(u, a, a + 3);
          break;
        case O.ITERPREP:
          addRange(u, a, a + 2); addRange(d, a, a + 2);
          break;
        case O.TFORLOOP:
          // Iterator result registers are conditional writes.
          addRange(u, a, a + 2 + c);
          break;
        case O.SETLIST:
          u.add(a);
          if (b === 0) addRange(u, a + 1, maxReg - 1);
          else addRange(u, a + 1, a + b);
          break;
        case O.VARARG:
          if (b === 0) addRange(d, a, maxReg - 1);
          else if (b > 1) addRange(d, a, a + b - 2);
          break;
        case O.CLOSURE: d.add(a); break;
        case O.JMP: case O.CLOSE: break;
        default: break;
      }

      const addSuccessor = target => {
        if (target >= 0 && target < n && !successors[i].includes(target)) successors[i].push(target);
      };
      if (x.op === O.JMP) addSuccessor(i + 1 + (x.b | 0));
      else if (x.op === O.RETURN || x.op === O.TAILCALL) { /* terminal */ }
      else if (x.op === O.LOADBOOL && (x.c | 0) !== 0) {
        // Lua 5.1 LOADBOOL with C=1 skips the following instruction.
        addSuccessor(i + 2);
      } else if ([O.EQ, O.LT, O.LE, O.TEST, O.TESTSET, O.TFORLOOP].includes(x.op)) {
        addSuccessor(i + 1); addSuccessor(i + 2);
      } else if (x.op === O.FORPREP || x.op === O.FORLOOP) {
        addSuccessor(i + 1); addSuccessor(i + 1 + (x.b | 0));
      } else addSuccessor(i + 1);

      for (const target of successors[i]) predecessors[target].push(i);
    }

    const liveIn = Array.from({ length: n }, () => new Set());
    const liveOut = Array.from({ length: n }, () => new Set());
    const queue = Array.from({ length: n }, (_, i) => n - i - 1);
    const queued = new Set(queue);
    while (queue.length) {
      const i = queue.pop();
      queued.delete(i);
      const out = new Set();
      for (const target of successors[i]) for (const r of liveIn[target]) out.add(r);
      const input = new Set(uses[i]);
      for (const r of out) if (!defs[i].has(r)) input.add(r);
      const changed = input.size !== liveIn[i].size || out.size !== liveOut[i].size ||
        [...input].some(r => !liveIn[i].has(r)) || [...out].some(r => !liveOut[i].has(r));
      if (changed) {
        liveIn[i] = input;
        liveOut[i] = out;
        for (const pred of predecessors[i]) if (!queued.has(pred)) {
          queue.push(pred);
          queued.add(pred);
        }
      }
    }

    // Mark code reachable from the entry point. This is especially important
    // for LOADBOOL C=1: the following instruction is skipped unconditionally,
    // and must not remain a fake CFG predecessor of later reads.
    const reachable = new Set();
    const work = [0];
    while (work.length) {
      const i = work.pop();
      if (i < 0 || i >= n || reachable.has(i)) continue;
      reachable.add(i);
      for (const target of successors[i]) work.push(target);
    }

    const remove = new Set();
    for (let i = 0; i < n; i++) {
      const x = ins[i];
      if (!reachable.has(i)) { remove.add(i); continue; }
      // Identity moves and jumps to the next instruction have no runtime
      // effect. Removing them also shortens the serialized prototype safely;
      // compact() redirects all incoming relative branches.
      if (!x.upval && x.op === O.MOVE && (x.a | 0) === (x.b | 0)) remove.add(i);
      if (!x.upval && x.op === O.JMP && i + 1 + (x.b | 0) === i + 1) remove.add(i);
      if (x.upval || ![O.MOVE, O.LOADK, O.LOADBOOL, O.LOADNIL, O.GETUPVAL, O.NEWTABLE].includes(x.op)) continue;
      // LOADBOOL with C=1 is also a skip-next branch, so it is not a pure write.
      if (x.op === O.LOADBOOL && (x.c | 0) !== 0) continue;
      const writes = defs[i];
      if (writes.size && [...writes].every(r => !liveOut[i].has(r) && !captured.has(r))) remove.add(i);
    }
    if (!remove.size) return false;
    compact(proto, remove);
    removed += remove.size;
    return true;
  }

  function visit(proto) {
    while (optimizeOne(proto)) { /* repeat after removing newly dead values */ }
    for (const child of proto.functions) visit(child);
  }

  visit(root);
  return { removed };
}

module.exports = { optimizeProto };
