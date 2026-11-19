'use strict';

const OpCode = {
  MOVE: 'MOVE',
  LOADK: 'LOADK',
  LOADBOOL: 'LOADBOOL',
  LOADNIL: 'LOADNIL',
  GETUPVAL: 'GETUPVAL',
  GETGLOBAL: 'GETGLOBAL',
  GETTABLE: 'GETTABLE',
  SETGLOBAL: 'SETGLOBAL',
  SETUPVAL: 'SETUPVAL',
  SETTABLE: 'SETTABLE',
  NEWTABLE: 'NEWTABLE',
  SELF: 'SELF',
  ADD: 'ADD',
  SUB: 'SUB',
  MUL: 'MUL',
  DIV: 'DIV',
  MOD: 'MOD',
  POW: 'POW',
  UNM: 'UNM',
  NOT: 'NOT',
  LEN: 'LEN',
  CONCAT: 'CONCAT',
  JMP: 'JMP',
  EQ: 'EQ',
  LT: 'LT',
  LE: 'LE',
  TEST: 'TEST',
  TESTSET: 'TESTSET',
  CALL: 'CALL',
  TAILCALL: 'TAILCALL',
  RETURN: 'RETURN',
  FORLOOP: 'FORLOOP',
  FORPREP: 'FORPREP',
  TFORLOOP: 'TFORLOOP',
  ITERPREP: 'ITERPREP',
  SETLIST: 'SETLIST',
  CLOSE: 'CLOSE',
  CLOSURE: 'CLOSURE',
  VARARG: 'VARARG',
};

const OpType = {
  A: 'A',
  AB: 'AB',
  AC: 'AC',
  ABC: 'ABC',
  ABx: 'ABx',
  AsBx: 'AsBx',
  sBx: 'sBx',
};

function getOpType(op) {
  switch (op) {
    case OpCode.MOVE:
    case OpCode.LOADNIL:
    case OpCode.GETUPVAL:
    case OpCode.SETUPVAL:
    case OpCode.UNM:
    case OpCode.NOT:
    case OpCode.LEN:
    case OpCode.RETURN:
    case OpCode.VARARG:
      return OpType.AB;
    case OpCode.LOADK:
    case OpCode.GETGLOBAL:
    case OpCode.SETGLOBAL:
    case OpCode.CLOSURE:
      return OpType.ABx;
    case OpCode.LOADBOOL:
    case OpCode.GETTABLE:
    case OpCode.SETTABLE:
    case OpCode.ADD:
    case OpCode.SUB:
    case OpCode.MUL:
    case OpCode.DIV:
    case OpCode.MOD:
    case OpCode.POW:
    case OpCode.CONCAT:
    case OpCode.CALL:
    case OpCode.TAILCALL:
    case OpCode.SELF:
    case OpCode.EQ:
    case OpCode.LT:
    case OpCode.LE:
    case OpCode.TESTSET:
    case OpCode.NEWTABLE:
    case OpCode.SETLIST:
      return OpType.ABC;
    case OpCode.JMP:
      return OpType.sBx;
    case OpCode.TEST:
    case OpCode.TFORLOOP:
      return OpType.AC;
    case OpCode.FORPREP:
    case OpCode.FORLOOP:
      return OpType.AsBx;
    case OpCode.CLOSE:
      return OpType.A;
    default:
      return OpType.ABC;
  }
}

const RKASK = 256;

const BINOPS = {
  '+': OpCode.ADD,
  '-': OpCode.SUB,
  '*': OpCode.MUL,
  '/': OpCode.DIV,
  '//': OpCode.DIV,
  '%': OpCode.MOD,
  '^': OpCode.POW,
};

const CMPOPS = {
  '==': OpCode.EQ,
  '<': OpCode.LT,
  '<=': OpCode.LE,
};

module.exports = { OpCode, OpType, getOpType, RKASK, BINOPS, CMPOPS };
