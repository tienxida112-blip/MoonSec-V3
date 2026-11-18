# Redz comparison — current Node.js build

Matched files:

- Source: `/home/user/uploads/Redz.luau.txt`
- Original MoonSec V3 output: `/home/user/uploads/redzHub.lua.txt`
- Current Node.js output: `Redz.ours.lua`, seed 1

Both the original protected payload (decoded with the known string rule) and the
current output were parsed and measured on the same tree walk. These are
structural measurements, not a byte-for-byte or runtime-equivalence claim.

| Measurement | Original | Current Node.js output | Difference |
|---|---:|---:|---:|
| Protected output bytes | 1,249,716 | 1,194,998 | ours 54,718 smaller |
| Serialized instructions (incl. closure descriptors) | 41,823 | 47,730 | ours +5,907 (14.1%) |
| Prototypes | 643 | 642 | ours −1 |
| Constants | 11,932 | 11,754 | ours −178 |
| Function nodes in protected text | 58 | 40 | ours −18 |
| `if` statements | 2,252 | 138 | ours −2,114 |
| `while` statements | 89 | 8 | ours −81 |
| Numeric `for` statements | 507 | 23 | ours −484 |
| `repeat` statements | 251 | 5 | ours −246 |
| `break` statements | 749 | 12 | ours −737 |
| AST nodes (parser walk) | 77,579 | 3,573 | ours −74,006 |

Only one original protected file is available and the size comparison is not
seed-controlled, so the smaller protected text does not imply equivalence. The
remaining gap is mostly the original's flattened/opaque VM control flow, which
this port does not reproduce yet.

## Runtime fixes found by executing the Runaway case

The attached Runaway script is a Roblox Luau script whose callbacks capture
globals (`m`, `n`, `o`, `p`, `q`) and run generic-`for` loops over tables. It was
used as a real workload instead of only checking that output parses. Three
genuine VM/compiler defects showed up, all of which produced valid Lua but wrong
runtime behaviour:

1. **Closure capture descriptors** were stripped from the bytecode, the child
   prototype was looked up with a zero-based index in a one-based table, and
   `CLOSURE` was encoded as `ABx` although the VM needs the capture count in `C`.
   Descriptors are now retained, serialized, and consumed from the decoded
   instruction array; upvalues share their storage with the captured slot.
2. **Generic `for`** (`TFORLOOP`) did not consume the stand-alone back-edge
   `JMP`: on a yielded value it re-entered the loop body with a stale control
   variable, and on loop exit it fell into the back-edge. `TFORLOOP` now falls
   through to the back-edge on a value and skips it on `nil`.
3. **Compares used as values** (`a == b`, `a ~= b`, `a < b`, … producing a
   boolean) shared the *fused condition-jump* variants. Those variants treat `B`
   as a jump target, so `m.PlayerDamage.TakeDamage == n` jumped into the
   iterator's own body and looped forever — this is the "God Mode" hang found in
   the attached script. Value compares now have separate `EQV0*/EQV1*` variants
   that implement Lua 5.1's "skip next instruction when the result equals `A`",
   with `A=1` variants implementing `~=`.

`node scripts/selftest.js` passes, including new end-to-end cases that run the
emitted Lua through a bundled Lua 5.1.5 interpreter (`tools/bin/lua`).

## Runaway verification

`examples/Runaway.ours.lua` is generated from `/home/user/uploads/Runaway.txt`
with seed 1 (52,580 bytes). It was executed headlessly under
`tools/roblox-stub.lua`, a Roblox API stub that loads the script, drives every
registered UI callback and pumps the connected signals:

| Build | Result |
|---|---|
| Original source | runs; 1 error, `Get 5 Stars` → arithmetic on a table (stub artifact) |
| Current output | runs; the **same single** error, same callback |

Before the compare fix, the current output additionally hung/spun in
`God Mode` and looped in the Heartbeat handler. Both are gone.

## Scope

- The workspace implementation is Node.js and obfuscate-only; MoonSec V3 is
  treated as an IronBrew2 fork. The temporary C# checkout and its toolchain
  caches were removed on request.
- This does not yet reproduce the original's control-flow flattening density
  (see the statement counts above), so output size and shape still differ.
- Roblox itself is not available here, so "runs" means "runs against the stub";
  a genuine in-Roblox run is still the final check.
