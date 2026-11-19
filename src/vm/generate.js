'use strict';

const { handlers } = require('./handlers');
const { encodeBytes } = require('../encode');
const { Lexer } = require('../lua/lexer');
const { shortenLocals } = require('./rename');
const { bitDispatcher } = require('./readers');

// Minify tokens, not string contents. In particular, whitespace in the codec's
// alphabet and decimal escapes in the import blob must not be rewritten.
function minify(src) {
  const lexer = new Lexer(src);
  let output = '', previous = '';
  for (;;) {
    lexer.skipSpaceAndComments();
    const start = lexer.i, token = lexer.next();
    if (token.type === 'eof') break;
    const text = src.slice(start, lexer.i);
    const last = previous.slice(-1), first = text[0];
    const separate = (/[\w]/.test(last) && /[\w]/.test(first)) ||
      (token.type === '..' && /^[0-9]/.test(previous)) ||
      (/\d$/.test(previous) && first === '.') ||
      (last === '.' && first === '.') ||
      (last === '-' && first === '-') ||
      (last === '[' && (first === '[' || first === '=')) ||
      (['<=', '>=', '~=', '==', '::', '//'].includes(last + first));
    output += (separate ? ' ' : '') + text;
    previous = text;
  }
  return output;
}

function quote(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function binary(s) {
  return '"' + [...s].map(c => '\\' + c.charCodeAt(0)).join('') + '"';
}

function key8(rng, used) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_';
  let name;
  do {
    name = '';
    while (name.length < 8) name += chars[rng.int(chars.length)];
  } while (used.has(name));
  used.add(name);
  return name;
}

function importBlob(entries) {
  let blob = '';
  const sized = s => String.fromCharCode(s.length) + s;
  for (const e of entries) {
    blob += String.fromCharCode(e.control) + sized(e.names[0]);
    if (e.control === 0) blob += sized(e.names[1]);
    blob += e.key;
  }
  return blob + '\x05';
}

// This arithmetic really derives the payload key. Evaluate the same bounded
// integer recurrence in JavaScript and Lua; never rely on a partial Lua
// evaluator or cancel a decorative computation with `return 0`.
function keyExpression(rng, key) {
  const initial = rng.range(100, 30000), rounds = rng.range(8, 18);
  const mul = rng.range(23, 499), add = rng.range(33, 997);
  const other = rng.range(101, 1599), mod = rng.range(20001, 49001);
  const split = rng.range(200, 1700), half = Math.floor(split / 2);
  let value = initial;
  for (let i = 0; i < rounds; i++) {
    value = value % split < half ? (value * mul + add) % mod : (value + other) % mod;
  }
  return `(${key - value}+(function()
local counter,value=0,${initial};
while counter<${rounds} do
if value%${split}<${half} then value=(value*${mul}+${add})%${mod}
else value=(value+${other})%${mod} end;
counter=counter+1;
end;
return value;
end)())`;
}

// Initialize the wrapper through a modular state machine. Every task does real
// work once. Simulate the schedule to determine a terminating bound, rather
// than padding a fixed number of loops/locals into the output.
function initializer(tasks, rng) {
  const mul = rng.range(71, 997), add = rng.range(37, 799), mod = 65521;
  const order = rng.shuffle(tasks), keys = new Set();
  let value = 24915, rounds = 0;
  const visited = new Set();
  while (visited.size < tasks.length && rounds < 1000) {
    value = (value * mul + add) % mod;
    visited.add(value % tasks.length);
    rounds++;
  }
  if (visited.size !== tasks.length) return tasks.join(';');
  const key = () => {
    let k; do k = rng.range(1000, 95000); while (keys.has(k));
    keys.add(k); return '0x' + k.toString(16);
  };
  const leaves = order.map((body, i) => {
    const k = key();
    return { num: i, code: `if not initSeen[${k}] then initSeen[${k}]=1;${body};end` };
  });
  const tree = decisionTree(leaves, 'initState', rng);
  return `do
local initValue,initCounter,initSeen=24915,0,{};
while initCounter<${rounds} do
initCounter=initCounter+1;
initValue=(initValue*0x${mul.toString(16)}+${add})%0x${mod.toString(16)};
local initState=initValue%${tasks.length};
${tree};
end;
end`;
}

