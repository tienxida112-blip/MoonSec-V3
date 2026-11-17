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

function stripUpvalueDummies(proto) {
  const insts = proto.instructions;
  const map = new Array(insts.length + 1);
  let np = 0;
  for (let i = 0; i < insts.length; i++) {
    map[i] = np;
    if (!insts[i].upval) np++;
  }
  map[insts.length] = np;

  const remapRel = (ins) => {
    const oldPc = ins.pc;
    let target = oldPc + 1 + (ins.b | 0);
    if (target < 0) target = 0;
    if (target > insts.length) target = insts.length;
    ins.b = map[target] - (map[oldPc] + 1);
  };

  for (const ins of insts) {
    if (ins.upval) continue;
    if (ins.op === OpCode.JMP || ins.op === OpCode.FORPREP || ins.op === OpCode.FORLOOP) {
      remapRel(ins);
    }
  }

  proto.instructions = insts.filter(ins => !ins.upval);
  for (let i = 0; i < proto.instructions.length; i++) proto.instructions[i].pc = i;
  for (const f of proto.functions) stripUpvalueDummies(f);
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
  stripUpvalueDummies(proto);
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
    constantKey: 0,
    alphabet: makeAlphabet(rng),
    opSlots: { enum: 1, A: 2, B: 3, C: 4 },
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
      alphabet: ctx.alphabet,
    },
  };
}

module.exports = { obfuscate };
