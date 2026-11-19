'use strict';

const { OpCode, RKASK, BINOPS } = require('../bytecode/opcodes');
const { optimizeProto } = require('./optimizer');

class CompileError extends Error {}

function isFalse(v) {
  return v === false || v === null || v === undefined;
}

class Proto {
  constructor(parent = null) {
    this.parent = parent;
    this.instructions = [];
    this.constants = [];
    this.constantBytes = [];
    this.constMap = new Map();
    this.functions = [];
    this.locals = [];
    this.upvalues = [];
    this.numParams = 0;
    this.isVararg = false;
    this.maxStack = 2;
    this.line = 0;
  }
}

class Compiler {
  constructor() {
    this.fs = null;
  }

  compile(ast) {
    const proto = new Proto();
    proto.isVararg = true;
    this.fs = { proto, freereg: 0, nactvar: 0, scopes: [], breaks: [], continues: [], captured: new Set(), pc: () => proto.instructions.length };
    this.block(ast.body);
    this.emit(OpCode.RETURN, 0, 1, 0);
    proto.maxStack = Math.max(proto.maxStack, this.fs.freereg, 2);
    optimizeProto(proto);
    return proto;
  }

  enterScope() {
    this.fs.scopes.push({ nactvar: this.fs.nactvar, breaks: [] });
  }

  // Close any open upvalue created for a register >= fromReg.
  maybeClose(fromReg) {
    // findUpval records captures on the owning Proto, because it runs while the
    // child function's state is active.
    const captured = this.fs.proto.captured || this.fs.captured;
    if (!captured || !captured.size) return;
    for (const r of captured) {
      if (r >= fromReg) { this.emit(OpCode.CLOSE, fromReg, 0, 0); return; }
    }
  }

  leaveScope() {
    const sc = this.fs.scopes.pop();
    const proto = this.fs.proto;
    // A register captured by a nested closure keeps the open upvalue alive
    // until the block ends, so leaving the block must close it. Without this
    // every closure made in a loop shares one register: `for i=1,3 do
    // fs[i]=function() return i end end` returned 3,3,3 instead of 1,2,3.
    this.maybeClose(sc.nactvar);
    while (this.fs.nactvar > sc.nactvar) {
      const reg = this.fs.nactvar - 1;
      for (let i = proto.locals.length - 1; i >= 0; i--) {
        if (proto.locals[i].reg === reg && proto.locals[i].endpc === -1) {
          proto.locals[i].endpc = proto.instructions.length;
          break;
        }
      }
      this.fs.nactvar--;
    }
    this.fs.freereg = this.fs.nactvar;
  }

  emit(op, a = 0, b = 0, c = 0, extra = {}) {
    const proto = this.fs.proto;
    const inst = { op, a, b, c, pc: proto.instructions.length, ...extra };
    proto.instructions.push(inst);
    proto.maxStack = Math.max(proto.maxStack, (a | 0) + 1, this.fs.freereg);
    return inst;
  }

  kst(value, bytes) {
    const proto = this.fs.proto;
    if (typeof value === 'number' && !Number.isFinite(value)) {
      value = value < 0 ? -1.7976931348623157e+308 : 1.7976931348623157e+308;
    }
    let key;
    if (value === null) key = 'nil';
    else if (typeof value === 'string') key = 's:' + (bytes || Buffer.from(value, 'utf8')).toString('hex');
    else if (typeof value === 'number') key = Object.is(value, -0) ? 'n:-0' : 'n:' + value;
    else if (typeof value === 'boolean') key = 'b:' + value;
    else key = 'u:' + String(value);
    if (proto.constMap.has(key)) return proto.constMap.get(key);
    const idx = proto.constants.length;
    proto.constants.push(value);
    if (typeof value === 'string') proto.constantBytes[idx] = bytes || Buffer.from(value, 'utf8');
    proto.constMap.set(key, idx);
    return idx;
  }

  rk(regOrK) {
    if (regOrK && typeof regOrK === 'object' && regOrK.k !== undefined) return RKASK + regOrK.k;
    return regOrK;
  }

  reserve(n = 1) {
    const r = this.fs.freereg;
    this.fs.freereg += n;
    this.fs.proto.maxStack = Math.max(this.fs.proto.maxStack, this.fs.freereg);
    return r;
  }

  freeTo(r) {
    if (r >= this.fs.nactvar) this.fs.freereg = r;
  }

