'use strict';

const { Lexer } = require('./lexer');

class ParseError extends Error {
  constructor(msg, tok) {
    super(`${msg} at ${tok.line}:${tok.col} (got ${tok.type})`);
    this.tok = tok;
  }
}

class Parser {
  constructor(src) {
    this.tokens = new Lexer(src).tokenize();
    this.p = 0;
  }

  cur() { return this.tokens[this.p]; }
  peek(n = 0) { return this.tokens[this.p + n] || this.tokens[this.tokens.length - 1]; }
  at(type) { return this.cur().type === type; }
  eat(type) {
    if (!this.at(type)) throw new ParseError(`expected ${type}`, this.cur());
    return this.tokens[this.p++];
  }
  match(type) {
    if (this.at(type)) { this.p++; return true; }
    return false;
  }

  skipBalanced(open, close) {
    this.eat(open);
    let depth = 1;
    while (!this.at('eof') && depth > 0) {
      if (this.at(open)) depth++;
      else if (this.at(close)) depth--;
      this.p++;
    }
  }

  skipType() {
    this.skipTypeAtom();
    while (this.at('|') || this.at('&')) {
      this.p++;
      this.skipTypeAtom();
    }
  }

  skipTypeAtom() {
    if (this.match('...')) {
      if (!this.at(',') && !this.at(')') && !this.at('|') && !this.at('&') && !this.at('eof')) this.skipTypeAtom();
      this.match('?');
      return;
    }
    if (this.at('(')) {
      this.skipBalanced('(', ')');
      if (this.match('->')) this.skipTypeAtom();
      this.match('?');
      return;
    }
    if (this.at('{')) {
      this.skipBalanced('{', '}');
      this.match('?');
      return;
    }
    if (this.at('string') || this.at('number') || this.at('true') || this.at('false') || this.at('nil')) {
      this.p++;
      this.match('?');
      return;
    }
    if (this.at('name') || this.at('function')) {
      const n = this.cur().value;
      this.p++;
      if (n === 'typeof' && this.at('(')) this.skipBalanced('(', ')');
      else {
        while (this.match('.')) {
          if (this.at('name')) this.p++;
          else break;
        }
        if (this.at('<')) this.skipBalanced('<', '>');
      }
      this.match('?');
      if (this.match('->')) this.skipTypeAtom();
      return;
    }
    this.match('?');
  }

  skipAttributes() {
    while (this.at('@')) {
      this.p++;
      if (this.at('name')) this.p++;
      if (this.at('(')) this.skipBalanced('(', ')');
    }
  }

  parse() {
    const body = this.block();
    this.eat('eof');
    return { type: 'chunk', body };
  }

  block(until) {
    const body = [];
    while (!this.at('eof') && !this.at('end') && !this.at('else') && !this.at('elseif') && !this.at('until') && !(until && this.at(until))) {
      if (this.at('return')) {
        body.push(this.statReturn());
        this.match(';');
        break;
      }
      const s = this.statement();
      if (s) body.push(s);
      this.match(';');
    }
    return body;
  }

  statement() {
    this.skipAttributes();
    const t = this.cur().type;
    if (t === ';') { this.p++; return null; }
    if (t === 'if') return this.statIf();
    if (t === 'while') return this.statWhile();
    if (t === 'do') return this.statDo();
    if (t === 'for') return this.statFor();
    if (t === 'repeat') return this.statRepeat();
    if (t === 'function') return this.statFunction(false);
    if (t === 'local') {
      this.eat('local');
      this.skipAttributes();
      if (this.at('function')) return this.statFunction(true);
      return this.statLocal();
    }
    if (t === 'break') { this.eat('break'); return { type: 'break' }; }
    if (t === 'name' && this.cur().value === 'continue') {
      const n = this.peek(1).type;
      if (n === 'end' || n === 'else' || n === 'elseif' || n === 'until' || n === ';' || n === 'eof') {
        this.p++;
        return { type: 'continue' };
      }
    }
    if (t === 'name' && this.cur().value === 'export' && this.peek(1).type === 'name' && this.peek(1).value === 'type') {
      this.p++;
      return this.statType();
    }
    if (t === 'name' && this.cur().value === 'type' && this.peek(1).type === 'name') {
      return this.statType();
    }
    return this.statExpr();
  }

