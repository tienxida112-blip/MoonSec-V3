# MoonSec V4 — Lua VM obfuscator

A Node.js reconstruction of the MoonSec-style Lua/Luau obfuscation pipeline. V4 compiles supported Lua and Luau syntax into custom bytecode, randomizes the VM and its instruction layout per build, and emits a Lua script that interprets that bytecode. This is an independent reconstruction, not an official MoonSec release.

## Usage

Requires Node.js 18 or newer.

```sh
node bin/moonsec.js input.lua -o output.lua
node bin/moonsec.js input.lua -o output.lua --seed 12345
node bin/moonsec.js input.lua -o output.lua --no-watermark
```

A fixed `--seed` makes output reproducible; different seeds diversify the generated VM. `--no-watermark` disables the extra watermark instructions and constant in the compiled program. The generated VM still contains a V4 identification header.

The JavaScript API returns the generated source and build metadata:

```js
const { obfuscate } = require('./src/obfuscate');
const result = obfuscate('print("hello")', { seed: 12345 });
console.log(result.output);
```

## V4 changes

- Seeded xoshiro-based generator diversifies identifiers, opcodes, instruction slots, constants and VM layouts.
- Bytecode uses a chained keystream and alternating nibble order; string constants use a separate key and per-constant salt.
- Instruction descriptors and opcodes are masked by their position; the VM uses a balanced opcode dispatch tree and randomized equivalent handler bodies.
- A payload checksum detects accidental corruption before deserialization. The checksum and keys are present in the output: they are not cryptographic authentication or protection against a determined analyst. Obfuscation cannot guarantee secrecy or prevent reverse engineering.

V4 output and serialized bytecode use a different format from V3; regenerate scripts rather than mixing V3 and V4 internals. Existing samples under `samples/obfuscated/` are historical V3 output.

## Tests

```sh
npm test
LUA_BIN=/path/to/lua5.1 npm test
```

The test suite automatically tries `lua5.1`, `lua`, then `tools/bin/lua` for end-to-end VM tests. If none can run, those tests are explicitly skipped; set `LUA_BIN` to a working interpreter to require them. The bundled binary may not run on every operating system or GLIBC version. The JS compiler/interpreter and codec tests do not require Lua.

## Credit

- [Arena.ai/agent](https://arena.ai/agent)
- [terrorlua](https://github.com/terrorlua) — obfuscator samples
