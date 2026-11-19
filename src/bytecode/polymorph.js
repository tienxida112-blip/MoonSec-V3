'use strict';

// Give repeated, actually dispatched operations several opcode identities.
// Unlike unused decoy handlers, every identity here is assigned to a record.
// CLOSURE's MOVE/GETUPVAL binding records must retain their canonical enum.
function polymorphOpcodes(proto, rng) {
  const sites = new Map(), aliases = {};
  (function walk(p) {
    for (const x of p.instructions) {
      if (x.upval || x.superMember) continue;
      const name = x.dispatchVariant || x.variant;
      if (!sites.has(name)) sites.set(name, []);
      sites.get(name).push(x);
    }
    p.functions.forEach(walk);
  })(proto);
  for (const [base, occurrences] of sites) {
    if (occurrences.length < 4 || rng.int(3) !== 0) continue;
    const count = Math.min(3, Math.floor(occurrences.length / 2));
    const shuffled = rng.shuffle(occurrences);
    for (let i = 0; i < shuffled.length; i++) {
      const group = i % count;
      if (!group) continue;
      const name = 'M' + group + ':' + base;
      aliases[name] = base;
      shuffled[i].opcodeVariant = name;
    }
  }
  return aliases;
}

module.exports = { polymorphOpcodes };
