-- MoonSec V3 sample 045
-- Adler-32 of a generated buffer
local n, a, b = 200, 1, 0
local MOD = 65521
for i = 1, n do
  local c = (i * 37 + 11) % 256
  a = (a + c) % MOD
  b = (b + a) % MOD
end
print(b * 65536 + a)

