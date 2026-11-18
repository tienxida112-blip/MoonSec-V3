'use strict';

const fs = require('fs');
const path = require('path');
const { obfuscate } = require('../src/obfuscate');
const { benches } = require('./unique-benches');

const ROOT = path.join(__dirname, '..', 'samples');
const ORIG = path.join(ROOT, 'original');
const OBF = path.join(ROOT, 'obfuscated');
const FIX = path.join(__dirname, '..', 'Tests');

function pad(n) { return String(n).padStart(3, '0'); }

const LUA_KW = new Set(
  'and break do else elseif end false for function if in local nil not or repeat return then true until while print math table string ipairs pairs type tonumber tostring'.split(' ')
);

function tokens(src, identsOnly) {
  const set = new Set();
  const re = /[A-Za-z_][A-Za-z0-9_]*/g;
  let m;
  while ((m = re.exec(src))) {
    if (identsOnly && LUA_KW.has(m[0])) continue;
    set.add(m[0]);
  }
  return set;
}

function jaccard(a, b) {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const uni = a.size + b.size - inter;
  return uni ? inter / uni : 1;
}

function loadFixtures() {
  const names = ['life.lua', 'bytecode_vm.lua', 'bignum.lua', 'fft.lua', 'graphs.lua', 'sha.lua', 'aes128.lua'];
  return names.map((n, i) => {
    const p = path.join(FIX, n);
    if (!fs.existsSync(p)) throw new Error('missing fixture ' + p);
    return '-- fixture ' + n + '\n' + fs.readFileSync(p, 'utf8');
  });
}

function main() {
  fs.mkdirSync(OBF, { recursive: true });
  // The repository ships only generated output; `samples/original/` is not kept.
  if (fs.existsSync(ORIG)) fs.rmSync(ORIG, { recursive: true, force: true });

  const extra = benches();
  const list = loadFixtures().concat(extra.slice(0, 93));
  if (list.length !== 100) {
    console.error('expected 100 samples, got', list.length);
    process.exit(1);
  }

  const tok = list.map(s => tokens(s, false));
  const ids = list.map(s => tokens(s, true));
  let worst = 0, worstPair = '', worstId = 0, worstIdPair = '';
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const jac = jaccard(tok[i], tok[j]);
      const idj = jaccard(ids[i], ids[j]);
      if (jac > worst) { worst = jac; worstPair = pad(i + 1) + ' vs ' + pad(j + 1); }
      if (idj > worstId) { worstId = idj; worstIdPair = pad(i + 1) + ' vs ' + pad(j + 1); }
      if (idj > 0.60) {
        console.error('TOO SIMILAR', pad(i + 1), 'vs', pad(j + 1), 'ident-jaccard', idj.toFixed(3));
        process.exit(1);
      }
    }
  }
  console.log('max token jaccard', worst.toFixed(3), '(' + worstPair + ')');
  console.log('max ident jaccard', worstId.toFixed(3), '(' + worstIdPair + ')');

  const index = [];
  for (let i = 0; i < list.length; i++) {
    const n = pad(i + 1);
    const src = '-- MoonSec V4 sample ' + n + '\n' + list[i] + '\n';
    let res;
    try {
      res = obfuscate(src, { seed: 1000 + i * 97 });
    } catch (e) {
      console.error('\nFAIL sample', n, e.message);
      process.exit(1);
    }
    fs.writeFileSync(path.join(OBF, n + '.lua'), res.output);
    index.push({
      id: n,
      obfuscated: 'obfuscated/' + n + '.lua',
      bytes: res.output.length,
      origBytes: src.length,
      seed: 1000 + i * 97,
    });
    process.stdout.write('\r  generated ' + (i + 1) + '/100  last=' + res.output.length + 'B   ');
  }
  fs.writeFileSync(path.join(ROOT, 'index.json'), JSON.stringify(index, null, 2));
  const bytes = index.reduce((s, x) => s + x.bytes, 0);
  console.log('\nwrote ' + index.length + ' obfuscated samples to', OBF, 'sum', bytes);
}

main();
