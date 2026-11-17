'use strict';

const fs = require('fs');
const path = require('path');
const { parse } = require('../src/lua/parser');
const { compile } = require('../src/lua/compiler');
const { interpret } = require('../src/interpret');
const { obfuscate } = require('../src/obfuscate');
const { encodeBytes, decodeBytes, makeAlphabet } = require('../src/encode');
const { RNG } = require('../src/util');

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
  expectOut('complex-stress', fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'complex_stress.lua'), 'utf8'),
    ['stress\t79\t4\t95\t50\t2,3,5,7,11,13,17,19,23,31']);

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
    fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'complex_stress.lua'), 'utf8'),
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

  if (!process.exitCode) console.log('\nall tests passed');
}

main();
