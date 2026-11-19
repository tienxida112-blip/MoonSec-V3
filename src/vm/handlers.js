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
      // Both condition and value contexts have already been lowered to the
      // genuine A=value, B=absolute destination, C=value instruction layout.
      const k = leftK ? (rightK ? 'KK' : 'KR') : (rightK ? 'RK' : 'RR');
      if (!ins.fusedCmp) throw new Error(op + ' must be lowered before choosing an opcode variant');
      const inv = invert ? 'N' : 'P';
      return op + inv + k;
    }
    case OpCode.TEST: return ins.c ? 'TESTC' : 'TEST';
    case OpCode.TESTSET: return ins.invert ? 'TESTSETC' : 'TESTSET';
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
    case OpCode.CLOSURE: return ins.c ? 'CLOSURE' : 'CLOSURE0';
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
  const S = n.stk, I = n.inst, P = n.pc, E = n.env, U = n.upv;
  const IS = n.insts, W = n.wrap, R = n.protos, UN = n.unpack, T = n.top, RR = n._R;
  const IA = `${I}[OP_A]`, IB = `${I}[OP_B]`, IC = `${I}[OP_C]`;
  const sA = `${S}[${IA}]`, sB = `${S}[${IB}]`, sC = `${S}[${IC}]`;
  const moveEnum = n.moveEnum === undefined ? -1 : n.moveEnum;
  const number = n.tonumberName || 'tonumber';
  const error = n.errFn || 'error';
  const setmt = n.setmetatable || 'setmetatable';
  const getmt = n.getmetatable || 'getmetatable';
  const type = n.typeName || 'type';
  const next = n.nextName || 'next';

  // Use native Lua operations here. Besides being smaller than redundant type
  // guards, these preserve Lua's numeric-string coercion and metamethod calls.
  const _jH = {
    MOVE: `${sA}=${sB}`,
    LOADK: `${S}(${IA},${IB})`,
    LOADBOOL: `${sA}=${IB}~=0`,
    LOADBOOLC: `${sA}=${IB}~=0;${P}=${P}+1`,
    LOADNIL: `for a=${IA},${IB} do ${S}[a]=nil end`,
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
    SELF: `local a=${IA};local b=${sB};${S}[a+1]=b;${S}[a]=b[${sC}]`,
    SELFK: `local a=${IA};local b=${sB};${S}[a+1]=b;${S}[a]=b[${IC}]`,
    UNM: `${sA}=-${sB}`,
    NOT: `${sA}=not ${sB}`,
    LEN: `${sA}=#${sB}`,
    CONCAT: `local a=${IC};local b=${S}[a];for c=a-1,${IB},-1 do b=${S}[c]..b end;${sA}=b`,
    JMP: `${P}=${IB}`,
    TEST: `if ${sA} then ${P}=${P}+1 else ${P}=${IB} end`,
    TESTC: `if not ${sA} then ${P}=${P}+1 else ${P}=${IB} end`,
    TESTSET: `local a=${sC};if a then ${P}=${P}+1 else ${sA}=a;${P}=${IB} end`,
    TESTSETC: `local a=${sC};if not a then ${P}=${P}+1 else ${sA}=a;${P}=${IB} end`,
    CALL00: `${sA}()`,
    CALL01: `local a=${IA};${S}[a]=${S}[a]()`,
    CALL10: `local a=${IA};${S}[a](${S}[a+1])`,
    CALL11: `local a=${IA};${S}[a]=${S}[a](${S}[a+1])`,
    CALL0V: `local a=${IA};local b,c=${RR}(${S}[a]());${T}=c+a-1;for d=a,${T} do ${S}[d]=b[d-a+1] end`,
    CALL1V: `local a=${IA};local b,c=${RR}(${S}[a](${S}[a+1]));${T}=c+a-1;for d=a,${T} do ${S}[d]=b[d-a+1] end`,
    CALLV0: `local a=${IA};${S}[a](${UN}(${S},a+1,${T}))`,
    CALLV1: `local a=${IA};${S}[a]=${S}[a](${UN}(${S},a+1,${T}))`,
    CALLVV: `local a=${IA};local b,c=${RR}(${S}[a](${UN}(${S},a+1,${T})));${T}=c+a-1;for d=a,${T} do ${S}[d]=b[d-a+1] end`,
    CALL: `local a=${IA};${S}[a]=${S}[a](${UN}(${S},a+1,${IB}))`,
    CALLN0: `local a=${IA};${S}[a](${UN}(${S},a+1,${IB}))`,
    CALLNV: `local a=${IA};local b,c=${RR}(${S}[a](${UN}(${S},a+1,${IB})));${T}=c+a-1;for d=a,${T} do ${S}[d]=b[d-a+1] end`,
    CALLNM: `local a=${IA};local b={${S}[a](${UN}(${S},a+1,${IB}))};for c=a,${IC} do ${S}[c]=b[c-a+1] end`,
    CALL0M: `local a=${IA};local b={${S}[a]()};for c=a,${IC} do ${S}[c]=b[c-a+1] end`,
    CALL1M: `local a=${IA};local b={${S}[a](${S}[a+1])};for c=a,${IC} do ${S}[c]=b[c-a+1] end`,
    CALLVM: `local a=${IA};local b={${S}[a](${UN}(${S},a+1,${T}))};for c=a,${IC} do ${S}[c]=b[c-a+1] end`,
    TAILCALL0: `do return ${sA}() end`,
    TAILCALLV: `local a=${IA};do return ${S}[a](${UN}(${S},a+1,${T})) end`,
    TAILCALL: `local a=${IA};do return ${S}[a](${UN}(${S},a+1,${IB})) end`,
    RETURN0: `do return end`,
    RETURN1: `do return ${sA} end`,
    RETURN2: `local a=${IA};do return ${S}[a],${S}[a+1] end`,
    RETURNV: `local a=${IA};do return ${UN}(${S},a,${T}) end`,
    RETURN: `local a=${IA};do return ${UN}(${S},a,a+${IB}) end`,
    FORLOOP: `local a=${IA};local b=${S}[a+2];local c=${S}[a]+b;${S}[a]=c;if b>0 then if c<=${S}[a+1] then ${P}=${IB};${S}[a+3]=c end elseif c>=${S}[a+1] then ${P}=${IB};${S}[a+3]=c end`,
    FORPREP: `local a=${IA};local b=${number}(${S}[a]);local c=${number}(${S}[a+1]);local d=${number}(${S}[a+2]);if b==nil then ${error}("'for' initial value must be a number")end;if c==nil then ${error}("'for' limit must be a number")end;if d==nil then ${error}("'for' step must be a number")end;b=(b-d)+d;${S}[a]=b;${S}[a+1]=c;${S}[a+2]=d;if (d>0 and b<=c)or(d<=0 and b>=c)then ${S}[a+3]=b else ${P}=${IB} end`,
    ITERPREP: `local a=${IA};local b=${S}[a];if ${type}(b)~="function" then local c=${getmt}(b);local d=${type}(c)=="table" and c.__iter;if d then ${S}[a],${S}[a+1],${S}[a+2]=d(b) elseif ${type}(b)=="table" and not (${type}(c)=="table" and c.__call) then ${S}[a],${S}[a+1],${S}[a+2]=${next},b,nil end end`,
    TFORLOOP: `local a=${IA};local b=a+2;local c={${S}[a](${S}[a+1],${S}[b])};for d=1,${IC} do ${S}[b+d]=c[d] end;local e=c[1];if e~=nil then ${S}[b]=e;${P}=${IB} else ${P}=${P}+1 end`,
    SETLIST: `local a=${IA};local b=${S}[a];local c=(${IC}-1)*50;for d=a+1,${IB} do b[c+d-a]=${S}[d] end`,
    SETLISTV: `local a=${IA};local b=${S}[a];local c=(${IC}-1)*50;for d=a+1,${T} do b[c+d-a]=${S}[d] end`,
    CLOSE: `local a={};for f=1,#${n.lupv} do local b=${n.lupv}[f];for g=0,#b do local c=b[g];local d=c[1];local e=c[2];if d==${S} and e>=${IA} then a[e]=d[e];c[1]=a end end end`,
    CLOSURE: `local a=${R}[${IB}];if (${IC} or 0)>0 then local b={};local c=${setmt}({},{__index=function(_,k)local d=b[k];return d[1][d[2]] end,__newindex=function(_,k,ar)local d=b[k];d[1][d[2]]=ar end});for f=1,${IC} do ${P}=${P}+1;local e=${IS}[${P}];if e[OP_ENUM]==${moveEnum} then b[f-1]={${S},e[OP_B]} else b[f-1]={${U},e[OP_B]} end end;${n.lupv}[#${n.lupv}+1]=b;${sA}=${W}(a,c,${E}) else ${sA}=${W}(a,nil,${E}) end`,
    CLOSURE0: `${sA}=${W}(${R}[${IB}],nil,${E})`,
    VARARG: `local a=${IA};for b=a,${IB} do ${S}[b]=${n.vararg}[b-a] end`,
    VARARGV: `local a=${IA};${T}=a+${n.varargz}-1;for b=a,${T} do ${S}[b]=${n.vararg}[b-a] end`,
  };

  const arith = { ADD: '+', SUB: '-', MUL: '*', DIV: '/', MOD: '%', POW: '^' };
  for (const [op, sym] of Object.entries(arith)) {
    _jH[op + 'RR'] = `${sA}=${sB}${sym}${sC}`;
    _jH[op + 'RK'] = `${sA}=${sB}${sym}${IC}`;
    _jH[op + 'KR'] = `${sA}=${IB}${sym}${sC}`;
    _jH[op + 'KK'] = `${sA}=${IB}${sym}${IC}`;
  }

  function cmp(op, l, r, inv) {
    const rel = op === 'EQ' ? (inv ? '~=' : '==') : op === 'LT' ? '<' : '<=';
    if (!inv || op === 'EQ') {
      return `if ${l}${rel}${r} then ${P}=${P}+1 else ${P}=${IB} end`;
    }
    return `if ${l}${rel}${r} then ${P}=${IB} else ${P}=${P}+1 end`;
  }
  for (const op of ['EQ', 'LT', 'LE']) {
    _jH[op + 'PRR'] = cmp(op, sA, sC, false);
    _jH[op + 'PRK'] = cmp(op, sA, IC, false);
    _jH[op + 'PKR'] = cmp(op, IA, sC, false);
    _jH[op + 'PKK'] = cmp(op, IA, IC, false);
    _jH[op + 'NRR'] = cmp(op, sA, sC, true);
    _jH[op + 'NRK'] = cmp(op, sA, IC, true);
    _jH[op + 'NKR'] = cmp(op, IA, sC, true);
    _jH[op + 'NKK'] = cmp(op, IA, IC, true);
  }
  return _jH;
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

// Handler temporaries are scoped within individual dispatch leaves.
handlers.tempNames = ["a","b","c","d","e","f","g"];