  statType() {
    if (this.at('name') && this.cur().value === 'type') this.p++;
    if (this.at('name')) this.p++;
    if (this.at('<')) this.skipBalanced('<', '>');
    if (this.match('=')) this.skipType();
    return { type: 'typedef' };
  }

  statReturn() {
    this.eat('return');
    if (this.at(';') || this.at('end') || this.at('else') || this.at('elseif') || this.at('until') || this.at('eof')) {
      return { type: 'return', values: [] };
    }
    return { type: 'return', values: this.explist() };
  }

  statIf() {
    this.eat('if');
    const test = this.expr();
    this.eat('then');
    const consequent = this.block();
    const elifs = [];
    while (this.match('elseif')) {
      const t = this.expr();
      this.eat('then');
      elifs.push({ test: t, body: this.block() });
    }
    let alternate = null;
    if (this.match('else')) alternate = this.block();
    this.eat('end');
    return { type: 'if', test, consequent, elifs, alternate };
  }

  statWhile() {
    this.eat('while');
    const test = this.expr();
    this.eat('do');
    const body = this.block();
    this.eat('end');
    return { type: 'while', test, body };
  }

  statDo() {
    this.eat('do');
    const body = this.block();
    this.eat('end');
    return { type: 'do', body };
  }

  statRepeat() {
    this.eat('repeat');
    const body = this.block();
    this.eat('until');
    const test = this.expr();
    return { type: 'repeat', body, test };
  }

  statFor() {
    this.eat('for');
    const name = this.eat('name').value;
    if (this.match(':')) this.skipType();
    if (this.match('=')) {
      const start = this.expr();
      this.eat(',');
      const end = this.expr();
      let step = { type: 'literal', value: 1 };
      if (this.match(',')) step = this.expr();
      this.eat('do');
      const body = this.block();
      this.eat('end');
      return { type: 'fornum', name, start, end, step, body };
    }
    const names = [name];
    while (this.match(',')) {
      names.push(this.eat('name').value);
      if (this.match(':')) this.skipType();
    }
    this.eat('in');
    const iters = this.explist();
    this.eat('do');
    const body = this.block();
    this.eat('end');
    return { type: 'forin', names, iters, body };
  }

  statFunction(isLocal) {
    this.eat('function');
    let name = null;
    let method = false;
    if (!isLocal && this.at('name')) {
      const parts = [this.eat('name').value];
      while (this.match('.')) parts.push(this.eat('name').value);
      if (this.match(':')) {
        parts.push(this.eat('name').value);
        method = true;
      }
      name = parts;
    } else if (isLocal) {
      name = [this.eat('name').value];
    }
    if (this.at('<')) this.skipBalanced('<', '>');
    const fn = this.funcbody(method);
    fn.type = 'function';
    fn.name = name;
    fn.isLocal = isLocal;
    fn.method = method;
    return fn;
  }

  funcbody(method) {
    if (this.at('<')) this.skipBalanced('<', '>');
    this.eat('(');
    const params = [];
    let vararg = false;
    if (method) params.push('self');
    if (!this.at(')')) {
      for (;;) {
        if (this.match('...')) {
          vararg = true;
          if (this.match(':')) this.skipType();
          break;
        }
        params.push(this.eat('name').value);
        if (this.match(':')) this.skipType();
        if (!this.match(',')) break;
      }
    }
    this.eat(')');
    if (this.match(':')) this.skipType();
    const body = this.block();
    this.eat('end');
    return { type: 'functionexpr', params, vararg, body };
  }

  skipLocalAttr() {
    if (this.at('<') && this.peek(1).type === 'name') {
      this.p++;
      this.eat('name');
      this.eat('>');
    }
  }

