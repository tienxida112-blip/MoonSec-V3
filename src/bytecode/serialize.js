'use strict';

const { OpCode, getOpType, OpType, RKASK } = require('./opcodes');
const { ByteWriter, ByteReader, getBits } = require('../util');
const { encodeConstant, decodeConstant } = require('../encode');

const PROTO_STEPS = ['instructions', 'constants', 'functions', 'numparams'];

function instTypeCode(op, inst) {
  const t = getOpType(op);
  if (t === OpType.ABx) return 1;
  if (t === OpType.sBx) return 2;
  if (t === OpType.AsBx) return 3;
  return 0;
}

function isRK(op) {
  const s = String(op || '');
  const base = s.replace(/KK$|KR$|RK$|RR$|K$/, '');
  return (
    base === OpCode.ADD || base === OpCode.SUB || base === OpCode.MUL ||
    base === OpCode.DIV || base === OpCode.MOD || base === OpCode.POW ||
    base === OpCode.GETTABLE || base === OpCode.SETTABLE || base === OpCode.SELF ||
    base === OpCode.EQ || base === OpCode.LT || base === OpCode.LE
  );
}

function serializeProto(proto, ctx) {
  const w = new ByteWriter();
  writeFunction(w, proto, ctx);
  return w.toBuffer();
}

function writeFunction(w, proto, ctx) {
  for (const step of ctx.protoFormat) {
    switch (step) {
      case 'constants':
        writeConstants(w, proto, ctx);
        break;
      case 'instructions':
        writeInstructions(w, proto, ctx);
        break;
      case 'numparams':
        w.u8(proto.numParams || 0);
        break;
      case 'functions':
        w.i32(proto.functions.length);
        for (const f of proto.functions) writeFunction(w, f, ctx);
        break;
    }
  }
}

function writeConstants(w, proto, ctx) {
  w.i32(proto.constants.length);
  for (const c of proto.constants) {
    if (typeof c === 'boolean') {
      w.u8(ctx.constTypes.boolean);
      w.u8(c ? 1 : 0);
    } else if (typeof c === 'number') {
      w.u8(ctx.constTypes.number);
      w.f64(c);
    } else if (typeof c === 'string') {
      w.u8(ctx.constTypes.string);
      const enc = encodeConstant(c, ctx.constantKey);
      w.i32(enc.length);
      w.bytes(enc);
    } else {
      w.u8(ctx.constTypes.nil);
    }
  }
}

function writeInstructions(w, proto, ctx) {
  const map = ctx.opMap;
  const insts = proto.instructions.filter(ins => !ins.upval);
  w.i32(insts.length);
  for (let i = 0; i < insts.length; i++) {
    const ins = insts[i];
    const type = instTypeCode(ins.op, ins);
    let mask = 0;
    let A = ins.a | 0;
    let B = ins.b | 0;
    let C = ins.c | 0;

    if (ins.fusedCmp) {
      if (A >= RKASK) {
        mask |= 0b001;
        A = (A - RKASK) + 1;
      }
      if (C >= RKASK) {
        mask |= 0b100;
        C = (C - RKASK) + 1;
      }
    } else {
      if (ins.op === OpCode.LOADK || ins.op === OpCode.GETGLOBAL || ins.op === OpCode.SETGLOBAL) {
        mask |= 0b010;
        B = B + 1;
      }
      if (isRK(ins.op)) {
        if (B >= RKASK) {
          mask |= 0b010;
          B = (B - RKASK) + 1;
        }
        if (C >= RKASK) {
          mask |= 0b100;
          C = (C - RKASK) + 1;
        }
      }
    }

    const v = ins.variant || ins.op;
    if (v === 'CALL' || v === 'CALLN0' || v === 'CALLNV') {
      B = A + B - 1;
    } else if (v === 'CALLNM') {
      B = A + B - 1;
      C = A + C - 2;
    } else if (v === 'CALL0M' || v === 'CALL1M' || v === 'CALLVM') {
      C = A + C - 2;
    } else if (v === 'SETLIST') {
      B = A + B;
    } else if (v === 'RETURN') {
      B = B - 2;
    } else if (v === 'TAILCALL') {
      B = A + B - 1;
    } else if (v === 'VARARG') {
      B = A + B - 2;
    }

    const desc = (type << 1) | (mask << 3);
    w.u8(desc);
    const opnum = (ctx.varMap && ins.variant && ctx.varMap[ins.variant] !== undefined)
      ? ctx.varMap[ins.variant]
      : map[ins.op];
    w.i16(opnum);
    w.i16(A);

    if (type === 0) {
      w.i16(B);
      w.i16(C);
    } else if (type === 1) {
      w.i32(B);
    } else if (type === 2) {
      const abs = (ins.pc + 1) + B;
      w.i32(abs + 65536);
    } else if (type === 3) {
      // C# ForPrep fix is B -= PC+2 (IB2 skip target is one past FORLOOP).
      let abs = (ins.pc + 1) + B;
      if (ins.op === OpCode.FORPREP) abs += 1;
      w.i32(abs + 65536);
      w.i16(C);
    }
  }
}

