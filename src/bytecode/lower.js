'use strict';

const { OpCode: O, RKASK } = require('./opcodes');

// MoonSec's VM does not consume native Lua 5.1 operands unchanged. Conditions
// put the tested value in A, an absolute branch destination in B, and the
// second value in C. Destinations are zero-based because the VM increments its
// one-based PC after every handler. Keep records in place: closure bindings,
// skipped JMPs and superinstruction members still occupy instruction slots.
function lowerBranches(proto) {
  const code = proto.instructions;
  code.forEach((x, i) => { x.pc = i; });
  for (let i = 0; i < code.length; i++) {
    const x = code[i], next = code[i + 1];
    if (x.upval) continue;
    const paired = next && next.op === O.JMP;
    const destination = paired ? i + 2 + next.b : i + 1;
    if ([O.EQ, O.LT, O.LE].includes(x.op)) {
      x.invert = x.a;
      x.a = x.b;
      x.b = destination;
      x.fusedCmp = true;
      x.branchTarget = destination;
      x.valueCompare = !paired;
    } else if (x.op === O.TEST) {
      x.b = destination;
      x.fusedCmp = true;
      x.branchTarget = destination;
    } else if (x.op === O.TESTSET) {
      x.invert = x.c;
      x.c = x.b;
      x.b = destination;
      x.fusedBranch = true;
      x.branchTarget = destination;
    } else if (x.op === O.TFORLOOP && paired) {
      x.b = destination;
      x.fusedBranch = true;
      x.branchTarget = destination;
    }
  }
  proto.functions.forEach(lowerBranches);
}

function instructionForm(x) {
  if (x.fusedCmp || x.fusedBranch) return 3;
  if (x.op === O.JMP) return 2;
  if (x.op === O.FORPREP || x.op === O.FORLOOP) return 3;
  if ([O.LOADK, O.GETGLOBAL, O.SETGLOBAL].includes(x.op)) return 1;
  if (x.op === O.CLOSURE && !x.c) return 1;
  return 0;
}

// This is the only native-operand -> wire-operand conversion. The serializer,
// protocol tests and VM generator share the result, not separate heuristics.
function lowerInstruction(x) {
  let a = x.a || 0, b = x.b || 0, c = x.c || 0, mask = 0;
  const ka = () => { if (a >= RKASK) { a = a - RKASK + 1; mask |= 1; } };
  const kb = () => { if (b >= RKASK) { b = b - RKASK + 1; mask |= 2; } };
  const kc = () => { if (c >= RKASK) { c = c - RKASK + 1; mask |= 4; } };
  if (x.fusedCmp && [O.EQ, O.LT, O.LE].includes(x.op)) {
    ka(); kc();
  } else if ([O.LOADK, O.GETGLOBAL, O.SETGLOBAL].includes(x.op)) {
    b++; mask |= 2;
  } else if ([O.ADD, O.SUB, O.MUL, O.DIV, O.MOD, O.POW, O.SETTABLE].includes(x.op)) {
    kb(); kc();
  } else if (x.op === O.GETTABLE || x.op === O.SELF) kc();

  const v = x.variant || x.op;
  if (['CALL', 'CALLN0', 'CALLNV', 'CALLNM', 'TAILCALL'].includes(v)) b = a + b - 1;
  if (['CALLNM', 'CALL0M', 'CALL1M', 'CALLVM'].includes(v)) c = a + c - 2;
  if (v === 'SETLIST') b = a + b;
  if (v === 'RETURN') b -= 2;
  if (v === 'VARARG') b = a + b - 2;

  if (x.op === O.JMP || x.op === O.FORLOOP) b = x.pc + 1 + x.b;
  // MoonSec enters a numeric loop at its initial index and branches OUT when
  // it is empty; Lua 5.1 instead pre-decrements and jumps to the footer.
  if (x.op === O.FORPREP) b = x.pc + 2 + x.b;
  return { form: instructionForm(x), mask, a, b, c };
}

module.exports = { lowerBranches, lowerInstruction, instructionForm };