function decisionTree(items, name, rng) {
  const list = items.slice().sort((a, b) => a.num - b.num);
  function emit(lo, hi) {
    if (hi - lo === 1) return list[lo].code;
    if (hi <= lo) return 'do end';
    const size = hi - lo;
    const width = size > 3 && rng.int(4) === 0 ? rng.range(1, Math.min(3, size - 1)) : Math.floor(size / 2);
    const mid = lo + width, left = emit(lo, mid), right = emit(mid, hi);
    return rng.int(2)
      ? `if ${name}<${list[mid].num} then ${left} else ${right} end`
      : `if ${name}>=${list[mid].num} then ${right} else ${left} end`;
  }
  return emit(0, list.length);
}

function dispatch(ctx, names, op, imports) {
  const rng = ctx.rng;
  const H = handlers({
    ...names, moveEnum: ctx.varMap.MOVE,
    tonumberName: imports.number, errFn: imports.error, setmetatable: imports.setmt,
    getmetatable: imports.getmt, typeName: imports.type, nextName: imports.next,
  });
  const code = v => {
    if (!H[v]) throw new Error('missing VM handler ' + v);
    let body = H[v].replace(/OP_ENUM/g, op.enum).replace(/OP_A/g, op.A)
      .replace(/OP_B/g, op.B).replace(/OP_C/g, op.C);
    // Mutation is applied to live operand accesses, not dead filler. A bounded
    // state machine initializes the aliases that this handler actually uses.
    if (rng.int(4) === 0) {
      const originals = [names.inst, op.A, op.B, op.C].filter(x => new RegExp('\\b' + x + '\\b').test(body));
      const aliases = originals.map((x, i) => 'operandAlias' + i);
      originals.forEach((x, i) => { body = body.replace(new RegExp('\\b' + x + '\\b', 'g'), aliases[i]); });
      const tasks = originals.map((x, i) => ({ num: i, code: aliases[i] + '=' + x }));
      if (tasks.length) body = `local ${aliases.join(',')};for mutationState=0,${tasks.length - 1} do ${decisionTree(tasks, 'mutationState', rng)};end;${body}`;
    }
    return body;
  };
  const step = `${names.pc}=${names.pc}+1;${names.inst}=${names.insts}[${names.pc}]`;
  const items = [...ctx.dispatchVariants].map(v => {
    const base = ctx.handlerAliases[v] || v;
    const sequence = ctx.superinstructions[base];
    let body;
    if (sequence && rng.int(3) === 0) {
      // Flatten a REAL sequence into a small loop. Intermediate instructions
      // cannot branch; the final one may return/jump exactly as it did before.
      const cases = sequence.map((part, i) => ({ num: i, code: code(part) }));
      body = `for sequencePhase=0,${sequence.length - 1} do
${decisionTree(cases, 'sequencePhase', rng)};
if sequencePhase<${sequence.length - 1} then ${step};end;
end`;
    } else if (sequence) {
      body = sequence.map(part => `do ${code(part)} end`).join(';' + step + ';');
    } else body = code(base);
    // One bounded control-flow layer, not nested fake fetch/step bodies. Each
    // emitted handler is selected by an opcode present in this input.
    const form = rng.int(5);
    if (form === 0) body = `repeat ${body};until true`;
    else if (form === 1) {
      const low = rng.range(3, 40);
      body = `for leafPhase=${low},${rng.range(41, 91)} do ${body};break;end`;
    }
    return { num: ctx.varMap[v], code: body };
  });
  return decisionTree(items, 'vmEnum', rng);
}

