'use strict';

const { OpCode, RKASK } = require('../bytecode/opcodes');

function variantOf(ins) {
  const op = ins.op;
  const bK = ins.b >= RKASK;
  const cK = ins.c >= RKASK;
  const invert = ins.invert !== undefined ? ins.invert : 0;
  const leftK = ins.fusedCmp ? ins.a >= RKASK : bK;
  const rightK = ins.fusedCmp ? ins.c >= RKASK : cK;

  switch (op) {
    case OpCode.LOADBOOL: return ins.c ? 'LOADBOOLC' : 'LOADBOOL';
    case OpCode.GETTABLE: return cK ? 'GETTABLEK' : 'GETTABLE';
    case OpCode.SETTABLE:
      if (bK && cK) return 'SETTABLEKK';
      if (bK) return 'SETTABLEKR';
      if (cK) return 'SETTABLEK';
      return 'SETTABLE';
    case OpCode.SELF: return cK ? 'SELFK' : 'SELF';
    case OpCode.ADD:
    case OpCode.SUB:
    case OpCode.MUL:
    case OpCode.DIV:
    case OpCode.MOD:
    case OpCode.POW: {
      if (bK && cK) return op + 'KK';
      if (bK) return op + 'KR';
      if (cK) return op + 'RK';
      return op + 'RR';
    }
    case OpCode.EQ:
    case OpCode.LT:
    case OpCode.LE: {
      // Only compares fused with a following JMP may jump. A compare used as a
      // value (the compiler emits EQ/LT/LE + LOADBOOL + LOADBOOL) must merely
      // skip the next instruction, otherwise its "false" branch would use the
      // operand register number as a jump target.
      const k = leftK ? (rightK ? 'KK' : 'KR') : (rightK ? 'RK' : 'RR');
      // Value context keeps Lua 5.1's A flag: skip the next instruction when
      // the comparison result equals A. `~=` sets A=1, so it needs its own
      // variant; ignoring A made `a ~= b` evaluate as `a == b`.
      if (!ins.fusedCmp) return op + 'V' + ((ins.a | 0) ? '1' : '0') + k;
      const inv = invert ? 'N' : 'P';
      return op + inv + k;
    }
    case OpCode.TEST: return ins.c ? 'TESTC' : 'TEST';
    case OpCode.CALL: {
      const B = ins.b | 0, C = ins.c | 0;
      if (B === 1 && C === 1) return 'CALL00';
      if (B === 1 && C === 2) return 'CALL01';
      if (B === 2 && C === 1) return 'CALL10';
      if (B === 2 && C === 2) return 'CALL11';
      if (B === 1 && C === 0) return 'CALL0V';
      if (B === 2 && C === 0) return 'CALL1V';
      if (B === 0 && C === 1) return 'CALLV0';
      if (B === 0 && C === 2) return 'CALLV1';
      if (B === 0 && C === 0) return 'CALLVV';
      if (B === 1 && C >= 3) return 'CALL0M';
      if (B === 2 && C >= 3) return 'CALL1M';
      if (B === 0 && C >= 3) return 'CALLVM';
      if (B >= 3 && C === 1) return 'CALLN0';
      if (B >= 3 && C === 2) return 'CALL';
      if (B >= 3 && C === 0) return 'CALLNV';
      if (B >= 3 && C >= 3) return 'CALLNM';
      return 'CALL';
    }
    case OpCode.RETURN:
      if (ins.b === 1) return 'RETURN0';
      if (ins.b === 2) return 'RETURN1';
      if (ins.b === 3) return 'RETURN2';
      if (ins.b === 0) return 'RETURNV';
      return 'RETURN';
    case OpCode.CLOSURE: return 'CLOSURE';
    case OpCode.SETLIST: return ins.b === 0 ? 'SETLISTV' : 'SETLIST';
    case OpCode.VARARG: return ins.b === 0 ? 'VARARGV' : 'VARARG';
    case OpCode.TAILCALL:
      if (ins.b === 1) return 'TAILCALL0';
      if (ins.b === 0) return 'TAILCALLV';
      return 'TAILCALL';
    default: return op;
  }
}

