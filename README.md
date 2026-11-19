# MoonSec V3 - Lua Obfuscator

A reconstruction of the MoonSec V3 Lua obfuscator. This is not the original source code.

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
3. Fuse supported comparison/test branches, select opcode variants, and randomize opcode numbers.
4. Serialize the bytecode with a randomized prototype layout.
5. Encode the payload and generate a Lua VM wrapper with a dispatch tree and control-flow blocks.
6. Adjust the wrapper against the stored reference profile, then write the output file.

The CLI only obfuscates. It does not deobfuscate or package the Roblox runtime. Output that uses Roblox APIs still needs Roblox to run. Syntax support is limited to what the parser implements.

## Tests

```sh
npm test
```

This runs the compiler, interpreter, and output checks. End-to-end VM tests also run when Lua 5.1 is on `PATH`. Btw, you can set `LUA_BIN` to its executable path.

## Credit

- [Arena.ai/agent](https://arena.ai/agent) - code assistance
- [terrorlua](https://github.com/terrorlua) - obfuscator samples
