'use strict';

const { OpCode, RKASK } = require('./bytecode/opcodes');

function isTruthy(v) {
  return v !== null && v !== undefined && v !== false;
}

function luaLen(v) {
  if (typeof v === 'string') return v.length;
  if (v && typeof v === 'object') {
    let i = 1;
    while (v[i] !== undefined) i++;
    return i - 1;
  }
  return 0;
}

function luaEq(a, b) {
  if (a === b) return true;
  if (a === null || a === undefined) return b === null || b === undefined;
  return false;
}

class LuaRuntimeError extends Error {}

function makeEnv(extra = {}) {
  const env = {
    print: (...args) => {
      env._output.push(args.map(a => a === null || a === undefined ? 'nil' : String(a)).join('\t'));
    },
    type: (v) => {
      if (v === null || v === undefined) return 'nil';
      if (Array.isArray(v) || (typeof v === 'object' && !Array.isArray(v) && typeof v !== 'function')) return 'table';
      return typeof v;
    },
    tostring: (v) => (v === null || v === undefined ? 'nil' : String(v)),
    tonumber: (v) => {
      const n = Number(v);
      return Number.isNaN(n) ? null : n;
    },
    select: (n, ...rest) => {
      if (n === '#') return rest.length;
      return rest[n - 1];
    },
    pairs: (t) => {
      const keys = Object.keys(t);
      let i = 0;
      return function() {
        if (i >= keys.length) return [];
        const k = keys[i++];
        const nk = /^\d+$/.test(k) ? Number(k) : k;
        return [nk, t[k]];
      };
    },
    ipairs: (t) => {
      let i = 0;
      return function() {
        i++;
        if (t[i] === undefined) return [];
        return [i, t[i]];
      };
    },
    next: (t, k) => {
      const keys = Object.keys(t);
      if (k === null || k === undefined) {
        if (!keys.length) return [];
        const nk = /^\d+$/.test(keys[0]) ? Number(keys[0]) : keys[0];
        return [nk, t[keys[0]]];
      }
      const idx = keys.indexOf(String(k));
      if (idx < 0 || idx + 1 >= keys.length) return [];
      const nk = /^\d+$/.test(keys[idx + 1]) ? Number(keys[idx + 1]) : keys[idx + 1];
      return [nk, t[keys[idx + 1]]];
    },
    unpack: (t, i = 1, j) => {
      const n = luaLen(t);
      if (j === undefined) j = n;
      const out = [];
      for (let k = i; k <= j; k++) out.push(t[k]);
      return out;
    },
    pcall: (fn, ...args) => {
      try {
        const r = fn(...args);
        if (Array.isArray(r)) return [true, ...r];
        return [true, r];
      } catch (e) {
        return [false, e.message];
      }
    },
    error: (m) => { throw new LuaRuntimeError(String(m)); },
    assert: (v, m) => { if (!isTruthy(v)) throw new LuaRuntimeError(m || 'assertion failed!'); return v; },
    string: {
      char: (...n) => String.fromCharCode(...n),
      byte: (s, i = 1, j) => {
        i = i - 1;
        j = (j === undefined ? i : j - 1);
        const out = [];
        for (let k = i; k <= j && k < s.length; k++) out.push(s.charCodeAt(k));
        return out.length === 1 ? out[0] : out;
      },
      sub: (s, i, j) => {
        i = i < 0 ? s.length + i + 1 : i;
        j = j === undefined ? s.length : (j < 0 ? s.length + j + 1 : j);
        return s.substring(i - 1, j);
      },
      len: (s) => String(s).length,
      lower: (s) => String(s).toLowerCase(),
      upper: (s) => String(s).toUpperCase(),
      rep: (s, n) => String(s).repeat(n),
      reverse: (s) => String(s).split('').reverse().join(''),
      format: (fmt, ...args) => {
        let i = 0;
        return String(fmt).replace(/%[-+#0 ]*\d*(?:\.\d+)?[sdifxXq]/g, (m) => {
          const a = args[i++];
          if (m.endsWith('s') || m.endsWith('q')) return String(a);
          if (m.endsWith('d') || m.endsWith('i')) return String(Math.floor(Number(a)));
          if (m.endsWith('f')) return String(Number(a));
          return String(a);
        });
      },
    },
    table: {
      concat: (t, sep = '', i = 1, j) => {
        const n = luaLen(t);
        if (j === undefined) j = n;
        const a = [];
        for (let k = i; k <= j; k++) a.push(t[k] == null ? '' : String(t[k]));
        return a.join(sep);
      },
      insert: (t, ...rest) => {
        if (rest.length === 1) t[luaLen(t) + 1] = rest[0];
        else {
          const [pos, v] = rest;
          const n = luaLen(t);
          for (let k = n; k >= pos; k--) t[k + 1] = t[k];
          t[pos] = v;
        }
      },
      remove: (t, pos) => {
        const n = luaLen(t);
        if (pos === undefined) pos = n;
        const v = t[pos];
        for (let k = pos; k < n; k++) t[k] = t[k + 1];
        t[n] = undefined;
        return v;
      },
      sort: (t, cmp) => {
        const n = luaLen(t);
        const a = [];
        for (let i = 1; i <= n; i++) a.push(t[i]);
        a.sort(cmp ? (x, y) => (cmp(x, y) ? -1 : 1) : undefined);
        for (let i = 1; i <= n; i++) t[i] = a[i - 1];
      },
    },
    math: {
      abs: Math.abs, floor: Math.floor, ceil: Math.ceil, sqrt: Math.sqrt,
      sin: Math.sin, cos: Math.cos, tan: Math.tan, max: Math.max, min: Math.min,
      random: Math.random, pi: Math.PI, huge: Infinity,
      ldexp: (m, e) => m * Math.pow(2, e),
      mod: (a, b) => a % b,
      pow: Math.pow,
    },
    _G: null,
    _VERSION: 'Lua 5.1',
    _output: [],
    ...extra,
  };
  env._G = env;
  return env;
}

