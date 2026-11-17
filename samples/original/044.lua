-- MoonSec V3 sample 044
-- Feistel 8-round 32-bit
local function F(r, k)
  r = (r + k) % 65536
  r = (r * 9 + 7) % 65536
  return math.floor(r / 2) + (r % 2) * 32768
end
local L, R = 0x1234, 0xABCD
for round = 1, 8 do
  L, R = R, (L + F(R, round * 17)) % 65536
end
print(L, R)

