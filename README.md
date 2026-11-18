# MoonSec V3 — Node.js Lua/Roblox obfuscator

A Node.js reconstruction of a MoonSec V3-style Lua VM obfuscator. The CLI is intentionally **obfuscate-only**. It accepts Lua/Luau source and emits Lua syntax intended for Roblox Luau.

## CLI

```bash
node bin/moonsec.js input.lua -o out.lua
node bin/moonsec.js input.lua -o out.lua --seed 12345
node bin/moonsec.js input.lua -o out.lua --no-watermark
```

The seed makes output reproducible. The default watermark is `MoonSec V3`; no Federal watermark is included.

## Pipeline

1. Lex and parse the supported Lua 5.1 / Roblox Luau syntax.
2. Compile into Lua 5.1-style register bytecode, with conservative dead-write elimination and register-read peepholes.
3. Fuse comparison/test branches and virtualize opcode variants.
4. Serialize randomized prototype layouts, constants and instruction operands.
5. Encode bytecode and generate a VM wrapper with a shuffled dispatch tree.

## Samples

`samples/obfuscated` holds 100 generated outputs, `001.lua`–`100.lua`. Only the obfuscated
samples are stored; the Lua sources are rebuilt on demand from `Tests/` plus
`scripts/unique-benches.js`. Regenerate all 100 with:

```bash
node scripts/generate-samples.js
```

A larger algorithmic stress input is in `Tests/complex_stress.lua`. The runtime
checks also use `tools/roblox-stub.lua` (a Roblox API stub) and `tools/bin/lua`
(a Lua 5.1.5 interpreter) to execute emitted code end to end.

## Development checks

```bash
node scripts/selftest.js
```

`selftest.js` includes end-to-end cases that run the emitted Lua through
`tools/bin/lua`; they are skipped automatically if that interpreter is absent.

## Layout

```
bin/moonsec.js          obfuscate-only CLI
src/obfuscate.js        obfuscation pipeline
src/lua/                lexer, parser, compiler, internal expression evaluator
src/bytecode/           opcodes and bytecode serializer
src/vm/                 handler templates and VM generator
src/encode.js           string and constant encoding
Tests/                  algorithmic test inputs, including complex_stress.lua
samples/                100 generated (obfuscated-only) samples + index.json
```
