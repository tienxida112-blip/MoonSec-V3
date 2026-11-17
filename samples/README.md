# Samples

100 **structurally distinct** Lua/Luau algorithmic benches (not game hubs).

- `001`–`007` are the real Test-suite sources (Life, bytecode VM, bignum, FFT, graphs, SHA, AES-128).
- `008`–`100` are unique kernels: sorts, string matching, graphs, parsers, VMs, crypto, geometry, DP, automata — each a different algorithm, not a parameterized copy of a family template.

- `original/` — Lua 5.1 / Luau sources
- `obfuscated/` — MoonSec V3 output of this obfuscator

Regenerate:

```bash
node scripts/generate-samples.js
```
