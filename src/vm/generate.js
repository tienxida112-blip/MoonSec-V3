'use strict';

const { handlers } = require('./handlers');
const { encodeBytes } = require('../encode');
const { uniqueNames } = require('../util');
const { parse } = require('../lua/parser');
const { evalLua } = require('../lua/eval');

function luaMod(a, b) {
  if (!b) return 0;
  return a - Math.floor(a / b) * b;
}

function minify(src) {
  return src
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .replace(/ *\n */g, '\n')
    .replace(/\n/g, ' ')
    .replace(/ +/g, ' ')
    .replace(/ ([,;(){}[\]])/g, '$1')
    .replace(/([,;(){}[\]]) /g, '$1')
    .trim();
}

function ifTree(list, enumName) {
  const items = list.filter(x => x.num !== undefined).sort((a, b) => a.num - b.num);
  if (!items.length) return 'do end';
  function rec(i) {
    const it = items[i];
    const body = it.code || 'do end';
    const c = it.num + 1;
    if (i === items.length - 1) {
      return `if ${enumName}<${c} then ${body} else do end end`;
    }
    return `if ${enumName}<${c} then ${body} else ${rec(i + 1)} end`;
  }
  return rec(0);
}

function luaBin(str) {
  let o = '"';
  for (let i = 0; i < str.length; i++) o += '\\' + str.charCodeAt(i);
  return o + '"';
}

function luaDQuote(str) {
  return '"' + String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function key8(rng) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[rng.int(chars.length)];
  return s;
}

function watermarkName(rng) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let s = '_';
  const n = rng.range(10, 14);
  while (s.length < n) s += chars[rng.int(chars.length)];
  return s;
}

function packConstBlob(entries) {
  const buf = [];
  const pushS = (s) => {
    buf.push(s.length);
    for (let i = 0; i < s.length; i++) buf.push(s.charCodeAt(i));
  };
  for (const e of entries) {
    buf.push(e.control);
    pushS(e.names[0]);
    if (e.control === 0) pushS(e.names[1]);
    for (let i = 0; i < 8; i++) buf.push(e.key.charCodeAt(i));
  }
  buf.push(5);
  return String.fromCharCode(...buf);
}

function opaqueKey(rng) {
  const tMax1 = rng.range(24, 72);
  const tMax2 = rng.range(12, 40);
  const a1 = rng.range(180, 900);
  const m1 = rng.range(5000, 35000);
  const m2 = rng.range(700, 2000);
  const h2 = (m2 / 2) | 0;
  const a2 = rng.range(80, 500);
  const m3 = rng.range(6000, 20000);
  const m4 = rng.range(800, 2400);
  const h4 = (m4 / 2) | 0;
  const mul = rng.range(200, 800);
  const m5 = rng.range(5000, 18000);

  const src =
    `local t,l=0,1;(function(n,e)e(e(n,n),e(n,e and e))end)(function(e,n)if t>${tMax1} then return e end t=t+1 l=(l+${a1})%${m1} if(l%${m2})<${h2} then return n else return n(e(e,n),e(e,n)and e(n,n))end return e(e(e,e and n),e(n,n and e))end,function(n,e)if t>${tMax2} then return e end t=t+1 l=(l-${a2})%${m3} if(l%${m4})>=${h4} then l=(l*${mul})%${m5} return n(n(e,e),e(e,e))else return n end return e end)return l;`;
  let delta = 1;
  try {
    const ast = parse('return (function()' + src + 'end)()');
    const v = evalLua(ast);
    if (typeof v === 'number' && Number.isFinite(v)) delta = v | 0;
  } catch (_) {
    delta = 1;
  }
  return { src, delta };
}