  newLocal(name) {
    const proto = this.fs.proto;
    const reg = this.fs.nactvar;
    proto.locals.push({ name, reg, startpc: proto.instructions.length, endpc: -1 });
    this.fs.nactvar++;
    this.fs.freereg = Math.max(this.fs.freereg, this.fs.nactvar);
    proto.maxStack = Math.max(proto.maxStack, this.fs.freereg);
    return reg;
  }

  findLocal(name) {
    const proto = this.fs.proto;
    for (let i = proto.locals.length - 1; i >= 0; i--) {
      const local = proto.locals[i];
      if (local.endpc === -1 && local.name === name) return local.reg;
    }
    return -1;
  }

  findUpval(name) {
    const proto = this.fs.proto;
    for (let i = 0; i < proto.upvalues.length; i++) {
      if (proto.upvalues[i].name === name) return i;
    }
    if (!proto.parent) return -1;
    const saved = this.fs;
    let level = proto.parent;
    const chain = [];
    let cur = proto;
    while (level) {
      chain.push(level);
      const loc = level.locals;
      let found = -1;
      for (let i = loc.length - 1; i >= 0; i--) {
        if (loc[i].endpc === -1 && loc[i].name === name) { found = loc[i].reg; break; }
      }
      if (found >= 0) {
        if (!level.captured) level.captured = new Set();
        level.captured.add(found);
        let idx = this.addUpval(cur, name, true, found);
        for (let c = chain.length - 2; c >= 0; c--) {
          idx = this.addUpvalOn(chain[c], name, false, idx);
        }
        this.fs = saved;
        return this.addUpval(proto, name, false, idx);
      }
      for (let i = 0; i < level.upvalues.length; i++) {
        if (level.upvalues[i].name === name) {
          let idx = i;
          for (let c = chain.length - 2; c >= 0; c--) {
            idx = this.addUpvalOn(chain[c], name, false, idx);
          }
          this.fs = saved;
          return this.addUpval(proto, name, false, idx);
        }
      }
      cur = level;
      level = level.parent;
    }
    this.fs = saved;
    return -1;
  }

  addUpval(proto, name, instack, idx) {
    for (let i = 0; i < proto.upvalues.length; i++) {
      if (proto.upvalues[i].name === name) return i;
    }
    proto.upvalues.push({ name, instack, idx });
    return proto.upvalues.length - 1;
  }

  addUpvalOn(proto, name, instack, idx) {
    return this.addUpval(proto, name, instack, idx);
  }

  block(stats) {
    this.enterScope();
    for (const s of stats) this.statement(s);
    this.leaveScope();
  }

  statement(s) {
    switch (s.type) {
      case 'local': return this.statLocal(s);
      case 'assign': return this.statAssign(s);
      case 'exprstat': return this.statCall(s.expr);
      case 'if': return this.statIf(s);
      case 'while': return this.statWhile(s);
      case 'repeat': return this.statRepeat(s);
      case 'fornum': return this.statForNum(s);
      case 'forin': return this.statForIn(s);
      case 'function': return this.statFunction(s);
      case 'return': return this.statReturn(s);
      case 'break': return this.statBreak();
      case 'continue': return this.statContinue();
      case 'typedef': return;
      case 'do': return this.block(s.body);
      default: throw new CompileError('unknown statement ' + s.type);
    }
  }

  statLocal(s) {
    const n = s.names.length;
    const nvals = s.values.length;
    const base = this.fs.freereg;
    for (let i = 0; i < nvals; i++) {
      const last = i === nvals - 1;
      // The last expression of a `local` list is multi-valued when the list is
      // shorter than the name list (`local p, q = f()`), and must be truncated
      // to exactly one value when it is longer (`local a = f()`).
      if (last) this.exprToNext(s.values[i], nvals < n ? n - nvals + 1 : 1);
      else this.exprToNext(s.values[i], 1);
    }
    if (nvals === 0) {
      this.emit(OpCode.LOADNIL, base, base + n - 1, 0);
      this.fs.freereg = base + n;
    } else if (nvals < n) {
      // A trailing call/vararg already filled the remaining slots with its
      // extra results (CALL was emitted with n-nvals+1 results above). Padding
      // with LOADNIL there would overwrite real values: `local p, q = f()`
      // used to load nil over the second result.
      const tail = s.values[nvals - 1];
      const multi = tail && (tail.type === 'call' || tail.type === 'vararg');
      if (!multi) {
        const start = base + nvals;
        this.emit(OpCode.LOADNIL, start, base + n - 1, 0);
      }
      this.fs.freereg = base + n;
    }
    for (const name of s.names) this.newLocal(name);
    this.fs.freereg = this.fs.nactvar;
  }

