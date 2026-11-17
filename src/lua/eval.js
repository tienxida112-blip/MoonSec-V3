'use strict';

class LuaReturn {
  constructor(values) { this.values = values; }
}

function luaMod(a, b) {
  if (b === 0) return NaN;
  return a - Math.floor(a / b) * b;
}

function isTruthy(v) {
  return v !== false && v !== null && v !== undefined;
}

function lookup(env, name) {
  while (env) {
    if (Object.prototype.hasOwnProperty.call(env.vars, name)) return env.vars[name];
    env = env.parent;
  }
  return undefined;
}

function assignName(env, name, value) {
  let e = env;
  while (e) {
    if (Object.prototype.hasOwnProperty.call(e.vars, name)) {
      e.vars[name] = value;
      return;
    }
    e = e.parent;
  }
  env.vars[name] = value;
}

function makeFn(node, env) {
  const params = node.params || [];
  return function luaFn(...args) {
    const local = { parent: env, vars: Object.create(null) };
    params.forEach((p, i) => { local.vars[p] = args[i]; });
    try {
      execBlock(node.body || [], local);
    } catch (e) {
      if (e instanceof LuaReturn) return e.values[0];
      throw e;
    }
    return undefined;
  };
}

function evalExpr(n, env) {
  if (!n) return undefined;
  switch (n.type) {
    case 'literal': return n.value;
    case 'name': return lookup(env, n.name);
    case 'vararg': return undefined;
    case 'functionexpr': return makeFn(n, env);
    case 'unary': {
      const a = evalExpr(n.arg, env);
      if (n.op === '-') return -(a || 0);
      if (n.op === 'not') return !isTruthy(a);
      if (n.op === '#') return (a && a.length) || 0;
      return undefined;
    }
    case 'binary': {
      if (n.op === 'and') {
        const l = evalExpr(n.left, env);
        return isTruthy(l) ? evalExpr(n.right, env) : l;
      }
      if (n.op === 'or') {
        const l = evalExpr(n.left, env);
        return isTruthy(l) ? l : evalExpr(n.right, env);
      }
      const l = evalExpr(n.left, env);
      const r = evalExpr(n.right, env);
      switch (n.op) {
        case '+': return (l || 0) + (r || 0);
        case '-': return (l || 0) - (r || 0);
        case '*': return (l || 0) * (r || 0);
        case '/': return (l || 0) / (r || 0);
        case '%': return luaMod(l || 0, r || 0);
        case '^': return (l || 0) ** (r || 0);
        case '..': return String(l) + String(r);
        case '<': return l < r;
        case '>': return l > r;
        case '<=': return l <= r;
        case '>=': return l >= r;
        case '==': return l === r;
        case '~=': return l !== r;
        default: return undefined;
      }
    }
    case 'call': {
      const fn = evalExpr(n.callee, env);
      if (typeof fn !== 'function') return undefined;
      const args = (n.args || []).map(a => evalExpr(a, env));
      return fn(...args);
    }
    case 'index': {
      const t = evalExpr(n.table, env);
      const k = evalExpr(n.key, env);
      return t ? t[k] : undefined;
    }
    case 'table': return {};
    default: return undefined;
  }
}

function execBlock(body, env) {
  for (const s of body || []) execStmt(s, env);
}

function execStmt(s, env) {
  if (!s) return;
  switch (s.type) {
    case 'local': {
      const vals = (s.values || []).map(v => evalExpr(v, env));
      (s.names || []).forEach((nm, i) => { env.vars[nm] = vals[i]; });
      return;
    }
    case 'assign': {
      const vals = (s.values || []).map(v => evalExpr(v, env));
      (s.vars || []).forEach((v, i) => {
        if (v.type === 'name') assignName(env, v.name, vals[i]);
      });
      return;
    }
    case 'if': {
      if (isTruthy(evalExpr(s.test, env))) return execBlock(s.consequent, env);
      for (const e of s.elifs || []) {
        if (isTruthy(evalExpr(e.test, env))) return execBlock(e.body, env);
      }
      if (s.alternate) return execBlock(s.alternate, env);
      return;
    }
    case 'return':
      throw new LuaReturn((s.values || []).map(v => evalExpr(v, env)));
    case 'exprstat':
      evalExpr(s.expr, env);
      return;
    case 'do':
      return execBlock(s.body, env);
    case 'function':
      env.vars[Array.isArray(s.name) ? s.name[0] : s.name] = makeFn(s, env);
      return;
    default:
      return;
  }
}

function evalLua(node, env) {
  env = env || { parent: null, vars: Object.create(null) };
  try {
    if (!node) return undefined;
    if (node.type === 'chunk') return evalLua(node.body, env);
    if (Array.isArray(node)) {
      execBlock(node, env);
      return undefined;
    }
    if (node.type && !node.body && node.type !== 'function' && node.type !== 'functionexpr') {
      return evalExpr(node, env);
    }
    execBlock(Array.isArray(node) ? node : [node], env);
  } catch (e) {
    if (e instanceof LuaReturn) return e.values[0];
    throw e;
  }
  return undefined;
}

module.exports = { evalLua, luaMod };