function handlers(n) {
  const S = n.stk, I = n.inst, IS = n.insts, P = n.pc, E = n.env, U = n.upv;
  const W = n.wrap, R = n.protos, UN = n.unpack, T = n.top, RR = n._R;
  const IA = `${I}[OP_A]`, IB = `${I}[OP_B]`, IC = `${I}[OP_C]`;
  const sA = `${S}[${IA}]`, sB = `${S}[${IB}]`, sC = `${S}[${IC}]`;
  const moveEnum = n.moveEnum === undefined ? -1 : n.moveEnum;

  const H = {
    MOVE: `${sA}=${sB}`,
    LOADK: `${S}(${IA},${IB})`,
    LOADBOOL: `${sA}=${IB}~=0`,
    LOADBOOLC: `${sA}=${IB}~=0;${P}=${P}+1`,
    LOADNIL: `for _i=${IA},${IB} do ${S}[_i]=nil end`,
    GETUPVAL: `${sA}=${U}[${IB}]`,
    GETGLOBAL: `${sA}=${E}[${IB}]`,
    GETTABLE: `${sA}=${sB}[${sC}]`,
    GETTABLEK: `${sA}=${sB}[${IC}]`,
    SETGLOBAL: `${E}[${IB}]=${sA}`,
    SETUPVAL: `${U}[${IB}]=${sA}`,
    SETTABLE: `${sA}[${sB}]=${sC}`,
    SETTABLEK: `${sA}[${sB}]=${IC}`,
    SETTABLEKR: `${sA}[${IB}]=${sC}`,
    SETTABLEKK: `${sA}[${IB}]=${IC}`,
    NEWTABLE: `${sA}={}`,
    SELF: `local _17=${IA};local _18=${sB};${S}[_17+1]=_18;${S}[_17]=_18[${sC}]`,
    SELFK: `local _17=${IA};local _18=${sB};${S}[_17+1]=_18;${S}[_17]=_18[${IC}]`,
    UNM: `${sA}=-${sB}`,
    NOT: `${sA}=not ${sB}`,
    LEN: `${sA}=#${sB}`,
    CONCAT: `local _216=${IB};local _217=${S}[_216];for _218=_216+1,${IC} do _217=_217..${S}[_218] end;${sA}=_217`,
    JMP: `${P}=${IB}`,
    TEST: `if ${sA} then ${P}=${P}+1 else ${P}=${IB} end`,
    TESTC: `if not ${sA} then ${P}=${P}+1 else ${P}=${IB} end`,
    TESTSET: `local _3=${sC};if _3 then ${P}=${P}+1 else ${sA}=_3;${P}=${IB} end`,
    CALL00: `${sA}()`,
    CALL01: `local _85=${IA};${S}[_85]=${S}[_85]()`,
    CALL10: `local _354=${IA};${S}[_354](${S}[_354+1])`,
    CALL11: `local _52=${IA};${S}[_52]=${S}[_52](${S}[_52+1])`,
    CALL0V: `local _75=${IA};local _76,_77=${RR}(${S}[_75]());${T}=(_77+_75)-1;local _78=0;for _79=_75,${T} do _78=_78+1;${S}[_79]=_76[_78] end`,
    CALL1V: `local _63=${IA};local _64,_65=${RR}(${S}[_63](${S}[_63+1]));${T}=(_65+_63)-1;local _66=0;for _67=_63,${T} do _66=_66+1;${S}[_67]=_64[_66] end`,
    CALLV0: `local _133=${IA};${S}[_133](${UN}(${S},_133+1,${T}))`,
    CALLV1: `local _80=${IA};${S}[_80]=${S}[_80](${UN}(${S},_80+1,${T}))`,
    CALLVV: `local _189=${IA};local _190,_191=${RR}(${S}[_189](${UN}(${S},_189+1,${T})));${T}=(_191+_189)-1;local _192=0;for _193=_189,${T} do _192=_192+1;${S}[_193]=_190[_192] end`,
    CALL: `local _19=${IA};${S}[_19]=${S}[_19](${UN}(${S},_19+1,${IB}))`,
    CALLN0: `local _194=${IA};${S}[_194](${UN}(${S},_194+1,${IB}))`,
    CALLNV: `local _423=${IA};local _424,_425=${RR}(${S}[_423](${UN}(${S},_423+1,${IB})));${T}=(_425+_423)-1;local _426=0;for _427=_423,${T} do _426=_426+1;${S}[_427]=_424[_426] end`,
    CALLNM: `local _57=${IA};local _58={${S}[_57](${UN}(${S},_57+1,${IB}))};local _59=0;for _60=_57,${IC} do _59=_59+1;${S}[_60]=_58[_59] end`,
    CALL0M: `local _511=${IA};local _512={${S}[_511]()};local _513=${IC};local _514=0;for _515=_511,_513 do _514=_514+1;${S}[_515]=_512[_514] end`,
    CALL1M: `local _324=${IA};local _325={${S}[_324](${S}[_324+1])};local _326=0;for _327=_324,${IC} do _326=_326+1;${S}[_327]=_325[_326] end`,
    CALLVM: `local _1066=${IA};local _1067={${S}[_1066](${UN}(${S},_1066+1,${T}))};local _1068=0;for _1069=_1066,${IC} do _1068=_1068+1;${S}[_1069]=_1067[_1068] end`,
    TAILCALL0: `do return ${sA}() end`,
    TAILCALLV: `local _135=${IA};do return ${S}[_135](${UN}(${S},_135+1,${T})) end`,
    TAILCALL: `local _64=${IA};do return ${S}[_64](${UN}(${S},_64+1,${IB})) end`,
    RETURN0: `do return end`,
    RETURN1: `do return ${sA} end`,
    RETURN2: `local _601=${IA};do return ${S}[_601],${S}[_601+1] end`,
    RETURNV: `local _1003=${IA};do return ${UN}(${S},_1003,${T}) end`,
    RETURN: `local _879=${IA};do return ${UN}(${S},_879,_879+${IB}) end`,
    FORLOOP: `local _144=${IA};local _145=${S}[_144+2];local _146=${S}[_144]+_145;${S}[_144]=_146;if _145>0 then if _146<=${S}[_144+1] then ${P}=${IB};${S}[_144+3]=_146 end elseif _146>=${S}[_144+1] then ${P}=${IB};${S}[_144+3]=_146 end`,
    FORPREP: `local _200=${IA};local _201=${S}[_200];local _202=${S}[_200+2];if _202>0 then if _201>${S}[_200+1] then ${P}=${IB} else ${S}[_200+3]=_201 end elseif _201<${S}[_200+1] then ${P}=${IB} else ${S}[_200+3]=_201 end`,
    TFORLOOP: `local _180=${IA};local _181=${IC};local _182=_180+2;local _183={${S}[_180](${S}[_180+1],${S}[_182])};for _184=1,_181 do ${S}[_182+_184]=_183[_184] end;local _185=_183[1];if _185 then ${S}[_182]=_185 else ${P}=${P}+1 end`,    SETLIST: `local _504=${IA};local _505=${S}[_504];for _506=(_504+1),${IB} do table.insert(_505,${S}[_506]) end`,
    SETLISTV: `local _273=${IA};local _275=${S}[_273];for _277=(_273+1),${T} do table.insert(_275,${S}[_277]) end`,
    CLOSE: `local _277={};for _278=1,#${n.lupv} do local _279=${n.lupv}[_278];for _280=0,#_279 do local _281=_279[_280];local _282=_281[1];local _283=_281[2];if (_282==${S})and(_283>=${IA}) then _277[_283]=_282[_283];_281[1]=_277 end end end`,
    CLOSURE: `local _uProto=${R}[${IB}+1];if ${IC}>0 then local _uIndex={};local _uValues=setmetatable({},{__index=function(_,k)local r=_uIndex[k];return r[1][r[2]] end,__newindex=function(_,k,v)local r=_uIndex[k];r[1][r[2]]=v end});for _u=1,${IC} do ${P}=${P}+1;local _d=${IS}[${P}];if _d[OP_ENUM]==${moveEnum} then _uIndex[_u-1]={${S},_d[OP_B]} else _uIndex[_u-1]={${U},_d[OP_B]} end;${n.lupv}[#${n.lupv}+1]=_uIndex end;${sA}=${W}(_uProto,_uValues,${E}) else ${sA}=${W}(_uProto,nil,${E}) end`,
    VARARG: `local _328=${IA};local _329=${IB};for _330=_328,_329 do ${S}[_330]=${n.vararg}[_330-_328] end`,
    VARARGV: `local _273=${IA};${T}=((_273+${n.varargz})-1);for _276=_273,${T} do local _274=${n.vararg}[(_276-_273)];${S}[_276]=_274 end`,
  };

  const arith = { ADD: '+', SUB: '-', MUL: '*', DIV: '/', MOD: '%', POW: '^' };
  for (const [op, sym] of Object.entries(arith)) {
    H[op + 'RR'] = `${sA}=${sB}${sym}${sC}`;
    H[op + 'RK'] = `${sA}=${sB}${sym}${IC}`;
    H[op + 'KR'] = `${sA}=${IB}${sym}${sC}`;
    H[op + 'KK'] = `${sA}=${IB}${sym}${IC}`;
  }

  function cmp(op, l, r, inv) {
    const rel = op === 'EQ' ? (inv ? '~=' : '==') : op === 'LT' ? '<' : '<=';
    if (!inv || op === 'EQ') {
      return `if ${l}${rel}${r} then ${P}=${P}+1 else ${P}=${IB} end`;
    }
    return `if ${l}${rel}${r} then ${P}=${IB} else ${P}=${P}+1 end`;
  }
  // Value-context compare: Lua 5.1 skips the following instruction when the
  // comparison result equals the A flag. A=1 variants implement `~=`.
  const cmpValue = (op, l, r) => {
    const rel = op === 'EQ' ? '==' : op === 'LT' ? '<' : '<=';
    return `if ${l}${rel}${r} then ${P}=${P}+1 end`;
  };
  const cmpValueN = (op, l, r) => {
    const rel = op === 'EQ' ? '~=' : op === 'LT' ? '>=' : '>';
    return `if ${l}${rel}${r} then ${P}=${P}+1 end`;
  };
  // Non-fused compares keep Lua 5.1's operand layout: A is the skip flag, B is
  // the left operand and C the right operand. (Only the fused P/N forms move the
  // left operand into A and the jump target into B.)
  for (const op of ['EQ', 'LT', 'LE']) {
    const operands = { RR: [sB, sC], RK: [sB, IC], KR: [IB, sC], KK: [IB, IC] };
    for (const [k, [l, r]] of Object.entries(operands)) {
      H[op + 'V0' + k] = cmpValue(op, l, r);
      H[op + 'V1' + k] = cmpValueN(op, l, r);
    }
  }
  for (const op of ['EQ', 'LT', 'LE']) {
    H[op + 'PRR'] = cmp(op, sA, sC, false);
    H[op + 'PRK'] = cmp(op, sA, IC, false);
    H[op + 'PKR'] = cmp(op, IA, sC, false);
    H[op + 'PKK'] = cmp(op, IA, IC, false);
    H[op + 'NRR'] = cmp(op, sA, sC, true);
    H[op + 'NRK'] = cmp(op, sA, IC, true);
    H[op + 'NKR'] = cmp(op, IA, sC, true);
    H[op + 'NKK'] = cmp(op, IA, IC, true);
  }
  return H;
}

function collectVariants(proto, set = new Set()) {
  for (const ins of proto.instructions) {
    // CLOSURE's inline MOVE/GETUPVAL descriptors are serialized opcodes too;
    // the VM consumes them while building the closure, rather than dispatching
    // them as ordinary instructions.
    set.add(ins.upval ? ins.op : variantOf(ins));
  }
  for (const f of proto.functions) collectVariants(f, set);
  return set;
}

function remapVariants(proto) {
  for (const ins of proto.instructions) {
    if (ins.upval) { ins.variant = ins.op; continue; }
    ins.variant = variantOf(ins);
  }
  for (const f of proto.functions) remapVariants(f);
}

module.exports = { variantOf, handlers, collectVariants, remapVariants };