  statAssign(s) {
    const nvars = s.vars.length;
    const nvals = s.values.length;

    // Lua already defines the order here: every table/key expression on the
    // left is evaluated first, then every value on the right, then the stores
    // happen left to right. Doing it in that order means the value registers
    // can be held in locals past freereg, so no temporary can collide with a
    // table or key register already computed (`t[1],t[2] = 1,2` used to have
    // its `t[...]` stores overwrite the value registers).
    const targets = [];
    for (let v = 0; v < nvars; v++) {
      const t = s.vars[v];
      if (t.type === 'index') {
        const tab = this.exprToReg(t.table);
        const key = this.exprRK(t.key);
        targets.push({ type: 'index', tab, key });
      } else if (t.type === 'name') {
        // `a.x = 1` parses as a name path; resolve its root once.
        const loc = this.findLocal(t.name);
        const uv = this.findUpval(t.name);
        targets.push({ type: 'name', loc, uv, name: t.name });
      } else {
        targets.push({ type: 'raw', node: t });
      }
    }
    // Root tables read before the values are computed stay valid only if a
    // value expression cannot change them, which holds for lvalues built from
    // names/indices of names, the normal case here.
    const start = this.fs.freereg;
    for (let i = 0; i < nvals; i++) {
      const last = i === nvals - 1;
      const want = last && nvals < nvars ? nvars - nvals + 1 : 1;
      this.exprToNext(s.values[i], want);
    }
    if (nvals < nvars) {
      const r = this.fs.freereg;
      this.emit(OpCode.LOADNIL, r, r + (nvars - nvals) - 1, 0);
      this.fs.freereg = r + (nvars - nvals);
    }
    const top = this.fs.freereg;

    // Store right to left: an earlier target may itself be a variable used as
    // a later target's table, and Lua assigns left to right, so working
    // backwards keeps every table register live.
    for (let i = nvars - 1; i >= 0; i--) {
      const src = start + i;
      const t = targets[i];
      if (t.type === 'index') {
        this.emit(OpCode.SETTABLE, t.tab, t.key, src);
      } else if (t.type === 'name') {
        if (t.loc >= 0) this.emit(OpCode.MOVE, t.loc, src, 0);
        else if (t.uv >= 0) this.emit(OpCode.SETUPVAL, src, t.uv, 0);
        else this.emit(OpCode.SETGLOBAL, src, this.kst(t.name), 0);
      } else {
        this.storeVar(t.node, src);
      }
    }
    this.fs.freereg = this.fs.nactvar;
    this.fs.proto.maxStack = Math.max(this.fs.proto.maxStack, top);
  }

  storeVar(v, src) {
    if (v.type === 'name') {
      const loc = this.findLocal(v.name);
      if (loc >= 0) {
        this.emit(OpCode.MOVE, loc, src, 0);
        return;
      }
      const uv = this.findUpval(v.name);
      if (uv >= 0) {
        this.emit(OpCode.SETUPVAL, src, uv, 0);
        return;
      }
      this.emit(OpCode.SETGLOBAL, src, this.kst(v.name), 0);
      return;
    }
    if (v.type === 'index') {
      const t = this.exprToReg(v.table);
      const k = this.exprRK(v.key);
      this.emit(OpCode.SETTABLE, t, k, src);
      this.freeTo(this.fs.nactvar);
    }
  }

  statCall(e) {
    // A statement discards all results (CALL C=1), unlike a value expression.
    this.exprToNext(e, 0);
    this.fs.freereg = this.fs.nactvar;
  }

  statIf(s) {
    const elseJump = [];
    let fj = this.condJump(s.test, false);
    this.block(s.consequent);
    if (s.elifs.length || s.alternate) {
      const j = this.emit(OpCode.JMP, 0, 0, 0);
      elseJump.push(j);
    }
    this.patchToHere(fj);
    for (const ei of s.elifs) {
      fj = this.condJump(ei.test, false);
      this.block(ei.body);
      const j = this.emit(OpCode.JMP, 0, 0, 0);
      elseJump.push(j);
      this.patchToHere(fj);
    }
    if (s.alternate) this.block(s.alternate);
    for (const j of elseJump) this.patchToHere(j);
  }

