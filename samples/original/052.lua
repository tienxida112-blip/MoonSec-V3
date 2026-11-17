-- MoonSec V3 sample 052
-- Xorshift32 stream sum
local x = 2463534242
local function xs()
  x = x % 4294967296
  x = x + ((x * 8192) % 4294967296)
  x = x % 4294967296
  local t = math.floor(x / 524288)
  x = x - t
  if x < 0 then x = x + 4294967296 end
  x = x + ((x * 4) % 4294967296)
  x = x % 4294967296
  return x
end
-- simpler xorshift
x = 123456789
local acc = 0
for i = 1, 100 do
  x = x % 4294967296
  local t = x
  t = (t * 2) % 4294967296 -- <<1 not quite, just mix
  x = (x + t + i * 997) % 4294967296
  acc = (acc + x % 1009) % 1000003
end
print(acc)

