"use strict";

const { getOpType, OpType } = require('./opcodes');
const { ByteWriter, ByteReader } = require('../util');
const { encodeConstant, decodeConstantBytes } = require('../encode');
const { lowerInstruction, instructionForm } = require('./lower');

const PROTO_STEPS = ['instructions', 'constants', 'functions', 'numparams'];

function validateContext(ctx) {
  if (!Array.isArray(ctx.protoFormat) || ctx.protoFormat.length !== 4 ||
      new Set(ctx.protoFormat).size !== 4 || ctx.protoFormat[0] !== 'constants' ||
      ctx.protoFormat.some(s => !PROTO_STEPS.includes(s))) {
    throw new Error('MoonSec prototype layout must start with constants and contain each of the four sections once');
  }
  const types = ['boolean', 'number', 'string', 'nil'].map(k => ctx.constTypes[k]);
  if (new Set(types).size !== 4 || types.some(n => !Number.isInteger(n) || n < 0 || n > 255)) {
    throw new Error('invalid constant type tags');
  }
}

function instTypeCode(op, inst = {}) {
  return instructionForm({ ...inst, op });
}

function serializeProto(proto, ctx) {
  validateContext(ctx);
  const w = new ByteWriter();
  writeFunction(w, proto, ctx);
  return w.toBuffer();
}

function writeFunction(w, proto, ctx) {
  for (const step of ctx.protoFormat) {
    switch (step) {
      case 'constants':
        w.i32(proto.constants.length);
        for (let i = 0; i < proto.constants.length; i++) {
          const c = proto.constants[i];
          if (typeof c === 'boolean') { w.u8(ctx.constTypes.boolean); w.u8(c ? 1 : 0); }
          else if (typeof c === 'number') { w.u8(ctx.constTypes.number); w.f64(c); }
          else if (typeof c === 'string') {
            w.u8(ctx.constTypes.string);
            const bytes = encodeConstant((proto.constantBytes && proto.constantBytes[i]) || c, ctx.constantKey);
            w.i32(bytes.length);
            w.bytes(bytes);
          } else w.u8(ctx.constTypes.nil);
        }
        break;
      case 'instructions': writeInstructions(w, proto, ctx); break;
      case 'numparams':
        if (!Number.isInteger(proto.numParams || 0) || proto.numParams < 0 || proto.numParams > 255) throw new Error('too many parameters');
        w.u8(proto.numParams || 0);
        break;
      case 'functions':
        w.i32(proto.functions.length);
        proto.functions.forEach(child => writeFunction(w, child, ctx));
        break;
    }
  }
}

function word(w, value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 65535) throw new Error(label + ' is outside the MoonSec u16 range: ' + value);
  w.u16(value);
}

function writeInstructions(w, proto, ctx) {
  w.i32(proto.instructions.length);
  for (const ins of proto.instructions) {
    const { form, mask, a, b, c } = lowerInstruction(ins);
    w.u8((form << 1) | (mask << 3));
    const name = ins.opcodeVariant || ins.dispatchVariant || ins.variant || ins.op;
    const number = (ctx.varMap || ctx.opMap || {})[name];
    word(w, number, 'opcode ' + name);
    word(w, a, name + ' A');
    if (form === 0) {
      word(w, b, name + ' B');
      word(w, c, name + ' C');
    } else {
      const stored = b + (form >= 2 ? 65536 : 0);
      if (!Number.isInteger(stored) || stored < 0 || stored > 0xffffffff) throw new Error(name + ' B is outside the MoonSec u32 range');
      w.u32(stored);
      if (form === 3) word(w, c, name + ' C');
    }
  }
}

// Return raw VM operands, not reconstructed Lua 5.1 instructions. Constant
// masks describe which integer fields the Lua reader replaces with K[index].
// Keep the original bytes alongside JS strings so binary Lua strings survive.
function deserializeProto(buf, ctx) {
  validateContext(ctx);
  const r = new ByteReader(buf);
  const rev = ctx.opRev || Object.fromEntries(Object.entries(ctx.varMap || ctx.opMap || {}).map(([k, v]) => [v, k]));
  function count(label, max) {
    const n = r.i32();
    if (n < 0 || n > max) throw new Error('bad ' + label + ' count ' + n);
    return n;
  }
  function readFunction(depth = 0) {
    if (depth > 200) throw new Error('prototype nesting limit exceeded');
    const fn = { instructions: [], constants: [], constantBytes: [], functions: [], numParams: 0 };
    for (const step of ctx.protoFormat) {
      if (step === 'constants') {
        const n = count('constant', 1000000);
        for (let i = 0; i < n; i++) {
          const flag = r.u8();
          if (flag === ctx.constTypes.boolean) fn.constants.push(r.u8() !== 0);
          else if (flag === ctx.constTypes.number) fn.constants.push(r.f64());
          else if (flag === ctx.constTypes.string) {
            const len = count('string byte', r.remaining());
            const bytes = decodeConstantBytes(ctx.constantKey, r.bytes(len));
            fn.constants.push(bytes.toString('utf8'));
            fn.constantBytes[i] = bytes;
          } else fn.constants.push(null);
        }
      } else if (step === 'numparams') fn.numParams = r.u8();
      else if (step === 'functions') {
        for (let i = 0, n = count('prototype', 100000); i < n; i++) fn.functions.push(readFunction(depth + 1));
      } else if (step === 'instructions') {
        for (let i = 0, n = count('instruction', 1000000); i < n; i++) {
          const descriptor = r.u8();
          if (descriptor & 1) { fn.instructions.push(null); continue; }
          const form = (descriptor >> 1) & 3, mask = (descriptor >> 3) & 7;
          const opnum = r.u16(), a = r.u16();
          let b, c = 0;
          if (form === 0) { b = r.u16(); c = r.u16(); }
          else { b = r.u32() - (form >= 2 ? 65536 : 0); if (form === 3) c = r.u16(); }
          fn.instructions.push({ opnum, op: rev[opnum] || 'UNKNOWN', a, b, c, pc: i, form, mask,
            isKA: !!(mask & 1), isKB: !!(mask & 2), isKC: !!(mask & 4) });
        }
      }
    }
    return fn;
  }
  const fn = readFunction();
  if (r.remaining() !== 0) throw new Error('trailing bytes after MoonSec prototype');
  return fn;
}