  statWhile(s) {
    const start = this.fs.proto.instructions.length;
    const fj = this.condJump(s.test, false);
    this.fs.breaks.push([]);
    this.fs.continues.push([]);
    this.block(s.body);
    this.patchContinues(start);
    this.emit(OpCode.JMP, 0, start - (this.fs.proto.instructions.length + 1), 0);
    this.patchToHere(fj);
    this.patchBreaks();
  }

  statRepeat(s) {
    const start = this.fs.proto.instructions.length;
    this.fs.breaks.push([]);
    this.fs.continues.push([]);
    this.enterScope();
    for (const st of s.body) this.statement(st);
    this.patchContinues(this.fs.proto.instructions.length);
    const fj = this.condJump(s.test, true);
    this.emit(OpCode.JMP, 0, start - (this.fs.proto.instructions.length + 1), 0);
    this.patchToHere(fj);
    this.leaveScope();
    this.patchBreaks();
  }

  statForNum(s) {
    this.enterScope();
    const base = this.fs.freereg;
    this.exprToRegDest(s.start, base);
    this.fs.freereg = base + 1;
    this.exprToRegDest(s.end, base + 1);
    this.fs.freereg = base + 2;
    this.exprToRegDest(s.step, base + 2);
    this.fs.freereg = base + 3;
    this.newLocal(`(for index)`);
    this.newLocal(`(for limit)`);
    this.newLocal(`(for step)`);
    const varReg = this.newLocal(s.name);
    const prep = this.emit(OpCode.FORPREP, base, 0, 0);
    this.fs.breaks.push([]);
    this.fs.continues.push([]);
    this.enterScope();
    for (const st of s.body) this.statement(st);
    this.leaveScope();
    const loopPc = this.fs.proto.instructions.length;
    this.patchContinues(loopPc);
    // The control variable is re-bound every iteration, so a closure created in
    // the body must get a fresh upvalue per iteration.
    this.maybeClose(base);
    // FORLOOP must be located *after* the optional CLOSE, otherwise the
    // back-edge lands on the CLOSE instead of the loop head.
    const footerPc = this.fs.proto.instructions.length;
    this.emit(OpCode.FORLOOP, base, 0, 0);
    prep.b = footerPc - (prep.pc + 1);
    const loop = this.fs.proto.instructions[footerPc];
    loop.b = prep.pc - footerPc;
    this.patchBreaks();
    this.leaveScope();
  }

  statForIn(s) {
    this.enterScope();
    const base = this.fs.freereg;
    const n = s.iters.length;
    for (let i = 0; i < n; i++) {
      const last = i === n - 1;
      this.exprToNext(s.iters[i], last ? Math.max(1, 3 - i) : 1);
    }
    while (this.fs.freereg < base + 3) {
      this.emit(OpCode.LOADNIL, this.fs.freereg, this.fs.freereg, 0);
      this.fs.freereg++;
    }
    this.newLocal('(for generator)');
    this.newLocal('(for state)');
    this.newLocal('(for control)');
    for (const name of s.names) this.newLocal(name);
    // Luau permits a table or __iter object as well as an iterator triple.
    // Prepare it once, before the loop, not again on every TFORLOOP step.
    this.emit(OpCode.ITERPREP, base, 0, 0);
    const jmp = this.emit(OpCode.JMP, 0, 0, 0);
    this.fs.breaks.push([]);
    this.fs.continues.push([]);
    this.enterScope();
    for (const st of s.body) this.statement(st);
    this.leaveScope();
    this.patchToHere(jmp);
    this.patchContinues(this.fs.proto.instructions.length);
    // Lua 5.1 generic-for layout (verified against luac -l): TFORLOOP is
    // followed by a JMP back to the body start. On a non-nil iterator result
    // control falls into that JMP (loop again); on a nil result TFORLOOP must
    // skip it and land on the exit target. See the TFORLOOP VM handler.
    this.emit(OpCode.TFORLOOP, base, 0, s.names.length);
    const back = this.emit(OpCode.JMP, 0, 0, 0);
    back.b = (jmp.pc + 1) - (back.pc + 1);
    this.patchBreaks();
    this.leaveScope();
  }