function bitDispatcher() {
  return `function(e,n,l,d,t,o)
local o;
if e<=3 then
if e>=2 then
if e>0 then repeat
if e>2 then do return n(1),n(4,t,d,l,n),n(5,t,d,l) end;break;end
do return 16777216,65536,256 end;
until true;else do return 16777216,65536,256 end;end
else
if -1<=e then repeat
if 0~=e then do return function(l,e,n)
if n then local e=(l/2^(e-1))%2^((n-1)-(e-1)+1);return e-e%1
else local e=2^(e-1);return(l%(e+e)>=e)and 1 or 0 end
end end;break;end
do return n(1),n(4,t,d,l,n),n(5,t,d,l) end;
until true;else do return function(n,e,l)
if l then local e=(n/2^(e-1))%2^((l-1)-(e-1)+1);return e-e%1
else local e=2^(e-1);return(n%(e+e)>=e)and 1 or 0 end
end end;end
end
else
if 6<=e then
if 7<=e then
if 3<=e then repeat
if e~=8 then do return setmetatable({},{['__\\99\\97\\108\\108']=function(e,l,d,t,n)
if n then return e[n] elseif t then return e else e[l]=d end
end}) end break;end
do return l(e,nil,l) end
until true;else do return setmetatable({},{['__\\99\\97\\108\\108']=function(e,d,t,l,n)
if n then return e[n] elseif l then return e else e[d]=t end
end}) end end
else do return t[l] end
end
else
if e~=3 then for o=37,83 do
if 5>e then
local e=d
local f,a,t=t(2)
do return function()
local n,l,d,o=n(l,e(e,e),e(e,e)+3)
e(4)
return(o*f)+(d*a)+(l*t)+n
end end
break;end
local e=d
do return function()
local n=n(l,e(e,e),e(e,e))
e(1)
return n
end end
break;end
else
local e=d
do return function()
local n=n(l,e(e,e),e(e,e))
e(1)
return n
end end
end
end
end
end`;
}

