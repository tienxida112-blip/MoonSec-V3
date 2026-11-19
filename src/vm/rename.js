'use strict';

const { Parser } = require('../lua/parser');
const { KEYWORDS } = require('../lua/lexer');
const { RNG } = require('../util');

// Alpha-rename the GENERATED Lua, not the user's encoded program. Resolve
// bindings first, then color their lexical interference graph. Strings, fields,
// globals and bytecode are never edited. Closures keep the original binding.
function shortenLocals(source, seed = 1) {
  const parser = new Parser(source);
  const ts = parser.tokens;
  const lines = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') lines.push(i + 1);
  for (let i = 0; i < ts.length; i++) ts[i].offset = lines[ts[i].line - 1] + ts[i].col - 1;
  const at = i => ts[Math.min(i, ts.length - 1)].offset;
  const wrap = (method, annotate) => {
    const original = parser[method];
    parser[method] = function (...args) {
      const from = this.p, node = original.apply(this, args);
      node.from = from; node.to = this.p;
      if (annotate) annotate(node, from, args);
      return node;
    };
  };
  const namesAt = (from, names) => names.map((name, i) => {
    const pos = from + 2 * i;
    if (ts[pos].type !== 'name' || ts[pos].value !== name) throw new Error('rename: declaration tokens disagree');
    return pos;
  });
  wrap('block');
  wrap('statLocal', (n, from) => { n.nameTokens = namesAt(from, n.names); });
  wrap('statFor', (n, from) => { n.nameTokens = namesAt(from + 1, n.type === 'fornum' ? [n.name] : n.names); });
  wrap('statRepeat');
  wrap('statFunction', (n, from) => { n.nameToken = from + 1; });
  wrap('funcbody', (n, from, args) => {
    let pos = from + 1;
    n.paramTokens = n.params.map((name, i) => {
      if (args[0] && i === 0) return null; // implicit method self
      if (ts[pos].type !== 'name' || ts[pos].value !== name) throw new Error('rename: parameter tokens disagree');
      const token = pos; pos += 2; return token;
    });
  });
  const prefix = parser.prefix;
  parser.prefix = function () {
    const token = this.at('name') ? this.p : null;
    const n = prefix.call(this);
    if (token !== null) n.token = token;
    return n;
  };
  const ast = parser.parse();
  const bindings = [], globals = [];
  const scope = (parent, body, end) => ({
    parent, depth: parent ? parent.depth + 1 : 0,
    end: end === undefined ? at(body.to) : end,
    names: new Map(), bindings: [],
  });
  const bind = (s, name, token, start) => {
    const b = {
      old: name, token, start, scope: s, refs: [], edges: new Set(),
      forbidden: new Set(), name: token === null ? name : null,
    };
    s.bindings.push(b); s.names.set(name, b); bindings.push(b);
    return b;
  };
  const group = bs => {
    for (const a of bs) for (const b of bs) if (a !== b) a.edges.add(b);
  };
  const ref = (s, name, token) => {
    let b;
    for (let p = s; p && !b; p = p.parent) b = p.names.get(name);
    const r = { scope: s, token, pos: at(token), name };
    if (b) b.refs.push(r); else globals.push(r);
  };
  const fn = (node, parent) => {
    const s = scope(parent, node.body, at(node.to));
    group(node.params.map((name, i) => bind(s, name, node.paramTokens[i], at(node.from))));
    block(node.body, s);
  };
  const expr = (n, s) => {
    if (!n) return;
    switch (n.type) {
      case 'name': ref(s, n.name, n.token); break;
      case 'literal': case 'vararg': break;
      case 'paren': expr(n.expr, s); break;
      case 'unary': expr(n.arg, s); break;
      case 'binary': expr(n.left, s); expr(n.right, s); break;
      case 'index': expr(n.table, s); expr(n.key, s); break;
      case 'call': expr(n.callee, s); n.args.forEach(a => expr(a, s)); break;
      case 'table': n.fields.forEach(f => { expr(f.key, s); expr(f.value, s); }); break;
      case 'functionexpr': fn(n, s); break;
      case 'ifexpr': expr(n.test, s); expr(n.consequent, s); expr(n.alternate, s); break;
      default: throw new Error('rename: unhandled expression ' + n.type);
    }
  };
  const block = (body, s) => {
    for (const n of body) {
      switch (n.type) {
        case 'local':
          n.values.forEach(v => expr(v, s));
          group(n.names.map((name, i) => bind(s, name, n.nameTokens[i], at(n.to))));
          break;
        case 'function':
          if (n.isLocal) bind(s, n.name[0], n.nameToken, at(n.nameToken));
          else ref(s, n.name[0], n.nameToken);
          fn(n, s); break;
        case 'assign': n.vars.forEach(v => expr(v, s)); n.values.forEach(v => expr(v, s)); break;
        case 'exprstat': expr(n.expr, s); break;
        case 'return': n.values.forEach(v => expr(v, s)); break;
        case 'if':
          expr(n.test, s); block(n.consequent, scope(s, n.consequent));
          for (const e of n.elifs) { expr(e.test, s); block(e.body, scope(s, e.body)); }
          if (n.alternate) block(n.alternate, scope(s, n.alternate));
          break;
        case 'while': expr(n.test, s); block(n.body, scope(s, n.body)); break;
        case 'repeat': {
          const inner = scope(s, n.body, at(n.to));
          block(n.body, inner); expr(n.test, inner); break;
        }
        case 'do': block(n.body, scope(s, n.body)); break;
        case 'fornum': {
          expr(n.start, s); expr(n.end, s); expr(n.step, s);
          const inner = scope(s, n.body);
          bind(inner, n.name, n.nameTokens[0], at(n.body.from));
          block(n.body, inner); break;
        }
        case 'forin': {
          n.iters.forEach(v => expr(v, s));
          const inner = scope(s, n.body);
          group(n.names.map((name, i) => bind(inner, name, n.nameTokens[i], at(n.body.from))));
          block(n.body, inner); break;
        }
        case 'break': case 'continue': case 'typedef': break;
        default: throw new Error('rename: unhandled statement ' + n.type);
      }
    }
  };
  block(ast.body, scope(null, ast.body));

  // At a reference to A, every later visible binding B must have another name;
  // otherwise B would capture that reference after renaming. Earlier closure
  // definitions may safely reuse a later declaration's spelling: Lua has
  // already captured the earlier local by then.
  for (const a of bindings) for (const r of a.refs) {
    for (let s = r.scope; s; s = s.parent) {
      if (s.depth < a.scope.depth) break;
      for (const b of s.bindings) {
        if (b === a || b.start > r.pos || r.pos >= s.end) continue;
        if (s === a.scope && b.start < a.start) continue;
        a.edges.add(b); b.edges.add(a);
      }
    }
  }
  for (const r of globals) for (let s = r.scope; s; s = s.parent) {
    for (const b of s.bindings) if (b.start <= r.pos && r.pos < s.end) b.forbidden.add(r.name);
  }

  const rng = new RNG((seed ^ 0x5a17c9e3) >>> 0);
  const short = rng.shuffle('enltdoarfhuscpmbvgijkqwxyz_'.split(''));
  const pool = short.slice();
  for (const a of short) for (const b of short) if (!KEYWORDS.has(a + b)) pool.push(a + b);
  const pending = new Set(bindings.filter(b => b.name === null));
  while (pending.size) {
    let best, rank = -1;
    for (const b of pending) {
      const saturation = new Set([...b.edges].map(e => e.name).filter(Boolean)).size;
      const weight = saturation * 1000000 + b.edges.size * 1000 + b.refs.length;
      if (weight > rank) { rank = weight; best = b; }
    }
    const taken = new Set([...best.edges].map(b => b.name).filter(Boolean));
    best.name = pool.find(n => !taken.has(n) && !best.forbidden.has(n));
    if (!best.name) throw new Error('rename: exhausted identifier pool');
    pending.delete(best);
  }
  const edits = new Map();
  for (const b of bindings) {
    if (b.token !== null) edits.set(b.token, b.name);
    for (const r of b.refs) edits.set(r.token, b.name);
  }
  let output = '', pos = 0;
  for (const [i, name] of [...edits].sort((a, b) => a[0] - b[0])) {
    const t = ts[i];
    output += source.slice(pos, t.offset) + name;
    pos = t.offset + t.value.length;
  }
  return output + source.slice(pos);
}

module.exports = { shortenLocals };
