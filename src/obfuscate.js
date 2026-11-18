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
  const mark = 'This file was protected with MoonSec V4';
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
    if (ins.op === OpCode.TEST || ins.op === OpCode.TESTSET) {
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

  const slots = rng.shuffle([1, 2, 3, 4]);
  const ctx = {
    rng,
    seed: seed >>> 0,
    varMap,
    usedVariants: used,
    protoFormat,
    constTypes,
    // V4: both keys live in a wide space and are actually used. V3 left
    // constantKey at 0, which silently disabled string-constant encryption.
    bytecodeKey: rng.range(1, 100000),
    constantKey: rng.range(1, 100000),
    alphabet: makeAlphabet(rng),
    opSlots: Object.fromEntries(['enum', 'A', 'B', 'C'].map((name, i) => [name, slots[i]])),
    instructionKey: rng.range(1, 255),
    opMap: varMap,
    junk: false,
  };

  const bytecode = serializeProto(proto, ctx);
  const output = generateVM(bytecode, ctx);

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
      instructionKey: ctx.instructionKey,
      alphabet: ctx.alphabet,
    },
  };
}

module.exports = { obfuscate };
