'use strict';

// Runtime envelope measurements used by the shape fitter. Keep this module
// self-contained: obfuscation must not depend on development scripts or samples.
function count(s, re) {
  return (s.match(re) || []).length;
}

const STDLIB = [
  'setmetatable', 'getmetatable', 'rawget', 'rawset', 'select', 'unpack',
  'tonumber', 'tostring', 'type', 'pairs', 'ipairs', 'next', 'pcall', 'xpcall',
  'error', 'assert', 'string', 'table', 'math', 'coroutine', 'os', 'io',
  'getfenv', 'setfenv', 'ldexp', 'char', 'byte', 'sub', 'concat', 'insert',
  'remove', 'sort', 'gsub', 'find', 'format',
];

function features(s, cutRaw) {
  const cut = cutRaw || 0;
  const prelude = cut ? s.slice(0, cut) : s;
  const tail = cut ? s.slice(cut) : '';

  const identLens = [];
  for (const m of s.matchAll(/\blocal ([A-Za-z_][A-Za-z0-9_]*)/g)) identLens.push(m[1].length);
  const avgLocal = identLens.length ? identLens.reduce((a, b) => a + b, 0) / identLens.length : 0;
  const literals = STDLIB.filter(k => new RegExp(`\\b${k}\\b`).test(s));
  return {
    bytes: s.length,
    header: s.startsWith("([[This file was protected with MoonSec V3]]):gsub('.+', (function(a) "),
    footer: s.trimEnd().endsWith('),...)'),
    dispatches: count(s, /\b[A-Za-z_]\w*=\w+\[\w+\];\w+=\w+\[\w+\];/g),
    tableIndex: count(s, /\b[a-z]\[[^\]]{1,24}\]/g),
    hexLiterals: count(s, /0x[0-9a-f]+/g),
    localCount: count(s, /\blocal\b/g),
    avgLocalName: avgLocal,
    oneLetterLocals: identLens.filter(n => n === 1).length,
    stdlibLiterals: literals,
    functions: count(s, /\bfunction\b/g),
    loops: count(s, /\bwhile\b/g) + count(s, /\brepeat\b/g) + count(s, /\bfor\b/g),
    loopFor: count(s, /\bfor\b/g),
    loopWhile: count(s, /\bwhile\b/g),
    loopRepeat: count(s, /\brepeat\b/g),
    semicolons: count(s, /;/g),
    preludeHex: count(prelude, /0x[0-9a-f]+/g),
    tailHex: count(tail, /0x[0-9a-f]+/g),
  };
}

module.exports = { features };
