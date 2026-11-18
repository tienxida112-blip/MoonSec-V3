# Samples

100 **structurally distinct** Lua/Luau algorithmic benches (not game hubs).

- `001`–`007` are the real test-suite sources (Life, bytecode VM, bignum, FFT, graphs, SHA, AES-128).
- `008`–`100` are unique kernels: sorts, string matching, graphs, parsers, VMs, crypto, geometry, DP, automata — each a different algorithm, not a parameterized copy of a family template.

Only the generated output is stored:

- `obfuscated/` — MoonSec V3 output of this obfuscator, `001.lua`–`100.lua`
- `index.json` — per-sample id, output path, output bytes, source bytes and seed

The Lua sources are not kept in the repository. They are rebuilt from `Tests/`
plus `scripts/unique-benches.js` on demand.

Regenerate all 100 outputs:

```bash
node scripts/generate-samples.js
```

The script rewrites `obfuscated/` in place and deletes any stale `original/`
directory, so the tree always holds exactly 100 obfuscated samples.
