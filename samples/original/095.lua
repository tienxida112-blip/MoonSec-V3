-- MoonSec V3 sample 095
-- XTEA 8 cycles
local function u32(x) x = x % 4294967296; if x < 0 then x = x + 4294967296 end; return x end
local v0, v1 = 1, 2
local k = {9,8,7,6}
local sum, delta = 0, 0x9E3779B9
for _ = 1, 8 do
  v0 = u32(v0 + u32(u32(u32(v1*16) + k[1]) + u32(v1 + sum) + u32(math.floor(v1/32) + k[2])))
  sum = u32(sum + delta)
  v1 = u32(v1 + u32(u32(u32(v0*16) + k[3]) + u32(v0 + sum) + u32(math.floor(v0/32) + k[4])))
end
print(v0 % 1000003, v1 % 1000003)

