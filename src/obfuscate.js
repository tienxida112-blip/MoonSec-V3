'use strict';

const { parse } = require('./lua/parser');
const { compile } = require('./lua/compiler');
const { OpCode, RKASK } = require('./bytecode/opcodes');
const { serializeProto } = require('./bytecode/serialize');
const { lowerBranches } = require('./bytecode/lower');
const { polymorphOpcodes } = require('./bytecode/polymorph');
const { remapVariants, collectVariants } = require('./vm/handlers');
const { fuseSequences, dispatchVariants } = require('./bytecode/superinstructions');
const { generateVM } = require('./vm/generate');
const { RNG, randomIdent } = require('./util');
const { makeAlphabet } = require('./encode');

function injectWatermark(proto, name) {
  const key = proto.constants.length;
  proto.constants.push(name, 'This file was protected with MoonSec V3');
  const extra = [
    { op: OpCode.GETGLOBAL, a: 0, b: key, c: 0, pc: 0 },
    { op: OpCode.EQ, a: 1, b: 0, c: RKASK + key + 1, pc: 1 },
    { op: OpCode.JMP, a: 0, b: 1, c: 0, pc: 2 },
    { op: OpCode.RETURN, a: 0, b: 1, c: 0, pc: 3 },
  ];
  for (const ins of proto.instructions) ins.pc += extra.length;
  proto.instructions = extra.concat(proto.instructions);
}

function assignOpcodes(variants, rng) {
  const list = [...variants];
  const nums = rng.shuffle(Array.from({ length: Math.max(list.length + 8, 24) }, (_, i) => i));
  return Object.fromEntries(list.map((v, i) => [v, nums[i]]));
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

  const watermarkName = '_' + randomIdent(rng, { min: 12, max: 12 });
  if (options.watermark !== false) injectWatermark(proto, watermarkName);
  lowerBranches(proto);
  remapVariants(proto);
  const used = collectVariants(proto);
  const superinstructions = fuseSequences(proto, rng);
  for (const variant of Object.keys(superinstructions)) used.add(variant);
  const handlerAliases = polymorphOpcodes(proto, rng);
  for (const variant of Object.keys(handlerAliases)) used.add(variant);
  const dispatched = dispatchVariants(proto);
  const varMap = assignOpcodes(used, rng);
  const protoFormat = ['constants', ...rng.shuffle(['instructions', 'functions', 'numparams'])];
  const typeBytes = rng.shuffle([0, 1, 2, 3]);
  const constTypes = Object.fromEntries(['boolean', 'number', 'string', 'nil'].map((k, i) => [k, typeBytes[i]]));
  const ctx = {
    rng,
    seed: seed >>> 0,
    profile: 'moonsec-v3/plain',
    watermarkName,
    varMap,
    usedVariants: used,
    dispatchVariants: dispatched,
    superinstructions,
    handlerAliases,
    protoFormat,
    constTypes,
    bytecodeKey: rng.range(1, 250),
    constantKey: 0,
    alphabet: makeAlphabet(rng),
    // Genuine readers initialize {read16(),read16(),nil,nil}; enum/A are
    // physically slots 1/2. Declaration order, not these meanings, is shuffled.
    opSlots: { enum: 1, A: 2, B: 3, C: 4 },
    opMap: varMap,
  };
  const bytecode = serializeProto(proto, ctx);
  const output = generateVM(bytecode, ctx);
  return {
    output,
    proto,
    ctx: {
      seed: ctx.seed,
      profile: ctx.profile,
      watermarkName,
      bytecodeKey: ctx.bytecodeKey,
      constantKey: ctx.constantKey,
      protoFormat: ctx.protoFormat,
      constTypes: ctx.constTypes,
      varMap: ctx.varMap,
      opSlots: ctx.opSlots,
      alphabet: ctx.alphabet,
      bytecodeBytes: bytecode.length,
      dispatchVariants: [...dispatched],
      superinstructions,
      handlerAliases,
    },
  };
}

module.exports = { obfuscate };