function lua51Serialize(proto) {
  const w = new ByteWriter();
  w.bytes([0x1b, 0x4c, 0x75, 0x61, 0x51, 0, 1, 4, 8, 4, 8, 0]);
  writeLua51Function(w, proto);
  return w.toBuffer();
}

function writeLua51Function(w, f) {
  const name = Buffer.from('');
  w.bytes(Buffer.concat([u64(name.length + 1), name, Buffer.from([0])]));
  w.i32(0); w.i32(0);
  w.u8(f.upvalues ? f.upvalues.length : 0);
  w.u8(f.numParams || 0);
  w.u8(f.isVararg ? 2 : 0);
  w.u8(f.maxStack || 2);
  w.i32(f.instructions.length);
  for (const ins of f.instructions) {
    w.u32(pack51(ins));
  }
  w.i32(f.constants.length);
  for (let i = 0; i < f.constants.length; i++) {
    const c = f.constants[i];
    if (typeof c === 'string') {
      w.u8(4);
      const b = (f.constantBytes && f.constantBytes[i]) || Buffer.from(c, 'utf8');
      w.bytes(Buffer.concat([u64(b.length + 1), b, Buffer.from([0])]));
    } else if (typeof c === 'number') {
      w.u8(3); w.f64(c);
    } else if (typeof c === 'boolean') {
      w.u8(1); w.u8(c ? 1 : 0);
    } else {
      w.u8(0);
    }
  }
  w.i32(f.functions.length);
  for (const sf of f.functions) writeLua51Function(w, sf);
  w.i32(0); w.i32(0); w.i32(0);
}

function u64(n) {
  const b = Buffer.alloc(8);
  b.writeUInt32LE(n >>> 0, 0);
  b.writeUInt32LE(0, 4);
  return b;
}

function pack51(ins) {
  const { OpCode: OC } = require('./opcodes');
  const map = {
    [OC.MOVE]: 0, [OC.LOADK]: 1, [OC.LOADBOOL]: 2, [OC.LOADNIL]: 3,
    [OC.GETUPVAL]: 4, [OC.GETGLOBAL]: 5, [OC.GETTABLE]: 6, [OC.SETGLOBAL]: 7,
    [OC.SETUPVAL]: 8, [OC.SETTABLE]: 9, [OC.NEWTABLE]: 10, [OC.SELF]: 11,
    [OC.ADD]: 12, [OC.SUB]: 13, [OC.MUL]: 14, [OC.DIV]: 15, [OC.MOD]: 16,
    [OC.POW]: 17, [OC.UNM]: 18, [OC.NOT]: 19, [OC.LEN]: 20, [OC.CONCAT]: 21,
    [OC.JMP]: 22, [OC.EQ]: 23, [OC.LT]: 24, [OC.LE]: 25, [OC.TEST]: 26,
    [OC.TESTSET]: 27, [OC.CALL]: 28, [OC.TAILCALL]: 29, [OC.RETURN]: 30,
    [OC.FORLOOP]: 31, [OC.FORPREP]: 32, [OC.TFORLOOP]: 33, [OC.SETLIST]: 34,
    [OC.CLOSE]: 35, [OC.CLOSURE]: 36, [OC.VARARG]: 37,
  };
  const opcode = map[ins.op] ?? 0;
  const t = getOpType(ins.op);
  let data = opcode;
  const mask = (v, bits) => v & ((1 << bits) - 1);
  switch (t) {
    case OpType.A:
      data |= mask(ins.a, 8) << 6;
      break;
    case OpType.AB:
      data |= mask(ins.a, 8) << 6;
      data |= mask(ins.b, 9) << 23;
      break;
    case OpType.AC:
      data |= mask(ins.a, 8) << 6;
      data |= mask(ins.c, 9) << 14;
      break;
    case OpType.ABC:
      data |= mask(ins.a, 8) << 6;
      data |= mask(ins.b, 9) << 23;
      data |= mask(ins.c, 9) << 14;
      break;
    case OpType.ABx:
      data |= mask(ins.a, 8) << 6;
      data |= mask(ins.b, 18) << 14;
      break;
    case OpType.AsBx:
      data |= mask(ins.a, 8) << 6;
      data |= mask(ins.b + 131071, 18) << 14;
      break;
    case OpType.sBx:
      data |= mask(ins.b + 131071, 18) << 14;
      break;
  }
  return data >>> 0;
}

module.exports = {
  PROTO_STEPS,
  serializeProto,
  deserializeProto,
  lua51Serialize,
  instTypeCode,
};