function rk(stk, kst, x) {
  if (x >= RKASK) return kst[x - RKASK];
  return stk[x];
}

function runProto(proto, env, args, upvals) {
  const stk = [];
  const kst = proto.constants;
  const nparams = proto.numParams;
  const vararg = [];
  for (let i = 0; i < nparams; i++) stk[i] = args[i] === undefined ? null : args[i];
  for (let i = nparams; i < args.length; i++) vararg.push(args[i]);
  let pc = 0;
  let top = nparams;
  const insts = proto.instructions;
  const upv = upvals || [];

  const wrap = (p, uv) => {
    const fn = function (...a) {
      const r = runProto(p, env, a, uv);
      if (r === undefined) return;
      if (Array.isArray(r) && r._multret) return r;
      return r;
    };
    fn._lua = true;
    fn._proto = p;
    return fn;
  };

  while (pc < insts.length) {
    const ins = insts[pc];
    const { op, a, b, c } = ins;
    switch (op) {
      case OpCode.MOVE:
        stk[a] = stk[b];
        break;
      case OpCode.LOADK:
        stk[a] = kst[b];
        break;
      case OpCode.LOADBOOL:
        stk[a] = b !== 0;
        if (c) pc++;
        break;
      case OpCode.LOADNIL:
        for (let i = a; i <= b; i++) stk[i] = null;
        break;
      case OpCode.GETUPVAL:
        stk[a] = getUp(upv[b]);
        break;
      case OpCode.GETGLOBAL: {
        const n = kst[b];
        stk[a] = env[n];
        if (stk[a] === undefined) stk[a] = null;
        break;
      }
      case OpCode.GETTABLE: {
        const t = stk[b];
        const k = rk(stk, kst, c);
        stk[a] = index(t, k);
        break;
      }
      case OpCode.SETGLOBAL:
        env[kst[b]] = stk[a];
        break;
      case OpCode.SETUPVAL:
        setUp(upv[b], stk[a]);
        break;
      case OpCode.SETTABLE:
        setIndex(stk[a], rk(stk, kst, b), rk(stk, kst, c));
        break;
      case OpCode.NEWTABLE:
        stk[a] = {};
        break;
      case OpCode.SELF: {
        const t = stk[b];
        stk[a + 1] = t;
        stk[a] = index(t, rk(stk, kst, c));
        break;
      }
      case OpCode.ADD: stk[a] = Number(rk(stk, kst, b)) + Number(rk(stk, kst, c)); break;
      case OpCode.SUB: stk[a] = Number(rk(stk, kst, b)) - Number(rk(stk, kst, c)); break;
      case OpCode.MUL: stk[a] = Number(rk(stk, kst, b)) * Number(rk(stk, kst, c)); break;
      case OpCode.DIV: stk[a] = Number(rk(stk, kst, b)) / Number(rk(stk, kst, c)); break;
      case OpCode.MOD: stk[a] = Number(rk(stk, kst, b)) % Number(rk(stk, kst, c)); break;
      case OpCode.POW: stk[a] = Math.pow(Number(rk(stk, kst, b)), Number(rk(stk, kst, c))); break;
      case OpCode.UNM: stk[a] = -Number(stk[b]); break;
      case OpCode.NOT: stk[a] = !isTruthy(stk[b]); break;
      case OpCode.LEN: stk[a] = luaLen(stk[b]); break;
      case OpCode.CONCAT: {
        let s = '';
        for (let i = b; i <= c; i++) s += stk[i] == null ? 'nil' : String(stk[i]);
        stk[a] = s;
        break;
      }
      case OpCode.JMP:
        pc += b;
        break;
      case OpCode.EQ: {
        const eq = luaEq(rk(stk, kst, b), rk(stk, kst, c));
        if (eq !== (a !== 0)) pc++;
        break;
      }
      case OpCode.LT: {
        const lt = rk(stk, kst, b) < rk(stk, kst, c);
        if (lt !== (a !== 0)) pc++;
        break;
      }
      case OpCode.LE: {
        const le = rk(stk, kst, b) <= rk(stk, kst, c);
        if (le !== (a !== 0)) pc++;
        break;
      }
      case OpCode.TEST:
        if (isTruthy(stk[a]) !== (c !== 0)) pc++;
        break;
      case OpCode.TESTSET:
        if (isTruthy(stk[b]) === (c !== 0)) {
          stk[a] = stk[b];
        } else pc++;
        break;
      case OpCode.CALL: {
        const fn = stk[a];
        let narg = b - 1;
        if (b === 0) narg = top - a - 1;
        const args = [];
        for (let i = 0; i < narg; i++) args.push(stk[a + 1 + i]);
        const nres = c - 1;
        const res = callFn(fn, args, env);
        const arr = flatten(res);
        if (c === 0) {
          for (let i = 0; i < arr.length; i++) stk[a + i] = arr[i];
          top = a + arr.length;
        } else {
          for (let i = 0; i < nres; i++) stk[a + i] = i < arr.length ? arr[i] : null;
        }
        break;
      }
      case OpCode.TAILCALL: {
        const fn = stk[a];
        let narg = b - 1;
        if (b === 0) narg = top - a - 1;
        const args = [];
        for (let i = 0; i < narg; i++) args.push(stk[a + 1 + i]);
        return flatten(callFn(fn, args, env));
      }
      case OpCode.RETURN: {
        let n = b - 1;
        if (b === 0) n = top - a;
        const out = [];
        for (let i = 0; i < n; i++) out.push(stk[a + i]);
        return out;
      }
      case OpCode.FORLOOP: {
        stk[a] = Number(stk[a]) + Number(stk[a + 2]);
        const step = Number(stk[a + 2]);
        const idx = Number(stk[a]);
        const limit = Number(stk[a + 1]);
        if (step > 0 ? idx <= limit : idx >= limit) {
          pc += b;
          stk[a + 3] = idx;
        }
        break;
      }
      case OpCode.FORPREP:
        stk[a] = Number(stk[a]) - Number(stk[a + 2]);
        pc += b;
        break;
      case OpCode.ITERPREP: {
        if (stk[a] && typeof stk[a] === 'object') {
          stk[a + 1] = stk[a]; stk[a] = env.next; stk[a + 2] = null;
        }
        break;
      }
      case OpCode.TFORLOOP: {
        const gen = stk[a];
        const res = flatten(callFn(gen, [stk[a + 1], stk[a + 2]], env));
        for (let i = 0; i < c; i++) stk[a + 3 + i] = i < res.length ? res[i] : null;
        if (stk[a + 3] !== null && stk[a + 3] !== undefined) {
          stk[a + 2] = stk[a + 3];
        } else pc++;
        break;
      }
      case OpCode.SETLIST: {
        const t = stk[a];
        let n = b;
        if (b === 0) n = top - a - 1;
        const page = c === 0 ? 1 : c;
        const FPF = 50;
        for (let i = 1; i <= n; i++) t[(page - 1) * FPF + i] = stk[a + i];
        break;
      }
      case OpCode.CLOSE:
        break;
      case OpCode.CLOSURE: {
        const p = proto.functions[b];
        const uv = [];
        for (let i = 0; i < (p.upvalues.length || ins.c || 0); i++) {
          const next = insts[pc + 1];
          pc++;
          if (next.op === OpCode.MOVE) uv.push({ stk, idx: next.b, open: true });
          else uv.push(upv[next.b]);
        }
        stk[a] = wrap(p, uv);
        break;
      }
      case OpCode.VARARG: {
        let n = b - 1;
        if (b === 0) {
          for (let i = 0; i < vararg.length; i++) stk[a + i] = vararg[i];
          top = a + vararg.length;
        } else {
          for (let i = 0; i < n; i++) stk[a + i] = i < vararg.length ? vararg[i] : null;
        }
        break;
      }
      default:
        throw new LuaRuntimeError('unknown opcode ' + op);
    }
    pc++;
  }
  return [];
}