  statFunction(s) {
    let localReg = -1;
    if (s.isLocal) localReg = this.newLocal(s.name[0]);
    const proto = this.compileFunction(s);
    const bx = this.fs.proto.functions.length;
    this.fs.proto.functions.push(proto);
    if (s.isLocal) {
      this.emitClosure(localReg, bx, proto);
    } else if (!s.name) {
      const r = this.reserve(1);
      this.emitClosure(r, bx, proto);
      this.fs.freereg = this.fs.nactvar;
    } else {
      // `function F() ... end` must not clobber an existing local that happens
      // to sit at freereg: `local a, b; function F() ... end` used to emit the
      // CLOSURE into a's register, silently replacing it.
      const r = this.reserve(1);
      this.emitClosure(r, bx, proto);
      this.storeNamePath(s.name, r, s.method);
      this.fs.freereg = this.fs.nactvar;
    }
  }

  storeNamePath(parts, src, method) {
    if (parts.length === 1) {
      this.storeVar({ type: 'name', name: parts[0] }, src);
      return;
    }
    let t = this.nameToReg(parts[0]);
    for (let i = 1; i < parts.length - 1; i++) {
      const r = this.reserve(1);
      this.emit(OpCode.GETTABLE, r, t, RKASK + this.kst(parts[i]));
      t = r;
    }
    this.emit(OpCode.SETTABLE, t, RKASK + this.kst(parts[parts.length - 1]), src);
  }

  nameToReg(name) {
    const loc = this.findLocal(name);
    if (loc >= 0) return loc;
    const uv = this.findUpval(name);
    const r = this.reserve(1);
    if (uv >= 0) this.emit(OpCode.GETUPVAL, r, uv, 0);
    else this.emit(OpCode.GETGLOBAL, r, this.kst(name), 0);
    return r;
  }

  compileFunction(s) {
    const proto = new Proto(this.fs.proto);
    proto.numParams = s.params.length;
    proto.isVararg = !!s.vararg;
    const saved = this.fs;
    this.fs = { proto, freereg: 0, nactvar: 0, scopes: [], breaks: [], continues: [], captured: new Set(), pc: () => proto.instructions.length };
    for (const p of s.params) this.newLocal(p);
    this.block(s.body);
    this.emit(OpCode.RETURN, 0, 1, 0);
    proto.maxStack = Math.max(proto.maxStack, this.fs.freereg, 2);
    this.fs = saved;
    return proto;
  }

  emitClosure(a, bx, proto) {
    this.emit(OpCode.CLOSURE, a, bx, proto.upvalues.length);
    for (const uv of proto.upvalues) {
      if (uv.instack) this.emit(OpCode.MOVE, 0, uv.idx, 0, { upval: true });
      else this.emit(OpCode.GETUPVAL, 1, uv.idx, 0, { upval: true });
    }
  }

  statReturn(s) {
    if (s.values.length === 0) {
      this.emit(OpCode.RETURN, 0, 1, 0);
      return;
    }
    const base = this.fs.freereg;
    for (let i = 0; i < s.values.length; i++) {
      const last = i === s.values.length - 1;
      this.exprToNext(s.values[i], last ? -1 : 1);
    }
    const n = s.values.length;
    const last = s.values[n - 1];
    if (last && (last.type === 'call' || last.type === 'vararg')) {
      this.emit(OpCode.RETURN, base, 0, 0);
    } else {
      this.emit(OpCode.RETURN, base, n + 1, 0);
    }
  }

  statBreak() {
    if (!this.fs.breaks.length) {
      this.emit(OpCode.RETURN, 0, 1, 0);
      return;
    }
    const j = this.emit(OpCode.JMP, 0, 0, 0);
    this.fs.breaks[this.fs.breaks.length - 1].push(j);
  }

  patchBreaks() {
    const list = this.fs.breaks.pop() || [];
    for (const j of list) this.patchToHere(j);
  }

  statContinue() {
    if (!this.fs.continues || !this.fs.continues.length) {
      this.emit(OpCode.RETURN, 0, 1, 0);
      return;
    }
    const j = this.emit(OpCode.JMP, 0, 0, 0);
    this.fs.continues[this.fs.continues.length - 1].push(j);
  }

  patchContinues(targetPc) {
    const list = (this.fs.continues && this.fs.continues.pop()) || [];
    for (const j of list) j.b = targetPc - (j.pc + 1);
  }

  patchToHere(inst) {
    if (!inst) return;
    inst.b = this.fs.proto.instructions.length - (inst.pc + 1);
  }

