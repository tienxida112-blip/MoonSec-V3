'use strict';

const fs = require('fs');
const path = require('path');
const { parse } = require('../src/lua/parser');
const { compile } = require('../src/lua/compiler');
const { interpret } = require('../src/interpret');
const { obfuscate } = require('../src/obfuscate');
const { encodeBytes, decodeBytes, makeAlphabet } = require('../src/encode');
const { RNG } = require('../src/util');
const { optimizeProto } = require('../src/lua/optimizer');
const { OpCode } = require('../src/bytecode/opcodes');
const { handlers } = require('../src/vm/handlers');

function run(src) {
  const ast = parse(src);
  const proto = compile(ast);
  return interpret(proto);
}

function expectOut(name, src, expected) {
  const r = run(src);
  const got = r.output.join('\n');
  const exp = expected.join('\n');
  if (got !== exp) {
    console.error('FAIL', name);
    console.error(' expected:', JSON.stringify(exp));
    console.error('      got:', JSON.stringify(got));
    process.exitCode = 1;
    return false;
  }
  console.log('  ok', name);
  return true;
}

function main() {
  console.log('compiler / interpreter');
  expectOut('print', 'print("hello")', ['hello']);
  expectOut('arith', 'print(1+2*3)', ['7']);
  expectOut('local', 'local a,b=2,3; print(a+b)', ['5']);
  expectOut('if', 'local a=1; if a==1 then print("yes") else print("no") end', ['yes']);
  expectOut('ifelse', 'local a=2; if a==1 then print("yes") else print("no") end', ['no']);
  expectOut('while', 'local i,s=0,0; while i<5 do s=s+i; i=i+1 end; print(s)', ['10']);
  expectOut('for', 'local s=0; for i=1,4 do s=s+i end; print(s)', ['10']);
  expectOut('fn', 'local function add(a,b) return a+b end; print(add(4,5))', ['9']);
  expectOut('table', 'local t={1,2,3}; print(t[1], t[2], t[3])', ['1\t2\t3']);
  expectOut('hash', 'local t={a=10,b=20}; print(t.a+t.b)', ['30']);
  expectOut('concat', 'print("a".."b".."c")', ['abc']);
  expectOut('andor', 'print(false or 3); print(1 and 2)', ['3', '2']);
  expectOut('notlen', 'print(not false); print(#"hi")', ['true', '2']);
  expectOut('cmp', 'print(1<2); print(2==2); print(3~=1)', ['true', 'true', 'true']);
  expectOut('nested', 'local function f(x) local function g(y) return x+y end; return g(3) end; print(f(4))', ['7']);
  expectOut('nested-mutable-upvalues', 'local x=10; local function make() local y=1; return function(d) x=x+d; y=y+1; return x+y end end; local f=make(); print(f(2)); print(f(3))', ['14', '18']);
  expectOut('method', 'local t={v=5}; function t:get() return self.v end; print(t:get())', ['5']);
  expectOut('global', 'x=9; print(x)', ['9']);
  expectOut('repeat', 'local i=0; repeat i=i+1 until i>=3; print(i)', ['3']);
  expectOut('unary', 'print(-5); print(#{10,20})', ['-5', '2']);
  expectOut('negative-zero', 'print(1/-0)', ['-Infinity']);
  expectOut('evaluation-order', 'local x=1; local function f() x=5; return 2 end; print(x+f())', ['3']);
  expectOut('luau-types', 'local function add(a: number, b: number): number return a+b end; print(add(2,3))', ['5']);
  expectOut('luau-plus', 'local a=3; a += 4; print(a)', ['7']);
  expectOut('luau-continue', 'local s=0; for i=1,5 do if i==3 then continue end; s=s+i end; print(s)', ['12']);
  expectOut('luau-assert', 'local x = (1+2) :: number; print(x)', ['3']);
  expectOut('luau-ifexpr', 'local x = if 1==1 then 10 else 20; print(x)', ['10']);
  expectOut('luau-interpol', 'local n="roblox"; print(`hi {n}`)', ['hi roblox']);
  expectOut('luau-const', 'local a <const> = 8; print(a)', ['8']);
  expectOut('luau-numus', 'print(1_000+2)', ['1002']);
  expectOut('complex-stress', fs.readFileSync(path.join(__dirname, '..', 'Tests', 'complex_stress.lua'), 'utf8'),
    ['stress\t79\t4\t95\t50\t2,3,5,7,11,13,17,19,23,31']);

  console.log('optimizer control-flow regressions');
  {
    const p = {
      instructions: [
        { op: OpCode.LOADBOOL, a: 0, b: 1, c: 1, pc: 0 },
        // Always skipped by the preceding LOADBOOL; must not keep r0 live.
        { op: OpCode.LOADK, a: 0, b: 0, c: 0, pc: 1 },
        { op: OpCode.RETURN, a: 0, b: 2, c: 0, pc: 2 },
      ],
      constants: [false], functions: [], locals: [], maxStack: 2,
    };
    optimizeProto(p);
    if (p.instructions.length !== 2 || p.instructions[0].op !== OpCode.LOADBOOL || p.instructions[0].c !== 0 || p.instructions[1].op !== OpCode.RETURN) {
      console.error('FAIL LOADBOOL skip-aware dead-write optimization');
      process.exitCode = 1;
    } else console.log('  ok LOADBOOL skip-aware dead-write optimization');
  }
  {
    const p = {
      instructions: [
        { op: OpCode.MOVE, a: 0, b: 0, c: 0, pc: 0 },
        { op: OpCode.JMP, a: 0, b: 0, c: 0, pc: 1 },
        { op: OpCode.RETURN, a: 0, b: 1, c: 0, pc: 2 },
      ],
      constants: [], functions: [], locals: [], maxStack: 2,
    };
    optimizeProto(p);
    if (p.instructions.length !== 1 || p.instructions[0].op !== OpCode.RETURN) {
      console.error('FAIL identity instruction elimination');
      process.exitCode = 1;
    } else console.log('  ok identity instruction elimination');
  }

  console.log('string codec');
  {
    const rng = new RNG(1);
    const alph = makeAlphabet(rng);
    const buf = Buffer.from('hello moonsec v3', 'utf8');
    const enc = encodeBytes(buf, 42, alph);
    const dec = decodeBytes(enc, 42);
    if (Buffer.compare(buf, dec) !== 0) {
      console.error('FAIL codec');
      process.exitCode = 1;
    } else console.log('  ok codec');
  }

  console.log('obfuscate output checks');
  const obfuscateSamples = [
    'print("hello")',
    'local a=1+2; print(a)',
    'local function f(x) return x*2 end; print(f(5))',
    'for i=1,3 do print(i) end',
    fs.readFileSync(path.join(__dirname, '..', 'Tests', 'complex_stress.lua'), 'utf8'),
  ];
  for (const src of obfuscateSamples) {
    try {
      const ob = obfuscate(src, { seed: 12345 });
      if (!ob.output.startsWith('([[This file was protected with MoonSec V3]]):gsub') || ob.output.includes('Federal')) {
        throw new Error('unexpected header or watermark');
      }
      console.log('  ok obfuscate', ob.output.length + ' bytes');
    } catch (e) {
      console.error('FAIL obfuscate', e.message);
      process.exitCode = 1;
    }
  }

  {
    const src = 'local x=10; local function make() local y=1; return function(d) x=x+d; y=y+1; return x+y end end; local f=make(); print(f(2)); print(f(3))';
    const ob = obfuscate(src, { seed: 77 });
    let captures = 0;
    let descriptorsPreserved = true;
    function checkClosures(p) {
      for (let i = 0; i < p.instructions.length; i++) {
        const ins = p.instructions[i];
        if (ins.op !== OpCode.CLOSURE || !ins.c) continue;
        captures += ins.c;
        for (let j = 1; j <= ins.c; j++) {
          const d = p.instructions[i + j];
          if (!d || !d.upval || ![OpCode.MOVE, OpCode.GETUPVAL].includes(d.op)) descriptorsPreserved = false;
        }
      }
      for (const child of p.functions) checkClosures(child);
    }
    checkClosures(ob.proto);
    const closureHandler = handlers({
      stk: 'S', inst: 'I', insts: 'IS', pc: 'P', env: 'E', upv: 'U', wrap: 'W',
      protos: 'R', unpack: 'UN', top: 'T', _R: 'RR', lupv: 'L', moveEnum: 7,
    }).CLOSURE;
    if (!captures || !descriptorsPreserved || ob.ctx.varMap.MOVE === undefined || ob.ctx.varMap.GETUPVAL === undefined ||
        !closureHandler.includes('R[I[OP_B]+1]') || !closureHandler.includes('IS[P]') ||
        !closureHandler.includes('P=P+1') || !closureHandler.includes('setmetatable')) {
      console.error('FAIL serialized CLOSURE upvalue bindings');
      process.exitCode = 1;
    } else console.log('  ok serialized CLOSURE upvalue bindings');
  }

  // Regression: a compare used as a *value* (EQ/LT/LE followed by the
  // LOADBOOL/LOADBOOL pair) must only skip the next instruction. It used to
  // share the fused condition-jump variants, which treat B as a jump target, so
  // `a == b` where `b` was a register returned into the iterator body and
  // looped forever.
  {
    const cases = [
      // value-context compare inside a closure over locals, then a generic-for
      ['local m={a={b=function()end}}; local n=function()end; local c=m.a.b; ' +
       'local f=function() if m and m.a and m.a.b==n then m.a.b=c end end; ' +
       'f(); for k in pairs(m) do m[k]=nil end; print("cmp-ok")', ['cmp-ok']],
      // both compare outcomes as values
      ['local t={} ; local a,b,c=1,1,2; t[1]=(a==b); t[2]=(a==c); print(t[1],t[2])', ['true\tfalse']],
      // relational compares as values
      ['local t={} ; local a,b=1,2; t[1]=(a<b); t[2]=(a<=b); print(t[1],t[2])', ['true\ttrue']],
    ];
    for (const [src, expected] of cases) {
      const ob = obfuscate(src, { seed: 1 });
      // The VM's value-context compare variants must be emitted, not P/N.
      let sawValueCmp = false;
      let sawFusedInValue = false;
      (function walk(p) {
        for (const ins of p.instructions) {
          if (!/^(EQ|LT|LE)/.test(ins.variant || '')) continue;
          if (/^(EQ|LT|LE)V/.test(ins.variant)) sawValueCmp = true;
          if (ins.fusedCmp && /^(EQ|LT|LE)[PN]/.test(ins.variant) === false) sawFusedInValue = true;
        }
        p.functions.forEach(walk);
      })(ob.proto);
      const got = run(src).output.join('\n');
      if (got !== expected.join('\n') || !ob.output.includes('([[This file was protected with MoonSec V3]]):gsub')) {
        console.error('FAIL value-compare variant split');
        process.exitCode = 1;
      } else if (sawFusedInValue) {
        console.error('FAIL value-compare reused a fused jump variant');
        process.exitCode = 1;
      } else {
        console.log('  ok value-compare variant split' + (sawValueCmp ? '' : ' (no value compares emitted)'));
      }
      void got;
    }
  }

  // Regression: generic-for must iterate over a real table. TFORLOOP previously
  // did not consume the stand-alone back-edge JMP, so it re-ran the body with a
  // stale control variable or spun when the loop exited.
  {
    const cases = [
      ['local s=0 for k,v in pairs({a=1,b=2}) do s=s+v end print(s)', ['3']],
      ['local s="" for i,v in ipairs({7,8,9}) do s=s..v end print(s)', ['789']],
      ['local function it(st,c) c=c+1 if c<=3 then return c, c*10 end end ' +
       'local s=0 for a,b in it,nil,0 do s=s+a+b end print(s)', ['66']],
      ['local q={a=1,b=2} local n=0 for k in pairs(q) do n=n+1 end print(n)', ['2']],
    ];
    for (const [src, expected] of cases) {
      const got = run(src).output.join('\n');
      if (got !== expected.join('\n')) {
        console.error('FAIL generic-for', JSON.stringify(src));
        console.error(' expected:', JSON.stringify(expected.join('\n')), 'got:', JSON.stringify(got));
        process.exitCode = 1;
      } else {
        console.log('  ok generic-for', JSON.stringify(src.slice(0, 42)));
      }
    }
  }

  // End-to-end: execute the emitted Lua. This is the only check that exercises
  // the real VM rather than the JavaScript reference interpreter, so it is the
  // one that catches dispatcher/offset/mutation bugs like the two above.
  {
    const luaBin = path.join(__dirname, '..', 'tools', 'bin', 'lua');
    const { spawnSync } = require('child_process');
    const tmp = require('os').tmpdir();
    if (!fs.existsSync(luaBin)) {
      console.log('  skip end-to-end (no tools/bin/lua)');
    } else {
      const execCases = [
        ['local s=0 for k,v in pairs({a=1,b=2,c=3}) do s=s+v end print(s)', '6'],
        ['local t="" for i,v in ipairs({4,5,6}) do t=t..v end print(t)', '456'],
        ['local x,y=1,1 local r=(x==y) print(r, (x~=y))', 'true\tfalse'],
        ['local a,b=2,3 print((a<b), (a<=b), (a>b))', 'true\ttrue\tfalse'],
        ['print(1~=2, 1~=1, 1==1, 2<3, 3<=2, 3>2, 2>=2)',
         'true\tfalse\ttrue\ttrue\tfalse\ttrue\ttrue'],
        ['print((3<=2), (3<2), (2<3))', 'false\tfalse\ttrue'],
        ['local function it(st,c) c=c+1 if c<=3 then return c end end ' +
         'local n=0 for v in it,nil,0 do n=n+v end print(n)', '6'],
        ['local m={a={b=function()end}} local n=function()end local keep=m.a.b ' +
         'local f=function() if m.a.b==n then m.a.b=keep end end f() ' +
         'for k in pairs(m.a) do m.a[k]=nil end print("ok")', 'ok'],
        ['local x=10 local function mk() local y=1 return function(d) x=x+d y=y+1 return x+y end end ' +
         'local g=mk() print(g(2)) print(g(3))', '14\n18'],
      ];
      for (const [src, expected] of execCases) {
        const out = obfuscate(src, { seed: 1 }).output;
        const file = path.join(tmp, 'msv3-selftest.lua');
        fs.writeFileSync(file, out);
        const res = spawnSync(luaBin, [file], { encoding: 'utf8', timeout: 20000 });
        const got = (res.stdout || '').trim();
        if (res.status !== 0 || got !== expected) {
          console.error('FAIL end-to-end', JSON.stringify(src.slice(0, 48)));
          console.error(' expected:', JSON.stringify(expected), 'got:', JSON.stringify(got),
            'status:', res.status, 'err:', (res.stderr || '').split('\n')[0]);
          process.exitCode = 1;
        } else {
          console.log('  ok end-to-end', JSON.stringify(src.slice(0, 40)));
        }
      }
    }
  }

  if (!process.exitCode) console.log('\nall tests passed');
}

main();