function generateVM(bytecode, ctx) {
  const rng = ctx.rng;
  const reserved = new Set([
    'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function',
    'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true',
    'until', 'while', 'string', 'table', 'math', 'select', 'unpack', 'pairs',
    'ipairs', 'next', 'type', 'getfenv', 'setfenv', 'setmetatable', 'getmetatable',
    'rawget', 'rawset', 'pcall', 'xpcall', 'tostring', 'tonumber', '_G', '_ENV',
    'game', 'workspace', 'script', 'wait', 'spawn', 'tick', 'time', 'print',
    'e', 'n', 'l', 'd', 't', 'o', 'f', 'a', 'r', 'k', 'i', 'j', 'x', 'y',
  ]);
  const names = uniqueNames(rng, 140, reserved);
  const take = () => names.pop();

  const n = {
    stk: take(), inst: take(), pc: take(), env: take(), upv: take(),
    unpack: take(), top: take(), protos: take(), wrap: take(),
    insts: take(), lupv: take(), vararg: take(), varargz: take(),
    _R: take(), insert: take(),
  };

  const enumN = take();
  const decodeN = take();
  const desN = take();
  const gbitN = take();
  const g8 = take();
  const g16 = take();
  const g32 = take();
  const gflt = take();
  const posN = take();
  const bcN = take();
  const charN = take();
  const byteN = take();
  const subN = take();
  const concatN = take();
  const ldexpN = take();
  const paramsN = take();
  const argsN = take();
  const pcountN = take();
  const watermark = watermarkName(rng);
  const bitN = take();
  const getfN = take();
  const protoN = take();
  const tabN = take();
  const decConstN = take();
  const packedN = take();
  const dummyA = take();
  const opEnum = take();
  const opA = take();
  const opB = take();
  const opC = take();
  const ckN = take();
  const bkN = take();
  const pad1 = take();
  const stN = take();
  const readStrN = take();
  const rFn = take();
  const dummy9 = take();
  const trapN = take();
  const yFn = take();
  const csTab = take();
  const csFn = take();
  const posCur = take();
  const wrapInner = take();
  const wrapFn = n.wrap;
  const strN = take();

  const kChar = key8(rng), kByte = key8(rng), kSub = key8(rng);
  const kConcat = key8(rng), kInsert = key8(rng), kTonum = key8(rng);
  const kLdexp = key8(rng), kUnpack = key8(rng), kUnpack2 = key8(rng);
  const kPcall = key8(rng), kSelect = key8(rng), kMatch = key8(rng);
  const kDump = key8(rng), kPrint = key8(rng);

  const blob = packConstBlob([
    { control: 4, names: ['tonumber'], key: kTonum },
    { control: 0, names: ['string', 'char'], key: kChar },
    { control: 0, names: ['string', 'byte'], key: kByte },
    { control: 0, names: ['string', 'sub'], key: kSub },
    { control: 0, names: ['table', 'concat'], key: kConcat },
    { control: 0, names: ['table', 'insert'], key: kInsert },
    { control: 0, names: ['math', 'ldexp'], key: kLdexp },
    { control: 4, names: ['unpack'], key: kUnpack },
    { control: 0, names: ['table', 'unpack'], key: kUnpack2 },
    { control: 4, names: ['select'], key: kSelect },
    { control: 4, names: ['pcall'], key: kPcall },
    { control: 0, names: ['string', 'match'], key: kMatch },
    { control: 0, names: ['string', 'dump'], key: kDump },
    { control: 4, names: ['print'], key: kPrint },
  ]);

  const extraBlob = packConstBlob([
    { control: 4, names: ['select'], key: key8(rng) },
  ]);
  const extraEnc = encodeBytes(Buffer.from(extraBlob, 'binary'), 27, ctx.alphabet);
  const termEnc = encodeBytes(Buffer.from([5]), 27, ctx.alphabet);

  const H = handlers({
    ...n,
    wrap: wrapFn,
    moveEnum: ctx.varMap.MOVE,
  });
  const used = [...ctx.usedVariants];
  const items = used.map(v => ({
    num: ctx.varMap[v],
    code: (H[v] || 'do end')
      .replace(/OP_A/g, opA)
      .replace(/OP_B/g, opB)
      .replace(/OP_C/g, opC)
      .replace(/OP_ENUM/g, opEnum),
  })).filter(x => x.num !== undefined).sort((a, b) => a.num - b.num);

  const tree = ifTree(items, enumN);
  const encoded = encodeBytes(bytecode, ctx.bytecodeKey, ctx.alphabet);
  const encLit = luaDQuote(encoded);
  const ct = ctx.constTypes;
  const cfLimit = rng.range(180, 400);
  const opaque = opaqueKey(rng);
  const keyLit = (ctx.bytecodeKey - opaque.delta) | 0;

  const bit = (src, a, b) => `${gbitN}(${src},${a},${b})`;
  const jn = () => rng.range(8, 90);

  const stepCode = {
    numparams: `${paramsN}=${g8}()`,
    constants: [
      `local _nc=${g32}()`,
      `local _K={}`,
      `for _i=1,_nc do`,
      `local _t=${g8}()`,
      `local _v=nil`,
      `if _t==${ct.boolean} then _v=(${g8}()~=#{}) elseif _t==${ct.number} then _v=${gflt}() elseif _t==${ct.string} then _v=${readStrN}() else _v=nil end`,
      `_K[_i]=_v`,
      `end`,
    ].join(' '),
    instructions: [
      `local _ni=${g32}()`,
      `local _I={}`,
      `for _i=1,_ni do`,
      `local _d=${g8}()`,
      `if ${bit('_d', 1, 1)}==0 then local _ty=${bit('_d', 2, 3)};local _m=${bit('_d', 4, 6)};local _e={};_e[${opEnum}]=${g16}();_e[${opA}]=${g16}();if _ty==0 then _e[${opB}]=${g16}();_e[${opC}]=${g16}() elseif _ty==1 then _e[${opB}]=${g32}() elseif _ty==2 then _e[${opB}]=${g32}()-65536 elseif _ty==3 then _e[${opB}]=${g32}()-65536;_e[${opC}]=${g16}() end;if ${bit('_m', 1, 1)}==1 then _e[${opA}]=_K[_e[${opA}]] end;if ${bit('_m', 2, 2)}==1 then _e[${opB}]=_K[_e[${opB}]] end;if ${bit('_m', 3, 3)}==1 then _e[${opC}]=_K[_e[${opC}]] end;_I[#_I+1]=_e end`,
      `end`,
    ].join(' '),
    functions: [
      `local _nf=${g32}()`,
      `local _F={}`,
      `for _i=1,_nf do`,
      `_F[_i]=${desN}()`,
      `end`,
    ].join(' '),
  };

  const desBody = ctx.protoFormat.map(s => stepCode[s]).join(' ');

  const slotOrder = rng.shuffle([
    [opEnum, 1], [opA, 2], [opB, 3], [opC, 4],
  ]);
  const slotDecls = slotOrder.map(([nm, v]) => `local ${nm}=${v}`).join(';');

  const k1 = rng.range(1000, 90000);
  const k2 = rng.range(1000, 90000);
  const k3 = rng.range(1000, 90000);
  const k4 = rng.range(1000, 90000);
  const k5 = rng.range(1000, 90000);
  const k6 = rng.range(1000, 90000);
  const mulA = rng.range(200, 900);
  const modA = rng.range(20000, 50000);
  const hexN = '0x' + (cfLimit + rng.range(40, 200)).toString(16);
  const hexM = '0x' + rng.range(0x100, 0x4000).toString(16);
  const hexH = hexM;

  const inner = `
local ${tabN};local ${decConstN};local ${packedN};local ${dummyA};local ${getfN};local ${strN};
local e=24915;local n=0;local l={};
while n<${cfLimit} do
n=n+1;
while n<${hexN} and e%${hexM}<${hexH} do
n=n+1;e=(e*${mulA})%${modA};local r=n+e;
if not l[${k1}] then l[${k1}]=0x1 ${strN}=string;
elseif not l[${k2}] then l[${k2}]=0x1 ${tabN}={};
elseif not l[${k3}] then l[${k3}]=0x1 ${dummyA}=tonumber;
elseif not l[${k4}] then l[${k4}]=0x1 ${packedN}=${luaBin(blob)};
elseif not l[${k5}] then l[${k5}]=0x1 ${getfN}=getfenv and getfenv();
elseif not l[${k6}] then l[${k6}]=0x1 ${decConstN}=function(d)
local e=0x01;
local function l(n)e=e+n;return d:sub(e-n,e-0x01)end;
while true do
local n=l(0x01);
if(n=="\\5")then break end;
local e=${strN}.byte(l(0x01));
local e=l(e);
if n=="\\4" then e=${getfN}[e]
elseif n=="\\0" then local m=l(${strN}.byte(l(0x01)));e=${getfN}[e][m]end;
local k=l(0x08);
${tabN}[k]=e;
end
end;
else break
end
end
end
${decConstN}(${packedN});
local ${charN}=${tabN}.${kChar} or string.char;
local ${byteN}=${tabN}.${kByte} or string.byte;
local ${subN}=${tabN}.${kSub} or string.sub;
local ${concatN}=${tabN}.${kConcat} or table.concat;
local ${n.insert}=${tabN}.${kInsert} or table.insert;
local ${n.unpack}=unpack or table.unpack;
local ${ldexpN}=${tabN}.${kLdexp} or math.ldexp or function(s,e) return s*2^e end;
local ${getfN}=(${getfN})or(function()return _ENV end);
local ${n.env}=${getfN};
local ${csTab}={};
for e=0x0,0xff do local l=${charN}(e);${csTab}[e]=l;${csTab}[l]=e;end
local function ${csFn}(e)return ${csTab}[e];end
local ${decodeN}=(function(a,d)
local r,l=0x01,0x10;
local n={{},{},{}};
local t=-0x01;
local e=0x01;
local f=a;
while true do
n[0x03][${subN}(d,e,(function()e=r+e;return e-0x01 end)())]=(function()t=t+0x01;return t end)();
if t==(0x0f)then t="";l=0x000;break;end
end;
local t=#d;
while e<t+0x01 do
n[0x02][l]=${subN}(d,e,(function()e=r+e;return e-0x01 end)());
l=l+0x01;
if l%0x02==0x00 then
l=0x00;
n[0x01][#n[0x01]+1]=${charN}(((((n[0x03][n[0x02][0x00]]or 0x00)*0x10)+(n[0x03][n[0x02][0x01]]or 0x00)+f)%0x100));
f=a+f;
end
end
return ${concatN}(n[0x01]);
end);
${decConstN}(${decodeN}(27,${luaDQuote(termEnc)}));
${decConstN}(${decodeN}(27,${luaDQuote(extraEnc)}));
local ${bkN}=(${keyLit}+(function()${opaque.src}end)());
${slotDecls};
local function ${yFn}(k,...)
local ${bcN}=${decodeN}(${bkN},${encLit});
local ${ckN}=0;
local ${posCur}=1;
local function ${posN}(l,e) if e then return ${posCur} end;${posCur}=${posCur}+l;end
local ${gbitN};${gbitN}=function(b,s,e) if e then local r=(b/2^(s-1))%2^((e-1)-(s-1)+1);return r-r%1 else local p=2^(s-1);return (b%(p+p)>=p) and 1 or 0 end end;
local ${g8};${g8}=function()
local x=${byteN}(${bcN},${posN}(0,1),${posN}(0,1));${posN}(1);return x
end;
local ${g32};${g32}=function()
local a,b,c,d=${byteN}(${bcN},${posN}(0,1),${posN}(0,1)+3);${posN}(4);local n=a+b*256+c*65536+d*16777216;if n>=2147483648 then n=n-4294967296 end;return n
end;
local function ${g16}()
local a,b=${byteN}(${bcN},${posN}(0,1),${posN}(0,1)+1);${posN}(2);local n=a+b*256;if n>=32768 then n=n-65536 end;return n
end
local function ${gflt}()
local L=${g32}();if L<0 then L=L+4294967296 end;
local R=${g32}();if R<0 then R=R+4294967296 end;
local N=1-0;
local M=(${gbitN}(R,1,20)*(2^32))+L;
local E=${gbitN}(R,21,31);
local S=((-1)^${gbitN}(R,32));
if E==0 then if M==0 then return S*0 else E=1;N=0 end elseif E==2047 then return(M==0)and(S*(1/0))or(S*(0/0))end;
return ${ldexpN}(S,E-1023)*(N+(M/(2^52)))
end
local function ${readStrN}(n)
local l
if(not n)then n=${g32}();if(n==0)then return'';end;end
l=${subN}(${bcN},${posN}(0,1),${posN}(0,1)+n-1);${posN}(n)
if #l>1 and ${byteN}(l,1)>127 then local o={};for j=2,#l do o[j-1]=${charN}((${byteN}(l,j)+${ckN})%256)end;return ${concatN}(o)end
return l
end
local function ${rFn}(...)
return{...},select('#',...)
end
local function ${desN}()
local ${paramsN}
${desBody}
return{_I,_F,${paramsN} or 0,_K}
end
local function ${dummy9}(l,e,n) local t=e;local t=n;return ${rFn}((({pcall(l)})[2]),e,n) end
local function ${wrapFn}(${protoN},${n.upv},${n.env})
${n.upv}=${n.upv} or {};
${n.env}=${n.env} or ${getfN};
local function ${wrapInner}(...)
local ${n.insts},${n.protos},${paramsN},${pad1},${n._R},${n.pc},${n.top},${n.vararg},${argsN},${pcountN},${n.lupv},${n.stk};
local ${stN}=0;
while-1<${stN} do
if ${stN}<=2 then
if 0>=${stN} then ${n.insts}=${bitN}(6,${jn()},1,${jn()},${protoN});${n.protos}=${bitN}(6,${jn()},2,${jn()},${protoN});
else if ${stN}~=0 then repeat if 1~=${stN} then ${n.pc}=-41;${n.top}=-1;break;end ${paramsN}=${bitN}(6,${jn()},3,${jn()},${protoN});${n._R}=${rFn};${pad1}=0;until true;
else ${paramsN}=${bitN}(6,${jn()},3,${jn()},${protoN});${n._R}=${rFn};${pad1}=0;end end
else
if ${stN}>4 then
if ${stN}>2 then repeat if 5<${stN} then ${stN}=-2;break;end ${n.stk}=${bitN}(7);until true;
else ${stN}=-2;end
else
if 0~=${stN} then for _i=28,66 do if ${stN}~=4 then ${n.vararg}={};${argsN}={...};break;end ${pcountN}=select('#',...)-1;${n.lupv}={};break;end
else ${n.vararg}={};${argsN}={...};end
end
end
${stN}=${stN}+1;
end
for _i=0,${pcountN} do if(_i>=${paramsN})then ${n.vararg}[_i-${paramsN}]=${argsN}[_i+1];else ${n.stk}[_i]=${argsN}[_i+1];end;end;
local ${n.varargz}=${pcountN}-${paramsN}+1;
local ${n.inst};
local ${enumN};
local function ${trapN}(...)while true do end end
while true do
if ${n.pc}<-40 then ${n.pc}=${n.pc}+42 end
${n.inst}=${n.insts}[${n.pc}];
${enumN}=${n.inst}[${opEnum}];
${tree}
${n.pc}=1+${n.pc};
end
end
return ${wrapInner}
end
local ${pad1}=${wrapFn}(${desN}());
return ${pad1}(...)
end
return ${yFn}((function()local n={}local e=0x01;n[e]=0x02;n[n[e]+0x01]=0x03;return n;end)(),...)
end)((${bitDispatcher()}),...)
`;

  const header = `([[This file was protected with MoonSec V3]]):gsub('.+', (function(a) ${watermark} = a; end)); return(function(${bitN},...)`;
  return header + minify(inner);
}

module.exports = { generateVM, minify };
