-- MoonSec V3 sample 077
-- Schoolbook polynomial multiply
local N = 18
local st = 2468
local function rnd() st = st * 48271 % 2147483647; return st end
local a, b, c = {}, {}, {}
for i = 1, N do a[i] = (rnd()%9)-4; b[i] = (rnd()%9)-4 end
for i = 1, 2*N-1 do c[i] = 0 end
for i = 1, N do
  for j = 1, N do c[i+j-1] = c[i+j-1] + a[i]*b[j] end
end
local h = 0
for i = 1, #c do h = (h * 17 + (c[i] % 1009 + 1009) % 1009) % 1000003 end
print(h)

