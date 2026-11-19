# MoonSec V3 - Lua Obfuscator

A reconstruction of MoonSec V3's observed plain-constant bytecode format and VM transforms. This is not the original source code.

## About MoonSec

MoonSec V3 was released on **July 2, 2021** and worked until **December 15, 2024**. It was fully gone by **December 25, 2025**. Its owner was **federal#9999**.

It used control-flow flattening, a virtual machine (aka VM), and custom bytecode. The owner later left the message "I quit" on GitHub.

## Usage

Requires **Node.js 18 or newer**. There are no npm dependencies to install.

```sh
node bin/moonsec.js input.lua -o output.lua
```

Use a fixed seed to get the same output from the same input:

```sh
node bin/moonsec.js input.lua -o output.lua --seed 12345
```

`--no-watermark` disables the watermark injected into the bytecode. The wrapper header stays.

## Install on Termux

```sh
pkg update
pkg install git nodejs
git clone https://github.com/tienxida112-blip/MoonSec-V3-Reconstruct- moonsec-v3
cd moonsec-v3
```

Then run the usage command with your input file.

## Obfuscation pipeline

1. Tokenize and parse the Lua/Luau source into an AST.
2. Compile the AST into register-based bytecode, including constants and nested functions.
3. Lower comparisons, tests, loop branches, calls, and register bounds into the observed MoonSec operand layout. Use zero-based child prototypes and retain closure bindings.
4. Choose operand-specific opcode variants and real superinstructions, aka handlers that execute several records in order. Give repeated live operations different opcode identities. Do not merge across branch targets or closure bindings.
5. Serialize the MoonSec descriptor forms, 32-bit string lengths, constant masks, and per-output section order/tags. Preserve byte escapes and UTF-8. Instruction slots keep the genuine enum/A/B/C meanings.
6. Encode the payload with a 16-symbol alphabet. Generate staged imports, the reader, a live header guard, and an input-specific VM with mutated handlers and a comparison-tree dispatcher.
7. Shorten local names with lexical scope tracking, minify without changing strings, and write the output.

There is no fixed output size or reference-profile padding. The VM contains handlers selected by the input, not discarded fetch blocks added to reach a score.

The CLI only obfuscates. It does not deobfuscate or package the Roblox runtime. Output that uses Roblox APIs still needs Roblox to run. Syntax support is limited to what the parser implements.

## Tests

```sh
npm test
```

This runs compiler/interpreter checks, a hand-written wire-format vector, 144 layout/tag combinations, size-scaling checks, and reproducibility checks. With Lua 5.1 on `PATH`, it also executes the generated VM and checks closures, branches, table pages, unsigned operands, byte strings, long strings, and scope-safe naming. Btw, you can set `LUA_BIN` to its executable path. Without Lua 5.1, execution tests are explicitly skipped.

The retained benchmark inputs include Luau syntax and APIs such as `bit32` and `table.create`. To compare their original and generated output in a standalone Luau runtime:

```sh
LUAU_BIN=/path/to/luau node Tests/benchmarks.js
```

For independent reference checks, explicitly fetch the six pinned reference files:

```sh
LUA_BIN=/path/to/lua5.1 npm run test:reference -- --fetch
```

Or pass `--corpus /path/to/MoonSec/V3` instead of `--fetch`. This extracts hash-checked, reviewed decoder/reader functions and one VM function. They receive newly generated payloads; the unknown reference programs are not executed. Normal `npm test` does not use the network.

These tests are not a live Roblox test.

## Reference and limits

The reference family is [terrorlua's MoonSec/V3 collection](https://github.com/terrorlua/obfuscator-samples/tree/main/MoonSec/V3). This revision replaces the previous custom compact encoding with the observed MoonSec wire format and operand transforms. Six genuine readers accepted newly serialized payloads, and an isolated genuine VM executed known new programs using its supported opcode variants.

This is a plain-profile clone/reconstruction, not recovered original source or a universal MoonSec loader. Original opcode numbers are per-output; section order, tags, and opcode meanings must agree with the selected VM. Encrypted/nested anti-tamper variants, byte-identical compiler output, and equal protection strength are not claimed. The corpus has no paired original inputs, so it cannot establish same-input expansion ratios. See [FORMAT.md](FORMAT.md) for the exact profile and [VALIDATION.md](VALIDATION.md) for measured results.

## Credit

- [Arena.ai/agent](https://arena.ai/agent) - code assistance
- [terrorlua](https://github.com/terrorlua) - obfuscator samples
- [tupsutumppu/MoonsecDeobfuscator](https://github.com/tupsutumppu/MoonsecDeobfuscator) - format cross-checks; GPL-3.0 implementation is not bundled
