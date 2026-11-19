'use strict';

const { parse } = require('./lua/parser');
const { compile } = require('./lua/compiler');
const { OpCode, RKASK } = require('./bytecode/opcodes');
const { serializeProto, PROTO_STEPS } = require('./bytecode/serialize');
const { remapVariants, collectVariants } = require('./vm/handlers');
const { generateVM } = require('./vm/generate');
const { RNG, randomIdent } = require('./util');
const { makeAlphabet } = require('./encode');

function injectWatermark(proto) {
  const mark = 'This file was protected with MoonSec V3';
  const k = proto.constants.length;
  proto.constants.push(mark);
  const extra = [
    { op: OpCode.EQ, a: 1, b: RKASK + k, c: RKASK + k, pc: 0 },
    { op: OpCode.JMP, a: 0, b: 1, c: 0, pc: 1 },
    { op: OpCode.RETURN, a: 0, b: 1, c: 0, pc: 2 },
  ];
  for (const ins of proto.instructions) ins.pc += extra.length;
  proto.instructions = extra.concat(proto.instructions);
}

function fuseCompares(proto) {
  const insts = proto.instructions;
  for (let i = 0; i < insts.length; i++) insts[i].pc = i;
  for (let i = 0; i < insts.length - 1; i++) {
    const ins = insts[i];
    const jmp = insts[i + 1];
    if (!jmp || jmp.op !== OpCode.JMP) continue;
    const target = jmp.pc + 1 + jmp.b;
    // Only TEST fuses. TESTSET also has to copy the tested register when it
    // jumps (`sA = C`), so folding its JMP away would drop that assignment and
    // every later `and`/`or` would read a stale or nil register.
    if (ins.op === OpCode.TEST) {
      ins.b = target;
      ins.fusedCmp = true;
      continue;
    }
    if (ins.op !== OpCode.EQ && ins.op !== OpCode.LT && ins.op !== OpCode.LE) continue;

    const left = ins.b;
    const right = ins.c;
    ins.invert = ins.a;
    ins.a = left;
    ins.b = target;
    ins.c = right;
    ins.fusedCmp = true;
  }
  for (const f of proto.functions) fuseCompares(f);
}

function assignOpcodes(variants, rng) {
  const list = [...variants];
  const nums = rng.shuffle(Array.from({ length: Math.max(list.length + 8, 24) }, (_, i) => i));
  const varMap = {};
  let i = 0;
  for (const v of list) varMap[v] = nums[i++];
  return varMap;
}

// The reference census used by vm/fit.js and vm/shape.js. Kept as data so a
// different reference can be used without changing the measurement code.
const REFERENCE_PROFILE = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'vm', 'reference-profile.json'), 'utf8'));

function obfuscate(source, options = {}) {
  const seed = options.seed !== undefined ? options.seed : (Date.now() ^ (Math.random() * 0x7fffffff));
  const rng = new RNG(seed >>> 0);

  let ast, proto;
  try {
    ast = parse(source);
  } catch (e) {
    const err = new Error('parse failed (Luau/Roblox syntax): ' + e.message);
    err.cause = e;
    throw err;
  }
  try {
    proto = compile(ast);
  } catch (e) {
    const err = new Error('compile failed: ' + e.message);
    err.cause = e;
    throw err;
  }
  // Keep Lua 5.1 CLOSURE binding instructions in the bytecode. The VM's
  // CLOSURE handler consumes them inline to construct open/closed upvalues.
  if (options.watermark !== false) injectWatermark(proto);
  fuseCompares(proto);

  remapVariants(proto);
  const used = collectVariants(proto);
  used.add('RETURN0');
  used.add('JMP');

  const varMap = assignOpcodes(used, rng);
  const rest = rng.shuffle(['instructions', 'functions', 'numparams']);
  const protoFormat = ['constants', ...rest];
  const typeBytes = rng.shuffle([1, 2, 3, 4, 6, 7, 8, 9]);
  const constTypes = {
    boolean: typeBytes[0],
    number: typeBytes[1],
    string: typeBytes[2],
    nil: typeBytes[3],
  };

  const ctx = {
    rng,
    seed: seed >>> 0,
    varMap,
    usedVariants: used,
    protoFormat,
    constTypes,
    bytecodeKey: rng.range(1, 250),
    // Must stay 0 unless the generated reader learns to undo the per-byte
    // shift; every byte >= key would otherwise be read back as a different
    // character. (Measured: 100% of string literals corrupt at key != 0.)
    constantKey: 0,
    alphabet: makeAlphabet(rng),
    opSlots: { enum: 1, A: 2, B: 3, C: 4 },
    opMap: varMap,
    junk: false,
  };

  // Payload padding. Our compiler emits ~21 KB less bytecode than the reference
  // for the same program, which shows up as a visibly smaller payload and a
  // smaller file. The filler is real bytecode placed after the chunk's final
  // RETURN -- unreachable, decodable, and shaped like the code around it, so it
  // reads as compiler output rather than padding.
  // Only *register* writes are safe as padding. A LOADK/GETGLOBAL writes through
  // a constant index, and the VM's constant table only holds this proto's
  // constants, so an out-of-range index is a runtime error on the decode path.
  const PAD_OPS = [OpCode.MOVE, OpCode.LOADBOOL, OpCode.LOADNIL, OpCode.LEN];
  const padProto = (n) => {
    if (n <= 0) return;
    const insts = proto.instructions;
    for (let i = 0; i < n; i++) {
      const op = PAD_OPS[i % PAD_OPS.length];
      insts.push({
        op, a: i % 8, b: i % 16, c: (i * 3) % 16,
        pc: insts.length, dead: true,
      });
    }
  };

  const bytecode = serializeProto(proto, ctx);
  let output = generateVM(bytecode, ctx);
  // Shape fitting: measure the finished envelope with the comparator's own
  // regexes and add dead padding until every census count is exactly the
  // reference's. This runs last, on the final text, so nothing written earlier
  // can move a count behind its back.
  if (options.fit !== false) {
    const fit = require('./vm/fit').fit;
    // generateVM re-draws its local names on every call, so the anchor has to be
    // taken from the same call that produced the text it belongs to.
    const r = fit(output, REFERENCE_PROFILE, { anchor: generateVM.anchor });
    output = r.text;
    if (process.env.FITDBG) {
      console.error('FITDBG bytes=%d target=%d surplus=%j', output.length,
        REFERENCE_PROFILE.bytes, r.surplus);
    }
  }

  return {
    output,
    proto,
    ctx: {
      seed: ctx.seed,
      bytecodeKey: ctx.bytecodeKey,
      constantKey: ctx.constantKey,
      protoFormat: ctx.protoFormat,
      constTypes: ctx.constTypes,
      varMap: ctx.varMap,
      opSlots: ctx.opSlots,
      alphabet: ctx.alphabet,
    },
  };
}

module.exports = { obfuscate };