function generateVM(bytecode, ctx) {
  if (ctx.constantKey) throw new Error('VM generation currently implements the MoonSec plain-constant profile only');
  const rng = ctx.rng, keys = new Set();
  const k = {};
  for (const name of ['number', 'char', 'byte', 'sub', 'concat', 'insert', 'unpack', 'unpack2',
    'select', 'setmt', 'ldexp', 'error', 'getmt', 'type', 'next']) k[name] = key8(rng, keys);
  const entry = (name, ...names) => ({ control: names.length === 1 ? 4 : 0, names, key: k[name] });
  // Stage one only imports what the alphabet decoder itself needs. Remaining
  // lookups use the same decoder as the program payload (two-stage loading).
  const bootstrap = importBlob([
    entry('number', 'tonumber'), entry('char', 'string', 'char'),
    entry('byte', 'string', 'byte'), entry('sub', 'string', 'sub'),
    entry('concat', 'table', 'concat'), entry('insert', 'table', 'insert'),
  ]);
  const extended = importBlob([
    entry('unpack', 'unpack'), entry('unpack2', 'table', 'unpack'),
    entry('select', 'select'), entry('setmt', 'setmetatable'),
    entry('ldexp', 'math', 'ldexp'), entry('error', 'error'),
    ...(ctx.usedVariants.has('ITERPREP') ? [
      entry('getmt', 'getmetatable'), entry('type', 'type'), entry('next', 'next'),
    ] : []),
  ]);
  const std = name => 'vmImports.' + k[name];
  const op = { enum: 'slotEnum', A: 'slotA', B: 'slotB', C: 'slotC' };
  const names = {
    stk: 'vmStack', inst: 'vmInst', insts: 'vmInstructions', pc: 'vmPC', env: 'vmEnv',
    upv: 'vmUpvalues', protos: 'vmProtos', top: 'vmTop', wrap: 'vmWrap',
    unpack: 'vmUnpack', vararg: 'vmVararg', varargz: 'vmVarargCount',
    _R: 'vmResults', lupv: 'vmOpenUpvalues',
  };
  const tree = dispatch(ctx, names, op, {
    number: std('number'), error: std('error'), setmt: std('setmt'),
    getmt: std('getmt'), type: std('type'), next: std('next'),
  });
  const ct = ctx.constTypes;
  const steps = {
    constants: `local protoConstants={};
for constantIndex=1,read32() do
local kind=read8();local value;
if kind==${ct.boolean} then value=read8()~=#{}
elseif kind==${ct.number} then value=readFloat()
elseif kind==${ct.string} then value=readString() end;
protoConstants[constantIndex]=value;
end;`,
    numparams: 'local protoParams=read8();',
    functions: `local protoChildren={};for childIndex=1,read32() do protoChildren[childIndex-1]=deserialize();end;`,
    instructions: `local protoInstructions={};
for instructionIndex=1,read32() do
local word=read8();
if getBit(word,1,1)==0 then
local form,flags=getBit(word,2,3),getBit(word,4,6);
local record={};record[slotEnum]=read16();record[slotA]=read16();
if form==0 then record[slotB]=read16();record[slotC]=read16()
elseif form==1 then record[slotB]=read32()
elseif form==format[2] then record[slotB]=read32()-0x10000
elseif form==format[3] then record[slotB]=read32()-0x10000;record[slotC]=read16() end;
if getBit(flags,1,1)==1 then record[slotA]=protoConstants[record[slotA]] end;
if getBit(flags,2,2)==1 then record[slotB]=protoConstants[record[slotB]] end;
if getBit(flags,3,3)==1 then record[slotC]=protoConstants[record[slotC]] end;
protoInstructions[instructionIndex]=record;
end;
end;`,
  };
  const importReader = `readImports=function(blob)
local offset=1;
local function slice(count) offset=offset+count;return blob:sub(offset-count,offset-1);end;
while true do
local control=slice(1);if control=="\\5" then break end;
local value=slice(vmString.byte(slice(1)));
if control=="\\0" then value=vmEnvironment[value][slice(vmString.byte(slice(1)))]
elseif control=="\\4" then value=vmEnvironment[value]
elseif control=="\\2" then value=vmNumber(value) end;
vmImports[slice(8)]=value;
end;
end`;
  const init = initializer([
    'vmImports={}', 'vmString=string', 'vmNumber=tonumber',
    'vmEnvironment=getfenv and getfenv() or _ENV',
    'bootstrapBlob=' + binary(bootstrap), importReader,
  ], rng);
  const slotDecls = rng.shuffle(Object.keys(op)).map(name => `local ${op[name]}=${ctx.opSlots[name]}`).join(';');
  const watermark = ctx.watermarkName;
  const encoded = encodeBytes(bytecode, ctx.bytecodeKey, ctx.alphabet);
  const encodedImports = encodeBytes(Buffer.from(extended, 'binary'), 27, ctx.alphabet);
  const inner = `
local vmImports,vmString,vmNumber,vmEnvironment,bootstrapBlob,readImports;
${init};
readImports(bootstrapBlob);
local vmChars={};
for value=0x0,0xff do local character=${std('char')}(value);vmChars[value]=character;vmChars[character]=value;end;
local function vmChar(value) return vmChars[value];end;
local decode=(function(key,data)
local width,base=0x01,0x10;
local parts={{},{},{}};local rank=-0x01;local offset=0x01;local rolling=key;
while true do
parts[3][${std('sub')}(data,offset,(function()offset=offset+width;return offset-1;end)())]=(function()rank=rank+1;return rank;end)();
if rank==0x0f then rank="";base=0x000;break;end;
end;
while offset<#data+1 do
parts[2][base]=${std('sub')}(data,offset,(function()offset=offset+width;return offset-1;end)());
base=base+1;
if base%2==0 then base=0;
${std('insert')}(parts[1],vmChar((((parts[3][parts[2][0]] or 0)*16)+(parts[3][parts[2][1]] or 0)+rolling)%0x100));
rolling=rolling+key;
end;
end;
return ${std('concat')}(parts[1]);
end);
readImports(decode(27,${quote(encodedImports)}));
local payloadKey=${keyExpression(rng, ctx.bytecodeKey)};
local vmUnpack=${std('unpack')} or ${std('unpack2')};
local vmLdexp=${std('ldexp')} or function(value,exponent)return value*2^exponent;end;
${slotDecls};
local function execute(format,...)
local bytecode=decode(payloadKey,${quote(encoded)});
local cursor=1;
local function position(count,peek)if peek then return cursor end;cursor=cursor+count;end;
local getBit,read32,read8=vmBits(0,vmBits,position,bytecode,${std('byte')});
local function read16()
local low,high=${std('byte')}(bytecode,position(0,1),position(0,1)+1);position(2);
return low+high*0x100;
end;
local function readFloat()
local low,high=read32(),read32();local implicit=1;
local mantissa=getBit(high,1,20)*2^32+low;
local exponent=getBit(high,21,31);local sign=(-1)^getBit(high,32);
if exponent==0 then if mantissa==0 then return sign*0 end;exponent=1;implicit=0;
elseif exponent==2047 then return mantissa==0 and sign*(1/0) or sign*(0/0) end;
return vmLdexp(sign,exponent-1023)*(implicit+mantissa/2^52);
end;
local function readString(length)
if not length then length=read32();end;
if length==0 then return "" end;
local text=${std('sub')}(bytecode,position(0,1),position(0,1)+length-1);position(length);
return text;
end;
local function collectResults(...)return {...},${std('select')}("#",...);end;
local function deserialize()
${ctx.protoFormat.map(step => steps[step]).join('\n')}
return {protoInstructions,protoChildren,protoParams,{}};
end;
local function vmWrap(proto,vmUpvalues,vmEnv)
vmUpvalues=vmUpvalues or {};vmEnv=vmEnv or vmEnvironment;
local function vmClosure(...)
local vmInstructions,vmProtos,numParams,vmResults,vmPC,vmTop,vmVararg,args,argCount,vmOpenUpvalues,vmStack;
local state=0;
while -1<state do
if state<=2 then
if state<=0 then vmInstructions=vmBits(6,${rng.range(11, 90)},1,${rng.range(11, 90)},proto);vmProtos=vmBits(6,${rng.range(11, 90)},2,${rng.range(11, 90)},proto);
elseif state==1 then numParams=vmBits(6,${rng.range(11, 90)},3,${rng.range(11, 90)},proto);vmResults=collectResults;
else vmPC=-41;vmTop=-1;end;
elseif state<5 then
if state==3 then vmVararg={};args={...};else argCount=${std('select')}("#",...)-1;vmOpenUpvalues={};end;
elseif state==5 then vmStack=vmBits(7);else state=-2;end;
state=state+1;
end;
for index=0,argCount do if index>=numParams then vmVararg[index-numParams]=args[index+1] else vmStack[index]=args[index+1] end;end;
local vmVarargCount=argCount-numParams+1;
local vmInst,vmEnum;
while true do
if vmPC<-40 then vmPC=vmPC+42 end;
vmInst=vmInstructions[vmPC];vmEnum=vmInst[slotEnum];
${tree};
vmPC=vmPC+1;
end;
end;
return vmClosure;
end;
return vmWrap(deserialize(),{},vmEnvironment)(...);
end;
return execute({[2]=2,[3]=3},...);
end)(${bitDispatcher()},...)
`;
  const header = `([[This file was protected with MoonSec V3]]):gsub('.+', (function(a) ${watermark}=a;end));return(function(vmBits,...)`;
  return minify(shortenLocals(header + inner, ctx.seed));
}

module.exports = { generateVM, minify };
