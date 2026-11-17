-- MoonSec V3 sample 093
-- Skiplist-ish probabilistic insert height histogram
local st = 777
local function rnd() st = st * 1103515245 % 2147483648; return st end
local hist = {0,0,0,0,0,0}
for i = 1, 80 do
  local h, x = 1, rnd()
  while h < 6 and x % 2 == 0 do h = h + 1; x = math.floor(x/2) end
  hist[h] = hist[h] + 1
end
local s = 0
for i = 1, 6 do s = s + hist[i] * i * i end
print(s)

