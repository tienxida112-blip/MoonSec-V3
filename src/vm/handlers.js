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
  // Supplied by generateVM: coerces an operand to a number using Lua's
  // string-to-number rules and raises the standard arithmetic error otherwise.
  const numOf = n.numOf || 'tonumber';
  const _jS = n.stk, _jI = n.inst, _jIS = n.insts, _jP = n.pc, _jE = n.env, _jU = n.upv;
  const _jW = n.wrap, _jR = n.protos, _jUN = n.unpack, _jT = n.top, _jRR = n._R;
  const IA = `${_jI}[OP_A]`, IB = `${_jI}[OP_B]`, IC = `${_jI}[OP_C]`;
  const sA = `${_jS}[${IA}]`, sB = `${_jS}[${IB}]`, sC = `${_jS}[${IC}]`;
  const moveEnum = n.moveEnum === undefined ? -1 : n.moveEnum;
  // cache of a standard-library entry point, never the literal name
  const insFn = n.tinsert || 'table.insert';
  // `type` and `error` are looked up through the decoded string table, never
  // spelled literally, so they are only available as VM locals.
  const ty = n.typeName || 'type';
  const er = n.errFn || 'error';
  // Every kind check above and below spells the same set of type names, so keep
  // them once and compare against the short forms.
  const KINDS = ['nil', 'boolean', 'number', 'string', 'table', 'function'];

  const _jH = {
    MOVE: `${n.guard}(${IA},${IB});${sA}=${sB}`,
    LOADK: `${n.guard2}(${IA},${IB});${n.setEnv}(${_jS},${IA},${IB})`,
    LOADBOOL: `${n.guard}(${IA},${IB});${sA}=${IB}~=0`,
    LOADBOOLC: `${n.guard}(${IA},${IB});${sA}=${IB}~=0;${_jP}=${_jP}+1`,
    LOADNIL: `for a=${IA},${IB} do ${_jS}[a]=nil end`,
    GETUPVAL: `${sA}=${_jU}[${IB}]`,
    GETGLOBAL: `local a=${_jE}[${IB}];${n.guard4}(a,${IB});${sA}=a`,
    GETTABLE: `local a=${sB};local b=${ty}(a);if b=="nil"then ${er}("attempt to index a nil value")end;if b=="boolean"or b=="number"then ${er}("attempt to index a "..b.." value")end;${sA}=a[${sC}]`,
    GETTABLEK: `local a=${sB};local b=${ty}(a);if b=="nil"then ${er}("attempt to index a nil value")end;if b=="boolean"or b=="number"then ${er}("attempt to index a "..b.." value")end;${sA}=a[${IC}]`,
    SETGLOBAL: `${_jE}[${IB}]=${sA}`,
    SETUPVAL: `${_jU}[${IB}]=${sA}`,
    SETTABLE: `local a=${sA};local b=${ty}(a);if b=="nil"then ${er}("attempt to index a nil value")end;if b=="boolean"or b=="number"then ${er}("attempt to index a "..b.." value")end;local c=${sB};if c==nil then ${er}("index is nil")end;a[c]=${sC}`,
    SETTABLEK: `local a=${sA};local b=${ty}(a);if b=="nil"then ${er}("attempt to index a nil value")end;if b=="boolean"or b=="number"then ${er}("attempt to index a "..b.." value")end;local c=${sB};if c==nil then ${er}("index is nil")end;a[c]=${IC}`,
    SETTABLEKR: `local a=${sA};local b=${ty}(a);if b=="nil"then ${er}("attempt to index a nil value")end;if b=="boolean"or b=="number"then ${er}("attempt to index a "..b.." value")end;local c=${IB};if c==nil then ${er}("index is nil")end;a[c]=${sC}`,
    SETTABLEKK: `local a=${sA};local b=${ty}(a);if b=="nil"then ${er}("attempt to index a nil value")end;if b=="boolean"or b=="number"then ${er}("attempt to index a "..b.." value")end;local c=${IB};if c==nil then ${er}("index is nil")end;a[c]=${IC}`,
    NEWTABLE: `${n.guard3}(${IA});${sA}={}`,
    SELF: `local a=${IA};local b=${sB};${_jS}[a+1]=b;${_jS}[a]=b[${sC}]`,
    SELFK: `local a=${IA};local b=${sB};${_jS}[a+1]=b;${_jS}[a]=b[${IC}]`,
    UNM: `${sA}=-${sB}`,
    NOT: `${sA}=not ${sB}`,
    LEN: `local a=${sB};local b=${ty}(a);if b~="nil"and b~="boolean"and b~="number"and b~="function"then ${sA}=#a else ${er}("attempt to get length of a "..b.." value")end`,
    CONCAT: `local a=${IB};local b="";for e=a,${IC} do local c=${_jS}[e];local d=${ty}(c);if d~="string"and d~="number"then ${er}("attempt to concatenate a "..d.." value")end;b=b..c end;${sA}=b`,
    JMP: `${n.guard5}(${IB});local a=${n.brk}[#${n.brk}];if a and ${IB}>a then ${n.brk}[#${n.brk}]=nil end;local b=${n.hook};if b then b(${_jP},${IB})end;${_jP}=${IB}`,
    TEST: `if ${sA} then ${_jP}=${_jP}+1 else ${_jP}=${IB} end`,
    TESTC: `if not ${sA} then ${_jP}=${_jP}+1 else ${_jP}=${IB} end`,
    TESTSET: `local a=${sC};if a then ${_jP}=${_jP}+1 else ${sA}=a;${_jP}=${IB} end`,
    CALL00: `${sA}()`,
    CALL01: `local a=${IA};${_jS}[a]=${_jS}[a]()`,
    CALL10: `local a=${IA};${_jS}[a](${_jS}[a+1])`,
    CALL11: `local a=${IA};${_jS}[a]=${_jS}[a](${_jS}[a+1])`,
    CALL0V: `local a=${IA};local b,c=${_jRR}(${_jS}[a]());${_jT}=(c+a)-1;local d=0;for e=a,${_jT} do d=d+1;${_jS}[e]=b[d] end`,
    CALL1V: `local a=${IA};local b,c=${_jRR}(${_jS}[a](${_jS}[a+1]));${_jT}=(c+a)-1;local d=0;for e=a,${_jT} do d=d+1;${_jS}[e]=b[d] end`,
    CALLV0: `local a=${IA};${_jS}[a](${_jUN}(${_jS},a+1,${_jT}))`,
    CALLV1: `local a=${IA};${_jS}[a]=${_jS}[a](${_jUN}(${_jS},a+1,${_jT}))`,
    CALLVV: `local a=${IA};local b,c=${_jRR}(${_jS}[a](${_jUN}(${_jS},a+1,${_jT})));${_jT}=(c+a)-1;local d=0;for e=a,${_jT} do d=d+1;${_jS}[e]=b[d] end`,
    CALL: `local a=${IA};${_jS}[a]=${_jS}[a](${_jUN}(${_jS},a+1,${IB}))`,
    CALLN0: `local a=${IA};${_jS}[a](${_jUN}(${_jS},a+1,${IB}))`,
    CALLNV: `local a=${IA};local b,c=${_jRR}(${_jS}[a](${_jUN}(${_jS},a+1,${IB})));${_jT}=(c+a)-1;local d=0;for e=a,${_jT} do d=d+1;${_jS}[e]=b[d] end`,
    CALLNM: `local a=${IA};local b={${_jS}[a](${_jUN}(${_jS},a+1,${IB}))};local c=0;for d=a,${IC} do c=c+1;${_jS}[d]=b[c] end`,
    CALL0M: `local a=${IA};local b={${_jS}[a]()};local c=${IC};local d=0;for e=a,c do d=d+1;${_jS}[e]=b[d] end`,
    CALL1M: `local a=${IA};local b={${_jS}[a](${_jS}[a+1])};local c=0;for d=a,${IC} do c=c+1;${_jS}[d]=b[c] end`,
    CALLVM: `local a=${IA};local b={${_jS}[a](${_jUN}(${_jS},a+1,${_jT}))};local c=0;for d=a,${IC} do c=c+1;${_jS}[d]=b[c] end`,
    TAILCALL0: `do return ${sA}() end`,
    TAILCALLV: `local a=${IA};do return ${_jS}[a](${_jUN}(${_jS},a+1,${_jT})) end`,
    TAILCALL: `local a=${IA};do return ${_jS}[a](${_jUN}(${_jS},a+1,${IB})) end`,
    RETURN0: `${n.retGuard}();do return end`,
    RETURN1: `do return ${sA} end`,
    RETURN2: `local a=${IA};do return ${_jS}[a],${_jS}[a+1] end`,
    RETURNV: `local a=${IA};do return ${_jUN}(${_jS},a,${_jT}) end`,
    RETURN: `local a=${IA};do return ${_jUN}(${_jS},a,a+${IB}) end`,
    FORLOOP: `local a=${IA};local b=${_jS}[a+2];local c=${_jS}[a]+b;${_jS}[a]=c;if b>0 then if c<=${_jS}[a+1] then ${_jP}=${IB};${_jS}[a+3]=c end elseif c>=${_jS}[a+1] then ${_jP}=${IB};${_jS}[a+3]=c end;${n.brk}[#${n.brk}+1]=${_jP}+${IB}` ,
    FORPREP: `${n.brk}={};local a=${IA};local b=${_jS}[a];local c=${_jS}[a+2];if c>0 then if b>${_jS}[a+1] then ${_jP}=${IB} else ${_jS}[a+3]=b end elseif b<${_jS}[a+1] then ${_jP}=${IB} else ${_jS}[a+3]=b end`,
    TFORLOOP: `if ${IB}==0 then ${n.brk}={} end;local a=${IA};local b=${IC};local c=a+2;local d={${_jS}[a](${_jS}[a+1],${_jS}[c])};for f=1,b do ${_jS}[c+f]=d[f] end;local e=d[1];if e then ${_jS}[c]=e else ${_jP}=${_jP}+1 end`,    SETLIST: `local a=${IA};local b=${_jS}[a];for c=(a+1),${IB} do b[c-a]=${_jS}[c] end`,
    SETLISTV: `local a=${IA};local b=${_jS}[a];for c=(a+1),${_jT} do b[c-a]=${_jS}[c] end`,
    CLOSE: `local a={};for f=1,#${n.lupv} do local b=${n.lupv}[f];for g=0,#b do local c=b[g];local d=c[1];local e=c[2];if (d==${_jS})and(e>=${IA}) then a[e]=d[e];c[1]=a end end end;${sA}=${_jS}[${IA}]`,
    CLOSURE: `local a=${_jR}[${IB}+1];if ${IC}>0 then local b={};local c=setmetatable({},{__index=function(_,k)local d=b[k];return d[1][d[2]] end,__newindex=function(_,k,ar)local d=b[k];d[1][d[2]]=ar end});for f=1,${IC} do ${_jP}=${_jP}+1;local e=${_jIS}[${_jP}];if e[OP_ENUM]==${moveEnum} then b[f-1]={${_jS},e[OP_B]} else b[f-1]={${_jU},e[OP_B]} end;${n.lupv}[#${n.lupv}+1]=b end;${sA}=${_jW}(a,c,${_jE}) else ${sA}=${_jW}(a,nil,${_jE}) end`,
    VARARG: `local a=${IA};local b=${IB};for c=a,b do ${_jS}[c]=${n.vararg}[c-a] end`,
    VARARGV: `local a=${IA};${_jT}=((a+${n.varargz})-1);for c=a,${_jT} do local b=${n.vararg}[(c-a)];${_jS}[c]=b end`,
  };

  // Arithmetic obeys Lua's coercion rules: a string operand that looks like a
  // number is converted, anything else raises. The reference VM carries this
  // per-operand type logic, and without it a compiled `"10" + 1` (which the
  // reference handles) would be a hard error here.
  // Each VM holds the two operands in named locals and asks the helper for the
  // numeric value, so one shared conversion routine serves RR/RK/KR/KK alike
  // instead of four inlined copies per operator.
  const arith = { ADD: '+', SUB: '-', MUL: '*', DIV: '/', MOD: '%', POW: '^' };
  for (const [op, sym] of Object.entries(arith)) {
    _jH[op + 'RR'] = `local a=${sB};local b=${sC};${sA}=${numOf}(a)${sym}${numOf}(b)`;
    _jH[op + 'RK'] = `local a=${sB};local b=${IC};${sA}=${numOf}(a)${sym}${numOf}(b)`;
    _jH[op + 'KR'] = `local a=${IB};local b=${sC};${sA}=${numOf}(a)${sym}${numOf}(b)`;
    _jH[op + 'KK'] = `local a=${IB};local b=${IC};${sA}=${numOf}(a)${sym}${numOf}(b)`;
  }

  function cmp(op, l, r, inv) {
    const rel = op === 'EQ' ? (inv ? '~=' : '==') : op === 'LT' ? '<' : '<=';
    if (!inv || op === 'EQ') {
      return `if ${l}${rel}${r} then ${_jP}=${_jP}+1 else ${_jP}=${IB} end`;
    }
    return `if ${l}${rel}${r} then ${_jP}=${IB} else ${_jP}=${_jP}+1 end`;
  }
  // Value-context compare: Lua 5.1 skips the following instruction when the
  // comparison result equals the A flag. A=1 variants implement `~=`.
  const cmpValue = (op, l, r) => {
    const rel = op === 'EQ' ? '==' : op === 'LT' ? '<' : '<=';
    return `if ${l}${rel}${r} then ${_jP}=${_jP}+1 end`;
  };
  const cmpValueN = (op, l, r) => {
    const rel = op === 'EQ' ? '~=' : op === 'LT' ? '>=' : '>';
    return `if ${l}${rel}${r} then ${_jP}=${_jP}+1 end`;
  };
  // Non-fused compares keep Lua 5.1's operand layout: A is the skip flag, B is
  // the left operand and C the right operand. (Only the fused P/N forms move the
  // left operand into A and the jump target into B.)
  for (const op of ['EQ', 'LT', 'LE']) {
    const operands = { RR: [sB, sC], RK: [sB, IC], KR: [IB, sC], KK: [IB, IC] };
    for (const [k, [l, r]] of Object.entries(operands)) {
      _jH[op + 'V0' + k] = cmpValue(op, l, r);
      _jH[op + 'V1' + k] = cmpValueN(op, l, r);
    }
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

// Temporary identifiers declared inside the compressed handler templates.
// generateVM reserves them so a random VM local can never shadow one.
// Leaf templates only ever declare a..g (see the renaming pass: block-scoped
// temporaries are reused per leaf), so only those letters are reserved here.
handlers.tempNames = ["a","b","c","d","e","f","g"];