function getUp(u) {
  if (!u) return null;
  if (u.open) return u.stk[u.idx];
  return u.value;
}
function setUp(u, v) {
  if (u.open) u.stk[u.idx] = v;
  else u.value = v;
}
function index(t, k) {
  if (t == null) return null;
  if (typeof t === 'function') return null;
  if (typeof t === 'string') {
    if (k === 'byte' || k === 'char' || k === 'sub' || k === 'len' || k === 'format' || k === 'lower' || k === 'upper' || k === 'rep' || k === 'reverse') {
      return null;
    }
  }
  const v = t[k];
  return v === undefined ? null : v;
}
function setIndex(t, k, v) {
  t[k] = v;
}
function flatten(res) {
  if (res === undefined || res === null) return [null];
  if (Array.isArray(res)) return res;
  return [res];
}
function callFn(fn, args, env) {
  if (typeof fn !== 'function') throw new LuaRuntimeError('attempt to call a ' + typeof fn + ' value');
  const r = fn(...args);
  if (Array.isArray(r)) return r;
  if (r === undefined) return [];
  return [r];
}

function interpret(proto, extraEnv) {
  const env = makeEnv(extraEnv || {});
  const out = runProto(proto, env, [], []);
  return { result: out, output: env._output, env };
}

module.exports = { interpret, makeEnv, runProto };