  statLocal() {
    const names = [];
    for (;;) {
      names.push(this.eat('name').value);
      this.skipLocalAttr();
      if (this.match(':')) this.skipType();
      if (!this.match(',')) break;
    }
    let values = [];
    if (this.match('=')) values = this.explist();
    return { type: 'local', names, values };
  }

  statExpr() {
    const e = this.suffixed();
    const COMPOUND = {
      '+=': '+', '-=': '-', '*=': '*', '/=': '/', '%=': '%', '^=': '^',
      '..=': '..', '//=': '//',
    };
    if (COMPOUND[this.cur().type]) {
      const op = COMPOUND[this.cur().type];
      this.p++;
      const right = this.expr();
      return { type: 'assign', vars: [e], values: [{ type: 'binary', op, left: e, right }] };
    }
    if (this.at(',') || this.at('=')) {
      const vars = [e];
      while (this.match(',')) vars.push(this.suffixed());
      this.eat('=');
      return { type: 'assign', vars, values: this.explist() };
    }
    if (e.type !== 'call') throw new ParseError('expected statement', this.cur());
    return { type: 'exprstat', expr: e };
  }

  explist() {
    const list = [this.expr()];
    while (this.match(',')) list.push(this.expr());
    return list;
  }

  expr() { return this.exprOr(); }
  exprOr() {
    let left = this.exprAnd();
    while (this.match('or')) left = { type: 'binary', op: 'or', left, right: this.exprAnd() };
    return left;
  }
  exprAnd() {
    let left = this.exprCmp();
    while (this.match('and')) left = { type: 'binary', op: 'and', left, right: this.exprCmp() };
    return left;
  }
  exprCmp() {
    let left = this.exprConcat();
    for (;;) {
      const t = this.cur().type;
      if (t === '==' || t === '~=' || t === '<' || t === '>' || t === '<=' || t === '>=') {
        this.p++;
        left = { type: 'binary', op: t, left, right: this.exprConcat() };
      } else break;
    }
    return left;
  }
  exprConcat() {
    let left = this.exprAdd();
    if (this.match('..')) {
      return { type: 'binary', op: '..', left, right: this.exprConcat() };
    }
    return left;
  }
  exprAdd() {
    let left = this.exprMul();
    for (;;) {
      const t = this.cur().type;
      if (t === '+' || t === '-') {
        this.p++;
        left = { type: 'binary', op: t, left, right: this.exprMul() };
      } else break;
    }
    return left;
  }
  exprMul() {
    let left = this.exprUnary();
    for (;;) {
      const t = this.cur().type;
      if (t === '*' || t === '/' || t === '%' || t === '//') {
        this.p++;
        left = { type: 'binary', op: t, left, right: this.exprUnary() };
      } else break;
    }
    return left;
  }
  exprUnary() {
    if (this.match('not')) return { type: 'unary', op: 'not', arg: this.exprUnary() };
    if (this.match('#')) return { type: 'unary', op: '#', arg: this.exprUnary() };
    if (this.match('-')) return { type: 'unary', op: '-', arg: this.exprUnary() };
    return this.exprPow();
  }
  exprPow() {
    const left = this.primary();
    if (this.match('^')) return { type: 'binary', op: '^', left, right: this.exprUnary() };
    return left;
  }

  primary() {
    if (this.match('nil')) return { type: 'literal', value: null };
    if (this.match('true')) return { type: 'literal', value: true };
    if (this.match('false')) return { type: 'literal', value: false };
    if (this.at('number')) return { type: 'literal', value: this.eat('number').value };
    if (this.at('string')) {
      const token = this.eat('string');
      return { type: 'literal', value: token.value, bytes: token.bytes };
    }
    if (this.at('interpolated')) return this.interpolToExpr(this.eat('interpolated').value);
    if (this.at('if')) return this.exprIf();
    if (this.match('...')) return { type: 'vararg' };
    if (this.match('function')) return this.funcbody(false);
    if (this.match('{')) return this.table();
    return this.suffixed();
  }

