-- MoonSec V3 sample 068
-- Reservoir sampling checksum
local k = 7
local R = {}
local st = 4242
local function rnd() st = st * 1103515245 % 2147483648; return st end
for i = 1, k do R[i] = i * 3 end
for i = k+1, 80 do
  local j = rnd() % i
  if j < k then R[j+1] = i * 3 end
end
local s = 0
for i = 1, k do s = s + R[i] * i end
print(s)

