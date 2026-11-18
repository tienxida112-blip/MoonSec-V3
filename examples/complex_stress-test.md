# Complex stress test

Input: `../Tests/complex_stress.lua`  
Emitted Lua: `complex_stress.obfuscated.lua`  
CLI command: `node bin/moonsec.js Tests/complex_stress.lua -o examples/complex_stress.obfuscated.lua --seed 1`

The test exercises recursive merge sort, a higher-order map callback, nested scopes and loops, a generic iterator, table indexing/construction, branches, multiple functions and arithmetic.

## Validation performed before removing the deobfuscator code

The source and its Node C#-pipeline deobfuscation were interpreted and compared for seeds 1, 42, and 12345:

| Seed | Output bytes | Unknown handler fingerprints | Runtime output |
|---:|---:|---:|---|
| 1 | 19,765 | 0 | Match |
| 42 | 19,845 | 0 | Match |
| 12345 | 19,907 | 0 | Match |

Expected and recovered output:

```text
stress    79    4    95    50    2,3,5,7,11,13,17,19,23,31
```

The recovered prototype tree had matching function counts, constants, instruction counts, and opcode sequences after excluding the three leading watermark instructions. Comparison-branch operand fields are transformed by the VM's compare fusion, so this is a structural/semantic round-trip check, not a byte-for-byte identity claim.

**Scope notes:** the available check was the Node port of the C# deobfuscation pipeline, not execution of the original C# binary. The temporary deobfuscator implementation and CLI were removed from this obfuscator-only project after validation. This stress case does not exercise closures that capture outer locals; an intermediate captured-upvalue test did not round-trip correctly through the Node deobfuscation interpreter, so captured-upvalue behavior remains a known unverified limitation rather than a claimed pass.