  condJump(test, ifTrue) {
    if (test.type === 'unary' && test.op === 'not') {
      return this.condJump(test.arg, !ifTrue);
    }
    if (test.type === 'binary' && (test.op === '==' || test.op === '~=' || test.op === '<' || test.op === '>' || test.op === '<=' || test.op === '>=')) {
      return this.cmpJump(test, ifTrue);
    }
    const r = this.exprToReg(test);
    this.emit(OpCode.TEST, r, 0, ifTrue ? 1 : 0);
    const j = this.emit(OpCode.JMP, 0, 0, 0);
    this.freeTo(this.fs.nactvar);
    return j;
  }

  cmpJump(test, ifTrue) {
    let op = test.op;
    let left = test.left;
    let right = test.right;
    if (op === '>') { op = '<'; [left, right] = [right, left]; }
    if (op === '>=') { op = '<='; [left, right] = [right, left]; }
    let a = 0;
    let opcode;
    if (op === '==') { opcode = OpCode.EQ; a = ifTrue ? 1 : 0; }
    else if (op === '~=') { opcode = OpCode.EQ; a = ifTrue ? 0 : 1; }
    else if (op === '<') { opcode = OpCode.LT; a = ifTrue ? 1 : 0; }
    else if (op === '<=') { opcode = OpCode.LE; a = ifTrue ? 1 : 0; }
    const b = this.exprRK(left, this.isStableRead(right));
    const c = this.exprRK(right);
    this.emit(opcode, a, b, c);
    const j = this.emit(OpCode.JMP, 0, 0, 0);
    this.freeTo(this.fs.nactvar);
    return j;
  }

  isStableRead(e) {
    return e?.type === 'literal' ||
      (e?.type === 'name' && this.findLocal(e.name) >= 0);
  }

  exprRK(e, allowLocal = true) {
    // An RK consumer may read a local directly only when no later expression
    // evaluation can mutate it before the instruction executes.
    if (allowLocal && e.type === 'name') {
      const local = this.findLocal(e.name);
      if (local >= 0) return local;
    }
    if (e.type === 'literal' && (typeof e.value === 'number' || typeof e.value === 'string' || typeof e.value === 'boolean' || e.value === null)) {
      if (typeof e.value === 'boolean' || e.value === null) {
        const r = this.exprToReg(e);
        return r;
      }
      const k = this.kst(e.value, e.bytes);
      if (k < RKASK) return RKASK + k;
    }
    return this.exprToReg(e);
  }

  exprToNext(e, nresults) {
    const r = this.fs.freereg;
    this.exprToRegDest(e, r, nresults);
    if (nresults > 0) this.fs.freereg = r + nresults;
    else if (nresults === -1) this.fs.freereg = r + 1;
    else this.fs.freereg = r + 1;
    return r;
  }

  exprToReg(e) {
    const r = this.fs.freereg;
    this.exprToRegDest(e, r, 1);
    this.fs.freereg = r + 1;
    return r;
  }

  exprToRegDest(e, dest, nresults = 1) {
    switch (e.type) {
      case 'paren':
        this.exprToRegDest(e.expr, dest, 1);
        break;
      case 'literal':
        this.loadConst(dest, e.value, e.bytes);
        break;
      case 'name':
        this.loadName(dest, e.name);
        break;
      case 'vararg':
        this.emit(OpCode.VARARG, dest, nresults < 0 ? 0 : nresults + 1, 0);
        break;
      case 'unary':
        this.exprUnary(e, dest);
        break;
      case 'binary':
        this.exprBinary(e, dest);
        break;
      case 'index':
        this.exprIndex(e, dest);
        break;
      case 'call':
        this.exprCall(e, dest, nresults);
        break;
      case 'table':
        this.exprTable(e, dest);
        break;
      case 'functionexpr': {
        const proto = this.compileFunction(e);
        const bx = this.fs.proto.functions.length;
        this.fs.proto.functions.push(proto);
        this.emitClosure(dest, bx, proto);
        break;
      }
      case 'ifexpr': {
        const fj = this.condJump(e.test, false);
        this.exprToRegDest(e.consequent, dest, nresults);
        const j = this.emit(OpCode.JMP, 0, 0, 0);
        this.patchToHere(fj);
        if (e.alternate) this.exprToRegDest(e.alternate, dest, nresults);
        else this.emit(OpCode.LOADNIL, dest, dest, 0);
        this.patchToHere(j);
        break;
      }
      default:
        throw new CompileError('bad expr ' + e.type);
    }
  }