function readHeader(r, ctx) {
  if (r.remaining() < 4) return;
  const mag = r.bytes(4);
  if (mag.toString('ascii') !== 'MSV3') {
    r.pos -= 4;
    return;
  }
  const names = ['instructions', 'constants', 'functions', 'numparams'];
  ctx.protoFormat = [r.u8(), r.u8(), r.u8(), r.u8()].map(i => names[i]);
  ctx.constTypes = { boolean: r.u8(), number: r.u8(), string: r.u8(), nil: r.u8() };
  ctx.opSlots = { enum: r.u8(), A: r.u8(), B: r.u8(), C: r.u8() };
  ctx.bytecodeKey = r.u8();
  ctx.constantKey = r.u8();
  const n = r.i32();
  ctx.varMap = ctx.varMap || Object.create(null);
  ctx.opRev = ctx.opRev || Object.create(null);
  for (let i = 0; i < n; i++) {
    const len = r.u8();
    const name = r.bytes(len).toString('utf8');
    const num = r.i16();
    ctx.varMap[name] = num;
    ctx.opRev[num] = name;
  }
}

function deserializeProto(buf, ctx) {
  const r = new ByteReader(buf);
  readHeader(r, ctx);
  return readFunction(r, ctx);
}

function readFunction(r, ctx) {
  const fn = {
    instructions: [],
    constants: [],
    functions: [],
    numParams: 0,
    upvalues: [],
    maxStack: 2,
    isVararg: true,
  };
  for (const step of ctx.protoFormat) {
    switch (step) {
      case 'constants':
        fn.constants = readConstants(r, ctx);
        break;
      case 'instructions':
        fn.instructions = readInstructions(r, fn, ctx);
        break;
      case 'numparams':
        fn.numParams = r.u8();
        break;
      case 'functions': {
        const n = r.i32();
        if (n < 0 || n > 100000) throw new Error('bad proto count ' + n);
        fn.functions = [];
        for (let i = 0; i < n; i++) fn.functions.push(readFunction(r, ctx));
        break;
      }
    }
  }
  return fn;
}

function readConstants(r, ctx) {
  const n = r.i32();
  if (n < 0 || n > 1000000) throw new Error('bad constant count ' + n);
  const out = [];
  const rev = {};
  for (const [k, v] of Object.entries(ctx.constTypes)) rev[v] = k;
  for (let i = 0; i < n; i++) {
    const flag = r.u8();
    const kind = rev[flag];
    if (kind === 'boolean') out.push(r.u8() !== 0);
    else if (kind === 'number') out.push(r.f64());
    else if (kind === 'string') {
      const len = r.i32();
      const bytes = r.bytes(len);
      out.push(decodeConstant(ctx.constantKey, bytes));
    } else {
      out.push(null);
    }
  }
  return out;
}

function readInstructions(r, fn, ctx) {
  const n = r.i32();
  if (n < 0 || n > 1000000) throw new Error('bad instruction count ' + n);
  const out = [];
  const rev = ctx.opRev;
  let pc = 0;
  for (let i = 0; i < n; i++) {
    const desc = r.u8();
    if (getBits(desc, 1, 1) !== 0) continue;
    const type = getBits(desc, 2, 3);
    const mask = getBits(desc, 4, 6);
    const inst = {
      opnum: r.i16(),
      a: r.i16(),
      b: 0,
      c: 0,
      pc,
      isKA: getBits(mask, 1, 1) === 1,
      isKB: getBits(mask, 2, 2) === 1,
      isKC: getBits(mask, 3, 3) === 1,
    };
    if (type === 0) {
      inst.b = r.i16();
      inst.c = r.i16();
    } else if (type === 1) {
      inst.b = r.i32();
    } else if (type === 2) {
      inst.b = r.i32() - 65536;
    } else if (type === 3) {
      inst.b = r.i32() - 65536;
      inst.c = r.i16();
    }
    inst.op = rev[inst.opnum] || 'UNKNOWN';
    if ((inst.op === OpCode.LOADK || inst.op === OpCode.GETGLOBAL || inst.op === OpCode.SETGLOBAL) && inst.isKB) {
      inst.b = inst.b - 1;
    }
    if (isRK(inst.op)) {
      if (inst.isKB) inst.b = RKASK + (inst.b - 1);
      if (inst.isKC) inst.c = RKASK + (inst.c - 1);
    }
    out.push(inst);
    pc++;
  }
  return out;
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
  for (const c of f.constants) {
    if (typeof c === 'string') {
      w.u8(4);
      const b = Buffer.from(c, 'utf8');
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