  interpolToExpr(parts) {
    if (!parts.length) return { type: 'literal', value: '' };
    const pieces = parts.map(p => {
      if (p.kind === 'str') return { type: 'literal', value: p.value };
      const inner = parse('return ' + p.value);
      const ret = inner.body && inner.body[0];
      const val = ret && ret.type === 'return' ? ret.values[0] : { type: 'literal', value: null };
      return { type: 'call', callee: { type: 'name', name: 'tostring' }, args: [val] };
    });
    return pieces.reduce((left, right) => ({ type: 'binary', op: '..', left, right }));
  }

  exprIf() {
    this.eat('if');
    return this.finishIfExpr();
  }

  finishIfExpr() {
    const test = this.expr();
    this.eat('then');
    const consequent = this.expr();
    if (this.match('elseif')) {
      return { type: 'ifexpr', test, consequent, alternate: this.finishIfExpr() };
    }
    let alternate = { type: 'literal', value: null };
    if (this.match('else')) alternate = this.expr();
    return { type: 'ifexpr', test, consequent, alternate };
  }

  suffixed() {
    let e = this.prefix();
    for (;;) {
      if (this.match('.')) {
        const n = this.eat('name').value;
        e = { type: 'index', table: e, key: { type: 'literal', value: n }, dot: true };
      } else if (this.match('[')) {
        const k = this.expr();
        this.eat(']');
        e = { type: 'index', table: e, key: k };
      } else if (this.match('::')) {
        this.skipType();
      } else if (this.match(':')) {
        const n = this.eat('name').value;
        const args = this.funcargs();
        e = { type: 'call', callee: { type: 'index', table: e, key: { type: 'literal', value: n }, dot: true }, args, method: true };
      } else if (this.at('(') || this.at('string') || this.at('{')) {
        e = { type: 'call', callee: e, args: this.funcargs() };
      } else break;
    }
    return e;
  }

  prefix() {
    if (this.at('name')) return { type: 'name', name: this.eat('name').value };
    if (this.match('(')) {
      const e = this.expr();
      this.eat(')');
      // Parentheses truncate a multi-value expression to exactly one value, so
      // keep the node shaped as non-expandable (it used to be returned raw,
      // which let `print((f()))` expand all of f's results).
      return { type: 'paren', expr: e };
    }
    throw new ParseError('expected expression', this.cur());
  }

  funcargs() {
    if (this.match('(')) {
      if (this.match(')')) return [];
      const a = this.explist();
      this.eat(')');
      return a;
    }
    if (this.at('string')) {
      const token = this.eat('string');
      return [{ type: 'literal', value: token.value, bytes: token.bytes }];
    }
    if (this.match('{')) return [this.table()];
    throw new ParseError('expected function arguments', this.cur());
  }

  table() {
    const fields = [];
    while (!this.at('}') && !this.at('eof')) {
      if (this.match('[')) {
        const key = this.expr();
        this.eat(']');
        this.eat('=');
        fields.push({ key, value: this.expr() });
      } else if (this.at('name') && this.peek(1).type === '=') {
        const key = { type: 'literal', value: this.eat('name').value };
        this.eat('=');
        fields.push({ key, value: this.expr() });
      } else {
        fields.push({ value: this.expr() });
      }
      if (!this.match(',') && !this.match(';')) break;
    }
    this.eat('}');
    return { type: 'table', fields };
  }
}

function parse(src) {
  if (typeof src !== 'string') src = String(src || '');
  if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  if (src.startsWith('#!')) {
    const nl = src.indexOf('\n');
    src = nl >= 0 ? src.slice(nl + 1) : '';
  }
  const parser = new Parser(src);
  try {
    return parser.parse();
  } catch (e) {
    if (e instanceof ParseError && e.tok) {
      const lines = src.split('\n');
      const ln = e.tok.line || 1;
      const col = e.tok.col || 1;
      const line = lines[ln - 1] || '';
      e.message = `${e.message}\n  ${line}\n  ${' '.repeat(Math.max(0, col - 1))}^`;
    }
    throw e;
  }
}

module.exports = { Parser, ParseError, parse };