  loadConst(dest, v, bytes) {
    if (v === null) this.emit(OpCode.LOADNIL, dest, dest, 0);
    else if (typeof v === 'boolean') this.emit(OpCode.LOADBOOL, dest, v ? 1 : 0, 0);
    else this.emit(OpCode.LOADK, dest, this.kst(v, bytes), 0);
  }

  loadName(dest, name) {
    const loc = this.findLocal(name);
    if (loc >= 0) {
      if (loc !== dest) this.emit(OpCode.MOVE, dest, loc, 0);
      return;
    }
    const uv = this.findUpval(name);
    if (uv >= 0) {
      this.emit(OpCode.GETUPVAL, dest, uv, 0);
      return;
    }
    this.emit(OpCode.GETGLOBAL, dest, this.kst(name), 0);
  }

  exprUnary(e, dest) {
    if (e.op === '-' && e.arg.type === 'literal' && typeof e.arg.value === 'number') {
      this.loadConst(dest, -e.arg.value);
    } else {
      let r;
      if (e.arg.type === 'name') {
        const local = this.findLocal(e.arg.name);
        r = local >= 0 ? local : this.exprToReg(e.arg);
      } else r = this.exprToReg(e.arg);
      if (e.op === '-') this.emit(OpCode.UNM, dest, r, 0);
      else if (e.op === 'not') this.emit(OpCode.NOT, dest, r, 0);
      else if (e.op === '#') this.emit(OpCode.LEN, dest, r, 0);
    }
    this.freeTo(this.fs.nactvar);
    if (this.fs.freereg <= dest) this.fs.freereg = dest + 1;
  }

  exprBinary(e, dest) {
    if (e.op === 'and' || e.op === 'or') {
      this.exprToRegDest(e.left, dest);
      this.emit(OpCode.TEST, dest, 0, e.op === 'and' ? 0 : 1);
      const j = this.emit(OpCode.JMP, 0, 0, 0);
      this.exprToRegDest(e.right, dest);
      this.patchToHere(j);
      return;
    }
    if (e.op === '..') {
      const b = this.fs.freereg;
      this.exprToRegDest(e.left, b);
      this.fs.freereg = b + 1;
      this.exprToRegDest(e.right, b + 1);
      this.fs.freereg = b + 2;
      this.emit(OpCode.CONCAT, dest, b, b + 1);
      this.freeTo(dest + 1);
      return;
    }
    if (BINOPS[e.op]) {
      const b = this.exprRK(e.left, this.isStableRead(e.right));
      const c = this.exprRK(e.right);
      this.emit(BINOPS[e.op], dest, b, c);
      this.freeTo(dest + 1);
      return;
    }
    if (e.op === '==' || e.op === '~=' || e.op === '<' || e.op === '>' || e.op === '<=' || e.op === '>=') {
      let op = e.op, left = e.left, right = e.right;
      if (op === '>') { op = '<'; [left, right] = [right, left]; }
      if (op === '>=') { op = '<='; [left, right] = [right, left]; }
      const opcode = op === '==' || op === '~=' ? OpCode.EQ : op === '<' ? OpCode.LT : OpCode.LE;
      // EQ/LT/LE skip the next instruction on the selected truth value.
      // The false LOADBOOL itself skips the final true LOADBOOL.
      const invert = op === '~=' ? 1 : 0;
      const b = this.exprRK(left, this.isStableRead(right));
      const c = this.exprRK(right);
      this.emit(opcode, invert, b, c);
      this.emit(OpCode.LOADBOOL, dest, 0, 1);
      this.emit(OpCode.LOADBOOL, dest, 1, 0);
      this.freeTo(dest + 1);
      return;
    }
    throw new CompileError('bad binop ' + e.op);
  }

  exprIndex(e, dest) {
    // A chain rooted at a *global* used to bounce through a scratch register:
    // `GETGLOBAL rT,Kx; GETTABLE dest,rT,Ky`. Loading `dest` straight from the
    // global and indexing `dest` in place drops the extra instruction, so the
    // pair becomes `GETGLOBAL dest,Kx; GETTABLE dest,dest,Ky`. Only safe when
    // the table slot cannot alias the destination (see isStableRead).
    const local = e.table.type === 'name' ? this.findLocal(e.table.name) : -2;
    if (e.table.type === 'name' && local < 0 && this.isStableRead(e.key) &&
        !(e.table.type === 'name' && this.findUpval(e.table.name) >= 0)) {
      this.emit(OpCode.GETGLOBAL, dest, this.kst(e.table.name), 0);
      // Once the constant pool passes RKASK, even a literal key needs a
      // scratch register. Do not let that load overwrite the table in dest.
      this.fs.freereg = Math.max(this.fs.freereg, dest + 1);
      const k = this.exprRK(e.key);
      this.emit(OpCode.GETTABLE, dest, dest, k);
      this.freeTo(dest + 1);
      return;
    }
    let t;
    if (e.table.type === 'name' && this.isStableRead(e.key)) {
      t = local >= 0 ? local : this.exprToReg(e.table);
    } else {
      t = this.exprToReg(e.table);
    }
    const k = this.exprRK(e.key);
    this.emit(OpCode.GETTABLE, dest, t, k);
    this.freeTo(dest + 1);
  }

  exprCall(e, dest, nresults) {
    const base = dest;
    if (e.method) {
      const obj = e.callee.table;
      const key = e.callee.key;
      this.exprToRegDest(obj, base);
      this.fs.freereg = base + 1;
      const k = this.exprRK(key);
      this.emit(OpCode.SELF, base, base, k);
      this.fs.freereg = base + 2;
      for (let i = 0; i < e.args.length; i++) {
        const last = i === e.args.length - 1;
        const dest = this.fs.freereg;
        this.exprToRegDest(e.args[i], dest, last ? -1 : 1);
        this.fs.freereg = dest + 1;
      }
      const narg = e.args.length + 2;
      let b = narg;
      if (e.args.length && (e.args[e.args.length - 1].type === 'call' || e.args[e.args.length - 1].type === 'vararg')) b = 0;
      const c = nresults < 0 ? 0 : nresults + 1;
      this.emit(OpCode.CALL, base, b, c);
      this.fs.freereg = base + Math.max(1, nresults < 0 ? 1 : nresults);
      return;
    }
    this.exprToRegDest(e.callee, base);
    this.fs.freereg = base + 1;
    for (let i = 0; i < e.args.length; i++) {
      const last = i === e.args.length - 1;
      const dest = this.fs.freereg;
      this.exprToRegDest(e.args[i], dest, last ? -1 : 1);
      this.fs.freereg = dest + 1;
    }
    let b = e.args.length + 1;
    if (e.args.length && (e.args[e.args.length - 1].type === 'call' || e.args[e.args.length - 1].type === 'vararg')) b = 0;
    const c = nresults < 0 ? 0 : nresults + 1;
    this.emit(OpCode.CALL, base, b, c);
    this.fs.freereg = base + Math.max(1, nresults < 0 ? 1 : nresults);
  }

  exprTable(e, dest) {
    let narr = 0, nrec = 0;
    for (const f of e.fields) {
      if (f.key) nrec++;
      else narr++;
    }
    this.emit(OpCode.NEWTABLE, dest, narr, nrec);
    this.fs.freereg = Math.max(this.fs.freereg, dest + 1);
    const arr = [];
    for (const f of e.fields) {
      if (f.key) {
        const k = this.exprRK(f.key, this.isStableRead(f.value));
        const v = this.exprRK(f.value);
        this.emit(OpCode.SETTABLE, dest, k, v);
        this.freeTo(dest + 1);
      } else arr.push(f.value);
    }
    const FPF = 50;
    for (let i = 0; i < arr.length; i += FPF) {
      const batch = arr.slice(i, i + FPF);
      const base = dest + 1;
      this.fs.freereg = base;
      const last = batch[batch.length - 1];
      // The final array item of a table constructor expands to all of its
      // results, so it must be compiled with an open result count.
      const spreadLast = i + batch.length === arr.length && last &&
        (last.type === 'call' || last.type === 'vararg');
      for (let j = 0; j < batch.length; j++) {
        const want = spreadLast && j === batch.length - 1 ? -1 : 1;
        this.exprToRegDest(batch[j], base + j, want);
        this.fs.freereg = base + j + 1;
      }
      let b = batch.length;
      if (spreadLast) b = 0;
      this.emit(OpCode.SETLIST, dest, b, (i / FPF) + 1);
      this.freeTo(dest + 1);
    }
  }
}

function compile(ast) {
  return new Compiler().compile(ast);
}

module.exports = { Compiler, CompileError, compile, Proto };
